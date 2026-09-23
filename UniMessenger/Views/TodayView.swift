import SwiftUI

struct TodayView: View {
    @Environment(MessageHub.self) private var hub
    @Environment(SpeechReader.self) private var reader
    @Binding var tab: AppTab
    @State private var openChat: String?

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let first = hub.profile.ownerName.split(separator: " ").first.map(String.init) ?? ""
        return (hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend") + ", " + first
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(greeting).font(.title2.bold())
                        HStack(spacing: 10) {
                            stat(hub.totalUnread, "Ungelesen") { tab = .inbox }
                            stat(hub.conversations.filter { !$0.isArchived && $0.priority == .urgent }.count, "Dringend", hot: true) { tab = .inbox }
                            stat(hub.openTaskCount, "Aufgaben") { tab = .tasks }
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                if !hub.hasAPIKey {
                    Section {
                        Text("Für das KI-Tagesbriefing bitte einen API-Schlüssel hinterlegen.")
                        Button("Zu den Einstellungen") { tab = .settings }
                    }
                } else if hub.isBriefingLoading {
                    Section {
                        HStack { ProgressView(); Text("Die KI erstellt Ihr Tagesbriefing …").foregroundStyle(.secondary) }
                    }
                } else if let briefing = hub.briefing {
                    Section {
                        Text(briefing.summary)
                    } header: {
                        Label("Lagebild · \(briefing.created?.formatted(date: .omitted, time: .shortened) ?? "") Uhr", systemImage: "sparkles")
                    }
                    if !briefing.urgent.isEmpty {
                        Section("Heute reagieren") {
                            ForEach(briefing.urgent, id: \.self) { item in
                                Button {
                                    openChat = item.conversation_id
                                } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(hub.conversation(id: item.conversation_id)?.title ?? "Chat").foregroundStyle(.primary)
                                        Text(item.reason).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                    ActionListView(todos: briefing.todos, appointments: briefing.appointments)
                } else {
                    Section {
                        Button {
                            Task { await hub.loadBriefing() }
                        } label: {
                            Label("Briefing erstellen", systemImage: "sparkles")
                        }
                    }
                }
            }
            .navigationTitle("Heute")
            .navigationDestination(item: $openChat) { id in
                ConversationView(conversationID: id)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if reader.isSpeaking {
                            reader.stop()
                        } else if let briefing = hub.briefing {
                            reader.speak(SpeechReader.parts(for: briefing) { hub.conversation(id: $0)?.title ?? "Chat" })
                        }
                    } label: {
                        Label("Briefing vorlesen", systemImage: reader.isSpeaking ? "stop.circle" : "speaker.wave.2")
                    }
                    .disabled(hub.briefing == nil && !reader.isSpeaking)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await hub.loadBriefing() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(hub.isBriefingLoading || !hub.hasAPIKey)
                }
            }
            .refreshable { await hub.loadBriefing() }
            .task {
                if hub.hasAPIKey, hub.isBriefingStale, !hub.conversations.isEmpty {
                    await hub.loadBriefing()
                }
            }
        }
    }

    private func stat(_ value: Int, _ label: String, hot: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading) {
                Text("\(value)").font(.title.bold()).foregroundStyle(hot && value > 0 ? Color.red : .primary)
                Text(label).font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }
}
