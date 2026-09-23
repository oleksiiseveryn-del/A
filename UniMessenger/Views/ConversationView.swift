import SwiftUI

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
                        withAnimation { showAIPanel.toggle() }
                    } label: {
                        Image(systemName: showAIPanel ? "sparkles.rectangle.stack.fill" : "sparkles.rectangle.stack")
                    }
                    .accessibilityLabel("KI-Assistent ein-/ausblenden")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            if hub.hasAPIKey { showAnalysis = true } else { errorText = ClaudeClient.ClaudeError.missingAPIKey.localizedDescription }
                        } label: {
                            Label("Zusammenfassen, Aufgaben & Termine", systemImage: "doc.text.magnifyingglass")
                        }
                        Button {
                            showNote = true
                        } label: {
                            Label(conversation.note?.isEmpty == false ? "Notiz bearbeiten" : "Notiz zum Kontakt", systemImage: "note.text")
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
                if suggestions.isEmpty, conversation.lastMessage?.isOutgoing == false {
                    Task { await generate(conversation) }
                }
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
                        MessageBubble(message: message, accent: conversation.platform.color)
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
                TextField("Vorgabe, z. B. „Termin Do. 14 Uhr anbieten“", text: $instruction)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                    .submitLabel(.go)
                    .onSubmit { Task { await generate(conversation) } }
            }
            if isThinking {
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
        HStack(alignment: .bottom, spacing: 8) {
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
                    .frame(width: 32, height: 36)
            }
            .accessibilityLabel("Textbaustein einfügen")

            Menu {
                ForEach(ReplyAssistant.RewriteAction.allCases) { action in
                    Button(action.label) { Task { await rewrite(action, conversation) } }
                }
            } label: {
                Image(systemName: "wand.and.stars")
                    .font(.title3)
                    .frame(width: 36, height: 36)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isThinking)
            .accessibilityLabel("Entwurf mit KI überarbeiten")

            TextField("Nachricht an \(conversation.platform.displayName)", text: $draft, axis: .vertical)
                .lineLimit(1...8)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                .focused($draftFocused)

            Button {
                Task { await send() }
            } label: {
                Group {
                    if isSending { ProgressView() } else { Image(systemName: "arrow.up.circle.fill").font(.system(size: 32)) }
                }
                .frame(width: 36, height: 36)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
            .accessibilityLabel("Senden")
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    // MARK: - Actions

    private func generate(_ conversation: Conversation) async {
        isThinking = true
        defer { isThinking = false }
        do {
            suggestions = try await hub.assistant.suggestReplies(for: conversation, tone: tone,
                                                                 language: hub.profile.replyLanguage,
                                                                 instruction: instruction)
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
        guard !text.isEmpty else { return }
        isSending = true
        defer { isSending = false }
        do {
            try await hub.send(text, in: conversationID)
            draft = ""
            suggestions = []
            instruction = ""
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct MessageBubble: View {
    let message: Message
    let accent: Color

    var body: some View {
        HStack {
            if message.isOutgoing { Spacer(minLength: 48) }
            VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 2) {
                if !message.isOutgoing {
                    Text(message.senderName).font(.caption2.weight(.semibold)).foregroundStyle(accent)
                }
                Text(message.text)
                    .textSelection(.enabled)
                Text(message.date.formatted(date: .omitted, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(message.isOutgoing ? .white.opacity(0.7) : .secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(message.isOutgoing ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(Color(.secondarySystemBackground)),
                        in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(message.isOutgoing ? .white : .primary)
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
                    result = try await hub.assistant.analyze(conversation)
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
