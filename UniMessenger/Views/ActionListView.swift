import SwiftUI

/// To-dos and appointments suggested by the AI, each with a one-tap action.
struct ActionListView: View {
    @Environment(MessageHub.self) private var hub
    let todos: [ActionTodo]
    let appointments: [ActionAppointment]
    @State private var added: Set<String> = []
    @State private var message: String?

    var body: some View {
        Group { content }
            .alert("Hinweis", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(message ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        if todos.isEmpty && appointments.isEmpty {
            Text("Keine offenen Aufgaben oder Termine erkannt.").foregroundStyle(.secondary)
        }
        if !todos.isEmpty {
            Section("Aufgaben") {
                ForEach(todos, id: \.self) { todo in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(todo.text)
                            if !todo.due.isEmpty {
                                Text("fällig \(ActionAppointment.label(todo.due))").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button {
                            hub.addTask(text: todo.text, due: todo.due, conversationID: todo.conversation_id)
                            added.insert(todo.text)
                        } label: {
                            Label(added.contains(todo.text) ? "Gespeichert" : "Aufgabe",
                                  systemImage: added.contains(todo.text) ? "checkmark" : "plus")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(added.contains(todo.text))
                    }
                }
            }
        }
        if !appointments.isEmpty {
            Section("Termine") {
                ForEach(appointments, id: \.self) { appointment in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(appointment.title)
                            Text(ActionAppointment.label(appointment.start)
                                 + (appointment.location.isEmpty ? "" : " · \(appointment.location)"))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button {
                            Task {
                                do {
                                    try await CalendarService.add(appointment,
                                                                  context: hub.conversation(id: appointment.conversation_id)?.title)
                                    added.insert(appointment.title + appointment.start)
                                } catch {
                                    message = error.localizedDescription
                                }
                            }
                        } label: {
                            Label(added.contains(appointment.title + appointment.start) ? "Eingetragen" : "Kalender",
                                  systemImage: added.contains(appointment.title + appointment.start) ? "checkmark" : "calendar.badge.plus")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(added.contains(appointment.title + appointment.start))
                    }
                }
            }
        }
    }
}
