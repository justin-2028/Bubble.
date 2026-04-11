import Foundation
import Security

enum KeychainStoreError: LocalizedError {
  case unexpectedStatus(OSStatus)

  var errorDescription: String? {
    switch self {
    case .unexpectedStatus(let status):
      if let message = SecCopyErrorMessageString(status, nil) as String? {
        return message
      }
      return "Keychain error: \(status)"
    }
  }
}

final class KeychainStore: @unchecked Sendable {
  private let service: String

  init(service: String) {
    self.service = service
  }

  func loadData(account: String) throws -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    switch status {
    case errSecSuccess:
      return item as? Data
    case errSecItemNotFound:
      return nil
    default:
      throw KeychainStoreError.unexpectedStatus(status)
    }
  }

  func saveData(_ data: Data, account: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]

    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]

    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess {
      return
    }

    if updateStatus != errSecItemNotFound {
      throw KeychainStoreError.unexpectedStatus(updateStatus)
    }

    var insert = query
    insert[kSecValueData as String] = data
    insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

    let insertStatus = SecItemAdd(insert as CFDictionary, nil)
    guard insertStatus == errSecSuccess else {
      throw KeychainStoreError.unexpectedStatus(insertStatus)
    }
  }

  func delete(account: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]

    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw KeychainStoreError.unexpectedStatus(status)
    }
  }

  func loadString(account: String) throws -> String? {
    guard let data = try loadData(account: account) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  func saveString(_ value: String, account: String) throws {
    try saveData(Data(value.utf8), account: account)
  }
}
