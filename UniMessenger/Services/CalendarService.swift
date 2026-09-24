import EventKit

/// Adds AI-detected appointments to the iPhone calendar (write-only access, iOS 17+).
enum CalendarService {
    private static let store = EKEventStore()

    enum CalendarError: LocalizedError {
        case noDate, denied

        var errorDescription: String? {
            switch self {
            case .noDate: "Kein Datum erkannt – bitte im Kalender manuell anlegen."
            case .denied: "Kein Kalenderzugriff. Bitte unter Einstellungen → Datenschutz → Kalender erlauben."
            }
        }
    }

    static func add(_ appointment: ActionAppointment, context: String?) async throws {
        guard let start = appointment.startDate else { throw CalendarError.noDate }
        guard try await store.requestWriteOnlyAccessToEvents() else { throw CalendarError.denied }
        let event = EKEvent(eventStore: store)
        event.title = appointment.title
        event.location = appointment.location.isEmpty ? nil : appointment.location
        event.notes = context.map { "Aus Chat: \($0)" } ?? "Erstellt mit OS"
        event.startDate = start.date
        if start.hasTime {
            event.endDate = start.date.addingTimeInterval(TimeInterval(max(appointment.duration_minutes, 15) * 60))
            event.addAlarm(EKAlarm(relativeOffset: -30 * 60))
        } else {
            event.isAllDay = true
            event.endDate = start.date
        }
        event.calendar = store.defaultCalendarForNewEvents
        try store.save(event, span: .thisEvent)
    }
}
