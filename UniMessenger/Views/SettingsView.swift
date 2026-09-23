import SwiftUI

struct SettingsView: View {
    @Environment(MessageHub.self) private var hub
    @State private var apiKey = ""
    @State private var hasKey = KeychainStore.get(KeychainStore.Key.anthropicAPIKey) != nil

    var body: some View {
        @Bindable var hub = hub
        NavigationStack {
            Form {
                Section {
                    if hasKey {
                        LabeledContent("API-Schlüssel", value: "hinterlegt ✓")
                        Button("Schlüssel entfernen", role: .destructive) {
                            KeychainStore.set(nil, for: KeychainStore.Key.anthropicAPIKey)
                            hasKey = false
                        }
                    } else {
                        SecureField("Anthropic API-Schlüssel (sk-ant-…)", text: $apiKey)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Speichern") {
                            KeychainStore.set(apiKey.trimmingCharacters(in: .whitespacesAndNewlines),
                                              for: KeychainStore.Key.anthropicAPIKey)
                            apiKey = ""
                            hasKey = true
                        }
                        .disabled(apiKey.isEmpty)
                    }
                    Picker("Modell", selection: $hub.model) {
                        ForEach(ClaudeClient.Model.allCases) { Text($0.label).tag($0) }
                    }
                    Toggle("Neue Chats automatisch priorisieren", isOn: $hub.autoTriage)
                } header: {
                    Text("KI-Assistent (Claude)")
                } footer: {
                    Text("Den Schlüssel erhalten Sie unter console.anthropic.com. Chat-Inhalte werden nur für Vorschläge an die Claude API gesendet; nichts wird automatisch verschickt.")
                }

                Section("Antwortstil") {
                    Picker("Standard-Tonfall", selection: $hub.profile.defaultTone) {
                        ForEach(AssistantProfile.Tone.allCases) { Text($0.label).tag($0) }
                    }
                    Picker("Antwortsprache", selection: $hub.profile.replyLanguage) {
                        ForEach(AssistantProfile.ReplyLanguage.allCases) { Text($0.label).tag($0) }
                    }
                }

                Section("Absender") {
                    TextField("Name", text: $hub.profile.ownerName)
                    TextField("Funktion", text: $hub.profile.role)
                    TextField("Firma", text: $hub.profile.company)
                    TextField("Adresse", text: $hub.profile.address)
                    TextField("Telefon", text: $hub.profile.phone).keyboardType(.phonePad)
                }

                Section {
                    TextEditor(text: $hub.profile.signature).frame(minHeight: 90)
                } header: {
                    Text("E-Mail-Signatur")
                }

                Section {
                    ForEach($hub.templates) { $template in
                        VStack(alignment: .leading) {
                            TextField("Titel", text: $template.title).font(.headline)
                            TextField("Text", text: $template.text, axis: .vertical).font(.subheadline)
                        }
                    }
                    .onDelete { hub.templates.remove(atOffsets: $0) }
                    Button {
                        hub.templates.append(ReplyTemplate(title: "Neuer Baustein", text: ""))
                    } label: {
                        Label("Baustein hinzufügen", systemImage: "plus")
                    }
                } header: {
                    Text("Textbausteine")
                } footer: {
                    Text("Im Chat über das Symbol links neben dem Eingabefeld einfügen. Platzhalter in [eckigen Klammern] vor dem Senden ersetzen.")
                }

                Section {
                    TextEditor(text: $hub.profile.extraContext).frame(minHeight: 110)
                } header: {
                    Text("Wissen für die KI")
                } footer: {
                    Text("Z. B. laufende Baustellen, Urlaubszeiten, Standardantworten. Wird bei jedem Vorschlag berücksichtigt.")
                }
            }
            .navigationTitle("Einstellungen")
        }
    }
}
