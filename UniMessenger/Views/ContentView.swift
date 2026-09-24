import SwiftUI

enum AppTab: Hashable {
    case inbox, today, tasks, accounts, settings
}

struct ContentView: View {
    @Environment(MessageHub.self) private var hub
    @Environment(SpeechReader.self) private var reader
    @State private var tab: AppTab = .inbox
    @State private var showOnboarding = false

    var body: some View {
        TabView(selection: $tab) {
            InboxView()
                .tabItem { Label("Posteingang", systemImage: "tray.full.fill") }
                .badge(hub.totalUnread)
                .tag(AppTab.inbox)
            TodayView(tab: $tab)
                .tabItem { Label("Heute", systemImage: "sun.max.fill") }
                .tag(AppTab.today)
            TasksView()
                .tabItem { Label("Aufgaben", systemImage: "checklist") }
                .badge(hub.openTaskCount)
                .tag(AppTab.tasks)
            AccountsView()
                .tabItem { Label("Konten", systemImage: "person.crop.circle.badge.plus") }
                .tag(AppTab.accounts)
            SettingsView()
                .tabItem { Label("Einstellungen", systemImage: "gearshape.fill") }
                .tag(AppTab.settings)
        }
        .overlay(alignment: .bottom) {
            if reader.isSpeaking {
                HStack(spacing: 12) {
                    Label("Wird vorgelesen …", systemImage: "speaker.wave.2.fill")
                        .font(.subheadline)
                    Button("Stopp") { reader.stop() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
                .padding(.leading, 16)
                .padding(.trailing, 8)
                .padding(.vertical, 8)
                .background(.thinMaterial, in: Capsule())
                .shadow(radius: 6)
                .padding(.bottom, 64)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.default, value: reader.isSpeaking)
        .onAppear { showOnboarding = !hub.hasOnboarded }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                hub.hasOnboarded = true
                showOnboarding = false
                Task { await hub.triage() }
            }
        }
    }
}
