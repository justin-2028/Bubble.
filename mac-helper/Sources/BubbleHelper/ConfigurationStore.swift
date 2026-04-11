import Foundation

final class ConfigurationStore {
  private let defaults = UserDefaults.standard
  private let configKey = "BubbleHelper.configuration"

  func load() -> HelperConfiguration {
    guard let data = defaults.data(forKey: configKey) else {
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
    guard let data = try? encoder.encode(configuration) else { return }
    defaults.set(data, forKey: configKey)
  }
}
