import Foundation
import SwiftUI

/// Messenger platform a conversation originates from.
/// Matrix bridges report the original network, so a WhatsApp chat bridged
/// through Matrix still shows up as `.whatsapp` in the inbox.
enum Platform: String, Codable, CaseIterable, Identifiable {
    case whatsapp, telegram, signal, instagram, facebook, imessage, sms, email, slack, teams, linkedin, matrix, demo

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .whatsapp: "WhatsApp"
        case .telegram: "Telegram"
        case .signal: "Signal"
        case .instagram: "Instagram"
        case .facebook: "Messenger"
        case .imessage: "iMessage"
        case .sms: "SMS"
        case .email: "E-Mail"
        case .slack: "Slack"
        case .teams: "Teams"
        case .linkedin: "LinkedIn"
        case .matrix: "Matrix"
        case .demo: "Demo"
        }
    }

    var symbol: String {
        switch self {
        case .whatsapp: "phone.bubble.fill"
        case .telegram: "paperplane.fill"
        case .signal: "lock.shield.fill"
        case .instagram: "camera.fill"
        case .facebook: "bubble.left.and.bubble.right.fill"
        case .imessage: "message.fill"
        case .sms: "text.bubble.fill"
        case .email: "envelope.fill"
        case .slack: "number"
        case .teams: "person.3.fill"
        case .linkedin: "briefcase.fill"
        case .matrix: "square.grid.3x3.fill"
        case .demo: "sparkles"
        }
    }

    var color: Color {
        switch self {
        case .whatsapp: Color(red: 0.15, green: 0.78, blue: 0.40)
        case .telegram: Color(red: 0.16, green: 0.63, blue: 0.89)
        case .signal: Color(red: 0.23, green: 0.46, blue: 0.94)
        case .instagram: Color(red: 0.88, green: 0.19, blue: 0.42)
        case .facebook: Color(red: 0.0, green: 0.52, blue: 1.0)
        case .imessage, .sms: Color(red: 0.2, green: 0.78, blue: 0.35)
        case .email: .orange
        case .slack: Color(red: 0.29, green: 0.08, blue: 0.29)
        case .teams: Color(red: 0.31, green: 0.33, blue: 0.73)
        case .linkedin: Color(red: 0.04, green: 0.4, blue: 0.76)
        case .matrix: .primary
        case .demo: .purple
        }
    }
}

enum Priority: String, Codable, CaseIterable {
    case urgent, normal, low

    var label: String {
        switch self {
        case .urgent: "Dringend"
        case .normal: "Normal"
        case .low: "Niedrig"
        }
    }
}

struct Message: Identifiable, Codable, Hashable {
    let id: String
    var senderName: String
    var text: String
    var date: Date
    var isOutgoing: Bool
}

struct Conversation: Identifiable, Codable, Hashable {
    /// Globally unique: "<accountID>|<remoteID>".
    var id: String { "\(accountID)|\(remoteID)" }
    let accountID: UUID
    let remoteID: String
    var platform: Platform
    var title: String
    var messages: [Message]
    var unreadCount: Int
    var isPinned: Bool = false
    var isArchived: Bool = false
    /// Set by the AI triage; nil until analysed.
    var priority: Priority?
    var aiSummary: String?

    var lastMessage: Message? { messages.last }
    var lastActivity: Date { lastMessage?.date ?? .distantPast }
}

/// A configured connection to a messaging backend.
struct Account: Identifiable, Codable, Hashable {
    enum Kind: String, Codable, CaseIterable, Identifiable {
        case matrix, telegramBot, demo
        var id: String { rawValue }
        var title: String {
            switch self {
            case .matrix: "Matrix / Bridges (WhatsApp, Signal, Instagram …)"
            case .telegramBot: "Telegram Bot"
            case .demo: "Demo-Daten"
            }
        }
    }

    var id = UUID()
    var kind: Kind
    var name: String
    /// Homeserver URL for Matrix, unused otherwise.
    var serverURL: String = ""
    var username: String = ""
    var isEnabled = true
}
