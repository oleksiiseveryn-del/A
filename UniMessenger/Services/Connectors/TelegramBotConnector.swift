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
                  let chatID = chat["id"] as? Int,
                  let text = msg["text"] as? String ?? msg["caption"] as? String else { continue }
            let from = msg["from"] as? [String: Any] ?? [:]
            let sender = [from["first_name"] as? String, from["last_name"] as? String]
                .compactMap { $0 }.joined(separator: " ")
            let title = chat["title"] as? String ?? sender
            let message = Message(id: "\(chatID)-\(msg["message_id"] as? Int ?? 0)",
                                  senderName: sender.isEmpty ? title : sender, text: text,
                                  date: Date(timeIntervalSince1970: msg["date"] as? Double ?? 0),
                                  isOutgoing: false)
            let key = String(chatID)
            var conversation = byChat[key] ?? Conversation(accountID: account.id, remoteID: key, platform: .telegram,
                                                           title: title, messages: [], unreadCount: 0)
            conversation.messages.append(message)
            conversation.unreadCount += 1
            byChat[key] = conversation
        }
        return Array(byChat.values)
    }

    func send(text: String, to conversation: Conversation) async throws -> Message {
        let response = try await HTTP.json(try HTTP.request(try url("sendMessage"), method: "POST",
                                                            body: ["chat_id": conversation.remoteID, "text": text]))
        let result = response["result"] as? [String: Any]
        return Message(id: "\(conversation.remoteID)-\(result?["message_id"] as? Int ?? Int.random(in: 0...Int.max))",
                       senderName: "Ich", text: text, date: .now, isOutgoing: true)
    }
}
