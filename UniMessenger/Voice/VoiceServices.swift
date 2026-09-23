import AVFoundation
import Observation
import Speech

enum VoiceError: LocalizedError {
    case notAllowed, unavailable

    var errorDescription: String? {
        switch self {
        case .notAllowed: "Mikrofon bzw. Spracherkennung nicht erlaubt – bitte in den iPhone-Einstellungen → OS erlauben."
        case .unavailable: "Spracherkennung für diese Sprache gerade nicht verfügbar."
        }
    }
}

enum VoiceSettings {
    static let languages: [(id: String, name: String)] = [
        ("de-DE", "Deutsch"), ("uk-UA", "Українська"), ("ru-RU", "Русский"), ("pl-PL", "Polski"), ("en-US", "English"),
    ]
    static let rates: [(value: Double, name: String)] = [(0.85, "Langsam"), (1, "Normal"), (1.15, "Schnell"), (1.3, "Sehr schnell")]

    static var language: String { UserDefaults.standard.string(forKey: "speechLang") ?? "de-DE" }
    static var rate: Double {
        let value = UserDefaults.standard.double(forKey: "speechRate")
        return value == 0 ? 1 : value
    }

    /// Ukrainian/Russian voices for Cyrillic text, otherwise the configured language.
    static func language(for text: String) -> String {
        let configured = language
        let cyrillic = text.unicodeScalars.contains { (0x0400...0x04FF).contains($0.value) }
        if cyrillic {
            if text.rangeOfCharacter(from: CharacterSet(charactersIn: "іїєґІЇЄҐ")) != nil { return "uk-UA" }
            if text.rangeOfCharacter(from: CharacterSet(charactersIn: "ыэъЫЭЪ")) != nil { return "ru-RU" }
            return configured.hasPrefix("uk") || configured.hasPrefix("ru") ? configured : "uk-UA"
        }
        return configured.hasPrefix("uk") || configured.hasPrefix("ru") ? "de-DE" : configured
    }
}

// MARK: - Dictation (speech to text)

@MainActor
@Observable
final class Dictation {
    private(set) var isListening = false
    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var onText: ((String) -> Void)?
    @ObservationIgnored private var onEnd: ((String) -> Void)?
    @ObservationIgnored private var latest = ""

    /// Streams the recognised text to `onText`; `onEnd` receives the final text.
    func start(onText: @escaping (String) -> Void, onEnd: @escaping (String) -> Void) async throws {
        stop()
        guard await Self.authorize() else { throw VoiceError.notAllowed }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: VoiceSettings.language)),
              recognizer.isAvailable else { throw VoiceError.unavailable }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        Self.installTap(on: engine.inputNode, request: request)
        engine.prepare()
        try engine.start()

        self.request = request
        self.onText = onText
        self.onEnd = onEnd
        latest = ""
        isListening = true
        task = Self.recognize(recognizer, request) { [weak self] text, done in
            Task { @MainActor in self?.handle(text, done: done) }
        }
    }

    func stop() {
        guard isListening else { return }
        finish()
    }

    private func handle(_ text: String?, done: Bool) {
        guard isListening else { return }
        if let text {
            latest = text
            onText?(text)
        }
        if done { finish() }
    }

    private func finish() {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let callback = onEnd
        onEnd = nil
        onText = nil
        callback?(latest)
    }

    // The tap and recognition callbacks run on audio/background threads, so they
    // are created outside the main actor.
    nonisolated private static func installTap(on input: AVAudioInputNode, request: SFSpeechAudioBufferRecognitionRequest) {
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
    }

    nonisolated private static func recognize(_ recognizer: SFSpeechRecognizer, _ request: SFSpeechAudioBufferRecognitionRequest,
                                              handler: @escaping @Sendable (String?, Bool) -> Void) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            handler(result?.bestTranscription.formattedString, error != nil || result?.isFinal == true)
        }
    }

    nonisolated static func authorize() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}

// MARK: - Reading aloud (text to speech)

@MainActor
@Observable
final class SpeechReader {
    struct Part {
        let text: String
        var language: String?
    }

    private(set) var isSpeaking = false
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private let delegate = Delegate()
    @ObservationIgnored private var pending = 0

    init() {
        synthesizer.delegate = delegate
        delegate.onUtteranceDone = { [weak self] in
            Task { @MainActor in self?.utteranceDone() }
        }
    }

    func speak(_ parts: [Part]) {
        let list = parts.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !list.isEmpty else { return }
        stop()
        // Plays even when the ring/silent switch is on; other audio is ducked.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        for part in list {
            let utterance = AVSpeechUtterance(string: part.text)
            let language = part.language ?? VoiceSettings.language(for: part.text)
            utterance.voice = Self.bestVoice(for: language)
            utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate,
                                 AVSpeechUtteranceDefaultSpeechRate * Float(VoiceSettings.rate))
            utterance.postUtteranceDelay = 0.15
            synthesizer.speak(utterance)
        }
        pending = list.count
        isSpeaking = true
    }

    func stop() {
        pending = 0
        isSpeaking = false
        synthesizer.stopSpeaking(at: .immediate)
    }

    private func utteranceDone() {
        pending = max(0, pending - 1)
        if pending == 0 {
            isSpeaking = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    static func bestVoice(for language: String) -> AVSpeechSynthesisVoice? {
        let voices = AVSpeechSynthesisVoice.speechVoices()
        let exact = voices.filter { $0.language == language }
        let candidates = exact.isEmpty ? voices.filter { $0.language.prefix(2) == language.prefix(2) } : exact
        return candidates.max { $0.quality.rawValue < $1.quality.rawValue } ?? AVSpeechSynthesisVoice(language: language)
    }

    private final class Delegate: NSObject, AVSpeechSynthesizerDelegate {
        var onUtteranceDone: (() -> Void)?

        func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
            onUtteranceDone?()
        }
    }
}

// MARK: - Voice messages

@MainActor
@Observable
final class VoiceRecorder {
    private(set) var isRecording = false
    private(set) var startedAt: Date?
    @ObservationIgnored private var recorder: AVAudioRecorder?

    func start() async throws {
        guard await AVAudioApplication.requestRecordPermission() else { throw VoiceError.notAllowed }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let recorder = try AVAudioRecorder(url: url, settings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ])
        guard recorder.record() else { throw VoiceError.unavailable }
        self.recorder = recorder
        startedAt = .now
        isRecording = true
    }

    /// Stops and returns the recording as m4a data.
    func finish() -> Data? {
        guard let recorder else { return nil }
        recorder.stop()
        let data = try? Data(contentsOf: recorder.url)
        cleanup()
        return data
    }

    func cancel() {
        recorder?.stop()
        cleanup()
    }

    private func cleanup() {
        if let url = recorder?.url { try? FileManager.default.removeItem(at: url) }
        recorder = nil
        isRecording = false
        startedAt = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// MARK: - What is read aloud

extension SpeechReader {
    static func parts(for message: Message) -> [Part] {
        let who = message.isOutgoing ? "Sie" : message.senderName
        var intro = "\(who) schreibt:"
        if let attachment = message.attachment {
            let what = switch attachment.kind {
            case .image: "ein Foto"
            case .video: "ein Video"
            case .audio: "eine Sprachnachricht"
            case .file: "das Dokument " + (attachment.name as NSString).deletingPathExtension
            }
            intro = "\(who) schickt \(what)" + (message.text.isEmpty ? "." : " und schreibt:")
        }
        return [Part(text: intro, language: "de-DE")] + (message.text.isEmpty ? [] : [Part(text: message.text)])
    }

    /// Messages since the last own reply (at most 8), or the last three if everything is answered.
    static func parts(forChat conversation: Conversation) -> [Part] {
        let lastOwn = conversation.messages.lastIndex { $0.isOutgoing }
        let open = Array(conversation.messages[(lastOwn.map { $0 + 1 } ?? 0)...].suffix(8))
        let list = open.isEmpty ? Array(conversation.messages.suffix(3)) : open
        return [Part(text: "\(conversation.platform.displayName), \(conversation.title).", language: "de-DE")]
            + list.flatMap(parts(for:))
    }

    static func parts(forNew conversations: [Conversation]) -> [Part] {
        let rank: [Priority: Int] = [.urgent: 0, .normal: 1, .low: 2]
        let chats = conversations.filter { !$0.isArchived && $0.unreadCount > 0 }
            .sorted { rank[$0.priority ?? .normal, default: 1] < rank[$1.priority ?? .normal, default: 1] }
        guard !chats.isEmpty else { return [Part(text: "Keine neuen Nachrichten.", language: "de-DE")] }
        let total = chats.reduce(0) { $0 + $1.unreadCount }
        var result = [Part(text: "\(total == 1 ? "Eine neue Nachricht" : "\(total) neue Nachrichten") in \(chats.count == 1 ? "einem Chat" : "\(chats.count) Chats").",
                           language: "de-DE")]
        for chat in chats {
            result.append(Part(text: "\(chat.priority == .urgent ? "Dringend! " : "")\(chat.platform.displayName) von \(chat.title).",
                               language: "de-DE"))
            let incoming = chat.messages.filter { !$0.isOutgoing }.suffix(min(chat.unreadCount, 5))
            result += incoming.flatMap(parts(for:))
        }
        return result
    }

    static func parts(for briefing: Briefing, title: (String) -> String) -> [Part] {
        var text = [briefing.summary]
        if !briefing.urgent.isEmpty {
            text.append("Heute reagieren: " + briefing.urgent.map { "\(title($0.conversation_id)), \($0.reason)" }.joined(separator: ". ") + ".")
        }
        if !briefing.todos.isEmpty { text.append("Aufgaben: " + briefing.todos.map(\.text).joined(separator: ". ") + ".") }
        if !briefing.appointments.isEmpty {
            text.append("Termine: " + briefing.appointments.map { "\($0.title), \(ActionAppointment.label($0.start))" }.joined(separator: ". ") + ".")
        }
        return text.map { Part(text: $0, language: "de-DE") }
    }
}
