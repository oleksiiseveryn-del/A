# UniMessenger – alle Messenger in einer iPhone-App, mit KI-Antworten

**HSD Hamburg GmbH** · Merckmannstraße 30 · 20539 Hamburg

UniMessenger bündelt Nachrichten aus WhatsApp, Telegram, Signal, Instagram, Facebook Messenger,
SMS, Slack, LinkedIn u. a. in **einem Posteingang**. Eine KI (Claude von Anthropic) macht zu jeder
Nachricht **drei Antwortvorschläge**, sortiert den Posteingang nach **Dringlichkeit** und überarbeitet
oder übersetzt Ihre Entwürfe. Gesendet wird immer erst, wenn Sie auf „Senden“ tippen.

## Funktionen

| Bereich | Funktion |
|---|---|
| Posteingang | Alle Chats aller Konten, sortiert nach Aktivität; Filter *Alle / Ungelesen / Dringend / Archiv* und je Messenger; Volltextsuche; Anheften, Archivieren, Als gelesen markieren (Wischgesten) |
| KI-Antworten | 3 Entwürfe pro Chat (direkte Antwort · Rückfrage · nächster Schritt/Termin), Tonfall wählbar (professionell, freundlich, kurz, förmlich), eigene Vorgabe möglich („Termin Do. 14 Uhr anbieten“) |
| KI-Überarbeitung | Entwurf verbessern, kürzen, förmlicher/freundlicher, übersetzen (DE / EN / UK) |
| KI-Triage | Jeder neue Chat bekommt Priorität (*Dringend / Normal / Niedrig*) und eine Ein-Satz-Zusammenfassung „was ist zu tun“ |
| Firmenprofil | Name, Funktion, Adresse, Telefon, E-Mail-Signatur und „Wissen für die KI“ (z. B. „Termine erst nach Rücksprache verbindlich“) – vorbelegt für HSD Hamburg GmbH |
| Sicherheit | Passwörter, Tokens und API-Schlüssel nur im iOS-Schlüsselbund (nur dieses Gerät); lokale Daten mit iOS-Dateischutz verschlüsselt |

Die KI ist so eingestellt, dass sie **keine Preise, Termine oder Zusagen erfindet** – sie setzt
stattdessen Platzhalter wie `[Datum]` oder bietet Besichtigung/schriftliches Angebot an. Anweisungen,
die in fremden Nachrichten stehen, werden ignoriert (Schutz vor Manipulation).

## Wichtig: Wie kommen WhatsApp & Co. in die App?

Apple erlaubt **keiner** iPhone-App, die Nachrichten anderer Apps (WhatsApp, iMessage, Signal …)
direkt zu lesen. Alle seriösen „Alles-in-einem“-Messenger lösen das über einen Server mit
**Bridges**. UniMessenger nutzt dafür den offenen Standard **Matrix**:

```
 WhatsApp ─┐
 Signal ───┤   mautrix-Bridges      Matrix-Server           iPhone
 Instagram ┼──────────────────────▶ (z. B. Synapse)  ◀────▶ UniMessenger ◀──▶ Claude (KI)
 Messenger ┤                        matrix.hsd-…de
 SMS ──────┘
 Telegram-Firmenbot ──────────────────────────────────────▶ (direkt, ohne Server)
```

| Konto-Typ in der App | Deckt ab | Aufwand |
|---|---|---|
| **Matrix / Bridges** | WhatsApp, Signal, Telegram, Instagram, Facebook Messenger, Google Messages (SMS), LinkedIn, Slack … | eigener Server (einmalig einrichten, siehe unten) |
| **Telegram Bot** | Kunden schreiben Ihrem Firmen-Bot | 2 Minuten: Bot bei @BotFather anlegen, Token eintragen |
| **Demo-Daten** | Beispiel-Chats aus dem Baualltag | keiner – zum Ausprobieren |

Nicht möglich (technische Sperre von Apple): Zugriff auf **iMessage** ohne Mac-Relay.

### Matrix-Server mit Bridges einrichten (einmalig, IT/Dienstleister)

1. Einen Linux-Server (z. B. Hetzner, Standort Deutschland – DSGVO) mit Docker bereitstellen.
2. Matrix-Homeserver installieren, am einfachsten mit dem Ansible-Playbook
   <https://github.com/spantaleev/matrix-docker-ansible-deploy> (Synapse oder Conduit).
3. Im Playbook die gewünschten Bridges aktivieren, z. B.
   `matrix_mautrix_whatsapp_enabled: true`, `matrix_mautrix_signal_enabled: true`,
   `matrix_mautrix_meta_instagram_enabled: true`, `matrix_mautrix_gmessages_enabled: true`.
4. Pro Messenger einmal koppeln (QR-Code in WhatsApp → *Verknüpfte Geräte* usw., Anleitung je
   Bridge unter <https://docs.mau.fi/bridges/>).
5. In UniMessenger: **Konten → Matrix / Bridges** → Homeserver-Adresse, Benutzername, Passwort.

Die App erkennt automatisch, aus welchem Messenger ein Chat kommt, und zeigt das passende Symbol.

## App bauen und auf das iPhone bringen

Voraussetzungen: Mac mit **Xcode 15** oder neuer, iPhone mit **iOS 17** oder neuer, Apple-ID.

```bash
brew install xcodegen          # einmalig
git clone <dieses Repository> && cd A
xcodegen generate              # erzeugt UniMessenger.xcodeproj aus project.yml
open UniMessenger.xcodeproj
```

In Xcode: Ziel *UniMessenger* → *Signing & Capabilities* → Team wählen → iPhone anschließen →
▶︎ Ausführen. Für die Verteilung an Mitarbeiter: TestFlight oder Apple Business Manager.

### KI aktivieren

1. API-Schlüssel unter <https://console.anthropic.com> erstellen.
2. In der App: **Einstellungen → KI-Assistent** → Schlüssel einfügen → Speichern.
3. Modell: *Claude Opus 5* (Standard, beste Qualität) oder *Claude Sonnet 5* (schneller, günstiger).

Kosten: je Vorschlag ca. 1–3 Tausend Tokens, d. h. grob **1–3 Cent** pro Chat mit Opus 5 (Sonnet 5 etwa die Hälfte).

## Datenschutz (DSGVO)

- Chat-Inhalte werden **nur** zur Erstellung von Vorschlägen an die Claude API übertragen
  (verschlüsselt, HTTPS). Mit Anthropic einen Auftragsverarbeitungsvertrag (DPA) abschließen –
  (über das Anthropic-Konto bzw. den Vertrieb anfragen).
- Automatische Triage kann in den Einstellungen abgeschaltet werden; dann gehen Inhalte nur bei
  aktivem Tippen auf „Vorschläge“ an die KI.
- Den Matrix-Server in der EU betreiben; Kunden in der Datenschutzerklärung auf die
  Messenger-Kanäle hinweisen.

## Projektstruktur

```
project.yml                      XcodeGen-Projektdefinition (iOS 17, SwiftUI)
UniMessenger/
  App/UniMessengerApp.swift      Einstieg, Abruf alle 20 s solange die App offen ist
  Models/Models.swift            Platform, Conversation, Message, Account, Priority
  Services/
    MessengerConnector.swift     gemeinsame Schnittstelle aller Messenger + HTTP-Helfer
    MessageHub.swift             zentraler Speicher: Abruf, Zusammenführen, Senden, Triage
    Connectors/
      MatrixConnector.swift      Matrix Client-Server-API (/sync, /send, Lesebestätigung)
      TelegramBotConnector.swift Telegram Bot API (getUpdates, sendMessage)
      DemoConnector.swift        Beispieldaten
  AI/
    ClaudeClient.swift           Claude Messages API (strukturierte JSON-Ausgabe)
    ReplyAssistant.swift         Prompts: Vorschläge, Überarbeiten/Übersetzen, Triage
  Storage/                       Schlüsselbund, Einstellungen, lokale Ablage
  Views/                         Posteingang, Chat mit KI-Leiste, Konten, Einstellungen
UniMessengerTests/               Unit-Tests
```

Ein neuer Messenger wird angebunden, indem man `MessengerConnector` implementiert
(`connect`, `fetchUpdates`, `send`) und ihn in `MessageHub.makeConnector` einträgt.

## Nächste Ausbaustufen

- Push-Benachrichtigungen im Hintergrund (Matrix Push Gateway / Sygnal + APNs)
- Bilder, Sprachnachrichten (Transkription) und PDF-Anhänge (z. B. Pläne) in der KI-Analyse
- Anbindung an Bautagebuch/Angebote: aus einem Chat direkt eine Aufgabe, ein Protokoll oder einen
  Angebotsentwurf erzeugen
- E-Mail (IMAP/SMTP bzw. Microsoft 365) als weiterer Kanal
