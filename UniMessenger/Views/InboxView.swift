import SwiftUI

struct InboxView: View {
    @Environment(MessageHub.self) private var hub
    @State private var search = ""
    @State private var filter: Filter = .all
    @State private var platformFilter: Platform?

    enum Filter: String, CaseIterable, Identifiable {
        case all = "Alle", unread = "Ungelesen", urgent = "Dringend", archived = "Archiv"
        var id: String { rawValue }
    }

    private var visible: [Conversation] {
        hub.conversations.filter { conversation in
            switch filter {
            case .all: guard !conversation.isArchived else { return false }
            case .unread: guard !conversation.isArchived, conversation.unreadCount > 0 else { return false }
            case .urgent: guard !conversation.isArchived, conversation.priority == .urgent else { return false }
            case .archived: guard conversation.isArchived else { return false }
            }
            if let platformFilter, conversation.platform != platformFilter { return false }
            guard !search.isEmpty else { return true }
            return conversation.title.localizedCaseInsensitiveContains(search)
                || conversation.messages.contains { $0.text.localizedCaseInsensitiveContains(search) }
        }
    }

    private var platformsInUse: [Platform] {
        Platform.allCases.filter { platform in hub.conversations.contains { $0.platform == platform } }
    }

    var body: some View {
        NavigationStack {
            List {
                if hub.isTriaging {
                    Label("KI sortiert nach Dringlichkeit …", systemImage: "sparkles")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ForEach(visible) { conversation in
                    NavigationLink(value: conversation.id) {
                        ConversationRow(conversation: conversation)
                    }
                    .swipeActions(edge: .trailing) {
                        Button {
                            hub.toggleArchive(conversation.id)
                        } label: {
                            Label(conversation.isArchived ? "Zurück" : "Archiv", systemImage: "archivebox")
                        }
                        .tint(.gray)
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            hub.togglePin(conversation.id)
                        } label: {
                            Label(conversation.isPinned ? "Lösen" : "Anheften", systemImage: "pin")
                        }
                        .tint(.orange)
                        if conversation.unreadCount > 0 {
                            Button {
                                hub.markRead(conversation.id)
                            } label: {
                                Label("Gelesen", systemImage: "checkmark.message")
                            }
                            .tint(.blue)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .overlay {
                if visible.isEmpty {
                    ContentUnavailableView(search.isEmpty ? "Keine Nachrichten" : "Keine Treffer",
                                           systemImage: "tray",
                                           description: Text("Verbinden Sie Messenger unter „Konten“."))
                }
            }
            .navigationTitle("Posteingang")
            .navigationDestination(for: String.self) { id in
                ConversationView(conversationID: id)
            }
            .searchable(text: $search, prompt: "Chats und Nachrichten durchsuchen")
            .refreshable { await hub.refresh() }
            .safeAreaInset(edge: .top) { filterBar }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await hub.triage() }
                    } label: {
                        Label("KI-Sortierung", systemImage: "wand.and.stars")
                    }
                    .disabled(hub.isTriaging)
                }
            }
            .alert("Hinweis", isPresented: Binding(get: { hub.lastError != nil }, set: { if !$0 { hub.lastError = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(hub.lastError ?? "")
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Filter.allCases) { item in
                    chip(item.rawValue, selected: filter == item) { filter = item }
                }
                Divider().frame(height: 20)
                ForEach(platformsInUse) { platform in
                    chip(platform.displayName, selected: platformFilter == platform, color: platform.color) {
                        platformFilter = platformFilter == platform ? nil : platform
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
        }
        .background(.bar)
    }

    private func chip(_ title: String, selected: Bool, color: Color = .accentColor, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? color.opacity(0.2) : Color(.secondarySystemBackground), in: Capsule())
                .foregroundStyle(selected ? color : .primary)
        }
        .buttonStyle(.plain)
    }
}

struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PlatformBadge(platform: conversation.platform)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    if conversation.isPinned {
                        Image(systemName: "pin.fill").font(.caption2).foregroundStyle(.orange)
                    }
                    Text(conversation.title)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    Text(conversation.lastActivity.inboxLabel)
                        .font(.caption)
                        .foregroundStyle(conversation.unreadCount > 0 ? Color.accentColor : .secondary)
                }
                if let summary = conversation.aiSummary {
                    HStack(spacing: 6) {
                        if let priority = conversation.priority { PriorityTag(priority: priority) }
                        Text(summary).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                HStack(alignment: .top) {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Spacer()
                    if conversation.unreadCount > 0 {
                        Text("\(conversation.unreadCount)")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Color.accentColor, in: Capsule())
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var preview: String {
        guard let last = conversation.lastMessage else { return "" }
        return (last.isOutgoing ? "Ich: " : "") + last.text
    }
}
