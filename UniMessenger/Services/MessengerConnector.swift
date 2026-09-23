import Foundation

/// Common interface every messaging backend implements.
/// Secrets (tokens, passwords) never live on the connector's `Account`;
/// they are read from the Keychain by the concrete connector.
protocol MessengerConnector: AnyObject {
    var account: Account { get }

    /// Authenticate if necessary. Called once before the first `fetchUpdates`.
    func connect() async throws

    /// Returns conversations that changed since the previous call.
    /// Messages in the returned conversations are only the *new* ones;
    /// `MessageHub` merges them into its local state.
    func fetchUpdates() async throws -> [Conversation]

    func send(text: String, to conversation: Conversation) async throws -> Message

    func markRead(_ conversation: Conversation) async
}

extension MessengerConnector {
    func markRead(_ conversation: Conversation) async {}
}

enum ConnectorError: LocalizedError {
    case missingCredentials(String)
    case http(Int, String)
    case invalidResponse
    case notSupported(String)

    var errorDescription: String? {
        switch self {
        case .missingCredentials(let what): "Zugangsdaten fehlen: \(what)"
        case .http(let code, let body): "Serverfehler \(code): \(body.prefix(200))"
        case .invalidResponse: "Ungültige Serverantwort"
        case .notSupported(let what): "Nicht unterstützt: \(what)"
        }
    }
}

enum HTTP {
    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.waitsForConnectivity = true
        return URLSession(configuration: config)
    }()

    static func json(_ request: URLRequest) async throws -> [String: Any] {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ConnectorError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw ConnectorError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ConnectorError.invalidResponse
        }
        return object
    }

    static func request(_ url: URL, method: String = "GET", bearer: String? = nil, body: [String: Any]? = nil) throws -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        return request
    }
}
