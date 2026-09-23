import SwiftUI

@main
struct UniMessengerApp: App {
    @State private var hub = MessageHub()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(hub)
                .onChange(of: scenePhase, initial: true) { _, phase in
                    if phase == .active { hub.startPolling() } else { hub.stopPolling() }
                }
        }
    }
}
