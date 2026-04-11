import Foundation

final class ConfigurationStore {
  private let fileManager = FileManager.default

  func load() -> HelperConfiguration {
    guard let url = try? configurationURL(), let data = try? Data(contentsOf: url) else {
      return .default
    }

    do {
      return try JSONDecoder().decode(HelperConfiguration.self, from: data)
    } catch {
      return .default
    }
  }

  func save(_ configuration: HelperConfiguration) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

    guard
      let data = try? encoder.encode(configuration),
      let url = try? configurationURL()
    else {
      return
    }

    try? fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: url, options: .atomic)
  }

  private func configurationURL() throws -> URL {
    let base = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = base.appendingPathComponent("BubbleHelper", isDirectory: true)
    return directory.appendingPathComponent("config.json", isDirectory: false)
  }
}
