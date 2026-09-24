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

    /// Uploads a photo or document and returns the new message ID.
    func sendFile(_ data: Data, name: String, mime: String, to conversation: Conversation) async throws -> String

    func download(_ attachment: Attachment) async throws -> Data

    func markRead(_ conversation: Conversation) async
}

extension MessengerConnector {
    func markRead(_ conversation: Conversation) async {}

    func sendFile(_ data: Data, name: String, mime: String, to conversation: Conversation) async throws -> String {
        throw ConnectorError.notSupported("Dateiversand für dieses Konto")
    }

    func download(_ attachment: Attachment) async throws -> Data {
        throw ConnectorError.notSupported("Datei nicht mehr verfügbar")
    }
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

    static func data(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ConnectorError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw ConnectorError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    /// multipart/form-data body with text fields and one file.
    static func multipart(fields: [String: String], fileField: String, fileName: String, mime: String,
                          data: Data) -> (body: Data, contentType: String) {
        let boundary = "OS-\(UUID().uuidString)"
        var body = Data()
        for (name, value) in fields {
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        let safeName = fileName.replacingOccurrences(of: "\"", with: "")
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(safeName)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return (body, "multipart/form-data; boundary=\(boundary)")
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
