import Foundation
import Observation
import UIKit

/// Central store: owns the connectors, merges their conversations into one
/// inbox, persists state, and exposes AI helpers to the views.
@MainActor
@Observable
final class MessageHub {
    private(set) var conversations: [Conversation] = []
    var accounts: [Account] { didSet { Persistence.save(accounts, to: "accounts"); rebuildConnectors() } }
    var profile: AssistantProfile { didSet { Persistence.save(profile, to: "profile") } }
    var model: ClaudeClient.Model { didSet { UserDefaults.standard.set(model.rawValue, forKey: "ai.model") } }
    var autoTriage: Bool { didSet { UserDefaults.standard.set(autoTriage, forKey: "ai.autoTriage") } }

    var tasks: [TaskItem] { didSet { Persistence.save(tasks, to: "tasks") } }
    var templates: [ReplyTemplate] { didSet { Persistence.save(templates, to: "templates") } }
    private(set) var briefing: Briefing? { didSet { Persistence.save(briefing, to: "briefing") } }
    private(set) var isBriefingLoading = false
    var hasOnboarded: Bool { didSet { UserDefaults.standard.set(hasOnboarded, forKey: "onboarded") } }

    private(set) var isRefreshing = false
    private(set) var isTriaging = false
    private(set) var accountErrors: [UUID: String] = [:]
    var lastError: String?

    @ObservationIgnored private var connectors: [UUID: MessengerConnector] = [:]
    @ObservationIgnored private var connected: Set<UUID> = []
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    /// Reply drafts prepared in the background, keyed by conversation and last message.
    @ObservationIgnored private var suggestionCache: [String: (lastID: String, items: [ReplySuggestion])] = [:]
    @ObservationIgnored private var isPrefetching = false

    init() {
        accounts = Persistence.load([Account].self, from: "accounts")
            ?? [Account(kind: .demo, name: "Demo")]
        profile = Persistence.load(AssistantProfile.self, from: "profile") ?? AssistantProfile()
        model = UserDefaults.standard.string(forKey: "ai.model").flatMap(ClaudeClient.Model.init(rawValue:)) ?? .opus5
        autoTriage = UserDefaults.standard.object(forKey: "ai.autoTriage") as? Bool ?? true
        conversations = Persistence.load([Conversation].self, from: "conversations") ?? []
        tasks = Persistence.load([TaskItem].self, from: "tasks") ?? []
        templates = Persistence.load([ReplyTemplate].self, from: "templates") ?? ReplyTemplate.defaults
        briefing = Persistence.load(Briefing.self, from: "briefing")
        hasOnboarded = UserDefaults.standard.bool(forKey: "onboarded")
        rebuildConnectors()
    }

    var assistant: ReplyAssistant {
        ReplyAssistant(profile: profile, client: ClaudeClient(model: model))
    }

    var hasAPIKey: Bool { KeychainStore.get(KeychainStore.Key.anthropicAPIKey) != nil }
    var openTaskCount: Int { tasks.filter { !$0.isDone }.count }

    func conversation(id: String) -> Conversation? {
        conversations.first { $0.id == id }
    }

    var totalUnread: Int { conversations.filter { !$0.isArchived }.reduce(0) { $0 + $1.unreadCount } }

    func account(for conversation: Conversation) -> Account? {
        accounts.first { $0.id == conversation.accountID }
    }

    // MARK: - Connectors

    private func rebuildConnectors() {
        let enabled = accounts.filter(\.isEnabled)
        var rebuilt: [UUID: MessengerConnector] = [:]
        for account in enabled {
            if let existing = connectors[account.id], existing.account == account {
                rebuilt[account.id] = existing
            } else {
                rebuilt[account.id] = Self.makeConnector(for: account)
                connected.remove(account.id)
            }
        }
        connectors = rebuilt
        connected = connected.intersection(connectors.keys)
        let valid = Set(accounts.map(\.id))
        conversations.removeAll { !valid.contains($0.accountID) }
    }

    private static func makeConnector(for account: Account) -> MessengerConnector {
        switch account.kind {
        case .matrix: return MatrixConnector(account: account)
        case .telegramBot: return TelegramBotConnector(account: account)
        case .demo: return DemoConnector(account: account)
        }
    }

    /// Forces a fresh login next time (e.g. after the user edits credentials).
    func resetConnection(for accountID: UUID) {
        connected.remove(accountID)
        connectors[accountID] = nil
        rebuildConnectors()
    }

    func startPolling(interval: Duration = .seconds(20)) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: interval)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        let jobs = connectors.map { (id: $0.key, connector: $0.value, needsConnect: !connected.contains($0.key)) }
        let results = await withTaskGroup(of: (UUID, Result<[Conversation], Error>).self) { group in
            for job in jobs {
                group.addTask {
                    do {
                        if job.needsConnect { try await job.connector.connect() }
                        return (job.id, .success(try await job.connector.fetchUpdates()))
                    } catch {
                        return (job.id, .failure(error))
                    }
                }
            }
            var collected: [(UUID, Result<[Conversation], Error>)] = []
            for await result in group { collected.append(result) }
            return collected
        }

        var changedIDs: [String] = []
        for (id, result) in results {
            switch result {
            case .success(let updates):
                connected.insert(id)
                accountErrors[id] = nil
                for update in updates where merge(update) { changedIDs.append(update.id) }
            case .failure(let error):
                accountErrors[id] = error.localizedDescription
            }
        }
        sort()
        Persistence.save(conversations, to: "conversations")

        if autoTriage, !changedIDs.isEmpty {
            await triage(ids: changedIDs)
        }
    }

    /// Returns true if the conversation received new incoming messages.
    @discardableResult
    private func merge(_ update: Conversation) -> Bool {
        guard let index = conversations.firstIndex(where: { $0.id == update.id }) else {
            conversations.append(update)
            return update.messages.contains { !$0.isOutgoing }
        }
        var existing = conversations[index]
        let known = Set(existing.messages.map(\.id))
        let fresh = update.messages.filter { !known.contains($0.id) }
        existing.messages.append(contentsOf: fresh)
        existing.messages.sort { $0.date < $1.date }
        existing.title = update.title
        existing.platform = update.platform
        if update.unreadCount > 0 { existing.unreadCount = max(existing.unreadCount, update.unreadCount) }
        let hasIncoming = fresh.contains { !$0.isOutgoing }
        if hasIncoming { existing.isArchived = false }
        conversations[index] = existing
        return hasIncoming
    }

    private func sort() {
        conversations.sort { lhs, rhs in
            if lhs.isPinned != rhs.isPinned { return lhs.isPinned }
            return lhs.lastActivity > rhs.lastActivity
        }
    }

    // MARK: - Actions

    func send(_ text: String, in conversationID: String) async throws {
        guard let index = conversations.firstIndex(where: { $0.id == conversationID }),
              let connector = connectors[conversations[index].accountID] else {
            throw ConnectorError.notSupported("Konto ist deaktiviert")
        }
        let message = try await connector.send(text: text, to: conversations[index])
        guard let current = conversations.firstIndex(where: { $0.id == conversationID }) else { return }
        conversations[current].messages.append(message)
        conversations[current].unreadCount = 0
        conversations[current].priority = .low
        conversations[current].aiSummary = nil
        sort()
        Persistence.save(conversations, to: "conversations")
    }

    // MARK: - Photos & documents

    func sendFile(_ original: Data, name: String, mime: String, in conversationID: String) async throws {
        guard let index = conversations.firstIndex(where: { $0.id == conversationID }),
              let connector = connectors[conversations[index].accountID] else {
            throw ConnectorError.notSupported("Konto ist deaktiviert")
        }
        var data = original, fileName = name, type = mime
        // Large photos are scaled down for a fast upload.
        if Attachment.kind(for: mime) == .image, !mime.contains("gif"), original.count > 1_500_000,
           let image = UIImage(data: original), let jpeg = Self.scaled(image, maxSide: 2560).jpegData(compressionQuality: 0.85) {
            data = jpeg
            type = "image/jpeg"
            fileName = (name as NSString).deletingPathExtension + ".jpg"
        }
        guard data.count <= 50_000_000 else { throw ConnectorError.notSupported("Dateien über 50 MB") }
        if !connected.contains(conversations[index].accountID) {
            try await connector.connect()
            connected.insert(conversations[index].accountID)
        }
        let messageID = try await connector.sendFile(data, name: fileName, mime: type, to: conversations[index])
        let key = UUID().uuidString
        FileStore.store(data, for: "local_" + key)
        let message = Message(id: messageID, senderName: "Ich", text: "", date: .now, isOutgoing: true,
                              attachment: Attachment(kind: Attachment.kind(for: type), name: fileName, mime: type,
                                                     size: data.count, source: .local(key: key)))
        guard let current = conversations.firstIndex(where: { $0.id == conversationID }) else { return }
        conversations[current].messages.append(message)
        conversations[current].unreadCount = 0
        conversations[current].priority = .low
        sort()
        Persistence.save(conversations, to: "conversations")
    }

    /// Cached file content, downloaded through the conversation's connector if needed.
    func loadAttachment(_ attachment: Attachment, in conversation: Conversation) async throws -> Data {
        if let data = FileStore.data(for: attachment.cacheKey) { return data }
        guard case .local = attachment.source else {
            guard let connector = connectors[conversation.accountID] else { throw ConnectorError.notSupported("Konto ist deaktiviert") }
            if !connected.contains(conversation.accountID) {
                try await connector.connect()
                connected.insert(conversation.accountID)
            }
            let data = try await connector.download(attachment)
            FileStore.store(data, for: attachment.cacheKey)
            return data
        }
        throw ConnectorError.notSupported("Datei ist auf diesem Gerät nicht mehr vorhanden")
    }

    nonisolated static func scaled(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        guard scale < 1 else { return image }
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }

    /// Recent photos (and optionally one PDF) as Claude content blocks.
    func mediaBlocks(for conversation: Conversation, images: Int, pdf: Bool) async -> [[String: Any]] {
        var blocks: [[String: Any]] = []
        var imageCount = 0, pdfDone = !pdf
        for message in conversation.messages.suffix(12).reversed() {
            guard let attachment = message.attachment else { continue }
            if attachment.kind == .image, imageCount < images,
               let data = try? await loadAttachment(attachment, in: conversation),
               let image = UIImage(data: data),
               let jpeg = Self.scaled(image, maxSide: 1024).jpegData(compressionQuality: 0.8) {
                blocks.insert(["type": "image", "source": ["type": "base64", "media_type": "image/jpeg",
                                                           "data": jpeg.base64EncodedString()]], at: 0)
                imageCount += 1
            } else if !pdfDone, attachment.mime.contains("pdf"), attachment.size < 4_000_000,
                      let data = try? await loadAttachment(attachment, in: conversation) {
                blocks.insert(["type": "document", "title": attachment.name,
                               "source": ["type": "base64", "media_type": "application/pdf",
                                          "data": data.base64EncodedString()]], at: 0)
                pdfDone = true
            }
        }
        return blocks
    }

    // MARK: - Reply suggestions (cached, prefetched)

    func cachedSuggestions(for conversation: Conversation) -> [ReplySuggestion]? {
        guard let hit = suggestionCache[conversation.id], hit.lastID == conversation.lastMessage?.id else { return nil }
        return hit.items
    }

    func suggestions(for conversation: Conversation, tone: AssistantProfile.Tone, instruction: String) async throws -> [ReplySuggestion] {
        let media = await mediaBlocks(for: conversation, images: 2, pdf: false)
        let items = try await assistant.suggestReplies(for: conversation, tone: tone, language: profile.replyLanguage,
                                                        instruction: instruction, media: media)
        if instruction.isEmpty, tone == profile.defaultTone, let lastID = conversation.lastMessage?.id {
            suggestionCache[conversation.id] = (lastID, items)
        }
        return items
    }

    /// Prepares drafts for the most important unread chats so opening them is instant.
    func prefetchSuggestions() async {
        guard hasAPIKey, !isPrefetching else { return }
        isPrefetching = true
        defer { isPrefetching = false }
        let rank: [Priority: Int] = [.urgent: 0, .normal: 1, .low: 2]
        let candidates = conversations
            .filter { !$0.isArchived && $0.unreadCount > 0 && $0.lastMessage?.isOutgoing == false && cachedSuggestions(for: $0) == nil }
            .sorted { rank[$0.priority ?? .normal, default: 1] < rank[$1.priority ?? .normal, default: 1] }
            .prefix(3)
        for conversation in candidates {
            guard (try? await suggestions(for: conversation, tone: profile.defaultTone, instruction: "")) != nil else { break }
        }
    }

    func markRead(_ conversationID: String) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationID }) else { return }
        let conversation = conversations[index]
        conversations[index].unreadCount = 0
        Persistence.save(conversations, to: "conversations")
        if let connector = connectors[conversation.accountID] {
            Task { await connector.markRead(conversation) }
        }
    }

    func togglePin(_ conversationID: String) {
        update(conversationID) { $0.isPinned.toggle() }
        sort()
    }

    func toggleArchive(_ conversationID: String) {
        update(conversationID) { $0.isArchived.toggle() }
    }

    func setNote(_ note: String, for conversationID: String) {
        update(conversationID) { $0.note = note.trimmingCharacters(in: .whitespacesAndNewlines) }
    }

    // MARK: - Tasks

    /// Returns false if an identical open task already exists.
    @discardableResult
    func addTask(text: String, due: String = "", conversationID: String = "") -> Bool {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty,
              !tasks.contains(where: { !$0.isDone && $0.text.lowercased() == normalized.lowercased() }) else { return false }
        tasks.insert(TaskItem(text: normalized, due: due, conversationID: conversationID,
                              source: conversation(id: conversationID)?.title ?? ""), at: 0)
        return true
    }

    func toggleTask(_ id: UUID) {
        guard let index = tasks.firstIndex(where: { $0.id == id }) else { return }
        tasks[index].isDone.toggle()
        tasks[index].doneAt = tasks[index].isDone ? .now : nil
    }

    func deleteTask(_ id: UUID) {
        tasks.removeAll { $0.id == id }
    }

    // MARK: - Briefing

    var isBriefingStale: Bool {
        guard let created = briefing?.created else { return true }
        return Date.now.timeIntervalSince(created) > 2 * 3600
    }

    func loadBriefing() async {
        let open = conversations.filter { !$0.isArchived && $0.lastMessage != nil }.prefix(30)
        guard !open.isEmpty, !isBriefingLoading else { return }
        isBriefingLoading = true
        defer { isBriefingLoading = false }
        do {
            briefing = try await assistant.briefing(Array(open), openTasks: tasks.filter { !$0.isDone })
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func update(_ id: String, _ change: (inout Conversation) -> Void) {
        guard let index = conversations.firstIndex(where: { $0.id == id }) else { return }
        change(&conversations[index])
        Persistence.save(conversations, to: "conversations")
    }

    // MARK: - AI

    func triage(ids: [String]? = nil) async {
        let targets = conversations.filter { conversation in
            !conversation.isArchived
                && (ids?.contains(conversation.id) ?? (conversation.unreadCount > 0))
                && conversation.lastMessage?.isOutgoing == false
        }
        guard !targets.isEmpty, !isTriaging else { return }
        isTriaging = true
        defer { isTriaging = false }
        do {
            let results = try await assistant.triage(Array(targets.prefix(25)))
            for (id, item) in results {
                update(id) {
                    $0.priority = item.priority
                    $0.aiSummary = item.summary
                }
            }
        } catch ClaudeClient.ClaudeError.missingAPIKey {
            // Triage is optional; stay quiet until the user adds a key.
        } catch {
            lastError = error.localizedDescription
        }
        Task { await prefetchSuggestions() }
    }
}
