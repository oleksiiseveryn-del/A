import Foundation

/// User preferences for the AI assistant, persisted in UserDefaults.
/// Defaults are prefilled for HSD Hamburg GmbH and can be changed in Settings.
struct AssistantProfile: Codable, Equatable {
    var ownerName = "Oleksii Severyn"
    var role = "Betriebsleiter"
    var company = "HSD Hamburg GmbH"
    var address = "Merckmannstraße 30, 20539 Hamburg"
    var phone = "040 18124794"
    var signature = "Mit freundlichen Grüßen\nOleksii Severyn\nBetriebsleiter · HSD Hamburg GmbH\nTel. 040 18124794"
    var defaultTone: Tone = .professional
    var replyLanguage: ReplyLanguage = .matchSender
    /// Free-form context the AI should know (e.g. current projects, availability).
    var extraContext = "Wir führen Bauprojekte nach DIN-Normen, VOB und GEG aus. Termine und Angebote werden erst nach Rücksprache verbindlich bestätigt."

    enum Tone: String, Codable, CaseIterable, Identifiable {
        case professional, friendly, short, formal
        var id: String { rawValue }
        var label: String {
            switch self {
            case .professional: "Professionell"
            case .friendly: "Freundlich"
            case .short: "Kurz & knapp"
            case .formal: "Förmlich (Sie)"
            }
        }
    }

    enum ReplyLanguage: String, Codable, CaseIterable, Identifiable {
        case matchSender, german, english, ukrainian
        var id: String { rawValue }
        var label: String {
            switch self {
            case .matchSender: "Wie der Absender"
            case .german: "Deutsch"
            case .english: "Englisch"
            case .ukrainian: "Ukrainisch"
            }
        }
    }
}

enum Persistence {
    private static var directory: URL {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("UniMessenger", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func load<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        let url = directory.appendingPathComponent("\(name).json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    static func save<T: Encodable>(_ value: T, to name: String) {
        let url = directory.appendingPathComponent("\(name).json")
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtection])
    }
}
