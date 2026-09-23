import SwiftUI

struct TasksView: View {
    @Environment(MessageHub.self) private var hub
    @State private var newTask = ""
    @State private var openChat: String?

    private var open: [TaskItem] {
        hub.tasks.filter { !$0.isDone }.sorted {
            ($0.due.isEmpty ? "9999" : $0.due, $1.created) < ($1.due.isEmpty ? "9999" : $1.due, $0.created)
        }
    }

    private var done: [TaskItem] {
        hub.tasks.filter(\.isDone).sorted { ($0.doneAt ?? .distantPast) > ($1.doneAt ?? .distantPast) }.prefix(20).map { $0 }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Neue Aufgabe …", text: $newTask)
                            .submitLabel(.done)
                            .onSubmit(add)
                        Button(action: add) { Image(systemName: "plus.circle.fill").font(.title2) }
                            .disabled(newTask.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                Section {
                    if open.isEmpty {
                        ContentUnavailableView("Keine offenen Aufgaben", systemImage: "checkmark.seal",
                                               description: Text("Im Chat über ••• → „Aufgaben erkennen“ oder im Tagesbriefing hinzufügen."))
                    }
                    ForEach(open) { row($0) }
                        .onDelete { offsets in
                            for id in offsets.map({ open[$0].id }) { hub.deleteTask(id) }
                        }
                }
                if !done.isEmpty {
                    Section("Erledigt") {
                        ForEach(done) { row($0) }
                            .onDelete { offsets in
                                for id in offsets.map({ done[$0].id }) { hub.deleteTask(id) }
                            }
                    }
                }
            }
            .navigationTitle("Aufgaben")
            .navigationDestination(item: $openChat) { id in
                ConversationView(conversationID: id)
            }
        }
    }

    private func add() {
        if hub.addTask(text: newTask) { newTask = "" }
    }

    private func row(_ task: TaskItem) -> some View {
        let parts = Calendar.gregorian.dateComponents([.year, .month, .day], from: .now)
        let today = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        let overdue = !task.isDone && !task.due.isEmpty && task.due < today
        return HStack(alignment: .top, spacing: 12) {
            Button {
                withAnimation { hub.toggleTask(task.id) }
            } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 3) {
                Text(task.text)
                    .strikethrough(task.isDone)
                    .foregroundStyle(task.isDone ? .secondary : .primary)
                HStack(spacing: 8) {
                    if !task.due.isEmpty {
                        Label(ActionAppointment.label(task.due), systemImage: "calendar")
                            .foregroundStyle(overdue ? Color.red : .secondary)
                    }
                    if !task.source.isEmpty {
                        Button {
                            openChat = task.conversationID
                        } label: {
                            Label(task.source, systemImage: "bubble.left")
                        }
                        .buttonStyle(.borderless)
                        .disabled(hub.conversation(id: task.conversationID) == nil)
                    }
                }
                .font(.caption)
            }
        }
    }
}
