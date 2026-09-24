# OS – alle Messenger in einer iPhone-App, mit KI-Antworten

App-Name auf dem iPhone: **OS** · Farbe: Rot · **HSD Hamburg GmbH** · Merckmannstraße 30 · 20539 Hamburg

**OS** bündelt Nachrichten aus WhatsApp, Telegram, Signal, Instagram, Facebook Messenger,
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
| Fotos & Dokumente | Senden aus Kamera, Fotomediathek oder Dateien (PDF, Pläne, Excel …) mit Vorschau vor dem Senden; große Fotos werden automatisch verkleinert (schneller Versand). Empfangene Fotos direkt im Chat, Dokumente per Tipp öffnen, teilen oder sichern |
| KI sieht Fotos | Die KI bezieht die letzten Fotos (Analyse: auch ein PDF) in Vorschläge und Zusammenfassung ein; „Foto von der KI beschreiben lassen“ liefert Befund, Dringlichkeit und nächste Schritte |
| Spracheingabe | Mikrofon im Eingabefeld: sprechen statt tippen (Deutsch, Ukrainisch, Russisch, Polnisch, Englisch). Mikrofon im KI-Feld: sagen, *was* geantwortet werden soll („sag ihm, ich komme morgen um 8“) – die KI formuliert die fertige Antwort |
| Vorlesen | Einzelne Nachricht, offene Nachrichten eines Chats, **alle neuen Nachrichten** (dringende zuerst) und das Tagesbriefing – freihändig im Auto oder auf der Baustelle; ukrainische/russische Texte mit passender Stimme; eigenen Entwurf vor dem Senden anhören |
| Sprachnachrichten | Aufnehmen und senden; empfangene Sprachnachrichten direkt im Chat abspielen |
| Videoanrufe | Video- oder Sprachanruf mit einem Tipp aus jedem Chat: OS startet sofort und schickt dem Kontakt den Link in seinen Messenger – er tippt ihn an, **ohne App und ohne Konto**. Jitsi Meet/WebRTC, verschlüsselt, bei zwei Personen direkt von Gerät zu Gerät (kürzeste Verzögerung), HD 720p/Full HD 1080p mit automatischer Anpassung an schwache Verbindungen. Videotermine planen (Einladung + Kalender). Anruf-Links im Chat (auch Zoom/Teams/Meet) mit „Beitreten“-Knopf |
| Gesprächsprotokoll | Nach dem Anruf Stichworte tippen oder diktieren – die KI erstellt eine versandfertige Gesprächsnotiz mit Vereinbarungen, Aufgaben und Terminen |
| Emojis | Emoji-Leiste mit Baustellen-Emojis, zuletzt genutzte zuerst; empfangene Emojis werden normal angezeigt |
| Schnell | Für die wichtigsten ungelesenen Chats bereitet die KI die Antwortvorschläge im Hintergrund vor – beim Öffnen sofort da |
| Heute (Tagesbriefing) | KI-Lagebild über alle offenen Chats: was heute Priorität hat, wer heute eine Antwort braucht, neue Aufgaben und anstehende Termine – mit Kennzahlen *Ungelesen / Dringend / Aufgaben* |
| Aufgaben & Termine | Pro Chat „Zusammenfassen, Aufgaben & Termine erkennen“ (relative Angaben wie „Freitag 7 Uhr“ werden in Datum umgerechnet); Aufgabenliste mit Fälligkeit und Sprung zum Chat; Termine mit einem Tipp in den iPhone-Kalender (mit Erinnerung 30 min vorher) |
| Kontakt-Notizen | z. B. „EFH Wandsbek, Auftrag 2026-114“ – die KI berücksichtigt die Notiz bei jedem Vorschlag |
| Textbausteine | eigene Standardantworten (Besichtigung, Angebot folgt, Rückruf, Notfall …) mit Platzhaltern |
| Einrichtung | Assistent beim ersten Start; Zahl ungelesener Nachrichten am App-Symbol (Web-App ab iOS 16.4) |
| Firmenprofil | Name, Funktion, Adresse, Telefon, E-Mail-Signatur und „Wissen für die KI“ (z. B. „Termine erst nach Rücksprache verbindlich“) – vorbelegt für HSD Hamburg GmbH |
| Sicherheit | Passwörter, Tokens und API-Schlüssel nur im iOS-Schlüsselbund (nur dieses Gerät); lokale Daten mit iOS-Dateischutz verschlüsselt |

Die KI ist so eingestellt, dass sie **keine Preise, Termine oder Zusagen erfindet** – sie setzt
stattdessen Platzhalter wie `[Datum]` oder bietet Besichtigung/schriftliches Angebot an. Anweisungen,
die in fremden Nachrichten stehen, werden ignoriert (Schutz vor Manipulation).

## Wichtig: Wie kommen WhatsApp & Co. in die App?

Apple erlaubt **keiner** iPhone-App, die Nachrichten anderer Apps (WhatsApp, iMessage, Signal …)
direkt zu lesen. Alle seriösen „Alles-in-einem“-Messenger lösen das über einen Server mit
**Bridges**. OS nutzt dafür den offenen Standard **Matrix**:

```
 WhatsApp ─┐
 Signal ───┤   mautrix-Bridges      Matrix-Server           iPhone
 Instagram ┼──────────────────────▶ (z. B. Synapse)  ◀────▶ OS ◀──────────▶ Claude (KI)
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

### Eigener Server mit einem Befehl (`server/install.sh`)

Das Skript richtet auf einem frischen Server alles ein: Matrix-Server (Synapse + PostgreSQL), HTTPS,
Bridges für **WhatsApp, Signal, Instagram, Facebook Messenger** und einen eigenen **Jitsi-Videoserver**.

**1. Server mieten** (z. B. Hetzner Cloud, Standort Deutschland): Ubuntu 24.04, mindestens 2 vCPU / 4 GB RAM
(ca. 5–10 €/Monat, aktuellen Preis beim Anbieter prüfen). Die IP-Adresse notieren.

**2. Zwei DNS-Einträge** beim Domain-Anbieter (Beispiel Domain `hsd-hamburg.de`):

| Typ | Name | Wert |
|---|---|---|
| A | `matrix` | IP-Adresse des Servers |
| A | `jitsi` | IP-Adresse des Servers |

**3. Installieren** – in der Server-Konsole des Anbieters (im Browser, auch am iPhone) als root:

```bash
curl -fsSL https://raw.githubusercontent.com/oleksiiseveryn-del/A/claude/unified-messenger-iphone-app-67g1uc/server/install.sh -o install.sh
bash install.sh
```

Das Skript fragt nach Domain, Benutzername und Passwort, prüft die DNS-Einträge und installiert alles
(10–20 Minuten). Am Ende zeigt es genau, was in OS einzutragen ist:

- **OS → Konten → Matrix / Bridges:** Homeserver `matrix.hsd-hamburg.de`, Benutzername, Passwort
- **OS → Einstellungen → Videoanrufe → Eigener Server:** `jitsi.hsd-hamburg.de`

**4. Messenger koppeln:** OS → Konten → Matrix-Konto → **Messenger koppeln** → WhatsApp / Signal / …
WhatsApp wird per 8-stelligem Code gekoppelt (WhatsApp → Verknüpfte Geräte → Gerät hinzufügen →
„Stattdessen mit Telefonnummer verknüpfen“) – das funktioniert auf demselben iPhone. OS nimmt die
Einladungen der Bridges automatisch an; alle Chats erscheinen im Posteingang.

Update später: `bash install.sh` erneut ausführen (Passwörter und Daten bleiben erhalten).
Grundlage: das gepflegte Projekt [matrix-docker-ansible-deploy](https://github.com/spantaleev/matrix-docker-ansible-deploy).

## Ohne Mac: zwei Wege aufs iPhone

### Weg 1 – sofort: Web-App auf dem Home-Bildschirm (kostenlos)

**Link zum Installieren:**

**https://oleksiiseveryn-del.github.io/A/**

1. Den Link auf dem iPhone in **Safari** öffnen (nicht in der GitHub- oder Claude-App).
2. Unten auf Teilen **□↑** tippen → **„Zum Home-Bildschirm“** → Name „OS“ → **Hinzufügen**.
3. Das rote **OS**-Symbol starten – ab jetzt läuft OS im Vollbild wie eine normale App.
4. Der Einrichtungs-Assistent führt durch KI-Schlüssel und Konten.

Neue Versionen kommen automatisch: Änderungen in diesem Branch sind nach wenigen Minuten in der App.

> Die App wird über GitHub Pages aus diesem Branch veröffentlicht (Settings → Pages). Jede Änderung ist nach 1–2 Minuten live.

### Weg 2 – echte iPhone-App, gebaut auf einem Mac in der Cloud

GitHub stellt für öffentliche Repositories kostenlose Mac-Server bereit. Der Ablauf
`.github/workflows/ios.yml` baut und testet die App bei jeder Änderung automatisch.

Für die Installation über **TestFlight** (einmalig, alles im Browser, auch unter Windows):

1. **Apple Developer Program** beitreten: <https://developer.apple.com/programs/> (99 €/Jahr,
   als Firma mit D-U-N-S-Nummer).
2. In **App Store Connect** → *Apps* → „+“ → neue App: Bundle-ID
   `de.hsd-hamburg.UniMessenger`, Name z. B. „OS – HSD Hamburg“ (der Name im App Store muss weltweit eindeutig sein;
   auf dem Home-Bildschirm erscheint immer „OS“).
3. App Store Connect → *Benutzer und Zugriff* → *Integrationen* → **API-Schlüssel** erzeugen
   (Rolle „App-Manager“), `.p8`-Datei herunterladen, *Key ID* und *Issuer ID* notieren.
4. Auf GitHub: Repository → *Settings → Secrets and variables → Actions* → vier Secrets anlegen:

   | Name | Inhalt |
   |---|---|
   | `ASC_KEY_ID` | Key ID des API-Schlüssels |
   | `ASC_ISSUER_ID` | Issuer ID |
   | `ASC_KEY_P8` | kompletter Inhalt der `.p8`-Datei |
   | `APPLE_TEAM_ID` | Team-ID (developer.apple.com → Membership) |

5. GitHub → *Actions* → **iOS-App** → *Run workflow* → Haken bei „Nach TestFlight hochladen“.
6. Nach ca. 15–30 Minuten erscheint der Build in der **TestFlight-App** auf dem iPhone.
   Mitarbeiter lädt man dort per E-Mail ein.

Signierung und Zertifikate erledigt Xcode in der Cloud automatisch über den API-Schlüssel.

### Mit eigenem Mac (optional)

```bash
brew install xcodegen && xcodegen generate && open UniMessenger.xcodeproj
```

### Eigener Videoserver (empfohlen für den Firmeneinsatz)

Standard ist der öffentliche Jitsi-Server **meet.ffmuc.net** (Freifunk München, ohne Login). Für volle
Kontrolle und DSGVO-Sicherheit einen eigenen Jitsi-Server betreiben – am einfachsten auf dem Matrix-Server:
im Ansible-Playbook `jitsi_enabled: true` setzen (Anleitung im Playbook unter „Jitsi“). Danach in OS unter
**Einstellungen → Videoanrufe → Server → Eigener Server** die Adresse eintragen (z. B. `video.hsd-hamburg.de`).

### KI ohne API-Schlüssel – über Ihr Claude-Abo

Wer ein Claude-Abo (Pro/Max) hat, kann die KI auch ohne API-Schlüssel nutzen: Im Chat auf
**✨ „KI über Claude-Abo“** tippen. OS kopiert den Chat und öffnet den **OS KI-Assistenten** auf claude.ai
(<https://claude.ai/artifact/8ca7DPy66ztKt5MrnoNy7U>). Dort ins Feld tippen → **Einfügen** → Aufgabe wählen
(Antwortvorschläge, Aufgaben & Termine, Gesprächsnotiz, Entwurf verbessern, Foto prüfen) → Ergebnis mit
**Kopieren** zurück in OS. Beim ersten Mal fragt claude.ai, ob die Seite Ihr Abo nutzen darf. Die Nutzung
zählt auf Ihr Abo-Kontingent. Der Quelltext des Assistenten liegt in `artifact/os-ki-assistent.html`.

Vollautomatisch (Vorschläge beim Öffnen, Tagesbriefing, Priorisierung) arbeitet OS nur mit API-Schlüssel.

### KI aktivieren

1. API-Schlüssel unter <https://console.anthropic.com> erstellen.
2. In der App: **Einstellungen → KI-Assistent** → Schlüssel einfügen → Speichern.
   Tipp: in der Anthropic Console ein monatliches Ausgabenlimit setzen.
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
web/                             Web-App (PWA) mit gleichem Funktionsumfang, läuft in Safari
.github/workflows/               Cloud-Build der iOS-App (+ TestFlight) und Veröffentlichung der Web-App
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
