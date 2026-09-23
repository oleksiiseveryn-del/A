import SwiftUI
import WebKit

struct ActiveCall: Identifiable {
    let id = UUID()
    let room: URL
    let audioOnly: Bool
}

struct EndedCall: Identifiable {
    let id = UUID()
    let minutes: Int
}

/// Full-screen call. Jitsi runs in a WKWebView with camera and microphone granted.
struct CallScreen: View {
    @Environment(MessageHub.self) private var hub
    let call: ActiveCall
    let title: String
    let onEnd: (Int) -> Void
    @State private var startedAt = Date.now
    @State private var ended = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).lineLimit(1)
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let seconds = Int(context.date.timeIntervalSince(startedAt))
                        Label(String(format: "%d:%02d", seconds / 60, seconds % 60),
                              systemImage: call.audioOnly ? "phone.fill" : "video.fill")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.white.opacity(0.75))
                    }
                }
                Spacer()
                ShareLink(item: call.room) {
                    Image(systemName: "link").frame(width: 40, height: 40).background(Color.white.opacity(0.15), in: Circle())
                }
                Button(action: end) {
                    Image(systemName: "phone.down.fill").frame(width: 40, height: 40).background(Color.red, in: Circle())
                }
                .accessibilityLabel("Auflegen")
            }
            .foregroundStyle(.white)
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color.black)

            CallWebView(url: CallSettings.joinURL(room: call.room,
                                                  displayName: "\(hub.profile.ownerName) (\(hub.profile.company))",
                                                  subject: "\(hub.profile.company) · \(title)",
                                                  audioOnly: call.audioOnly),
                        roomPath: call.room.path,
                        onLeft: end)
                .ignoresSafeArea(edges: .bottom)
        }
        .background(Color.black)
        .onAppear {
            CallSettings.activateAudio()
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private func end() {
        guard !ended else { return }
        ended = true
        onEnd(max(1, Int(Date.now.timeIntervalSince(startedAt) / 60 + 0.5)))
    }
}

struct CallWebView: UIViewRepresentable {
    let url: URL
    let roomPath: String
    let onLeft: () -> Void

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        // Stops camera and microphone immediately.
        webView.loadHTMLString("", baseURL: nil)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        let parent: CallWebView
        init(_ parent: CallWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            // Auto-grant only the call server itself; anything else gets the normal WebKit prompt.
            decisionHandler(origin.host == parent.url.host ? .grant : .prompt)
        }

        /// Jitsi navigates away from the room after hanging up – treat that as the end of the call.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let target = navigationAction.request.url
            let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
            if isMainFrame, let target, target.scheme == "https", webView.url != nil,
               target.host == parent.url.host, target.path != parent.roomPath {
                decisionHandler(.cancel)
                parent.onLeft()
                return
            }
            decisionHandler(.allow)
        }
    }
}

struct CallMenuSheet: View {
    @Environment(\.dismiss) private var dismiss
    let conversation: Conversation
    let onStart: (Bool) -> Void
    let onPlan: (Date) -> Void
    @State private var planning = false
    @State private var planDate = Calendar.current.date(bySetting: .minute, value: 0, of: .now.addingTimeInterval(3600)) ?? .now

    var body: some View {
        NavigationStack {
            List {
                if conversation.aiSummary != nil || conversation.note?.isEmpty == false {
                    Section("Worum es geht") {
                        if let summary = conversation.aiSummary { Label(summary, systemImage: "sparkles") }
                        if let note = conversation.note, !note.isEmpty { Label(note, systemImage: "note.text") }
                    }
                }
                Section {
                    Button { dismiss(); onStart(false) } label: { Label("Videoanruf jetzt starten", systemImage: "video.fill") }
                    Button { dismiss(); onStart(true) } label: { Label("Sprachanruf jetzt starten", systemImage: "phone.fill") }
                    Button { withAnimation { planning.toggle() } } label: { Label("Videotermin planen", systemImage: "calendar.badge.plus") }
                    if planning {
                        DatePicker("Termin", selection: $planDate, in: Date.now..., displayedComponents: [.date, .hourAndMinute])
                        Button("Einladung senden & in Kalender") { dismiss(); onPlan(planDate) }
                            .buttonStyle(.borderedProminent)
                    }
                } footer: {
                    Text("\(conversation.title) erhält einen Link im Chat – ein Tipp genügt, im Browser, ohne App. Bei zwei Personen läuft das Gespräch direkt von Gerät zu Gerät; die Qualität passt sich automatisch an die Verbindung an.")
                }
            }
            .navigationTitle("Anruf")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// After the call: key points (typed or dictated) become a protocol with tasks and appointments.
struct CallProtocolSheet: View {
    @Environment(MessageHub.self) private var hub
    @Environment(\.dismiss) private var dismiss
    let conversation: Conversation
    let minutes: Int
    @State private var notes = ""
    @State private var dictation = Dictation()
    @State private var result: CallProtocol?
    @State private var protocolText = ""
    @State private var isWorking = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $notes).frame(minHeight: 110)
                    Button {
                        toggleDictation()
                    } label: {
                        Label(dictation.isListening ? "Diktat beenden" : "Diktieren",
                              systemImage: dictation.isListening ? "stop.circle.fill" : "mic.fill")
                    }
                    .tint(dictation.isListening ? .red : .accentColor)
                    Button {
                        Task { await create() }
                    } label: {
                        HStack {
                            Label("Protokoll erstellen", systemImage: "sparkles")
                            if isWorking { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isWorking)
                } header: {
                    Text("Stichworte zum Gespräch")
                } footer: {
                    Text(errorText ?? "Tippen oder diktieren – die KI erstellt daraus ein Gesprächsprotokoll mit Vereinbarungen, Aufgaben und Terminen.")
                        .foregroundStyle(errorText == nil ? Color.secondary : Color.red)
                }
                if result != nil {
                    Section("Gesprächsnotiz") {
                        TextEditor(text: $protocolText).frame(minHeight: 220)
                        Button {
                            Task {
                                do {
                                    try await hub.send(protocolText, in: conversation.id)
                                    dismiss()
                                } catch {
                                    errorText = error.localizedDescription
                                }
                            }
                        } label: {
                            Label("An \(conversation.title) senden", systemImage: "paperplane.fill")
                        }
                        ShareLink(item: protocolText) { Label("Teilen", systemImage: "square.and.arrow.up") }
                    }
                }
                if let result {
                    ActionListView(todos: result.tasks, appointments: result.appointments)
                }
            }
            .navigationTitle("Anruf beendet · \(minutes) Min.")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .onDisappear { dictation.stop() }
        }
    }

    private func toggleDictation() {
        if dictation.isListening { dictation.stop(); return }
        let base = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                try await dictation.start(onText: { notes = base.isEmpty ? $0 : base + " " + $0 }, onEnd: { _ in })
            } catch {
                errorText = error.localizedDescription
            }
        }
    }

    private func create() async {
        dictation.stop()
        isWorking = true
        defer { isWorking = false }
        do {
            let output = try await hub.assistant.callProtocol(conversation, notes: notes, minutes: minutes)
            result = output
            protocolText = output.text
            errorText = nil
        } catch {
            errorText = error.localizedDescription
        }
    }
}

extension MessageBubble {
    /// Message text with tappable web links.
    static func linkified(_ text: String) -> AttributedString {
        var attributed = AttributedString(text)
        guard let detector = CallSettings.linkDetector else { return attributed }
        for match in detector.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let url = match.url, let range = Range(match.range, in: text),
                  let lower = AttributedString.Index(range.lowerBound, within: attributed),
                  let upper = AttributedString.Index(range.upperBound, within: attributed) else { continue }
            attributed[lower..<upper].link = url
            attributed[lower..<upper].underlineStyle = .single
        }
        return attributed
    }
}
