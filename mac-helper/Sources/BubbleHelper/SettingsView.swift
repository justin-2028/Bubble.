import SwiftUI

struct SettingsView: View {
  @EnvironmentObject private var model: AppModel

  @State private var baseURL = ""
  @State private var tokenInput = ""
  @State private var automaticDailySyncEnabled = true

  var body: some View {
    Form {
      Section("Bubble Connection") {
        TextField("Bubble URL", text: $baseURL, prompt: Text("https://www.bubble.garden"))

        SecureField(
          model.hasStoredHelperToken
            ? "Leave blank to keep the stored helper token"
            : "Paste a helper token from Bubble",
          text: $tokenInput
        )

        Toggle("Automatically sync once a day at midnight", isOn: $automaticDailySyncEnabled)

        HStack(spacing: 10) {
          Button("Save Settings") {
            Task {
              await model.saveSettings(
                baseURL: baseURL,
                tokenInput: tokenInput,
                automaticDailySyncEnabled: automaticDailySyncEnabled
              )
              tokenInput = ""
            }
          }

          Button("Sync Now") {
            Task {
              await model.runSyncNow()
            }
          }

          Button("Refresh Bubble Catalog") {
            Task {
              await model.refreshBubbleCatalog(showErrors: true)
            }
          }

          if model.hasStoredHelperToken {
            Button("Clear Token", role: .destructive) {
              Task {
                await model.clearSavedHelperToken()
              }
            }
          }
        }
      }

      Section("Permissions") {
        permissionRow(
          title: "Messages",
          value: model.messagesAccessState.rawValue,
          detail: "Bubble Helper needs Full Disk Access so it can read your local Messages database."
        )

        permissionRow(
          title: "Contacts",
          value: model.contactsAccessState.rawValue,
          detail: "Contacts access is optional, but it improves names and pulls saved profile photos when available."
        )

        HStack(spacing: 10) {
          Button("Refresh Permissions") {
            Task {
              await model.refreshPermissions()
            }
          }
          Button("Request Contacts Access") {
            Task {
              await model.requestContactsAccess()
            }
          }
        }
      }

      Section("App Lifecycle") {
        Toggle(
          "Start Bubble Helper at login",
          isOn: Binding(
            get: { model.launchAtLoginEnabled },
            set: { enabled in
              Task {
                await model.setLaunchAtLoginEnabled(enabled)
              }
            }
          )
        )
        .disabled(!model.launchAtLoginAvailable)

        Text(
          model.launchAtLoginAvailable
            ? "Bubble Helper will launch automatically the next time you log into macOS."
            : "Install and run Bubble Helper from Bubble Helper.app to enable Start at Login."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }

      Section("Helper Status") {
        statusRow(title: "State", value: model.statusTitle)
        statusRow(title: "Detail", value: model.statusDetail)
        statusRow(title: "Linked people", value: "\(model.linkedCount)")
        statusRow(title: "Ignored people", value: "\(model.ignoredCount)")
        statusRow(
          title: "Last sync",
          value: model.localState.lastSyncAt.map { relativeDateDescription($0) } ?? "Never"
        )
      }

      if let error = model.lastErrorMessage, !error.isEmpty {
        Section("Last Error") {
          Text(error)
            .foregroundStyle(.red)
        }
      }
    }
    .formStyle(.grouped)
    .navigationTitle("Bubble Helper Settings")
    .onAppear(perform: syncFromModel)
    .onChange(of: model.configuration) { _, _ in
      syncFromModel()
    }
  }

  private func syncFromModel() {
    baseURL = model.configuration.baseURL
    automaticDailySyncEnabled = model.configuration.automaticDailySyncEnabled
  }

  private func permissionRow(title: String, value: String, detail: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(title)
        Spacer()
        Text(value)
          .foregroundStyle(.secondary)
      }
      Text(detail)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private func statusRow(title: String, value: String) -> some View {
    HStack {
      Text(title)
      Spacer()
      Text(value)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.trailing)
    }
  }
}
