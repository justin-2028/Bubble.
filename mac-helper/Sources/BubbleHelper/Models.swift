import Foundation

func resolveBubbleBaseURL(from rawValue: String) -> URL? {
  let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmed.isEmpty else { return nil }

  let candidate = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
  guard var components = URLComponents(string: candidate) else {
    return nil
  }

  if components.scheme == nil {
    components.scheme = "https"
  }

  if let host = components.host?.lowercased(), host == "bubble.garden" {
    components.host = "www.bubble.garden"
  }

  components.query = nil
  components.fragment = nil
  if components.path == "/" {
    components.path = ""
  }

  return components.url
}

func normalizeBubbleBaseURL(_ rawValue: String) -> String {
  resolveBubbleBaseURL(from: rawValue)?.absoluteString
    ?? rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
}

struct HelperConfiguration: Codable, Equatable {
  var baseURL: String
  var automaticDailySyncEnabled: Bool

  private enum CodingKeys: String, CodingKey {
    case baseURL
    case automaticDailySyncEnabled
    case monitoringEnabled
  }

  init(baseURL: String, automaticDailySyncEnabled: Bool) {
    self.baseURL = baseURL
    self.automaticDailySyncEnabled = automaticDailySyncEnabled
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    baseURL = normalizeBubbleBaseURL(
      try container.decodeIfPresent(String.self, forKey: .baseURL) ?? HelperConfiguration.default.baseURL
    )
    automaticDailySyncEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .automaticDailySyncEnabled)
      ?? container.decodeIfPresent(Bool.self, forKey: .monitoringEnabled)
      ?? HelperConfiguration.default.automaticDailySyncEnabled
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(baseURL, forKey: .baseURL)
    try container.encode(automaticDailySyncEnabled, forKey: .automaticDailySyncEnabled)
  }

  static let `default` = HelperConfiguration(
    baseURL: "https://www.bubble.garden",
    automaticDailySyncEnabled: true
  )
}

struct LocalIdentityLink: Codable, Hashable, Identifiable {
  let identityHash: String
  var bubbleId: String
  var bubbleName: String
  var displayName: String
  var maskedHandle: String?
  var source: String
  var updatedAt: Date

  var id: String { identityHash }
}

struct IgnoredIdentity: Codable, Hashable, Identifiable {
  let identityHash: String
  var displayName: String
  var maskedHandle: String?
  var updatedAt: Date

  var id: String { identityHash }
}

struct LocalHelperState: Codable, Equatable {
  var schemaVersion: Int = 2
  var lastProcessedMessageRowID: Int64 = 0
  var lastSyncAt: Date?
  var links: [LocalIdentityLink] = []
  var ignored: [IgnoredIdentity] = []
  var lastSyncedInteractionDays: [String: String] = [:]

  private enum CodingKeys: String, CodingKey {
    case schemaVersion
    case lastProcessedMessageRowID
    case lastSyncAt
    case links
    case ignored
    case lastSyncedInteractionDays
  }

  init() {}

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    schemaVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
    lastProcessedMessageRowID = try container.decodeIfPresent(Int64.self, forKey: .lastProcessedMessageRowID) ?? 0
    lastSyncAt = try container.decodeIfPresent(Date.self, forKey: .lastSyncAt)
    links = try container.decodeIfPresent([LocalIdentityLink].self, forKey: .links) ?? []
    ignored = try container.decodeIfPresent([IgnoredIdentity].self, forKey: .ignored) ?? []
    lastSyncedInteractionDays =
      try container.decodeIfPresent([String: String].self, forKey: .lastSyncedInteractionDays) ?? [:]
  }
}

struct HelperCategorySummary: Codable, Hashable, Identifiable {
  let id: String
  let name: String
  let sortOrder: Int
}

struct HelperBubbleSummary: Codable, Hashable, Identifiable {
  let id: String
  let fullName: String
  let categoryId: String
  let lastInteraction: String
  let image: String?
  let starred: Bool
  let duplicateCount: Int?
  let categoryNames: [String]?
}

struct HelperBootstrapResponse: Codable {
  let helperId: String
  let serverTime: String
  let defaultCategoryId: String?
  let categories: [HelperCategorySummary]
  let bubbles: [HelperBubbleSummary]
}

struct HelperCreateBubbleResponse: Codable {
  let ok: Bool
  let helperId: String
  let version: Int
  let updatedAt: String
  let bubble: HelperBubbleSummary
}

struct CreateBubbleRequest: Encodable {
  let fullName: String
  let categoryId: String
  let context: String
  let lastInteraction: String?
  let image: String?
  let starred: Bool
}

struct BubbleInteractionUpdate: Encodable {
  let bubbleID: String
  let occurredAt: Date
}

struct BubbleInteractionUpdateResponse: Decodable {
  let ok: Bool
  let helperId: String
  let updatedCount: Int
  let version: Int
  let updatedAt: String
}

struct ImportCandidate: Identifiable, Hashable {
  let identityHash: String
  let canonicalIdentityKey: String
  let displayName: String
  let subtitle: String
  let matchingHandles: [String]
  let avatarJPEGData: Data?
  let lastSeenAt: Date?
  let sourceLabel: String

  var id: String { identityHash }
}

struct RecentMessageParticipant: Hashable {
  let handle: String
  let lastSeenAt: Date?
}

struct ContactMatch: Hashable {
  let identifier: String
  let displayName: String
  let handles: [String]
  let avatarJPEGData: Data?
}

struct MessageEvent: Hashable {
  let rowID: Int64
  let occurredAt: Date
  let isFromMe: Bool
  let senderHandle: String?
  let participantHandles: [String]
  let chatGUID: String?
  let chatDisplayName: String?
}

enum HelperRuntimeState: Equatable {
  case starting
  case running
  case syncing
  case paused
  case needsConfiguration
  case needsMessagesAccess
  case error
}

enum ContactsAccessState: String {
  case notDetermined = "Not Determined"
  case denied = "Denied"
  case restricted = "Restricted"
  case authorized = "Authorized"
  case limited = "Limited"
}

enum MessagesAccessState: String {
  case unknown = "Unknown"
  case unavailable = "Needs Full Disk Access"
  case available = "Available"
}

enum CandidateStatus: Equatable {
  case linked(LocalIdentityLink)
  case ignored(IgnoredIdentity)
  case unlinked
}
