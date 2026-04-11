import Foundation

enum LaunchAtLoginError: LocalizedError {
  case requiresInstalledApp
  case missingExecutable
  case invalidAgentPayload

  var errorDescription: String? {
    switch self {
    case .requiresInstalledApp:
      return "Install and run Bubble Helper from Bubble Helper.app before enabling Start at Login."
    case .missingExecutable:
      return "Bubble Helper could not resolve its installed app executable."
    case .invalidAgentPayload:
      return "Bubble Helper could not build its launch agent configuration."
    }
  }
}

final class LaunchAtLoginManager {
  private let fileManager = FileManager.default
  private let launchAgentLabel = "garden.bubble.helper.launchagent"

  var isAvailable: Bool {
    installedBundleURL != nil && executablePath != nil
  }

  func isEnabled() throws -> Bool {
    fileManager.fileExists(atPath: launchAgentURL.path)
  }

  func syncCurrentBundlePathIfNeeded() throws {
    guard isAvailable else { return }
    guard try isEnabled() else { return }
    try writeLaunchAgent()
  }

  func setEnabled(_ enabled: Bool) throws {
    if enabled {
      guard isAvailable else {
        throw LaunchAtLoginError.requiresInstalledApp
      }
      try writeLaunchAgent()
      return
    }

    if fileManager.fileExists(atPath: launchAgentURL.path) {
      try fileManager.removeItem(at: launchAgentURL)
    }
  }

  private var installedBundleURL: URL? {
    let bundleURL = Bundle.main.bundleURL
    return bundleURL.pathExtension == "app" ? bundleURL : nil
  }

  private var executablePath: String? {
    if let executableURL = Bundle.main.executableURL {
      return executableURL.path
    }
    return nil
  }

  private var launchAgentURL: URL {
    fileManager.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/LaunchAgents", isDirectory: true)
      .appendingPathComponent("\(launchAgentLabel).plist", isDirectory: false)
  }

  private func writeLaunchAgent() throws {
    guard let executablePath else {
      throw LaunchAtLoginError.missingExecutable
    }

    let payload: [String: Any] = [
      "Label": launchAgentLabel,
      "ProgramArguments": [executablePath],
      "RunAtLoad": true,
      "KeepAlive": false,
      "ProcessType": "Interactive",
      "WorkingDirectory": fileManager.homeDirectoryForCurrentUser.path,
    ]

    guard PropertyListSerialization.propertyList(payload, isValidFor: .xml) else {
      throw LaunchAtLoginError.invalidAgentPayload
    }

    let directory = launchAgentURL.deletingLastPathComponent()
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

    let data = try PropertyListSerialization.data(fromPropertyList: payload, format: .xml, options: 0)
    try data.write(to: launchAgentURL, options: .atomic)
  }
}
