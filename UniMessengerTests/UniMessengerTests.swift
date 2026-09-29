import XCTest
@testable import UniMessenger

final class UniMessengerTests: XCTestCase {
    func testBridgePuppetUsersMapToPlatforms() {
        XCTAssertEqual(MatrixConnector.platform(forBridgeUser: "@whatsapp_4917612345678:matrix.example"), .whatsapp)
        XCTAssertEqual(MatrixConnector.platform(forBridgeUser: "@signal_abc:matrix.example"), .signal)
        XCTAssertEqual(MatrixConnector.platform(forBridgeUser: "@instagram_42:matrix.example"), .instagram)
        XCTAssertNil(MatrixConnector.platform(forBridgeUser: "@oleksii:matrix.example"))
    }

    func testBridgeProtocolIDsMapToPlatforms() {
        XCTAssertEqual(MatrixConnector.platform(forProtocol: "whatsapp"), .whatsapp)
        XCTAssertEqual(MatrixConnector.platform(forProtocol: "gmessages"), .sms)
        XCTAssertNil(MatrixConnector.platform(forProtocol: "unknown"))
    }

    func testConversationRoundTripsThroughJSON() throws {
        let conversation = Conversation(accountID: UUID(), remoteID: "!room:example", platform: .telegram,
                                        title: "Polier", messages: [
                                            Message(id: "1", senderName: "Andrej", text: "Beton Freitag 7:00",
                                                    date: Date(timeIntervalSince1970: 0), isOutgoing: false),
                                        ], unreadCount: 1, priority: .urgent, aiSummary: "Lieferung bestätigen")
        let decoded = try JSONDecoder().decode(Conversation.self, from: JSONEncoder().encode(conversation))
        XCTAssertEqual(decoded, conversation)
        XCTAssertEqual(decoded.id, conversation.id)
    }

    func testDemoConnectorDeliversOnce() async throws {
        let connector = DemoConnector(account: Account(kind: .demo, name: "Demo"))
        let first = try await connector.fetchUpdates()
        XCTAssertFalse(first.isEmpty)
        let second = try await connector.fetchUpdates()
        XCTAssertTrue(second.isEmpty)
    }

    func testAppointmentStartParsing() throws {
        let timed = try XCTUnwrap(ActionAppointment.parse("2026-09-25T07:30"))
        XCTAssertTrue(timed.hasTime)
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: timed.date)
        XCTAssertEqual([parts.year, parts.month, parts.day, parts.hour, parts.minute], [2026, 9, 25, 7, 30])

        let allDay = try XCTUnwrap(ActionAppointment.parse("2026-09-25"))
        XCTAssertFalse(allDay.hasTime)

        XCTAssertNil(ActionAppointment.parse(""))
        XCTAssertNil(ActionAppointment.parse("Freitag"))
        XCTAssertEqual(ActionAppointment.label(""), "Datum offen")
    }

    func testBriefingDecodesAPIResponseWithoutCreatedDate() throws {
        let json = #"{"summary":"Lage","urgent":[{"conversation_id":"a|b","reason":"Wasser"}],"todos":[],"appointments":[{"conversation_id":"a|b","title":"Betonage","start":"2026-09-25T07:00","duration_minutes":240,"location":"Harburg"}]}"#
        let briefing = try JSONDecoder().decode(Briefing.self, from: Data(json.utf8))
        XCTAssertNil(briefing.created)
        XCTAssertEqual(briefing.appointments.first?.duration_minutes, 240)
    }

    func testConversationWithoutNoteStillDecodes() throws {
        let legacy = #"{"accountID":"6F9619FF-8B86-D011-B42D-00C04FC964FF","remoteID":"r","platform":"whatsapp","title":"T","messages":[],"unreadCount":0,"isPinned":false,"isArchived":false}"#
        let conversation = try JSONDecoder().decode(Conversation.self, from: Data(legacy.utf8))
        XCTAssertNil(conversation.note)
    }

    func testTelegramPhotoAndDocumentBecomeAttachments() throws {
        let photo = try XCTUnwrap(TelegramBotConnector.attachment(in: [
            "photo": [["file_id": "small", "file_size": 100], ["file_id": "large", "file_size": 90_000]],
        ]))
        XCTAssertEqual(photo.kind, .image)
        XCTAssertEqual(photo.source, .telegram(fileID: "large"))

        let pdf = try XCTUnwrap(TelegramBotConnector.attachment(in: [
            "document": ["file_id": "doc", "file_name": "Plan Rev C.pdf", "mime_type": "application/pdf", "file_size": 2048],
        ]))
        XCTAssertEqual(pdf.kind, .file)
        XCTAssertEqual(pdf.name, "Plan Rev C.pdf")
        XCTAssertEqual(pdf.symbol, "doc.richtext")
        XCTAssertNil(TelegramBotConnector.attachment(in: ["text": "Hallo"]))
    }

    func testAttachmentRoundTripsAndLegacyMessagesDecode() throws {
        let message = Message(id: "1", senderName: "Ich", text: "", date: Date(timeIntervalSince1970: 0), isOutgoing: true,
                              attachment: Attachment(kind: .image, name: "Keller.jpg", mime: "image/jpeg", size: 1234,
                                                     source: .matrix(mxc: "mxc://example.org/abc")))
        let decoded = try JSONDecoder().decode(Message.self, from: JSONEncoder().encode(message))
        XCTAssertEqual(decoded, message)
        XCTAssertEqual(decoded.attachment?.cacheKey, "matrix_mxc://example.org/abc")

        let legacy = #"{"id":"2","senderName":"A","text":"Hi","date":0,"isOutgoing":false}"#
        XCTAssertNil(try JSONDecoder().decode(Message.self, from: Data(legacy.utf8)).attachment)
    }

    func testMimeKinds() {
        XCTAssertEqual(Attachment.kind(for: "image/heic"), .image)
        XCTAssertEqual(Attachment.kind(for: "video/mp4"), .video)
        XCTAssertEqual(Attachment.kind(for: "application/pdf"), .file)
    }

    func testReadAloudLanguageDetection() {
        UserDefaults.standard.set("de-DE", forKey: "speechLang")
        XCTAssertEqual(VoiceSettings.language(for: "Guten Tag, ich komme morgen."), "de-DE")
        XCTAssertEqual(VoiceSettings.language(for: "Доброго дня, я прийду завтра"), "uk-UA")
        XCTAssertEqual(VoiceSettings.language(for: "Добрый день, мы будем завтра"), "ru-RU")
    }

    @MainActor
    func testReadAloudTextForNewMessages() {
        let account = UUID()
        let urgent = Conversation(accountID: account, remoteID: "a", platform: .whatsapp, title: "Hr. Petersen", messages: [
            Message(id: "1", senderName: "Hr. Petersen", text: "Wasser im Keller!", date: .now, isOutgoing: false),
            Message(id: "2", senderName: "Hr. Petersen", text: "", date: .now, isOutgoing: false,
                    attachment: Attachment(kind: .image, name: "Foto.jpg", mime: "image/jpeg", size: 1, source: .local(key: "k"))),
        ], unreadCount: 2, priority: .urgent)
        let read = Conversation(accountID: account, remoteID: "b", platform: .telegram, title: "Polier", messages: [
            Message(id: "3", senderName: "Andrej", text: "Alles erledigt", date: .now, isOutgoing: false),
        ], unreadCount: 0)
        let texts = SpeechReader.parts(forNew: [read, urgent]).map(\.text)
        XCTAssertEqual(texts.first, "2 neue Nachrichten in einem Chat.")
        XCTAssertTrue(texts.contains("Dringend! WhatsApp von Hr. Petersen."))
        XCTAssertTrue(texts.contains("Wasser im Keller!"))
        XCTAssertTrue(texts.contains("Hr. Petersen schickt ein Foto."))
        XCTAssertFalse(texts.contains("Alles erledigt"))
    }

    func testMeetingLinksAreDetected() {
        UserDefaults.standard.set("meet.ffmuc.net", forKey: "callServer")
        let own = CallSettings.meetingLink(in: "📹 Videoanruf – jetzt beitreten:\nhttps://meet.ffmuc.net/OS-HSD-abc123\nEinfach antippen")
        XCTAssertEqual(own?.url.absoluteString, "https://meet.ffmuc.net/OS-HSD-abc123")
        XCTAssertEqual(own?.inApp, true)
        XCTAssertEqual(CallSettings.meetingLink(in: "Teams: https://teams.microsoft.com/l/meetup-join/xyz")?.inApp, false)
        XCTAssertNil(CallSettings.meetingLink(in: "Plan unter https://example.com/plan.pdf"))
        XCTAssertTrue(CallSettings.newRoomURL().absoluteString.hasPrefix("https://meet.ffmuc.net/OS-HSD-"))
    }

    func testJoinURLCarriesCallConfiguration() {
        let url = CallSettings.joinURL(room: URL(string: "https://meet.ffmuc.net/OS-HSD-abc")!,
                                       displayName: "Oleksii Severyn (HSD Hamburg GmbH)", subject: "Größe · Prüfung", audioOnly: true)
        let fragment = url.fragment(percentEncoded: false) ?? ""
        XCTAssertEqual(url.path, "/OS-HSD-abc")
        XCTAssertTrue(fragment.contains("config.prejoinConfig.enabled=false"))
        XCTAssertTrue(fragment.contains("config.startWithVideoMuted=true"))
        XCTAssertTrue(fragment.contains("config.p2p.enabled=true"))
        XCTAssertTrue(fragment.contains("userInfo.displayName=\"Oleksii Severyn (HSD Hamburg GmbH)\""))
    }

    func testCallProtocolDecodesProtocolKey() throws {
        let json = #"{"protocol":"Gesprächsnotiz","summary":"s","tasks":[],"appointments":[]}"#
        XCTAssertEqual(try JSONDecoder().decode(CallProtocol.self, from: Data(json.utf8)).text, "Gesprächsnotiz")
    }

    func testMatrixServerOfUserID() {
        XCTAssertEqual(MatrixConnector.server(of: "@oleksii:hsd-hamburg.de"), "hsd-hamburg.de")
        XCTAssertEqual(MatrixConnector.server(of: "@whatsapp_49176:matrix.example.org:8448"), "matrix.example.org:8448")
        XCTAssertEqual(MatrixConnector.server(of: "kein-matrix-name"), "")
        XCTAssertEqual(BridgeInfo.all.first?.command, "login phone")
    }

    func testSubscriptionHandOffAnchorsAndText() {
        XCTAssertEqual(SubscriptionHandOff.url(for: .briefing).absoluteString, "https://claude.ai/artifact/8ca7DPy66ztKt5MrnoNy7U#briefing")
        XCTAssertEqual(SubscriptionHandOff.url(for: .protocol_).fragment, "protocol")
        let chat = Conversation(accountID: UUID(), remoteID: "r", platform: .whatsapp, title: "Hr. Petersen", messages: [
            Message(id: "1", senderName: "Hr. Petersen", text: "Wasser im Keller", date: .now, isOutgoing: false),
        ], unreadCount: 1)
        let text = SubscriptionHandOff.openChatsText([chat], ownerName: "Oleksii Severyn")
        XCTAssertTrue(text.contains("Chat: Hr. Petersen (WhatsApp)"))
        XCTAssertTrue(text.contains("Hr. Petersen: Wasser im Keller"))
    }
}
