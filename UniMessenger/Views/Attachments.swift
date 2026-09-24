import AVFoundation
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

    @State private var player: AVAudioPlayer?
    @State private var isPlaying = false

    var body: some View {
        if attachment.kind == .audio { audioBody } else { fileBody }
    }

    /// Voice messages play inline; formats iOS cannot play (e.g. Telegram OGG) fall back to QuickLook.
    private var audioBody: some View {
        Button {
            Task { await togglePlayback() }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(isOutgoing ? Color.white : Color.accentColor)
                Image(systemName: "waveform")
                    .font(.title2)
                    .symbolEffect(.variableColor.iterative, isActive: isPlaying)
                VStack(alignment: .leading) {
                    Text("Sprachnachricht").font(.subheadline.weight(.semibold))
                    if let player {
                        Text(Duration.seconds(player.duration).formatted(.time(pattern: .minuteSecond))).font(.caption2).opacity(0.75)
                    } else if let failure {
                        Text(failure).font(.caption2).opacity(0.75)
                    }
                }
                if isOpening { ProgressView() }
            }
            .padding(.vertical, 4)
            .frame(minWidth: 200, alignment: .leading)
        }
        .buttonStyle(.plain)
        .onDisappear { player?.stop(); isPlaying = false }
        .quickLookPreview($previewURL)
    }

    private func togglePlayback() async {
        if let player, isPlaying {
            player.pause()
            isPlaying = false
            return
        }
        do {
            if player == nil {
                isOpening = true
                defer { isOpening = false }
                let data = try await hub.loadAttachment(attachment, in: conversation)
                do {
                    player = try AVAudioPlayer(data: data)
                } catch {
                    previewURL = try FileStore.previewURL(for: data, name: attachment.name)
                    return
                }
            }
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try? AVAudioSession.sharedInstance().setActive(true)
            player?.play()
            isPlaying = true
            // Reset the button when playback ends.
            let duration = (player?.duration ?? 0) - (player?.currentTime ?? 0)
            Task {
                try? await Task.sleep(for: .seconds(duration + 0.2))
                if player?.isPlaying == false { isPlaying = false }
            }
        } catch {
            failure = error.localizedDescription
        }
    }

    private var fileBody: some View {
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

/// Records a voice message; returns m4a data on "Anhängen".
struct VoiceRecorderSheet: View {
    let onFinish: (Data) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var recorder = VoiceRecorder()
    @State private var errorText: String?

    var body: some View {
        VStack(spacing: 20) {
            Text("Sprachnachricht").font(.headline).padding(.top)
            Image(systemName: "mic.fill")
                .font(.system(size: 44))
                .foregroundStyle(.red)
                .symbolEffect(.pulse, isActive: recorder.isRecording)
            TimelineView(.periodic(from: .now, by: 0.5)) { context in
                let seconds = Int(context.date.timeIntervalSince(recorder.startedAt ?? context.date))
                Text(String(format: "%d:%02d", seconds / 60, seconds % 60))
                    .font(.system(size: 44, weight: .bold).monospacedDigit())
            }
            Text(errorText ?? "Aufnahme läuft – sprechen Sie jetzt.")
                .foregroundStyle(errorText == nil ? Color.secondary : Color.red)
                .multilineTextAlignment(.center)
            Button {
                if let data = recorder.finish() { onFinish(data) }
                dismiss()
            } label: {
                Label("Stopp & anhängen", systemImage: "stop.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!recorder.isRecording)
            Button("Verwerfen", role: .destructive) {
                recorder.cancel()
                dismiss()
            }
        }
        .padding()
        .presentationDetents([.medium])
        .interactiveDismissDisabled(recorder.isRecording)
        .task {
            do { try await recorder.start() } catch { errorText = error.localizedDescription }
        }
        // Also cancels a start that is still waiting for microphone permission.
        .onDisappear { recorder.cancel() }
    }
}
