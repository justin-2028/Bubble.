import CryptoKit
import Foundation
import Security

enum LocalStateStoreError: LocalizedError {
  case missingCombinedPayload

  var errorDescription: String? {
    switch self {
    case .missingCombinedPayload:
      return "The helper state file is corrupt."
    }
  }
}

actor LocalStateStore {
  private enum Account {
    static let stateKey = "state-encryption-key"
    static let identitySalt = "identity-hash-salt"
    static let helperToken = "helper-token"
  }

  private let keychain: KeychainStore
  private let fileManager = FileManager.default

  init(keychain: KeychainStore) {
    self.keychain = keychain
  }

  func loadState() throws -> LocalHelperState {
    let url = try stateURL()
    guard fileManager.fileExists(atPath: url.path) else {
      return LocalHelperState()
    }

    let encrypted = try Data(contentsOf: url)
    let sealedBox = try AES.GCM.SealedBox(combined: encrypted)
    let decrypted = try AES.GCM.open(sealedBox, using: try encryptionKey())
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return try decoder.decode(LocalHelperState.self, from: decrypted)
  }

  func saveState(_ state: LocalHelperState) throws {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    encoder.outputFormatting = [.sortedKeys]
    let encoded = try encoder.encode(state)
    let sealed = try AES.GCM.seal(encoded, using: try encryptionKey())
    guard let combined = sealed.combined else {
      throw LocalStateStoreError.missingCombinedPayload
    }

    let url = try stateURL()
    try combined.write(to: url, options: .atomic)
  }

  func identityHash(for canonicalIdentityKey: String) throws -> String {
    let salt = try identitySaltData()
    var data = Data()
    data.append(salt)
    data.append(Data(canonicalIdentityKey.utf8))
    let digest = SHA256.hash(data: data)
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  func loadHelperToken() throws -> String? {
    try keychain.loadString(account: Account.helperToken)
  }

  func saveHelperToken(_ token: String) throws {
    try keychain.saveString(token, account: Account.helperToken)
  }

  func clearHelperToken() throws {
    try keychain.delete(account: Account.helperToken)
  }

  private func stateURL() throws -> URL {
    let base = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = base.appendingPathComponent("BubbleHelper", isDirectory: true)
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory.appendingPathComponent("state.bin", isDirectory: false)
  }

  private func encryptionKey() throws -> SymmetricKey {
    if let existing = try keychain.loadData(account: Account.stateKey) {
      return SymmetricKey(data: existing)
    }

    let data = try randomData(length: 32)
    try keychain.saveData(data, account: Account.stateKey)
    return SymmetricKey(data: data)
  }

  private func identitySaltData() throws -> Data {
    if let existing = try keychain.loadData(account: Account.identitySalt) {
      return existing
    }

    let data = try randomData(length: 32)
    try keychain.saveData(data, account: Account.identitySalt)
    return data
  }

  private func randomData(length: Int) throws -> Data {
    var bytes = [UInt8](repeating: 0, count: length)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard status == errSecSuccess else {
      throw KeychainStoreError.unexpectedStatus(status)
    }
    return Data(bytes)
  }
}
