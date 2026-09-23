import Foundation

/// Matrix Client-Server API connector.
///
/// This is the route to "all messengers": run a Matrix homeserver with
/// mautrix bridges (WhatsApp, Signal, Telegram, Instagram, Facebook Messenger,
/// Google Messages/SMS, LinkedIn, Slack …) and every bridged chat appears as a
/// Matrix room. Replies sent here are delivered by the bridge to the original network.
final class MatrixConnector: MessengerConnector {
    let account: Account
    private var accessToken: String?
    private var userID: String?
    private var displayNames: [String: String] = [:]
    private var roomNames: [String: String] = [:]
    private var roomPlatforms: [String: Platform] = [:]

    private var sinceKey: String { "matrix.since.\(account.id.uuidString)" }

    init(account: Account) {
        self.account = account
    }

    private var baseURL: URL {
        get throws {
            var server = account.serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
            if !server.hasPrefix("http") { server = "https://" + server }
            guard let url = URL(string: server) else { throw ConnectorError.missingCredentials("Homeserver-URL") }
            return url
        }
    }

    private func endpoint(_ path: String, query: [URLQueryItem] = []) throws -> URL {
        var components = URLComponents(url: try baseURL.appendingPathComponent("_matrix/client/v3/" + path),
                                       resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        return components.url!
    }

    func connect() async throws {
        if let token = KeychainStore.get(KeychainStore.Key.token(account.id)) {
            accessToken = token
        } else {
            guard let password = KeychainStore.get(KeychainStore.Key.secret(account.id)) else {
                throw ConnectorError.missingCredentials("Matrix-Passwort")
            }
            let body: [String: Any] = [
                "type": "m.login.password",
                "identifier": ["type": "m.id.user", "user": account.username],
                "password": password,
                "initial_device_display_name": "OS iPhone",
            ]
            let response = try await HTTP.json(try HTTP.request(try endpoint("login"), method: "POST", body: body))
            guard let token = response["access_token"] as? String else { throw ConnectorError.invalidResponse }
            accessToken = token
            userID = response["user_id"] as? String
            KeychainStore.set(token, for: KeychainStore.Key.token(account.id))
            // The password is no longer needed once we hold a device token.
            KeychainStore.set(nil, for: KeychainStore.Key.secret(account.id))
        }
        if userID == nil {
            let whoami = try await HTTP.json(try HTTP.request(try endpoint("account/whoami"), bearer: accessToken))
            userID = whoami["user_id"] as? String
        }
    }

    func fetchUpdates() async throws -> [Conversation] {
        var query = [URLQueryItem(name: "timeout", value: "0")]
        if let since = UserDefaults.standard.string(forKey: sinceKey) {
            query.append(URLQueryItem(name: "since", value: since))
        } else {
            query.append(URLQueryItem(name: "filter", value: #"{"room":{"timeline":{"limit":30}}}"#))
        }
        let sync = try await HTTP.json(try HTTP.request(try endpoint("sync", query: query), bearer: accessToken))
        if let next = sync["next_batch"] as? String {
            UserDefaults.standard.set(next, forKey: sinceKey)
        }

        let joined = (sync["rooms"] as? [String: Any])?["join"] as? [String: [String: Any]] ?? [:]
        var result: [Conversation] = []
        for (roomID, room) in joined {
            let stateEvents = (room["state"] as? [String: Any])?["events"] as? [[String: Any]] ?? []
            let timelineEvents = (room["timeline"] as? [String: Any])?["events"] as? [[String: Any]] ?? []
            (stateEvents + timelineEvents).forEach { absorbState($0, roomID: roomID) }

            let messages = timelineEvents.compactMap(message(from:))
            let unread = ((room["unread_notifications"] as? [String: Any])?["notification_count"] as? Int) ?? 0
            guard !messages.isEmpty || unread > 0 else { continue }

            let heroes = ((room["summary"] as? [String: Any])?["m.heroes"] as? [String]) ?? []
            let title = roomNames[roomID]
                ?? heroes.map(displayName(for:)).joined(separator: ", ").nonEmpty
                ?? roomID
            result.append(Conversation(accountID: account.id, remoteID: roomID,
                                       platform: roomPlatforms[roomID] ?? .matrix,
                                       title: title, messages: messages, unreadCount: unread))
        }
        return result
    }

    func send(text: String, to conversation: Conversation) async throws -> Message {
        let txnID = UUID().uuidString
        let roomID = conversation.remoteID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? conversation.remoteID
        let url = try endpoint("rooms/\(roomID)/send/m.room.message/\(txnID)")
        let response = try await HTTP.json(try HTTP.request(url, method: "PUT", bearer: accessToken,
                                                            body: ["msgtype": "m.text", "body": text]))
        return Message(id: response["event_id"] as? String ?? txnID, senderName: "Ich",
                       text: text, date: .now, isOutgoing: true)
    }

    func markRead(_ conversation: Conversation) async {
        guard let last = conversation.messages.last(where: { !$0.isOutgoing }) else { return }
        let roomID = conversation.remoteID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? conversation.remoteID
        let eventID = last.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? last.id
        guard let url = try? endpoint("rooms/\(roomID)/receipt/m.read/\(eventID)"),
              let request = try? HTTP.request(url, method: "POST", bearer: accessToken, body: [:]) else { return }
        _ = try? await HTTP.json(request)
    }

    // MARK: - Event parsing

    private func absorbState(_ event: [String: Any], roomID: String) {
        let content = event["content"] as? [String: Any] ?? [:]
        switch event["type"] as? String {
        case "m.room.name":
            if let name = content["name"] as? String, !name.isEmpty { roomNames[roomID] = name }
        case "m.room.member":
            if let key = event["state_key"] as? String {
                if let name = content["displayname"] as? String { displayNames[key] = name }
                if let platform = Self.platform(forBridgeUser: key) { roomPlatforms[roomID] = platform }
            }
        case "m.bridge", "uk.half-shot.bridge":
            let protocolID = ((content["protocol"] as? [String: Any])?["id"] as? String)?.lowercased() ?? ""
            if let platform = Self.platform(forProtocol: protocolID) { roomPlatforms[roomID] = platform }
        default:
            break
        }
    }

    private static let mediaTypes: [String: Attachment.Kind] = [
        "m.image": .image, "m.file": .file, "m.video": .video, "m.audio": .audio,
    ]

    private func message(from event: [String: Any]) -> Message? {
        guard event["type"] as? String == "m.room.message",
              let content = event["content"] as? [String: Any],
              let body = content["body"] as? String,
              let id = event["event_id"] as? String,
              let sender = event["sender"] as? String else { return nil }
        let timestamp = (event["origin_server_ts"] as? Double ?? 0) / 1000
        let isOutgoing = sender == userID
        var text = body
        var attachment: Attachment?
        if let msgtype = content["msgtype"] as? String, let kind = Self.mediaTypes[msgtype],
           let mxc = content["url"] as? String {
            let info = content["info"] as? [String: Any] ?? [:]
            let fileName = content["filename"] as? String
            attachment = Attachment(kind: kind, name: fileName ?? body, mime: info["mimetype"] as? String ?? "",
                                    size: info["size"] as? Int ?? 0, source: .matrix(mxc: mxc))
            // With media, body is the file name unless a separate caption was sent.
            text = fileName != nil && fileName != body ? body : ""
        }
        return Message(id: id, senderName: isOutgoing ? "Ich" : displayName(for: sender),
                       text: text, date: Date(timeIntervalSince1970: timestamp), isOutgoing: isOutgoing,
                       attachment: attachment)
    }

    func sendFile(_ data: Data, name: String, mime: String, to conversation: Conversation) async throws -> String {
        var components = URLComponents(url: try baseURL.appendingPathComponent("_matrix/media/v3/upload"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "filename", value: name)]
        var upload = URLRequest(url: components.url!)
        upload.httpMethod = "POST"
        upload.setValue("Bearer \(accessToken ?? "")", forHTTPHeaderField: "Authorization")
        upload.setValue(mime, forHTTPHeaderField: "Content-Type")
        upload.httpBody = data
        let uploaded = try await HTTP.json(upload)
        guard let contentURI = uploaded["content_uri"] as? String else { throw ConnectorError.invalidResponse }

        let kind = Attachment.kind(for: mime)
        let msgtype = ["image": "m.image", "video": "m.video", "audio": "m.audio"][kind.rawValue] ?? "m.file"
        let content: [String: Any] = [
            "msgtype": msgtype, "body": name, "filename": name, "url": contentURI,
            "info": ["mimetype": mime, "size": data.count],
        ]
        let roomID = conversation.remoteID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? conversation.remoteID
        let url = try endpoint("rooms/\(roomID)/send/m.room.message/\(UUID().uuidString)")
        let response = try await HTTP.json(try HTTP.request(url, method: "PUT", bearer: accessToken, body: content))
        return response["event_id"] as? String ?? UUID().uuidString
    }

    func download(_ attachment: Attachment) async throws -> Data {
        guard case .matrix(let mxc) = attachment.source else { throw ConnectorError.invalidResponse }
        let parts = mxc.replacingOccurrences(of: "mxc://", with: "").split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { throw ConnectorError.invalidResponse }
        // Authenticated media (Matrix 1.11) first, legacy endpoint as fallback.
        for path in ["_matrix/client/v1/media/download/\(parts[0])/\(parts[1])", "_matrix/media/v3/download/\(parts[0])/\(parts[1])"] {
            var request = URLRequest(url: try baseURL.appendingPathComponent(path))
            request.setValue("Bearer \(accessToken ?? "")", forHTTPHeaderField: "Authorization")
            if let data = try? await HTTP.data(request) { return data }
        }
        throw ConnectorError.notSupported("Datei konnte nicht geladen werden")
    }

    private func displayName(for userID: String) -> String {
        displayNames[userID] ?? String(userID.dropFirst().prefix(while: { $0 != ":" }))
    }

    /// mautrix bridges create puppet users like `@whatsapp_4917…:server`.
    static func platform(forBridgeUser userID: String) -> Platform? {
        let local = userID.dropFirst().lowercased()
        let prefixes: [(String, Platform)] = [
            ("whatsapp", .whatsapp), ("signal", .signal), ("telegram", .telegram),
            ("instagram", .instagram), ("facebook", .facebook), ("meta", .facebook),
            ("gmessages", .sms), ("imessage", .imessage), ("slack", .slack),
            ("linkedin", .linkedin), ("teams", .teams),
        ]
        return prefixes.first { local.hasPrefix($0.0) }?.1
    }

    static func platform(forProtocol id: String) -> Platform? {
        switch id {
        case "whatsapp": .whatsapp
        case "signal": .signal
        case "telegram": .telegram
        case "instagram": .instagram
        case "facebook", "messenger", "meta": .facebook
        case "gmessages", "sms": .sms
        case "imessage": .imessage
        case "slack": .slack
        case "linkedin": .linkedin
        default: nil
        }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
