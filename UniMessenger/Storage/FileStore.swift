import Foundation
import UniformTypeIdentifiers

/// Local cache for photos and documents (Application Support, file protection on).
enum FileStore {
    private static var directory: URL {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("UniMessenger/files", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static func url(for key: String) -> URL {
        let safe = key.map { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" ? $0 : "_" }
        return directory.appendingPathComponent(String(safe))
    }

    static func data(for key: String) -> Data? {
        try? Data(contentsOf: url(for: key))
    }

    static func store(_ data: Data, for key: String) {
        try? data.write(to: url(for: key), options: [.atomic, .completeFileProtection])
    }

    /// A temporary copy with the real file name, for QuickLook and the share sheet.
    static func previewURL(for data: Data, name: String) throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let safeName = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        let file = folder.appendingPathComponent(safeName.isEmpty ? "Datei" : safeName)
        try data.write(to: file)
        return file
    }

    static func mimeType(for url: URL) -> String {
        UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    }
}
