import Foundation

/// Offline sample data so the app can be tried without any accounts.
final class DemoConnector: MessengerConnector {
    let account: Account
    private var delivered = false

    init(account: Account) {
        self.account = account
    }

    func connect() async throws {}

    func fetchUpdates() async throws -> [Conversation] {
        guard !delivered else { return [] }
        delivered = true
        let now = Date()
        func ago(_ minutes: Double) -> Date { now.addingTimeInterval(-minutes * 60) }
        func conv(_ id: String, _ platform: Platform, _ title: String, unread: Int, _ messages: [Message]) -> Conversation {
            Conversation(accountID: account.id, remoteID: id, platform: platform, title: title,
                         messages: messages, unreadCount: unread)
        }
        func msg(_ id: String, _ sender: String, _ text: String, _ date: Date, out: Bool = false) -> Message {
            Message(id: id, senderName: out ? "Ich" : sender, text: text, date: date, isOutgoing: out)
        }
        return [
            conv("wa-bauherr", .whatsapp, "Hr. Petersen (Bauherr, Wandsbek)", unread: 2, [
                msg("1", "Hr. Petersen", "Guten Morgen Herr Severyn, wann kommt der Estrichleger nächste Woche?", ago(190)),
                msg("2", "Ich", "Guten Morgen, ich kläre das heute und melde mich.", ago(180), out: true),
                msg("3", "Hr. Petersen", "Danke. Außerdem ist im Keller Wasser an der Außenwand – bitte dringend anschauen! Foto schicke ich gleich.", ago(12)),
                msg("4", "Hr. Petersen", "Kann heute noch jemand vorbeikommen?", ago(10)),
            ]),
            conv("tg-polier", .telegram, "Polier Baustelle Harburg", unread: 1, [
                msg("5", "Andrej (Polier)", "Betonlieferung für Decke EG ist auf Freitag 7:00 verschoben. Pumpe ist bestätigt.", ago(45)),
            ]),
            conv("mail-architekt", .email, "Architekturbüro Nordlicht", unread: 1, [
                msg("6", "Fr. Jansen", "Sehr geehrter Herr Severyn, anbei die überarbeiteten Ausführungspläne Rev. C. Bitte um Prüfung und Rückmeldung bis Mittwoch, ob die geänderte Wandstärke (24 cm statt 17,5 cm KS) Auswirkungen auf Ihr Angebot hat.", ago(300)),
            ]),
            conv("sig-lieferant", .signal, "Baustoffhandel Süd", unread: 1, [
                msg("7", "Vertrieb", "Hallo, die Dämmplatten WLG 035 sind leider erst in KW 42 lieferbar. Alternative WLG 032 sofort verfügbar, Aufpreis 8 %. Sollen wir umstellen?", ago(80)),
            ]),
            conv("ig-anfrage", .instagram, "mueller.renovierung", unread: 1, [
                msg("8", "Familie Müller", "Hallo! Macht ihr auch Badsanierungen in Altona? Ca. 8 m², Wanne raus, bodengleiche Dusche rein. Was kostet sowas ungefähr?", ago(600)),
            ]),
        ]
    }

    func send(text: String, to conversation: Conversation) async throws -> Message {
        try await Task.sleep(for: .milliseconds(300))
        return Message(id: UUID().uuidString, senderName: "Ich", text: text, date: .now, isOutgoing: true)
    }
}
