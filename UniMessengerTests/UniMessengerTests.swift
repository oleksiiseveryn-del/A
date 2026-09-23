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
}
