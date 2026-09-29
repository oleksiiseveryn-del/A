import Foundation

/// Telegram Bot API connector. Customers write to your company bot
/// (e.g. @HSDHamburgBot) and you answer from UniMessenger.
/// Token from @BotFather, stored in the Keychain.
final class TelegramBotConnector: MessengerConnector {
    let account: Account
    private var token: String?
    private var offsetKey: String { "telegram.offset.\(account.id.uuidString)" }

    init(account: Account) {
        self.account = account
    }

    private func url(_ method: String) throws -> URL {
        guard let token else { throw ConnectorError.missingCredentials("Telegram-Bot-Token") }
        return URL(string: "https://api.telegram.org/bot\(token)/\(method)")!
    }

    func connect() async throws {
        token = KeychainStore.get(KeychainStore.Key.secret(account.id))
        let response = try await HTTP.json(try HTTP.request(try url("getMe")))
        guard response["ok"] as? Bool == true else { throw ConnectorError.invalidResponse }
    }

    func fetchUpdates() async throws -> [Conversation] {
        let offset = UserDefaults.standard.integer(forKey: offsetKey)
        let response = try await HTTP.json(try HTTP.request(try url("getUpdates"), method: "POST",
                                                            body: ["offset": offset, "timeout": 0]))
        let updates = response["result"] as? [[String: Any]] ?? []
        var byChat: [String: Conversation] = [:]
        for update in updates {
            if let updateID = update["update_id"] as? Int {
                UserDefaults.standard.set(updateID + 1, forKey: offsetKey)
            }
            guard let msg = update["message"] as? [String: Any],
                  let chat = msg["chat"] as? [String: Any],
                  let chatID = chat["id"] as? Int else { continue }
            let attachment = Self.attachment(in: msg)
            let sticker = msg["sticker"] as? [String: Any]
            let text: String = (msg["text"] as? String) ?? (msg["caption"] as? String) ?? (sticker?["emoji"] as? String) ?? ""
            guard !text.isEmpty || attachment != nil else { continue }
            let from = msg["from"] as? [String: Any] ?? [:]
            let sender = [from["first_name"] as? String, from["last_name"] as? String]
                .compactMap { $0 }.joined(separator: " ")
            let title = chat["title"] as? String ?? sender
            let message = Message(id: "\(chatID)-\(msg["message_id"] as? Int ?? 0)",
                                  senderName: sender.isEmpty ? title : sender, text: text,
                                  date: Date(timeIntervalSince1970: msg["date"] as? Double ?? 0),
                                  isOutgoing: false, attachment: attachment)
            let key = String(chatID)
            var conversation = byChat[key] ?? Conversation(accountID: account.id, remoteID: key, platform: .telegram,
                                                           title: title, messages: [], unreadCount: 0)
            conversation.messages.append(message)
            conversation.unreadCount += 1
            byChat[key] = conversation
        }
        return Array(byChat.values)
    }

    static func attachment(in msg: [String: Any]) -> Attachment? {
        func make(_ file: [String: Any], _ kind: Attachment.Kind, _ name: String, _ mime: String?) -> Attachment? {
            guard let fileID = file["file_id"] as? String else { return nil }
            return Attachment(kind: kind, name: name, mime: mime ?? "", size: file["file_size"] as? Int ?? 0,
                              source: .telegram(fileID: fileID))
        }
        if let photos = msg["photo"] as? [[String: Any]], let largest = photos.last {
            return make(largest, .image, "Foto.jpg", "image/jpeg")
        }
        if let document = msg["document"] as? [String: Any] {
            let mime = document["mime_type"] as? String ?? ""
            return make(document, Attachment.kind(for: mime), document["file_name"] as? String ?? "Dokument", mime)
        }
        if let video = msg["video"] as? [String: Any] {
            return make(video, .video, video["file_name"] as? String ?? "Video.mp4", video["mime_type"] as? String)
        }
        if let voice = msg["voice"] as? [String: Any] {
            return make(voice, .audio, "Sprachnachricht.ogg", voice["mime_type"] as? String)
        }
        if let audio = msg["audio"] as? [String: Any] {
            return make(audio, .audio, audio["file_name"] as? String ?? "Audio", audio["mime_type"] as? String)
        }
        return nil
    }

    func sendFile(_ data: Data, name: String, mime: String, to conversation: Conversation) async throws -> String {
        let asPhoto = Attachment.kind(for: mime) == .image && !mime.contains("gif") && data.count < 10_000_000
        let form = HTTP.multipart(fields: ["chat_id": conversation.remoteID], fileField: asPhoto ? "photo" : "document",
                                  fileName: name, mime: mime, data: data)
        var request = URLRequest(url: try url(asPhoto ? "sendPhoto" : "sendDocument"))
        request.httpMethod = "POST"
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = form.body
        let response = try await HTTP.json(request)
        let result = response["result"] as? [String: Any]
        return "\(conversation.remoteID)-\(result?["message_id"] as? Int ?? Int.random(in: 0...Int.max))"
    }

    func download(_ attachment: Attachment) async throws -> Data {
        guard case .telegram(let fileID) = attachment.source, let token else { throw ConnectorError.invalidResponse }
        var components = URLComponents(url: try url("getFile"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "file_id", value: fileID)]
        let info = try await HTTP.json(URLRequest(url: components.url!))
        guard let path = (info["result"] as? [String: Any])?["file_path"] as? String,
              let fileURL = URL(string: "https://api.telegram.org/file/bot\(token)/\(path)") else {
            throw ConnectorError.notSupported("Datei größer als 20 MB (Telegram-Limit)")
        }
        return try await HTTP.data(URLRequest(url: fileURL))
    }

    func send(text: String, to conversation: Conversation) async throws -> Message {
        let response = try await HTTP.json(try HTTP.request(try url("sendMessage"), method: "POST",
                                                            body: ["chat_id": conversation.remoteID, "text": text]))
        let result = response["result"] as? [String: Any]
        return Message(id: "\(conversation.remoteID)-\(result?["message_id"] as? Int ?? Int.random(in: 0...Int.max))",
                       senderName: "Ich", text: text, date: .now, isOutgoing: true)
    }
}
