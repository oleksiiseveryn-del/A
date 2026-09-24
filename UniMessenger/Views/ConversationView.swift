import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct ConversationView: View {
    @Environment(MessageHub.self) private var hub
    let conversationID: String

    @State private var draft = ""
    @State private var suggestions: [ReplySuggestion] = []
    @State private var tone: AssistantProfile.Tone = .professional
    @State private var instruction = ""
    @State private var isThinking = false
    @State private var isSending = false
    @State private var showAIPanel = true
    @State private var errorText: String?
    @State private var showAnalysis = false
    @State private var showNote = false
    @State private var pending: [PendingAttachment] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var showFileImporter = false
    @State private var showEmoji = false
    @State private var showRecorder = false
    @State private var dictation = Dictation()
    @State private var dictationTarget: DictationTarget?
    @State private var showCallMenu = false
    @State private var activeCall: ActiveCall?
    @State private var endedCall: EndedCall?
    /// Presentations queued until the covering sheet/cover has finished dismissing.
    @State private var queuedCallAudioOnly: Bool?
    @State private var queuedProtocolMinutes: Int?
    @Environment(\.openURL) private var openURL
    @Environment(SpeechReader.self) private var reader

    private enum DictationTarget { case draft, instruction }
    @Environment(\.dismiss) private var dismiss
    @FocusState private var draftFocused: Bool

    private var conversation: Conversation? {
        hub.conversations.first { $0.id == conversationID }
    }

    var body: some View {
        if let conversation {
            VStack(spacing: 0) {
                if let note = conversation.note, !note.isEmpty {
                    Button {
                        showNote = true
                    } label: {
                        Label(note, systemImage: "note.text")
                            .font(.caption)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                            .padding(.vertical, 6)
                            .background(Color(.secondarySystemBackground))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
                messageList(conversation)
                Divider()
                if showAIPanel { aiPanel(conversation) }
                if !pending.isEmpty { pendingTray }
                if showEmoji {
                    EmojiPanel { draft += $0 }
                }
                composer(conversation)
            }
            .navigationTitle(conversation.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(conversation.title).font(.headline).lineLimit(1)
                        Text(conversation.platform.displayName).font(.caption).foregroundStyle(conversation.platform.color)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if reader.isSpeaking { reader.stop() } else { reader.speak(SpeechReader.parts(forChat: conversation)) }
                    } label: {
                        Image(systemName: reader.isSpeaking ? "stop.circle" : "speaker.wave.2")
                    }
                    .accessibilityLabel("Offene Nachrichten vorlesen")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCallMenu = true
                    } label: {
                        Image(systemName: "video")
                    }
                    .accessibilityLabel("Video- oder Sprachanruf")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            if hub.hasAPIKey { showAnalysis = true } else { openSubscriptionAssistant(conversation, task: .actions) }
                        } label: {
                            Label("Zusammenfassen, Aufgaben & Termine", systemImage: "doc.text.magnifyingglass")
                        }
                        Button {
                            showNote = true
                        } label: {
                            Label(conversation.note?.isEmpty == false ? "Notiz bearbeiten" : "Notiz zum Kontakt", systemImage: "note.text")
                        }
                        Button {
                            openSubscriptionAssistant(conversation)
                        } label: {
                            Label("KI über Claude-Abo", systemImage: "sparkles")
                        }
                        Button {
                            showCallMenu = true
                        } label: {
                            Label("Video- oder Sprachanruf", systemImage: "video")
                        }
                        Button {
                            reader.speak(SpeechReader.parts(forChat: conversation))
                        } label: {
                            Label("Offene Nachrichten vorlesen", systemImage: "speaker.wave.2")
                        }
                        Button {
                            withAnimation { showAIPanel.toggle() }
                        } label: {
                            Label(showAIPanel ? "KI-Vorschläge ausblenden" : "KI-Vorschläge einblenden", systemImage: "sparkles")
                        }
                        Button {
                            hub.togglePin(conversationID)
                        } label: {
                            Label(conversation.isPinned ? "Nicht mehr anheften" : "Oben anheften", systemImage: "pin")
                        }
                        Button {
                            hub.toggleArchive(conversationID)
                            dismiss()
                        } label: {
                            Label(conversation.isArchived ? "Aus dem Archiv holen" : "Archivieren", systemImage: "archivebox")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .onAppear {
                tone = hub.profile.defaultTone
                hub.markRead(conversationID)
                if let cached = hub.cachedSuggestions(for: conversation) {
                    suggestions = cached
                } else if suggestions.isEmpty, conversation.lastMessage?.isOutgoing == false, hub.hasAPIKey {
                    Task { await generate(conversation) }
                }
            }
            .photosPicker(isPresented: $showPhotoPicker, selection: $photoItems, maxSelectionCount: 10,
                          matching: .any(of: [.images, .videos]))
            .onChange(of: photoItems) { Task { await loadPickedPhotos() } }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { image in
                    if let jpeg = image.jpegData(compressionQuality: 0.9) {
                        pending.append(.make(data: jpeg, name: "Foto-\(Int(Date.now.timeIntervalSince1970)).jpg",
                                             mime: "image/jpeg"))
                    }
                }
                .ignoresSafeArea()
            }
            .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                guard case .success(let urls) = result else { return }
                for url in urls {
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    if let data = try? Data(contentsOf: url) {
                        pending.append(.make(data: data, name: url.lastPathComponent, mime: FileStore.mimeType(for: url)))
                    }
                }
            }
            .sheet(isPresented: $showRecorder) {
                VoiceRecorderSheet { data in
                    let stamp = Date.now.formatted(.dateTime.hour().minute()).replacingOccurrences(of: ":", with: "-")
                    pending.append(PendingAttachment(data: data, name: "Sprachnachricht \(stamp).m4a", mime: "audio/mp4"))
                }
            }
            .onDisappear { dictation.stop() }
            .sheet(isPresented: $showCallMenu, onDismiss: {
                // The call screen can only be presented once the menu sheet is gone.
                if let audioOnly = queuedCallAudioOnly {
                    queuedCallAudioOnly = nil
                    startCall(audioOnly: audioOnly)
                }
            }) {
                CallMenuSheet(conversation: conversation,
                              onStart: { audioOnly in queuedCallAudioOnly = audioOnly },
                              onPlan: { date in Task { await planCall(at: date, conversation) } })
            }
            .fullScreenCover(item: $activeCall, onDismiss: {
                if let minutes = queuedProtocolMinutes {
                    queuedProtocolMinutes = nil
                    endedCall = EndedCall(minutes: minutes)
                }
            }) { call in
                CallScreen(call: call, title: conversation.title) { minutes in
                    queuedProtocolMinutes = minutes
                    activeCall = nil
                }
            }
            .sheet(item: $endedCall) { ended in
                CallProtocolSheet(conversation: conversation, minutes: ended.minutes)
            }
            .sheet(isPresented: $showAnalysis) {
                AnalysisSheet(conversation: conversation)
            }
            .sheet(isPresented: $showNote) {
                NoteEditor(conversationID: conversationID, text: conversation.note ?? "")
            }
            .alert("Fehler", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorText ?? "")
            }
        } else {
            ContentUnavailableView("Chat nicht gefunden", systemImage: "questionmark.bubble")
        }
    }

    // MARK: - Messages

    private func messageList(_ conversation: Conversation) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(conversation.messages) { message in
                        MessageBubble(message: message, accent: conversation.platform.color, conversation: conversation) { link in
                            if link.inApp { activeCall = ActiveCall(room: link.url, audioOnly: false) } else { openURL(link.url) }
                        }
                            .id(message.id)
                    }
                }
                .padding()
            }
            .onAppear {
                if let last = conversation.messages.last?.id { proxy.scrollTo(last, anchor: .bottom) }
            }
            .onChange(of: conversation.messages.count) {
                guard let last = conversation.messages.last?.id else { return }
                withAnimation { proxy.scrollTo(last, anchor: .bottom) }
            }
        }
    }

    // MARK: - AI panel

    private func aiPanel(_ conversation: Conversation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("KI-Antwortvorschläge", systemImage: "sparkles")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Menu {
                    Picker("Tonfall", selection: $tone) {
                        ForEach(AssistantProfile.Tone.allCases) { Text($0.label).tag($0) }
                    }
                } label: {
                    Label(tone.label, systemImage: "slider.horizontal.3").font(.caption)
                }
                Button {
                    Task { await generate(conversation) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(isThinking)
            }
            HStack {
                TextField("Was antworten? Tippen oder sprechen", text: $instruction)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                    .submitLabel(.go)
                    .onSubmit { Task { await generate(conversation) } }
                Button {
                    toggleDictation(.instruction, conversation)
                } label: {
                    Image(systemName: dictationTarget == .instruction ? "stop.circle.fill" : "mic.fill")
                        .symbolEffect(.pulse, isActive: dictationTarget == .instruction)
                }
                .buttonStyle(.bordered)
                .tint(dictationTarget == .instruction ? .red : .accentColor)
                .accessibilityLabel("Vorgabe sprechen – die KI formuliert")
            }
            if !hub.hasAPIKey {
                Button {
                    openSubscriptionAssistant(conversation)
                } label: {
                    Label("KI über Claude-Abo (Chat kopieren & öffnen)", systemImage: "sparkles")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
            } else if isThinking {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Entwürfe werden erstellt …").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 60)
            } else if !suggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 8) {
                        ForEach(suggestions) { suggestion in
                            Button {
                                draft = suggestion.text
                                draftFocused = true
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(suggestion.label).font(.caption.weight(.bold)).foregroundStyle(Color.accentColor)
                                    Text(suggestion.text).font(.caption).foregroundStyle(.primary)
                                        .multilineTextAlignment(.leading).lineLimit(5)
                                }
                                .padding(10)
                                .frame(width: 240, alignment: .topLeading)
                                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Composer

    private func composer(_ conversation: Conversation) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            Menu {
                Button { showCamera = true } label: { Label("Kamera", systemImage: "camera") }
                Button { showPhotoPicker = true } label: { Label("Fotos & Videos", systemImage: "photo.on.rectangle") }
                Button { showFileImporter = true } label: { Label("Dokument (PDF, Plan, Excel …)", systemImage: "doc") }
                Button { showRecorder = true } label: { Label("Sprachnachricht aufnehmen", systemImage: "mic") }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                    .frame(width: 30, height: 36)
            }
            .accessibilityLabel("Foto oder Dokument anhängen")

            Menu {
                ForEach(hub.templates) { template in
                    Button(template.title) {
                        draft = draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? template.text : draft.trimmingCharacters(in: .whitespacesAndNewlines) + " " + template.text
                        draftFocused = true
                    }
                }
            } label: {
                Image(systemName: "text.badge.plus")
                    .font(.title3)
                    .frame(width: 28, height: 36)
            }
            .accessibilityLabel("Textbaustein einfügen")

            Menu {
                ForEach(ReplyAssistant.RewriteAction.allCases) { action in
                    Button(action.label) {
                        if hub.hasAPIKey {
                            Task { await rewrite(action, conversation) }
                        } else {
                            openURL(SubscriptionHandOff.prepare(draft, task: .rewrite))
                        }
                    }
                }
                Divider()
                Button {
                    reader.speak([.init(text: draft)])
                } label: {
                    Label("Entwurf vorlesen", systemImage: "speaker.wave.2")
                }
            } label: {
                Image(systemName: "wand.and.stars")
                    .font(.title3)
                    .frame(width: 28, height: 36)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isThinking)
            .accessibilityLabel("Entwurf mit KI überarbeiten")

            TextField("Nachricht an \(conversation.platform.displayName)", text: $draft, axis: .vertical)
                .lineLimit(1...8)
                .padding(.leading, 12)
                .padding(.trailing, 64)
                .padding(.vertical, 8)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                .focused($draftFocused)
                .overlay(alignment: .bottomTrailing) {
                    HStack(spacing: 0) {
                        Button {
                            toggleDictation(.draft, conversation)
                        } label: {
                            Image(systemName: dictationTarget == .draft ? "stop.circle.fill" : "mic")
                                .font(.title3)
                                .foregroundStyle(dictationTarget == .draft ? Color.red : Color.accentColor)
                                .symbolEffect(.pulse, isActive: dictationTarget == .draft)
                                .padding(6)
                        }
                        .accessibilityLabel("Spracheingabe")
                        Button {
                            withAnimation { showEmoji.toggle() }
                        } label: {
                            Image(systemName: showEmoji ? "keyboard" : "face.smiling")
                                .font(.title3)
                                .padding(6)
                        }
                        .accessibilityLabel("Emoji")
                    }
                }

            Button {
                Task { await send() }
            } label: {
                Group {
                    if isSending { ProgressView() } else { Image(systemName: "arrow.up.circle.fill").font(.system(size: 32)) }
                }
                .frame(width: 36, height: 36)
            }
            .disabled((draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && pending.isEmpty) || isSending)
            .accessibilityLabel("Senden")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    private var pendingTray: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(pending) { item in
                    HStack(spacing: 8) {
                        if let thumbnail = item.thumbnail {
                            Image(uiImage: thumbnail).resizable().scaledToFill()
                                .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                        } else {
                            Image(systemName: Attachment(kind: Attachment.kind(for: item.mime), name: item.name, mime: item.mime,
                                                         size: item.data.count, source: .local(key: "")).symbol)
                                .font(.title2).frame(width: 44, height: 44)
                        }
                        VStack(alignment: .leading) {
                            Text(item.name).font(.caption).lineLimit(1)
                            Text(ByteCountFormatter.string(fromByteCount: Int64(item.data.count), countStyle: .file))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: 120, alignment: .leading)
                        Button {
                            pending.removeAll { $0.id == item.id }
                        } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .disabled(isSending)
                    }
                    .padding(6)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
        }
        .opacity(isSending ? 0.5 : 1)
    }

    // MARK: - AI via Claude subscription

    /// Without an API key: copies the chat and opens the OS AI assistant on claude.ai,
    /// which runs on the user's own Claude subscription.
    private func openSubscriptionAssistant(_ conversation: Conversation, task: SubscriptionHandOff.Task = .reply) {
        openURL(SubscriptionHandOff.prepare(SubscriptionHandOff.chatText(conversation, ownerName: hub.profile.ownerName), task: task))
    }

    // MARK: - Calls

    /// Opens the call at once and sends the invitation link in parallel – fast hand-over.
    private func startCall(audioOnly: Bool) {
        reader.stop()
        dictation.stop()
        let room = CallSettings.newRoomURL()
        activeCall = ActiveCall(room: room, audioOnly: audioOnly)
        Task {
            do {
                try await hub.send(CallSettings.invitation(url: room, from: hub.profile, audioOnly: audioOnly), in: conversationID)
            } catch {
                errorText = "Einladung nicht gesendet: \(error.localizedDescription)"
            }
        }
    }

    private func planCall(at date: Date, _ conversation: Conversation) async {
        let room = CallSettings.newRoomURL()
        let when = date.formatted(.dateTime.weekday(.abbreviated).day().month(.twoDigits).hour().minute().locale(Locale(identifier: "de_DE")))
        let text = "🗓 Einladung zum Videogespräch mit \(hub.profile.ownerName) (\(hub.profile.company)) am \(when) Uhr:\n\(room.absoluteString)\nZum Termin einfach den Link antippen – keine App nötig."
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = .gregorian
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        do {
            try await hub.send(text, in: conversationID)
            try await CalendarService.add(ActionAppointment(conversation_id: conversationID, title: "Videogespräch \(conversation.title)",
                                                            start: formatter.string(from: date), duration_minutes: 30,
                                                            location: room.absoluteString),
                                          context: conversation.title)
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func toggleDictation(_ target: DictationTarget, _ conversation: Conversation) {
        if dictation.isListening {
            dictation.stop()
            return
        }
        reader.stop()
        let base = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        dictationTarget = target
        Task {
            do {
                try await dictation.start(onText: { text in
                    switch target {
                    case .draft: draft = base.isEmpty ? text : base + " " + text
                    case .instruction: instruction = text
                    }
                }, onEnd: { text in
                    dictationTarget = nil
                    // Spoken instruction: the AI turns it into a professional reply.
                    if target == .instruction, !text.isEmpty {
                        Task { await generate(conversation) }
                    }
                })
            } catch {
                dictationTarget = nil
                errorText = error.localizedDescription
            }
        }
    }

    private func loadPickedPhotos() async {
        let items = photoItems
        guard !items.isEmpty else { return }
        photoItems = []
        for (index, item) in items.enumerated() {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let type = item.supportedContentTypes.first
            let ext = type?.preferredFilenameExtension ?? "jpg"
            pending.append(.make(data: data, name: "Foto-\(index + 1).\(ext)", mime: type?.preferredMIMEType ?? "image/jpeg"))
        }
    }

    // MARK: - Actions

    private func generate(_ conversation: Conversation) async {
        isThinking = true
        defer { isThinking = false }
        do {
            suggestions = try await hub.suggestions(for: conversation, tone: tone, instruction: instruction)
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func rewrite(_ action: ReplyAssistant.RewriteAction, _ conversation: Conversation) async {
        isThinking = true
        defer { isThinking = false }
        do {
            draft = try await hub.assistant.rewrite(draft, action: action, context: conversation)
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !pending.isEmpty else { return }
        isSending = true
        defer { isSending = false }
        showEmoji = false
        do {
            while let item = pending.first {
                try await hub.sendFile(item.data, name: item.name, mime: item.mime, in: conversationID)
                pending.removeFirst()
            }
            if !text.isEmpty { try await hub.send(text, in: conversationID) }
            draft = ""
            suggestions = []
            instruction = ""
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct MessageBubble: View {
    @Environment(SpeechReader.self) private var reader
    let message: Message
    let accent: Color
    let conversation: Conversation
    var onJoinCall: ((url: URL, inApp: Bool)) -> Void = { _ in }

    var body: some View {
        HStack {
            if message.isOutgoing { Spacer(minLength: 48) }
            VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 2) {
                if !message.isOutgoing {
                    Text(message.senderName).font(.caption2.weight(.semibold)).foregroundStyle(accent)
                }
                if let attachment = message.attachment {
                    AttachmentBubble(attachment: attachment, conversation: conversation, isOutgoing: message.isOutgoing)
                }
                if !message.text.isEmpty {
                    Text(Self.linkified(message.text))
                        .tint(message.isOutgoing ? .white : .accentColor)
                        .textSelection(.enabled)
                }
                if let link = CallSettings.meetingLink(in: message.text) {
                    Button {
                        onJoinCall(link)
                    } label: {
                        Label("Anruf beitreten", systemImage: "video.fill")
                            .font(.subheadline.weight(.bold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(message.isOutgoing ? Color.white : Color.green, in: Capsule())
                            .foregroundStyle(message.isOutgoing ? Color.green : Color.white)
                    }
                    .buttonStyle(.plain)
                }
                Text(message.date.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(message.isOutgoing ? .white.opacity(0.7) : .secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(message.isOutgoing ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(Color(.secondarySystemBackground)),
                        in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(message.isOutgoing ? .white : .primary)
            .contextMenu {
                Button {
                    reader.speak(SpeechReader.parts(for: message))
                } label: {
                    Label("Vorlesen", systemImage: "speaker.wave.2")
                }
                if !message.text.isEmpty {
                    Button {
                        UIPasteboard.general.string = message.text
                    } label: {
                        Label("Text kopieren", systemImage: "doc.on.doc")
                    }
                }
            }
            if !message.isOutgoing { Spacer(minLength: 48) }
        }
    }
}

struct AnalysisSheet: View {
    @Environment(MessageHub.self) private var hub
    @Environment(\.dismiss) private var dismiss
    let conversation: Conversation
    @State private var result: ChatAnalysis?
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            List {
                if let result {
                    Section("Zusammenfassung") { Text(result.summary) }
                    ActionListView(todos: result.tasks, appointments: result.appointments)
                } else if let errorText {
                    Text(errorText).foregroundStyle(.red)
                } else {
                    HStack { ProgressView(); Text("Die KI liest den Chat …").foregroundStyle(.secondary) }
                }
            }
            .navigationTitle(conversation.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } }
            }
            .task {
                do {
                    let media = await hub.mediaBlocks(for: conversation, images: 3, pdf: true)
                    result = try await hub.assistant.analyze(conversation, media: media)
                } catch {
                    errorText = error.localizedDescription
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct NoteEditor: View {
    @Environment(MessageHub.self) private var hub
    @Environment(\.dismiss) private var dismiss
    let conversationID: String
    @State var text: String

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text).frame(minHeight: 140)
                } footer: {
                    Text("Die KI berücksichtigt diese Notiz bei jedem Vorschlag, z. B. Bauvorhaben, Auftragsnummer, Ansprechpartner, Besonderheiten.")
                }
            }
            .navigationTitle("Notiz zum Kontakt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern") {
                        hub.setNote(text, for: conversationID)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
