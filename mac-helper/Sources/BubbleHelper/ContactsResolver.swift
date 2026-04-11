import Contacts
import Foundation

private struct CachedContact {
  let identifier: String
  let displayName: String
  let handles: [String]
  let avatarJPEGData: Data?
}

private struct ContactsCache {
  let contacts: [CachedContact]
  let handleLookup: [String: CachedContact]
}

actor ContactsResolver {
  private let store = CNContactStore()
  private var cache: ContactsCache?

  func accessState() -> ContactsAccessState {
    switch CNContactStore.authorizationStatus(for: .contacts) {
    case .notDetermined:
      return .notDetermined
    case .restricted:
      return .restricted
    case .denied:
      return .denied
    case .authorized:
      return .authorized
    case .limited:
      return .limited
    @unknown default:
      return .denied
    }
  }

  func requestAccessIfNeeded() async -> ContactsAccessState {
    let current = accessState()
    guard current == .notDetermined else { return current }

    _ = await withCheckedContinuation { continuation in
      store.requestAccess(for: .contacts) { granted, _ in
        continuation.resume(returning: granted)
      }
    }

    return accessState()
  }

  func searchContacts(query: String) async throws -> [ContactMatch] {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return [] }
    let state = accessState()
    guard state == .authorized || state == .limited else { return [] }

    let cache = try loadCache()
    return cache.contacts
      .filter { contact in
        containsQuery(contact.displayName, query: trimmed)
          || contact.handles.contains(where: { containsQuery($0, query: trimmed) })
      }
      .sorted { lhs, rhs in
        if lhs.displayName != rhs.displayName {
          return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
        }
        return lhs.identifier < rhs.identifier
      }
      .map {
        ContactMatch(
          identifier: $0.identifier,
          displayName: $0.displayName,
          handles: $0.handles,
          avatarJPEGData: $0.avatarJPEGData
        )
      }
  }

  func match(handle: String) async -> ContactMatch? {
    let state = accessState()
    guard state == .authorized || state == .limited else { return nil }

    do {
      let cache = try loadCache()
      for key in handleLookupKeys(handle) {
        if let contact = cache.handleLookup[key] {
          return ContactMatch(
            identifier: contact.identifier,
            displayName: contact.displayName,
            handles: contact.handles,
            avatarJPEGData: contact.avatarJPEGData
          )
        }
      }
      return nil
    } catch {
      return nil
    }
  }

  private func loadCache(forceReload: Bool = false) throws -> ContactsCache {
    if let cache, !forceReload {
      return cache
    }

    let keys: [CNKeyDescriptor] = [
      CNContactIdentifierKey as CNKeyDescriptor,
      CNContactGivenNameKey as CNKeyDescriptor,
      CNContactFamilyNameKey as CNKeyDescriptor,
      CNContactMiddleNameKey as CNKeyDescriptor,
      CNContactOrganizationNameKey as CNKeyDescriptor,
      CNContactPhoneNumbersKey as CNKeyDescriptor,
      CNContactEmailAddressesKey as CNKeyDescriptor,
      CNContactThumbnailImageDataKey as CNKeyDescriptor,
    ]

    let request = CNContactFetchRequest(keysToFetch: keys)
    request.sortOrder = .userDefault

    var contacts: [CachedContact] = []
    var lookup: [String: CachedContact] = [:]

    try store.enumerateContacts(with: request) { contact, _ in
      let displayName = contactDisplayName(contact)
      let handles = contact.phoneNumbers.map { $0.value.stringValue } + contact.emailAddresses.map { String($0.value) }
      guard !handles.isEmpty else { return }

      let cached = CachedContact(
        identifier: contact.identifier,
        displayName: displayName,
        handles: handles,
        avatarJPEGData: contact.thumbnailImageData
      )

      contacts.append(cached)
      for handle in handles {
        for key in handleLookupKeys(handle) {
          lookup[key] = cached
        }
      }
    }

    let built = ContactsCache(contacts: contacts, handleLookup: lookup)
    cache = built
    return built
  }

  private func contactDisplayName(_ contact: CNContact) -> String {
    if let formatted = CNContactFormatter.string(from: contact, style: .fullName), !formatted.isEmpty {
      return formatted
    }
    if !contact.organizationName.isEmpty {
      return contact.organizationName
    }

    let firstHandle = contact.phoneNumbers.first?.value.stringValue ?? contact.emailAddresses.first.map(String.init)
    return firstHandle ?? "Unknown Contact"
  }
}
