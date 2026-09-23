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
}
