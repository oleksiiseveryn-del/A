import PhotosUI
import QuickLook
import SwiftUI
import UniformTypeIdentifiers

/// A photo or document picked but not yet sent.
struct PendingAttachment: Identifiable {
    let id = UUID()
    let data: Data
    let name: String
    let mime: String
    var thumbnail: UIImage?

    /// Photos are converted to JPEG (HEIC is not understood everywhere) and scaled for a fast upload.
    static func make(data: Data, name: String, mime: String) -> PendingAttachment {
        if Attachment.kind(for: mime) == .image, !mime.contains("gif"), let image = UIImage(data: data) {
            let scaled = MessageHub.scaled(image, maxSide: 2560)
            if let jpeg = scaled.jpegData(compressionQuality: 0.85) {
                let base = (name as NSString).deletingPathExtension
                return PendingAttachment(data: jpeg, name: base + ".jpg", mime: "image/jpeg",
                                         thumbnail: MessageHub.scaled(image, maxSide: 200))
            }
        }
        return PendingAttachment(data: data, name: name, mime: mime, thumbnail: nil)
    }
}

/// Photo or document inside a chat bubble. Tap opens QuickLook (zoom, share, save, print).
struct AttachmentBubble: View {
    @Environment(MessageHub.self) private var hub
    let attachment: Attachment
    let conversation: Conversation
    let isOutgoing: Bool
    @State private var image: UIImage?
    @State private var failure: String?
    @State private var previewURL: URL?
    @State private var isOpening = false

    var body: some View {
        Button(action: open) {
            if attachment.kind == .image {
                Group {
                    if let image {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else {
                        VStack(spacing: 6) {
                            if let failure {
                                Image(systemName: "exclamationmark.triangle")
                                Text(failure).font(.caption2).multilineTextAlignment(.center)
                            } else {
                                ProgressView()
                                Text("Foto wird geladen …").font(.caption2)
                            }
                        }
                        .padding()
                    }
                }
                .frame(width: 240, height: image == nil ? 120 : 240 * min(1.3, max(0.5, (image?.size.height ?? 1) / (image?.size.width ?? 1))))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            } else {
                HStack(spacing: 10) {
                    Image(systemName: attachment.symbol).font(.title2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(attachment.name).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                        Text([attachment.size > 0 ? ByteCountFormatter.string(fromByteCount: Int64(attachment.size), countStyle: .file) : nil,
                              attachment.mime.split(separator: "/").last.map { $0.uppercased() }]
                            .compactMap { $0 }.joined(separator: " · "))
                            .font(.caption2).opacity(0.75)
                    }
                    if isOpening { ProgressView() }
                }
                .padding(10)
                .frame(maxWidth: 240, alignment: .leading)
                .background((isOutgoing ? Color.white : Color.primary).opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .buttonStyle(.plain)
        .task(id: attachment.cacheKey) {
            guard attachment.kind == .image, image == nil else { return }
            do {
                let data = try await hub.loadAttachment(attachment, in: conversation)
                image = UIImage(data: data).map { MessageHub.scaled($0, maxSide: 800) }
                if image == nil { failure = "Format nicht darstellbar" }
            } catch {
                failure = error.localizedDescription
            }
        }
        .quickLookPreview($previewURL)
    }

    private func open() {
        isOpening = true
        Task {
            defer { isOpening = false }
            do {
                let data = try await hub.loadAttachment(attachment, in: conversation)
                previewURL = try FileStore.previewURL(for: data, name: attachment.name)
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}

struct EmojiPanel: View {
    let onPick: (String) -> Void
    @AppStorage("recentEmojis") private var recentRaw = ""

    private static let emojis = ["👍", "🙏", "✅", "👌", "😊", "🙂", "😀", "😅", "😉", "👋", "🤝", "💪", "👏", "🎉", "❤️", "🔥",
                                 "⚠️", "❗", "❓", "⏰", "📅", "📍", "📞", "📧", "📷", "📄", "📐", "🏗️", "🏠", "🧱", "🔨", "🔧",
                                 "🚧", "🚚", "💧", "⚡", "☀️", "🌧️", "❄️", "✍️", "💶", "🕐", "👷", "🦺", "🪜", "🛠️", "📦", "🔑"]

    private var recent: [String] { recentRaw.split(separator: " ").map(String.init) }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 6) {
                ForEach(recent + Self.emojis.filter { !recent.contains($0) }, id: \.self) { emoji in
                    Button {
                        onPick(emoji)
                        recentRaw = ([emoji] + recent.filter { $0 != emoji }).prefix(8).joined(separator: " ")
                    } label: {
                        Text(emoji).font(.system(size: 28))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .frame(height: 180)
        .background(.bar)
    }
}

/// Camera capture via UIImagePickerController (PhotosPicker has no camera).
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
