import SwiftUI

struct ContentView: View {
    @Environment(MessageHub.self) private var hub

    var body: some View {
        TabView {
            InboxView()
                .tabItem { Label("Posteingang", systemImage: "tray.full.fill") }
                .badge(hub.totalUnread)
            AccountsView()
                .tabItem { Label("Konten", systemImage: "person.crop.circle.badge.plus") }
            SettingsView()
                .tabItem { Label("Einstellungen", systemImage: "gearshape.fill") }
        }
    }
}
