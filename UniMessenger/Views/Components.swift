import SwiftUI

struct PlatformBadge: View {
    let platform: Platform
    var size: CGFloat = 44

    var body: some View {
        ZStack {
            Circle().fill(platform.color.gradient)
            Image(systemName: platform.symbol)
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .accessibilityLabel(platform.displayName)
    }
}

struct PriorityTag: View {
    let priority: Priority

    var body: some View {
        Text(priority.label)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }

    private var color: Color {
        switch priority {
        case .urgent: .red
        case .normal: .blue
        case .low: .secondary
        }
    }
}

extension Date {
    var inboxLabel: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(self) { return formatted(date: .omitted, time: .shortened) }
        if calendar.isDateInYesterday(self) { return "Gestern" }
        return formatted(.dateTime.day().month(.twoDigits))
    }
}
