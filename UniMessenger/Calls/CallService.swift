import AVFoundation
import Foundation

/// Video calls run on Jitsi Meet (WebRTC). 1:1 calls go peer-to-peer; the
/// invitation is a plain link, so the other side needs no app and no account.
enum CallSettings {
    static let servers: [(id: String, name: String)] = [
        ("meet.ffmuc.net", "meet.ffmuc.net – Deutschland, ohne Login"),
        ("meet.jit.si", "meet.jit.si – Gastgeber-Login nötig"),
        ("custom", "Eigener Server …"),
    ]
    static let qualities: [(value: Int, name: String)] = [(1080, "Full HD 1080p"), (720, "HD 720p (empfohlen)"), (360, "Datensparen 360p")]

    static var server: String {
        let choice = UserDefaults.standard.string(forKey: "callServer") ?? "meet.ffmuc.net"
        let raw = choice == "custom" ? (UserDefaults.standard.string(forKey: "callServerCustom") ?? "") : choice
        let host = raw.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
            .split(separator: "/").first.map(String.init) ?? ""
        return host.isEmpty ? "meet.ffmuc.net" : host
    }

    static var quality: Int {
        let value = UserDefaults.standard.integer(forKey: "callQuality")
        return value == 0 ? 720 : value
    }

    static func newRoomURL() -> URL {
        let alphabet = Array("abcdefghjkmnpqrstuvwxyz23456789")
        let id = String((0..<10).map { _ in alphabet.randomElement()! })
        return URL(string: "https://\(server)/OS-HSD-\(id)")!
    }

    private static let jitsiHosts = ["jit.si", "ffmuc.net", "8x8.vc"]
    private static let meetingHosts = ["zoom.us", "teams.microsoft.com", "teams.live.com", "meet.google.com", "whereby.com", "webex.com"]

    /// Created once – building an NSDataDetector is expensive and bubbles redraw often.
    static let linkDetector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    /// A call link in a message. Jitsi rooms open inside OS, other services in Safari.
    static func meetingLink(in text: String) -> (url: URL, inApp: Bool)? {
        guard let detector = linkDetector else { return nil }
        for match in detector.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let url = match.url, url.scheme == "https", let host = url.host?.lowercased() else { continue }
            let matches = { (domains: [String]) in domains.contains { host == $0 || host.hasSuffix("." + $0) } }
            // In-app calls get camera and microphone, so only trusted Jitsi hosts open inside OS.
            if host == server || matches(jitsiHosts) {
                return (url, url.path.count > 1)
            }
            if url.path.hasPrefix("/OS-HSD-") || matches(meetingHosts) { return (url, false) }
        }
        return nil
    }

    /// Room URL with Jitsi config in the fragment: straight into the call, target quality, P2P.
    static func joinURL(room: URL, displayName: String, subject: String, audioOnly: Bool) -> URL {
        func json(_ value: Any) -> String {
            let data = (try? JSONSerialization.data(withJSONObject: [value], options: .fragmentsAllowed)) ?? Data("[]".utf8)
            let array = String(decoding: data, as: UTF8.self)
            return String(array.dropFirst().dropLast())
        }
        let q = quality
        let options: [(String, Any)] = [
            ("config.prejoinConfig.enabled", false),
            ("config.prejoinPageEnabled", false),
            ("config.disableDeepLinking", true),
            ("config.startWithAudioMuted", false),
            ("config.startWithVideoMuted", audioOnly),
            ("config.startAudioOnly", audioOnly),
            ("config.resolution", q),
            ("config.constraints.video.height.ideal", q),
            ("config.constraints.video.height.max", q),
            ("config.p2p.enabled", true),
            ("config.enableLayerSuspension", true),
            ("config.disableThirdPartyRequests", true),
            ("config.subject", subject),
            ("interfaceConfig.MOBILE_APP_PROMO", false),
            ("userInfo.displayName", displayName),
            ("lang", "de"),
        ]
        // ASCII-only: anything else (umlauts, quotes, spaces) must be percent-encoded.
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        let fragment = options.map { key, value in
            key + "=" + (json(value).addingPercentEncoding(withAllowedCharacters: allowed) ?? "")
        }.joined(separator: "&")
        var components = URLComponents(url: room, resolvingAgainstBaseURL: false)!
        components.percentEncodedFragment = fragment
        return components.url ?? room
    }

    static func invitation(url: URL, from profile: AssistantProfile, audioOnly: Bool) -> String {
        "\(audioOnly ? "📞 Anruf" : "📹 Videoanruf") von \(profile.ownerName) (\(profile.company)) – jetzt beitreten:\n\(url.absoluteString)\nEinfach antippen, keine App und kein Konto nötig."
    }

    /// Audio routed for a call: speaker, Bluetooth headsets and echo cancellation.
    static func activateAudio() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .videoChat, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
        try? session.setActive(true)
    }
}

struct CallProtocol: Codable, Hashable {
    let text: String
    let summary: String
    let tasks: [ActionTodo]
    let appointments: [ActionAppointment]

    enum CodingKeys: String, CodingKey {
        case text = "protocol", summary, tasks, appointments
    }
}
