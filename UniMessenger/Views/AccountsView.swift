import SwiftUI

struct AccountsView: View {
    @Environment(MessageHub.self) private var hub
    @State private var editing: Account?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(hub.accounts) { account in
                        Button {
                            editing = account
                        } label: {
                            HStack {
                                Image(systemName: icon(for: account.kind))
                                    .frame(width: 28)
                                VStack(alignment: .leading) {
                                    Text(account.name).foregroundStyle(.primary)
                                    if let error = hub.accountErrors[account.id] {
                                        Text(error).font(.caption).foregroundStyle(.red).lineLimit(2)
                                    } else {
                                        Text(account.isEnabled ? "Verbunden" : "Deaktiviert")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                    .onDelete { offsets in
                        for index in offsets {
                            let id = hub.accounts[index].id
                            KeychainStore.set(nil, for: KeychainStore.Key.secret(id))
                            KeychainStore.set(nil, for: KeychainStore.Key.token(id))
                        }
                        hub.accounts.remove(atOffsets: offsets)
                    }
                } header: {
                    Text("Verbundene Konten")
                }

                Section {
                    ForEach(Account.Kind.allCases) { kind in
                        Button {
                            editing = Account(kind: kind, name: defaultName(for: kind))
                        } label: {
                            Label(kind.title, systemImage: icon(for: kind))
                        }
                    }
                } header: {
                    Text("Konto hinzufügen")
                } footer: {
                    Text("""
                    WhatsApp, Signal, Instagram, Facebook Messenger, SMS und weitere Dienste werden über einen \
                    Matrix-Server mit Bridges angebunden (siehe README). Apple erlaubt keiner App den direkten \
                    Zugriff auf fremde Messenger – dies ist der offiziell zulässige Weg.
                    """)
                }
            }
            .navigationTitle("Konten")
            .sheet(item: $editing) { account in
                AccountEditor(account: account)
            }
        }
    }

    private func icon(for kind: Account.Kind) -> String {
        switch kind {
        case .matrix: "square.grid.3x3.fill"
        case .telegramBot: "paperplane.fill"
        case .demo: "sparkles"
        }
    }

    private func defaultName(for kind: Account.Kind) -> String {
        switch kind {
        case .matrix: "Alle Messenger (Matrix)"
        case .telegramBot: "Telegram Firmen-Bot"
        case .demo: "Demo"
        }
    }
}

struct AccountEditor: View {
    @Environment(MessageHub.self) private var hub
    @Environment(\.dismiss) private var dismiss
    @State var account: Account
    @State private var secret = ""
    @State private var pairing: BridgeInfo?
    @State private var pairingMessage: String?

    private var isNew: Bool { !hub.accounts.contains { $0.id == account.id } }

    private func pair(_ bridge: BridgeInfo) async {
        pairing = bridge
        defer { pairing = nil }
        do {
            _ = try await hub.startBridge(bridge, accountID: account.id)
            pairingMessage = "✓ \(bridge.name): Der Chat mit dem Kopplungs-Bot ist jetzt im Posteingang – bitte den Anweisungen dort folgen."
        } catch {
            pairingMessage = "\(bridge.name): \(error.localizedDescription)"
        }
    }

    /// A stored device token belongs to one homeserver and user; changing either needs a fresh login.
    private var loginChanged: Bool {
        guard let stored = hub.accounts.first(where: { $0.id == account.id }) else { return true }
        return stored.serverURL != account.serverURL || stored.username != account.username
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Allgemein") {
                    TextField("Name", text: $account.name)
                    Toggle("Aktiv", isOn: $account.isEnabled)
                }
                switch account.kind {
                case .matrix:
                    Section {
                        TextField("Homeserver, z. B. matrix.hsd-hamburg.de", text: $account.serverURL)
                            .textInputAutocapitalization(.never).keyboardType(.URL).autocorrectionDisabled()
                        TextField("Benutzername", text: $account.username)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField(loginChanged ? "Passwort" : "Neues Passwort (optional)", text: $secret)
                    } header: {
                        Text("Matrix-Anmeldung")
                    } footer: {
                        Text("Das Passwort wird nur einmal zur Anmeldung verwendet; danach speichert die App ausschließlich ein Geräte-Token im Schlüsselbund.")
                    }
                    if !isNew {
                        Section {
                            ForEach(BridgeInfo.all) { bridge in
                                Button {
                                    Task { await pair(bridge) }
                                } label: {
                                    HStack {
                                        PlatformBadge(platform: bridge.platform, size: 28)
                                        Text(bridge.name).foregroundStyle(.primary)
                                        Spacer()
                                        if pairing == bridge { ProgressView() }
                                    }
                                }
                                .disabled(pairing != nil)
                            }
                        } header: {
                            Text("Messenger koppeln")
                        } footer: {
                            Text(pairingMessage ?? "Öffnet den Chat mit dem Kopplungs-Bot und startet die Anmeldung. WhatsApp: Sie erhalten einen 8-stelligen Code – in WhatsApp unter Einstellungen → Verknüpfte Geräte → Gerät hinzufügen → „Stattdessen mit Telefonnummer verknüpfen“ eingeben. Signal: QR-Code auf einem zweiten Gerät anzeigen und in Signal scannen. Danach erscheinen alle Chats automatisch im Posteingang.")
                        }
                    }
                case .telegramBot:
                    Section {
                        SecureField(isNew ? "Bot-Token von @BotFather" : "Neues Token (optional)", text: $secret)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                    } header: {
                        Text("Telegram")
                    } footer: {
                        Text("Kunden schreiben Ihrem Firmen-Bot; Sie antworten hier. Das Token liegt verschlüsselt im iOS-Schlüsselbund.")
                    }
                case .demo:
                    Section {
                        Text("Beispiel-Chats aus dem Baualltag zum Ausprobieren der KI-Funktionen.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(isNew ? "Konto hinzufügen" : "Konto bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern") { save() }
                        .disabled(!isValid)
                }
            }
        }
    }

    private var isValid: Bool {
        switch account.kind {
        case .matrix: !account.serverURL.isEmpty && !account.username.isEmpty && (!loginChanged || !secret.isEmpty)
        case .telegramBot: !isNew || !secret.isEmpty
        case .demo: true
        }
    }

    private func save() {
        if !secret.isEmpty {
            KeychainStore.set(secret, for: KeychainStore.Key.secret(account.id))
            // New credentials invalidate any stored session token.
            KeychainStore.set(nil, for: KeychainStore.Key.token(account.id))
            UserDefaults.standard.removeObject(forKey: "matrix.since.\(account.id.uuidString)")
        }
        if let index = hub.accounts.firstIndex(where: { $0.id == account.id }) {
            hub.accounts[index] = account
        } else {
            hub.accounts.append(account)
        }
        hub.resetConnection(for: account.id)
        Task { await hub.refresh() }
        dismiss()
    }
}
