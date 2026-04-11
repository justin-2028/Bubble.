import SwiftUI

struct SettingsView: View {
  @EnvironmentObject private var model: AppModel

  @State private var baseURL = ""
  @State private var tokenInput = ""
  @State private var monitoringEnabled = true
  @State private var pollIntervalSeconds = 15.0

  var body: some View {
    Form {
      Section("Bubble Connection") {
        TextField("Bubble URL", text: $baseURL, prompt: Text("https://bubble.garden"))

        SecureField(
          model.hasStoredHelperToken
            ? "Leave blank to keep the stored helper token"
            : "Paste a helper token from Bubble",
          text: $tokenInput
        )

        Toggle("Enable realtime syncing", isOn: $monitoringEnabled)

        Stepper(value: $pollIntervalSeconds, in: 10 ... 120, step: 5) {
          Text("Poll Messages every \(Int(pollIntervalSeconds)) seconds")
        }

        HStack(spacing: 10) {
          Button("Save Settings") {
            Task {
              await model.saveSettings(
                baseURL: baseURL,
                tokenInput: tokenInput,
                monitoringEnabled: monitoringEnabled,
                pollIntervalSeconds: pollIntervalSeconds
              )
              tokenInput = ""
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
    monitoringEnabled = model.configuration.monitoringEnabled
    pollIntervalSeconds = model.configuration.pollIntervalSeconds
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
