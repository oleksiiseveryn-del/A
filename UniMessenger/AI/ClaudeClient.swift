import Foundation

/// Thin client for the Claude Messages API (`POST /v1/messages`).
/// Swift has no official Anthropic SDK, so this uses raw HTTP.
struct ClaudeClient {
    enum Model: String, CaseIterable, Identifiable, Codable {
        case opus5 = "claude-opus-5"
        case sonnet5 = "claude-sonnet-5"
        var id: String { rawValue }
        var label: String {
            switch self {
            case .opus5: "Claude Opus 5 (beste Qualität)"
            case .sonnet5: "Claude Sonnet 5 (schneller, günstiger)"
            }
        }
    }

    enum ClaudeError: LocalizedError {
        case missingAPIKey
        case http(Int, String)
        case refused
        case truncated
        case invalidResponse

        var errorDescription: String? {
            switch self {
            case .missingAPIKey: "Kein Anthropic API-Schlüssel hinterlegt (Einstellungen → KI-Assistent)."
            case .http(let code, let body): "KI-Fehler \(code): \(body.prefix(200))"
            case .refused: "Die KI hat diese Anfrage abgelehnt."
            case .truncated: "Die KI-Antwort wurde abgeschnitten."
            case .invalidResponse: "Unerwartete Antwort der KI."
            }
        }
    }

    var model: Model = .opus5
    var effort = "low"

    /// Sends one request and decodes the JSON the model returns under `schema`.
    func structured<T: Decodable>(_ type: T.Type, system: String, user: String,
                                  schema: [String: Any], maxTokens: Int = 4000) async throws -> T {
        guard let apiKey = KeychainStore.get(KeychainStore.Key.anthropicAPIKey), !apiKey.isEmpty else {
            throw ClaudeError.missingAPIKey
        }

        var body: [String: Any] = [
            "model": model.rawValue,
            "max_tokens": maxTokens,
            // Stable system prompt first so it can be served from the prompt cache.
            "system": [["type": "text", "text": system, "cache_control": ["type": "ephemeral"]]],
            "messages": [["role": "user", "content": user]],
            "thinking": ["type": "adaptive"],
            "output_config": [
                "effort": effort,
                "format": ["type": "json_schema", "schema": schema],
            ],
        ]

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        if model == .opus5 {
            // If a safety classifier declines, the API retries on Anthropic's
            // recommended fallback model inside the same call.
            body["fallbacks"] = "default"
            request.setValue("server-side-fallback-2026-07-01", forHTTPHeaderField: "anthropic-beta")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await HTTP.session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ClaudeError.invalidResponse }
        guard http.statusCode == 200 else {
            throw ClaudeError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }

        let decoded = try JSONDecoder().decode(MessageResponse.self, from: data)
        switch decoded.stop_reason {
        case "refusal": throw ClaudeError.refused
        case "max_tokens": throw ClaudeError.truncated
        default: break
        }
        let text = decoded.content.filter { $0.type == "text" }.compactMap(\.text).joined()
        guard let json = text.data(using: .utf8) else { throw ClaudeError.invalidResponse }
        return try JSONDecoder().decode(T.self, from: json)
    }

    private struct MessageResponse: Decodable {
        struct Block: Decodable {
            let type: String
            let text: String?
        }
        let content: [Block]
        let stop_reason: String?
    }
}
