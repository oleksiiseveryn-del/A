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
    @FocusState private var draftFocused: Bool

    private var conversation: Conversation? {
        hub.conversations.first { $0.id == conversationID }
    }

    var body: some View {
        if let conversation {
            VStack(spacing: 0) {
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
            }
            .onAppear {
                tone = hub.profile.defaultTone
                hub.markRead(conversationID)
                if suggestions.isEmpty, conversation.lastMessage?.isOutgoing == false {
                    Task { await generate(conversation) }
                }
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
