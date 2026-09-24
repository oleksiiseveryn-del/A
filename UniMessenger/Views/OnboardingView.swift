import SwiftUI

struct OnboardingView: View {
    @Environment(MessageHub.self) private var hub
    var onFinish: () -> Void
    @State private var step = 0

    private struct Step {
        let symbol: String?
        let title: String
        let text: String
    }

    private let steps = [
        Step(symbol: nil, title: "Willkommen bei OS",
             text: "Alle Messenger in einem Posteingang – WhatsApp, Telegram, Signal, Instagram, SMS und mehr. Die KI schreibt Antwortvorschläge, erkennt Dringendes und macht aus Chats Aufgaben und Termine. Gesendet wird nur, wenn Sie tippen."),
        Step(symbol: "sparkles", title: "KI über Ihr Claude-Abo",
             text: "Die KI läuft über Ihr Claude-Abo – nichts einzurichten. Im Chat auf „KI über Claude-Abo“ tippen: OS kopiert den Chat und öffnet den OS KI-Assistenten. Dort „Einfügen“ tippen und die Antwort zurückkopieren."),
        Step(symbol: "bubble.left.and.bubble.right.fill", title: "Messenger verbinden",
             text: "Zum Ausprobieren sind Beispiel-Chats aktiv. Unter „Konten“ verbinden Sie einen Telegram-Firmen-Bot oder Ihren Matrix-Server mit WhatsApp-, Signal- und Instagram-Bridges."),
    ]

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Group {
                if let symbol = steps[step].symbol {
                    Image(systemName: symbol).font(.system(size: 44)).foregroundStyle(Color.accentColor)
                } else {
                    Text("OS").font(.system(size: 42, weight: .heavy)).foregroundStyle(.white)
                }
            }
            .frame(width: 96, height: 96)
            .background(steps[step].symbol == nil ? AnyShapeStyle(Color.accentColor.gradient) : AnyShapeStyle(Color(.secondarySystemBackground)),
                        in: RoundedRectangle(cornerRadius: 22))
            Text(steps[step].title).font(.title.bold())
            Text(steps[step].text)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                ForEach(steps.indices, id: \.self) { index in
                    Circle().fill(index == step ? Color.accentColor : Color(.systemGray4)).frame(width: 7, height: 7)
                }
            }
            Spacer()
            Button {
                if step < steps.count - 1 { withAnimation { step += 1 } } else { onFinish() }
            } label: {
                Text(step < steps.count - 1 ? "Weiter" : "Los geht's")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            if step < steps.count - 1 {
                Button("Überspringen", action: onFinish)
            }
        }
        .padding(28)
    }
}
