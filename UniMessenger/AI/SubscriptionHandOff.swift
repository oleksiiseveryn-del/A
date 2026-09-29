import UIKit

/// Without an API key the AI runs in the OS KI-Assistent on claude.ai, on the user's own
/// Claude subscription: OS copies the text and opens the assistant with the task preselected.
enum SubscriptionHandOff {
    enum Task: String {
        case reply, actions, protocol_ = "protocol", rewrite, photo, briefing
    }

    static let assistant = URL(string: "https://claude.ai/artifact/8ca7DPy66ztKt5MrnoNy7U")!

    static func url(for task: Task) -> URL {
        URL(string: assistant.absoluteString + "#" + task.rawValue)!
    }

    /// Copies `text` (if any) and returns the URL to open.
    @MainActor
    static func prepare(_ text: String, task: Task) -> URL {
        if !text.isEmpty { UIPasteboard.general.string = text }
        return url(for: task)
    }

    static func chatText(_ conversation: Conversation, ownerName: String, limit: Int = 30) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "dd.MM. HH:mm"
        let lines = conversation.messages.suffix(limit).map { message in
            let who = message.isOutgoing ? ownerName + " (ich)" : message.senderName
            let media = message.attachment.map { "[\($0.label)] " } ?? ""
            return "[\(formatter.string(from: message.date))] \(who): \(media)\(message.text)"
        }
        let note = conversation.note.map { $0.isEmpty ? "" : "\nNotiz: \($0)" } ?? ""
        return "Chat: \(conversation.title) (\(conversation.platform.displayName))\(note)\n" + lines.joined(separator: "\n")
    }

    /// All open chats (unread or unanswered), newest messages only – for the daily briefing.
    static func openChatsText(_ conversations: [Conversation], ownerName: String) -> String {
        let open = conversations.filter { !$0.isArchived && ($0.unreadCount > 0 || $0.lastMessage?.isOutgoing == false) }.prefix(12)
        guard !open.isEmpty else { return "Keine offenen Chats." }
        return open.map { chatText($0, ownerName: ownerName, limit: 5) }.joined(separator: "\n\n")
    }
}
