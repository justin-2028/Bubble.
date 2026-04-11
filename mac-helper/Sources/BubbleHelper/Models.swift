import Foundation

struct HelperConfiguration: Codable, Equatable {
  var baseURL: String
  var monitoringEnabled: Bool
  var pollIntervalSeconds: Double

  init(baseURL: String, monitoringEnabled: Bool, pollIntervalSeconds: Double) {
    self.baseURL = baseURL
    self.monitoringEnabled = monitoringEnabled
    self.pollIntervalSeconds = pollIntervalSeconds
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    baseURL = try container.decodeIfPresent(String.self, forKey: .baseURL) ?? HelperConfiguration.default.baseURL
    monitoringEnabled = try container.decodeIfPresent(Bool.self, forKey: .monitoringEnabled) ?? HelperConfiguration.default.monitoringEnabled
    pollIntervalSeconds = try container.decodeIfPresent(Double.self, forKey: .pollIntervalSeconds) ?? HelperConfiguration.default.pollIntervalSeconds
  }

  static let `default` = HelperConfiguration(
    baseURL: "https://bubble.garden",
    monitoringEnabled: true,
    pollIntervalSeconds: 15
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
  var schemaVersion: Int = 1
  var lastProcessedMessageRowID: Int64 = 0
  var lastSyncAt: Date?
  var links: [LocalIdentityLink] = []
  var ignored: [IgnoredIdentity] = []
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
