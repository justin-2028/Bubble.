import Foundation

private struct PreparedInteractionUpdate {
  let bubbleID: String
  let occurredAt: Date
  let dayKey: String
}

@MainActor
final class AppModel: ObservableObject {
  @Published var configuration: HelperConfiguration
  @Published var bootstrap: HelperBootstrapResponse?
  @Published var localState = LocalHelperState()
  @Published var runtimeState: HelperRuntimeState = .starting
  @Published var statusDetail = "Starting Bubble Helper…"
  @Published var lastErrorMessage: String?
  @Published var importFeedbackMessage: String?
  @Published var importResults: [ImportCandidate] = []
  @Published var selectedCandidateID: String?
  @Published var bubbleSearch = ""
  @Published var selectedBubbleID: String?
  @Published var selectedCategoryID: String?
  @Published var contactsAccessState: ContactsAccessState = .notDetermined
  @Published var messagesAccessState: MessagesAccessState = .unknown
  @Published var hasStoredHelperToken = false
  @Published var launchAtLoginEnabled = false
  @Published var launchAtLoginAvailable = false

  private let configurationStore: ConfigurationStore
  private let localStateStore: LocalStateStore
  private let apiClient: BubbleAPIClient
  private let contactsResolver: ContactsResolver
  private let messagesDatabase: MessagesDatabase
  private let launchAtLoginManager: LaunchAtLoginManager

  private var monitorTask: Task<Void, Never>?
  private var syncInFlight = false

  init(
    configurationStore: ConfigurationStore = ConfigurationStore(),
    localStateStore: LocalStateStore? = nil,
    apiClient: BubbleAPIClient = BubbleAPIClient(),
    contactsResolver: ContactsResolver = ContactsResolver(),
    messagesDatabase: MessagesDatabase = MessagesDatabase(),
    launchAtLoginManager: LaunchAtLoginManager = LaunchAtLoginManager()
  ) {
    let keychain = KeychainStore(service: "garden.bubble.helper")
    let resolvedLocalStateStore = localStateStore ?? LocalStateStore(keychain: keychain)

    self.configurationStore = configurationStore
    self.configuration = configurationStore.load()
    self.localStateStore = resolvedLocalStateStore
    self.apiClient = apiClient
    self.contactsResolver = contactsResolver
    self.messagesDatabase = messagesDatabase
    self.launchAtLoginManager = launchAtLoginManager

    Task {
      await bootstrapApplication()
    }
  }

  var selectedCandidate: ImportCandidate? {
    importResults.first(where: { $0.id == selectedCandidateID })
  }

  var selectedBubble: HelperBubbleSummary? {
    filteredBubbles.first(where: { $0.id == selectedBubbleID })
      ?? bootstrap?.bubbles.first(where: { $0.id == selectedBubbleID })
  }

  var filteredBubbles: [HelperBubbleSummary] {
    let bubbles = bootstrap?.bubbles ?? []
    let query = bubbleSearch.trimmingCharacters(in: .whitespacesAndNewlines)
    return bubbles
      .filter { bubble in
        query.isEmpty
          || containsQuery(bubble.fullName, query: query)
          || (bubble.categoryNames ?? []).contains(where: { containsQuery($0, query: query) })
      }
      .sorted { lhs, rhs in
        if lhs.starred != rhs.starred {
          return lhs.starred && !rhs.starred
        }
        return lhs.fullName.localizedCaseInsensitiveCompare(rhs.fullName) == .orderedAscending
      }
  }

  var linkedCount: Int {
    localState.links.count
  }

  var ignoredCount: Int {
    localState.ignored.count
  }

  var statusTitle: String {
    switch runtimeState {
    case .starting:
      return "Starting"
    case .running:
      return "Running"
    case .syncing:
      return "Syncing"
    case .paused:
      return "Paused"
    case .needsConfiguration:
      return "Needs Setup"
    case .needsMessagesAccess:
      return "Needs Full Disk Access"
    case .error:
      return "Error"
    }
  }

  var statusIconName: String {
    switch runtimeState {
    case .starting:
      return "hourglass.circle"
    case .running:
      return "checkmark.circle.fill"
    case .syncing:
      return "arrow.triangle.2.circlepath.circle.fill"
    case .paused:
      return "pause.circle"
    case .needsConfiguration:
      return "gearshape.2.fill"
    case .needsMessagesAccess:
      return "lock.shield.fill"
    case .error:
      return "exclamationmark.triangle.fill"
    }
  }

  func candidateStatus(for candidate: ImportCandidate) -> CandidateStatus {
    if let link = localState.links.first(where: { $0.identityHash == candidate.identityHash }) {
      return .linked(link)
    }
    if let ignored = localState.ignored.first(where: { $0.identityHash == candidate.identityHash }) {
      return .ignored(ignored)
    }
    return .unlinked
  }

  func saveSettings(
    baseURL: String,
    tokenInput: String,
    automaticDailySyncEnabled: Bool
  ) async {
    let nextConfiguration = HelperConfiguration(
      baseURL: normalizeBubbleBaseURL(baseURL),
      automaticDailySyncEnabled: automaticDailySyncEnabled
    )
    configuration = nextConfiguration
    configurationStore.save(nextConfiguration)

    let token = tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)
    if !token.isEmpty {
      do {
        try await localStateStore.saveHelperToken(token)
      } catch {
        recordError(error)
      }
    }

    await refreshStoredHelperTokenState()
    await refreshPermissions()
    await refreshBubbleCatalog(showErrors: true)
    restartAutomaticSyncSchedule()
  }

  func clearSavedHelperToken() async {
    do {
      try await localStateStore.clearHelperToken()
      hasStoredHelperToken = false
      setRuntime(.needsConfiguration, detail: "Paste a helper token from Bubble to resume syncing.")
    } catch {
      recordError(error)
    }
  }

  func refreshPermissions() async {
    contactsAccessState = await contactsResolver.accessState()
    messagesAccessState = await messagesDatabase.accessState()
  }

  func requestContactsAccess() async {
    contactsAccessState = await contactsResolver.requestAccessIfNeeded()
  }

  func setLaunchAtLoginEnabled(_ enabled: Bool) async {
    do {
      try launchAtLoginManager.setEnabled(enabled)
      launchAtLoginEnabled = enabled
      launchAtLoginAvailable = launchAtLoginManager.isAvailable
      if enabled {
        lastErrorMessage = nil
      }
    } catch {
      launchAtLoginAvailable = launchAtLoginManager.isAvailable
      launchAtLoginEnabled = (try? launchAtLoginManager.isEnabled()) ?? false
      recordError(error)
    }
  }

  func refreshBubbleCatalog(showErrors: Bool) async {
    guard let baseURL = configuredBaseURL(), let helperToken = await helperToken() else {
      bootstrap = nil
      selectedBubbleID = nil
      if showErrors {
        setRuntime(.needsConfiguration, detail: "Set your Bubble URL and helper token in Settings.")
      }
      return
    }

    do {
      let response = try await apiClient.fetchBootstrap(baseURL: baseURL, helperToken: helperToken)
      bootstrap = response
      syncSelectionsFromBootstrap()
      if runtimeState == .starting || runtimeState == .needsConfiguration || runtimeState == .error {
        if configuration.automaticDailySyncEnabled {
          setRuntime(.running, detail: "Bubble Helper is connected. Automatic daily sync is enabled.")
        } else {
          setRuntime(.paused, detail: "Bubble Helper is connected. Automatic sync is off.")
        }
      }
    } catch {
      if showErrors {
        recordError(error)
        setRuntime(.error, detail: "Bubble Helper could not refresh the Bubble catalog.")
      }
    }
  }

  func performImportSearch(query: String) async {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      importResults = []
      selectedCandidateID = nil
      importFeedbackMessage = "Search by a contact name, phone number, or email."
      return
    }

    importFeedbackMessage = "Searching Messages and Contacts…"

    do {
      await refreshPermissions()

      let contactMatches = try await contactsResolver.searchContacts(query: trimmed)
      let recentParticipants = try? await messagesDatabase.recentParticipants(limit: 500)

      var merged: [String: ImportCandidate] = [:]

      for contact in contactMatches {
        let candidate = try await importCandidate(from: contact, lastSeenAt: nil)
        merged[candidate.identityHash] = candidate
      }

      for participant in recentParticipants ?? [] {
        let contact = await contactsResolver.match(handle: participant.handle)
        let candidate = try await importCandidate(from: participant, matchedContact: contact)
        if let existing = merged[candidate.identityHash] {
          merged[candidate.identityHash] = mergeCandidate(existing, with: candidate)
        } else {
          merged[candidate.identityHash] = candidate
        }
      }

      let results = merged.values
        .filter { candidate in
          containsQuery(candidate.displayName, query: trimmed)
            || candidate.matchingHandles.contains(where: { containsQuery($0, query: trimmed) })
            || containsQuery(candidate.subtitle, query: trimmed)
        }
        .sorted { lhs, rhs in
          let lhsDate = lhs.lastSeenAt ?? .distantPast
          let rhsDate = rhs.lastSeenAt ?? .distantPast
          if lhsDate != rhsDate {
            return lhsDate > rhsDate
          }
          return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
        }

      importResults = results
      if let selectedCandidateID, results.contains(where: { $0.id == selectedCandidateID }) {
        self.selectedCandidateID = selectedCandidateID
      } else {
        selectedCandidateID = results.first?.id
      }

      if results.isEmpty {
        importFeedbackMessage = "No iMessage people matched that search."
      } else {
        importFeedbackMessage = "\(results.count) match\(results.count == 1 ? "" : "es")."
      }
    } catch {
      recordError(error)
      importFeedbackMessage = "Search failed."
    }
  }

  func createBubbleForSelection() async {
    guard let candidate = selectedCandidate else { return }
    guard let categoryID = resolvedSelectedCategoryID() else {
      importFeedbackMessage = "Create a Bubble category first."
      return
    }
    guard let baseURL = configuredBaseURL(), let helperToken = await helperToken() else {
      setRuntime(.needsConfiguration, detail: "Set your Bubble URL and helper token in Settings.")
      return
    }

    do {
      let response = try await apiClient.createBubble(
        baseURL: baseURL,
        helperToken: helperToken,
        request: CreateBubbleRequest(
          fullName: candidate.displayName,
          categoryId: categoryID,
          context: "",
          lastInteraction: candidate.lastSeenAt.map(iso8601String),
          image: dataURL(forImageData: candidate.avatarJPEGData),
          starred: false
        )
      )

      var nextState = localState
      upsertLink(
        in: &nextState,
        identityHash: candidate.identityHash,
        bubbleID: response.bubble.id,
        bubbleName: response.bubble.fullName,
        displayName: candidate.displayName,
        maskedHandle: candidate.matchingHandles.first.map(maskedHandle),
        source: candidate.sourceLabel
      )
      try await localStateStore.saveState(nextState)
      localState = nextState

      await refreshBubbleCatalog(showErrors: true)
      selectedBubbleID = response.bubble.id
      importFeedbackMessage = "Created and linked \(response.bubble.fullName)."
    } catch {
      recordError(error)
      importFeedbackMessage = "Bubble creation failed."
    }
  }

  func linkSelectionToBubble() async {
    guard let candidate = selectedCandidate, let bubble = selectedBubble else { return }

    do {
      var nextState = localState
      upsertLink(
        in: &nextState,
        identityHash: candidate.identityHash,
        bubbleID: bubble.id,
        bubbleName: bubble.fullName,
        displayName: candidate.displayName,
        maskedHandle: candidate.matchingHandles.first.map(maskedHandle),
        source: candidate.sourceLabel
      )
      try await localStateStore.saveState(nextState)
      localState = nextState

      var backfillMessage = ""
      if let occurredAt = candidate.lastSeenAt,
         let baseURL = configuredBaseURL(),
         let helperToken = await helperToken()
      {
        do {
          let response = try await apiClient.sendInteractionUpdate(
            baseURL: baseURL,
            helperToken: helperToken,
            bubbleIDs: [bubble.id],
            occurredAt: occurredAt,
            timeZone: TimeZone.current.identifier
          )
          let dayKey = calendarDayKey(for: occurredAt, timeZone: TimeZone.current)
          nextState.lastSyncedInteractionDays[bubble.id] = dayKey
          try await localStateStore.saveState(nextState)
          localState = nextState
          backfillMessage = response.updatedCount > 0 ? " Last interaction was sent to Bubble." : " Bubble already had that interaction day."
        } catch {
          recordError(error)
          backfillMessage = " Link saved locally, but the last interaction was not sent."
        }
      }

      importFeedbackMessage = "Linked \(candidate.displayName) to \(bubble.fullName).\(backfillMessage)"
    } catch {
      recordError(error)
      importFeedbackMessage = "Bubble linking failed."
    }
  }

  func ignoreSelection() async {
    guard let candidate = selectedCandidate else { return }

    do {
      var nextState = localState
      nextState.links.removeAll { $0.identityHash == candidate.identityHash }
      if let existing = nextState.ignored.firstIndex(where: { $0.identityHash == candidate.identityHash }) {
        nextState.ignored[existing].displayName = candidate.displayName
        nextState.ignored[existing].maskedHandle = candidate.matchingHandles.first.map(maskedHandle)
        nextState.ignored[existing].updatedAt = Date()
      } else {
        nextState.ignored.append(
          IgnoredIdentity(
            identityHash: candidate.identityHash,
            displayName: candidate.displayName,
            maskedHandle: candidate.matchingHandles.first.map(maskedHandle),
            updatedAt: Date()
          )
        )
      }
      try await localStateStore.saveState(nextState)
      localState = nextState
      importFeedbackMessage = "Ignored \(candidate.displayName) for now."
    } catch {
      recordError(error)
    }
  }

  func resumeSelection() async {
    guard let candidate = selectedCandidate else { return }

    do {
      var nextState = localState
      nextState.ignored.removeAll { $0.identityHash == candidate.identityHash }
      try await localStateStore.saveState(nextState)
      localState = nextState
      importFeedbackMessage = "Suggestions resumed for \(candidate.displayName)."
    } catch {
      recordError(error)
    }
  }

  func unlinkSelection() async {
    guard let candidate = selectedCandidate else { return }

    do {
      var nextState = localState
      nextState.links.removeAll { $0.identityHash == candidate.identityHash }
      try await localStateStore.saveState(nextState)
      localState = nextState
      importFeedbackMessage = "Removed the Bubble link for \(candidate.displayName)."
    } catch {
      recordError(error)
    }
  }

  func runSyncNow() async {
    await performSync(manual: true)
  }

  func toggleAutomaticDailySync() {
    configuration.automaticDailySyncEnabled.toggle()
    configurationStore.save(configuration)
    restartAutomaticSyncSchedule()
  }

  private func bootstrapApplication() async {
    do {
      localState = try await localStateStore.loadState()
    } catch {
      recordError(error)
    }

    refreshLaunchAtLoginState()
    await refreshStoredHelperTokenState()
    await refreshPermissions()
    await refreshBubbleCatalog(showErrors: false)
    restartAutomaticSyncSchedule()
  }

  private func refreshStoredHelperTokenState() async {
    do {
      let token = try await localStateStore.loadHelperToken()
      hasStoredHelperToken = !(token?.isEmpty ?? true)
    } catch {
      hasStoredHelperToken = false
      recordError(error)
    }
  }

  private func refreshLaunchAtLoginState() {
    launchAtLoginAvailable = launchAtLoginManager.isAvailable

    do {
      try launchAtLoginManager.syncCurrentBundlePathIfNeeded()
      launchAtLoginEnabled = try launchAtLoginManager.isEnabled()
    } catch {
      launchAtLoginEnabled = false
      recordError(error)
    }
  }

  private func restartAutomaticSyncSchedule() {
    monitorTask?.cancel()

    guard configuredBaseURL() != nil, hasStoredHelperToken else {
      setRuntime(.needsConfiguration, detail: "Set your Bubble URL and helper token in Settings.")
      return
    }

    guard configuration.automaticDailySyncEnabled else {
      setRuntime(.paused, detail: "Automatic sync is off. Use Sync Now whenever you want to refresh.")
      return
    }

    if runtimeState != .error {
      setRuntime(.running, detail: "Automatic daily sync is enabled. Bubble Helper will sync again at midnight.")
    }

    monitorTask = Task { [weak self] in
      guard let self else { return }
      while !Task.isCancelled {
        let interval = secondsUntilNextLocalMidnight()
        try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
        if Task.isCancelled {
          return
        }
        await self.performSync(manual: false)
      }
    }
  }

  private func performSync(manual: Bool) async {
    if syncInFlight {
      return
    }

    guard manual || configuration.automaticDailySyncEnabled else {
      setRuntime(.paused, detail: "Automatic sync is off. Use Sync Now whenever you want to refresh.")
      return
    }

    guard let baseURL = configuredBaseURL(), let helperToken = await helperToken() else {
      setRuntime(.needsConfiguration, detail: "Set your Bubble URL and helper token in Settings.")
      return
    }

    syncInFlight = true
    setRuntime(.syncing, detail: manual ? "Checking Messages now…" : "Running the daily automatic sync…")
    defer {
      syncInFlight = false
    }

    messagesAccessState = await messagesDatabase.accessState()
    guard messagesAccessState == .available else {
      setRuntime(.needsMessagesAccess, detail: "Grant Bubble Helper Full Disk Access to read Messages.")
      return
    }

    do {
      var nextState = try await localStateStore.loadState()
      let events = try await messagesDatabase.fetchEvents(afterRowID: nextState.lastProcessedMessageRowID, limit: 500)
      let timeZone = TimeZone.current
      let interactionUpdates = try await prepareInteractionUpdates(
        from: events,
        state: nextState,
        timeZone: timeZone,
        skipAlreadySyncedDays: !manual
      )
      let recentInteractionUpdates = try await prepareRecentLinkedInteractionUpdates(
        state: nextState,
        timeZone: timeZone,
        skipAlreadySyncedDays: !manual
      )
      let updatesToSend = mergeInteractionUpdates(interactionUpdates + recentInteractionUpdates)

      let updatedCount: Int
      if updatesToSend.isEmpty {
        updatedCount = 0
      } else {
        updatedCount = try await sendInteractionUpdatesInChunks(
          baseURL: baseURL,
          helperToken: helperToken,
          updates: updatesToSend,
          timeZone: timeZone.identifier
        )
      }

      for event in events {
        nextState.lastProcessedMessageRowID = max(nextState.lastProcessedMessageRowID, event.rowID)
      }
      for update in updatesToSend {
        nextState.lastSyncedInteractionDays[update.bubbleID] = update.dayKey
      }
      pruneInteractionDayCache(&nextState, relativeTo: Date(), timeZone: timeZone)

      nextState.lastSyncAt = Date()
      try await localStateStore.saveState(nextState)
      localState = nextState
      if configuration.automaticDailySyncEnabled {
        setRuntime(
          .running,
          detail: syncCompletionDetail(
            manual: manual,
            sentCount: updatesToSend.count,
            updatedCount: updatedCount
          )
        )
      } else {
        setRuntime(
          .paused,
          detail: syncCompletionDetail(
            manual: manual,
            sentCount: updatesToSend.count,
            updatedCount: updatedCount
          )
        )
      }
    } catch {
      recordError(error)
      setRuntime(.error, detail: "Bubble Helper hit a sync error.")
    }
  }

  private func bubbleIDs(for event: MessageEvent, state: LocalHelperState) async throws -> [String] {
    let handles: [String]
    if event.isFromMe {
      if !event.participantHandles.isEmpty {
        handles = event.participantHandles
      } else if let senderHandle = event.senderHandle {
        handles = [senderHandle]
      } else {
        handles = []
      }
    } else if let senderHandle = event.senderHandle {
      handles = [senderHandle]
    } else {
      handles = event.participantHandles
    }

    if handles.isEmpty {
      return []
    }

    let linksByHash = Dictionary(uniqueKeysWithValues: state.links.map { ($0.identityHash, $0) })
    var bubbleIDs = Set<String>()

    for handle in handles {
      let hash = try await identityHash(forHandle: handle)
      if let link = linksByHash[hash] {
        bubbleIDs.insert(link.bubbleId)
      }
    }

    return bubbleIDs.sorted()
  }

  private func prepareInteractionUpdates(
    from events: [MessageEvent],
    state: LocalHelperState,
    timeZone: TimeZone,
    skipAlreadySyncedDays: Bool
  ) async throws -> [PreparedInteractionUpdate] {
    var latestByBubbleAndDay: [String: PreparedInteractionUpdate] = [:]

    for event in events {
      let bubbleIDs = try await bubbleIDs(for: event, state: state)
      if bubbleIDs.isEmpty {
        continue
      }

      let dayKey = calendarDayKey(for: event.occurredAt, timeZone: timeZone)
      for bubbleID in bubbleIDs {
        if skipAlreadySyncedDays && state.lastSyncedInteractionDays[bubbleID] == dayKey {
          continue
        }

        upsertPreparedInteraction(
          &latestByBubbleAndDay,
          bubbleID: bubbleID,
          occurredAt: event.occurredAt,
          dayKey: dayKey
        )
      }
    }

    return sortPreparedInteractions(Array(latestByBubbleAndDay.values))
  }

  private func prepareRecentLinkedInteractionUpdates(
    state: LocalHelperState,
    timeZone: TimeZone,
    skipAlreadySyncedDays: Bool
  ) async throws -> [PreparedInteractionUpdate] {
    let linksByHash = Dictionary(uniqueKeysWithValues: state.links.map { ($0.identityHash, $0) })
    if linksByHash.isEmpty {
      return []
    }

    let recentParticipants = try await messagesDatabase.recentParticipants(limit: max(500, linksByHash.count * 4))
    var latestByBubbleAndDay: [String: PreparedInteractionUpdate] = [:]

    for participant in recentParticipants {
      guard let lastSeenAt = participant.lastSeenAt else { continue }
      let identityHash = try await identityHash(forHandle: participant.handle)
      guard let link = linksByHash[identityHash] else { continue }

      let dayKey = calendarDayKey(for: lastSeenAt, timeZone: timeZone)
      if skipAlreadySyncedDays && state.lastSyncedInteractionDays[link.bubbleId] == dayKey {
        continue
      }

      upsertPreparedInteraction(
        &latestByBubbleAndDay,
        bubbleID: link.bubbleId,
        occurredAt: lastSeenAt,
        dayKey: dayKey
      )
    }

    return sortPreparedInteractions(Array(latestByBubbleAndDay.values))
  }

  private func mergeInteractionUpdates(_ updates: [PreparedInteractionUpdate]) -> [PreparedInteractionUpdate] {
    var latestByBubbleAndDay: [String: PreparedInteractionUpdate] = [:]
    for update in updates {
      upsertPreparedInteraction(
        &latestByBubbleAndDay,
        bubbleID: update.bubbleID,
        occurredAt: update.occurredAt,
        dayKey: update.dayKey
      )
    }
    return sortPreparedInteractions(Array(latestByBubbleAndDay.values))
  }

  private func upsertPreparedInteraction(
    _ latestByBubbleAndDay: inout [String: PreparedInteractionUpdate],
    bubbleID: String,
    occurredAt: Date,
    dayKey: String
  ) {
    let cacheKey = "\(bubbleID)|\(dayKey)"
    if let existing = latestByBubbleAndDay[cacheKey], occurredAt <= existing.occurredAt {
      return
    }

    latestByBubbleAndDay[cacheKey] = PreparedInteractionUpdate(
      bubbleID: bubbleID,
      occurredAt: occurredAt,
      dayKey: dayKey
    )
  }

  private func sortPreparedInteractions(_ updates: [PreparedInteractionUpdate]) -> [PreparedInteractionUpdate] {
    updates.sorted { lhs, rhs in
      if lhs.occurredAt != rhs.occurredAt {
        return lhs.occurredAt < rhs.occurredAt
      }
      return lhs.bubbleID < rhs.bubbleID
    }
  }

  private func sendInteractionUpdatesInChunks(
    baseURL: String,
    helperToken: String,
    updates: [PreparedInteractionUpdate],
    timeZone: String
  ) async throws -> Int {
    let chunkSize = 10
    var updatedCount = 0
    var startIndex = 0

    while startIndex < updates.count {
      let endIndex = min(startIndex + chunkSize, updates.count)
      let chunk = Array(updates[startIndex ..< endIndex])
      let response = try await apiClient.sendInteractionUpdates(
        baseURL: baseURL,
        helperToken: helperToken,
        updates: chunk.map { update in
          BubbleInteractionUpdate(bubbleID: update.bubbleID, occurredAt: update.occurredAt)
        },
        timeZone: timeZone
      )
      updatedCount += response.updatedCount
      startIndex = endIndex
    }

    return updatedCount
  }

  private func syncCompletionDetail(manual: Bool, sentCount: Int, updatedCount: Int) -> String {
    if sentCount == 0 {
      if configuration.automaticDailySyncEnabled {
        return manual
          ? "No linked iMessage activity needed syncing. Automatic sync will run again at midnight."
          : "Automatic daily sync completed. No linked iMessage activity needed syncing."
      }
      return "No linked iMessage activity needed syncing."
    }

    let checked = "\(sentCount) linked \(sentCount == 1 ? "Bubble" : "Bubbles") checked"
    let updated = "\(updatedCount) \(updatedCount == 1 ? "date" : "dates") changed"
    if configuration.automaticDailySyncEnabled {
      return "\(checked); \(updated). Automatic sync will run again at midnight."
    }
    return "\(checked); \(updated)."
  }

  private func identityHash(forHandle handle: String) async throws -> String {
    let contact = await contactsResolver.match(handle: handle)
    let canonicalIdentityKey: String
    if let contact {
      canonicalIdentityKey = "contact:\(contact.identifier)"
    } else {
      canonicalIdentityKey = "handle:\(normalizedHandle(handle))"
    }
    return try await localStateStore.identityHash(for: canonicalIdentityKey)
  }

  private func helperToken() async -> String? {
    do {
      let token = try await localStateStore.loadHelperToken()
      let trimmed = token?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return trimmed.isEmpty ? nil : trimmed
    } catch {
      recordError(error)
      return nil
    }
  }

  private func configuredBaseURL() -> String? {
    let trimmed = normalizeBubbleBaseURL(configuration.baseURL)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func resolvedSelectedCategoryID() -> String? {
    if let selectedCategoryID,
       bootstrap?.categories.contains(where: { $0.id == selectedCategoryID }) == true
    {
      return selectedCategoryID
    }

    return bootstrap?.defaultCategoryId ?? bootstrap?.categories.first?.id
  }

  private func syncSelectionsFromBootstrap() {
    let categories = bootstrap?.categories ?? []
    if let selectedCategoryID,
       categories.contains(where: { $0.id == selectedCategoryID })
    {
      self.selectedCategoryID = selectedCategoryID
    } else {
      selectedCategoryID = bootstrap?.defaultCategoryId ?? categories.first?.id
    }

    let bubbles = bootstrap?.bubbles ?? []
    if let selectedBubbleID,
       bubbles.contains(where: { $0.id == selectedBubbleID })
    {
      self.selectedBubbleID = selectedBubbleID
    } else {
      selectedBubbleID = nil
    }
  }

  private func importCandidate(from contact: ContactMatch, lastSeenAt: Date?) async throws -> ImportCandidate {
    let normalizedHandles = Array(Set(contact.handles.map(normalizedHandle))).filter { !$0.isEmpty }.sorted()
    let subtitle = normalizedHandles.isEmpty
      ? "Saved contact"
      : normalizedHandles.map(maskedHandle).joined(separator: " • ")
    let canonicalIdentityKey = "contact:\(contact.identifier)"
    let identityHash = try await localStateStore.identityHash(for: canonicalIdentityKey)

    return ImportCandidate(
      identityHash: identityHash,
      canonicalIdentityKey: canonicalIdentityKey,
      displayName: contact.displayName,
      subtitle: subtitle,
      matchingHandles: normalizedHandles,
      avatarJPEGData: contact.avatarJPEGData,
      lastSeenAt: lastSeenAt,
      sourceLabel: lastSeenAt == nil ? "Contacts" : "Messages + Contacts"
    )
  }

  private func importCandidate(
    from participant: RecentMessageParticipant,
    matchedContact: ContactMatch?
  ) async throws -> ImportCandidate {
    if let matchedContact {
      return try await importCandidate(from: matchedContact, lastSeenAt: participant.lastSeenAt)
    }

    let handle = normalizedHandle(participant.handle)
    let canonicalIdentityKey = "handle:\(handle)"
    let identityHash = try await localStateStore.identityHash(for: canonicalIdentityKey)

    return ImportCandidate(
      identityHash: identityHash,
      canonicalIdentityKey: canonicalIdentityKey,
      displayName: participant.handle,
      subtitle: maskedHandle(participant.handle),
      matchingHandles: [handle],
      avatarJPEGData: nil,
      lastSeenAt: participant.lastSeenAt,
      sourceLabel: "Messages"
    )
  }

  private func mergeCandidate(_ current: ImportCandidate, with next: ImportCandidate) -> ImportCandidate {
    let mergedHandles = Array(Set(current.matchingHandles + next.matchingHandles)).sorted()
    let mergedDate: Date?
    switch (current.lastSeenAt, next.lastSeenAt) {
    case let (lhs?, rhs?):
      mergedDate = max(lhs, rhs)
    case let (lhs?, nil):
      mergedDate = lhs
    case let (nil, rhs?):
      mergedDate = rhs
    default:
      mergedDate = nil
    }

    let mergedSourceLabel: String
    if current.sourceLabel == next.sourceLabel {
      mergedSourceLabel = current.sourceLabel
    } else if current.sourceLabel.contains("Messages") || next.sourceLabel.contains("Messages") {
      mergedSourceLabel = "Messages + Contacts"
    } else {
      mergedSourceLabel = current.sourceLabel
    }

    return ImportCandidate(
      identityHash: current.identityHash,
      canonicalIdentityKey: current.canonicalIdentityKey,
      displayName: current.displayName.count >= next.displayName.count ? current.displayName : next.displayName,
      subtitle: mergedHandles.isEmpty
        ? (current.subtitle.isEmpty ? next.subtitle : current.subtitle)
        : mergedHandles.map(maskedHandle).joined(separator: " • "),
      matchingHandles: mergedHandles,
      avatarJPEGData: current.avatarJPEGData ?? next.avatarJPEGData,
      lastSeenAt: mergedDate,
      sourceLabel: mergedSourceLabel
    )
  }

  private func upsertLink(
    in state: inout LocalHelperState,
    identityHash: String,
    bubbleID: String,
    bubbleName: String,
    displayName: String,
    maskedHandle: String?,
    source: String
  ) {
    state.ignored.removeAll { $0.identityHash == identityHash }
    if let index = state.links.firstIndex(where: { $0.identityHash == identityHash }) {
      state.links[index].bubbleId = bubbleID
      state.links[index].bubbleName = bubbleName
      state.links[index].displayName = displayName
      state.links[index].maskedHandle = maskedHandle
      state.links[index].source = source
      state.links[index].updatedAt = Date()
    } else {
      state.links.append(
        LocalIdentityLink(
          identityHash: identityHash,
          bubbleId: bubbleID,
          bubbleName: bubbleName,
          displayName: displayName,
          maskedHandle: maskedHandle,
          source: source,
          updatedAt: Date()
        )
      )
    }
  }

  private func dataURL(forImageData data: Data?) -> String? {
    guard let data, !data.isEmpty else { return nil }
    let mimeType: String
    if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
      mimeType = "image/png"
    } else {
      mimeType = "image/jpeg"
    }
    return "data:\(mimeType);base64,\(data.base64EncodedString())"
  }

  private func setRuntime(_ state: HelperRuntimeState, detail: String) {
    runtimeState = state
    statusDetail = detail
  }

  private func recordError(_ error: Error) {
    lastErrorMessage = error.localizedDescription
  }

  private func secondsUntilNextLocalMidnight() -> Double {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let now = Date()
    let startOfToday = calendar.startOfDay(for: now)
    guard let nextMidnight = calendar.date(byAdding: .day, value: 1, to: startOfToday) else {
      return 60 * 60 * 24
    }
    return max(1, nextMidnight.timeIntervalSince(now))
  }

  private func pruneInteractionDayCache(
    _ state: inout LocalHelperState,
    relativeTo now: Date,
    timeZone: TimeZone,
    keepingDays: Int = 14
  ) {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let oldestAllowed = calendar.date(byAdding: .day, value: -keepingDays, to: now) ?? now
    let oldestDayKey = calendarDayKey(for: oldestAllowed, timeZone: timeZone)
    state.lastSyncedInteractionDays = state.lastSyncedInteractionDays.filter { _, dayKey in
      dayKey >= oldestDayKey
    }
  }
}
