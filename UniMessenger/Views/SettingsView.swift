import SwiftUI

struct SettingsView: View {
    @Environment(MessageHub.self) private var hub
    @Environment(SpeechReader.self) private var reader
    @AppStorage("speechLang") private var speechLanguage = "de-DE"
    @AppStorage("callServer") private var callServer = "meet.ffmuc.net"
    @AppStorage("callServerCustom") private var callServerCustom = ""
    @AppStorage("callQuality") private var callQuality = 720
    @AppStorage("speechRate") private var speechRate = 1.0
    @State private var apiKey = ""

    var body: some View {
        @Bindable var hub = hub
        NavigationStack {
            Form {
                Section {
                    Link(destination: SubscriptionHandOff.assistant) {
                        Label("OS KI-Assistent öffnen (kein Schlüssel nötig)", systemImage: "sparkles")
                    }
                } header: {
                    Text("KI über Ihr Claude-Abo")
                } footer: {
                    Text("Im Chat „KI über Claude-Abo“ tippen: Der Chat wird kopiert und der Assistent auf claude.ai geöffnet. Die Nutzung zählt auf Ihr Claude-Abo.")
                }

                Section {
                    if hub.hasAPIKey {
                        LabeledContent("API-Schlüssel", value: "hinterlegt ✓")
                        Button("Schlüssel entfernen", role: .destructive) {
                            hub.setAPIKey(nil)
                        }
                    } else {
                        SecureField("Anthropic API-Schlüssel (sk-ant-…)", text: $apiKey)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Speichern") {
                            hub.setAPIKey(apiKey)
                            apiKey = ""
                        }
                        .disabled(apiKey.isEmpty)
                    }
                    Picker("Modell", selection: $hub.model) {
                        ForEach(ClaudeClient.Model.allCases) { Text($0.label).tag($0) }
                    }
                    Toggle("Neue Chats automatisch priorisieren", isOn: $hub.autoTriage)
                } header: {
                    Text("Optional: vollautomatische KI (API-Schlüssel)")
                } footer: {
                    Text("Den Schlüssel erhalten Sie unter console.anthropic.com. Chat-Inhalte werden nur für Vorschläge an die Claude API gesendet; nichts wird automatisch verschickt. Ohne Schlüssel: im Chat „KI über Claude-Abo“ tippen – der Chat wird kopiert und der OS KI-Assistent auf claude.ai geöffnet, der über Ihr Claude-Abo läuft.")
                }

                Section {
                    Picker("Server", selection: $callServer) {
                        ForEach(CallSettings.servers, id: \.id) { Text($0.name).tag($0.id) }
                    }
                    if callServer == "custom" {
                        TextField("z. B. video.hsd-hamburg.de", text: $callServerCustom)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    }
                    Picker("Qualität", selection: $callQuality) {
                        ForEach(CallSettings.qualities, id: \.value) { Text($0.name).tag($0.value) }
                    }
                } header: {
                    Text("Videoanrufe")
                } footer: {
                    Text("Videoanrufe laufen über Jitsi Meet (WebRTC, verschlüsselt). Bei zwei Personen direkt von Gerät zu Gerät; die Qualität passt sich automatisch an die Verbindung an. Für den Firmeneinsatz empfohlen: eigener Jitsi-Server.")
                }

                Section {
                    Picker("Sprache", selection: $speechLanguage) {
                        ForEach(VoiceSettings.languages, id: \.id) { Text($0.name).tag($0.id) }
                    }
                    Picker("Vorlesetempo", selection: $speechRate) {
                        ForEach(VoiceSettings.rates, id: \.value) { Text($0.name).tag($0.value) }
                    }
                    Button {
                        let samples = ["uk-UA": "Доброго дня! Це голос для читання повідомлень.",
                                       "ru-RU": "Добрый день! Это голос для чтения сообщений.",
                                       "pl-PL": "Dzień dobry! To jest głos do czytania wiadomości.",
                                       "en-US": "Hello! This is the voice that reads your messages."]
                        let first = hub.profile.ownerName.split(separator: " ").first.map(String.init) ?? ""
                        reader.speak([.init(text: samples[speechLanguage] ?? "Guten Tag, \(first)! So klingt das Vorlesen Ihrer Nachrichten.",
                                            language: speechLanguage)])
                    } label: {
                        Label("Stimme testen", systemImage: "speaker.wave.2")
                    }
                } header: {
                    Text("Sprache & Vorlesen")
                } footer: {
                    Text("Gilt für die Spracheingabe und das Vorlesen. Ukrainische und russische Nachrichten werden automatisch mit passender Stimme gelesen. Bessere Stimmen: Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen.")
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
