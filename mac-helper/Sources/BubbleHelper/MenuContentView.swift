import AppKit
import SwiftUI

struct MenuContentView: View {
  @EnvironmentObject private var model: AppModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Label("Bubble Helper", systemImage: model.statusIconName)
            .font(.headline)
          Text(model.statusTitle)
            .font(.subheadline.weight(.medium))
        }

        Spacer(minLength: 12)

        Text(model.statusTitle)
          .font(.caption.weight(.semibold))
          .foregroundStyle(statusColor)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(statusColor.opacity(0.12), in: Capsule())
      }

      Text(model.statusDetail)
        .font(.subheadline)
        .foregroundStyle(.secondary)

      if let lastSyncAt = model.localState.lastSyncAt {
        Text("Last sync \(relativeDateDescription(lastSyncAt))")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      HStack(spacing: 12) {
        statCard(title: "Linked", value: "\(model.linkedCount)")
        statCard(title: "Identities", value: "\(model.identityLinkCount)")
      }

      Divider()

      Button("Import from iMessage") {
        NSApp.activate(ignoringOtherApps: true)
        openWindow(id: "import")
        Task {
          await model.refreshBubbleCatalog(showErrors: false)
        }
      }

      Button("Sync Now") {
        Task {
          await model.runSyncNow()
        }
      }

      Button(model.configuration.automaticDailySyncEnabled ? "Disable Daily Auto Sync" : "Enable Daily Auto Sync") {
        model.toggleAutomaticDailySync()
      }

      Divider()

      Button("Settings") {
        NSApp.activate(ignoringOtherApps: true)
        openWindow(id: "settings")
      }

      Button("Quit Bubble Helper") {
        NSApplication.shared.terminate(nil)
      }

      if let error = model.lastErrorMessage, !error.isEmpty {
        Divider()
        Text(error)
          .font(.caption)
          .foregroundStyle(.red)
      }
    }
    .padding(14)
    .frame(width: 320)
  }

  private var statusColor: Color {
    switch model.runtimeState {
    case .running:
      return .green
    case .syncing:
      return .blue
    case .paused:
      return .orange
    case .needsConfiguration, .needsMessagesAccess:
      return .yellow
    case .error:
      return .red
    case .starting:
      return Color.secondary
    }
  }

  private func statCard(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title.uppercased())
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(value)
        .font(.title3.weight(.semibold))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(10)
    .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
  }
}
