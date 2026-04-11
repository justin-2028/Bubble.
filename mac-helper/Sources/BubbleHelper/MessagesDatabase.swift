import Foundation
import SQLite3

enum MessagesDatabaseError: LocalizedError {
  case accessDenied
  case sqlite(String)

  var errorDescription: String? {
    switch self {
    case .accessDenied:
      return "Grant Bubble Helper Full Disk Access so it can read your local Messages database."
    case .sqlite(let message):
      return message
    }
  }
}

actor MessagesDatabase {
  private let fileManager = FileManager.default

  func accessState() -> MessagesAccessState {
    do {
      let snapshotDirectory = try createSnapshotDirectory()
      try? fileManager.removeItem(at: snapshotDirectory)
      return .available
    } catch {
      return .unavailable
    }
  }

  func recentParticipants(limit: Int = 400) throws -> [RecentMessageParticipant] {
    try withSnapshotConnection { db in
      do {
        return try executeRecentParticipantsQuery(
          db,
          sql: """
          SELECT
            COALESCE(h.id, ''),
            MAX(m.date)
          FROM handle h
          LEFT JOIN chat_handle_join chj ON chj.handle_id = h.ROWID
          LEFT JOIN chat_message_join cmj ON cmj.chat_id = chj.chat_id
          LEFT JOIN message m ON m.ROWID = cmj.message_id
          GROUP BY h.ROWID
          HAVING COALESCE(h.id, '') != '' AND MAX(m.date) IS NOT NULL
          ORDER BY MAX(m.date) DESC
          LIMIT ?
          """,
          limit: limit
        )
      } catch {
        return try executeRecentParticipantsQuery(
          db,
          sql: """
          SELECT
            COALESCE(h.id, ''),
            MAX(m.date)
          FROM handle h
          LEFT JOIN message m ON m.handle_id = h.ROWID
          GROUP BY h.ROWID
          HAVING COALESCE(h.id, '') != '' AND MAX(m.date) IS NOT NULL
          ORDER BY MAX(m.date) DESC
          LIMIT ?
          """,
          limit: limit
        )
      }
    }
  }

  func fetchEvents(afterRowID: Int64, limit: Int = 250) throws -> [MessageEvent] {
    try withSnapshotConnection { db in
      do {
        return try executeEventQuery(
          db,
          sql: """
          SELECT
            m.ROWID,
            m.date,
            COALESCE(m.is_from_me, 0),
            COALESCE(sender.id, ''),
            COALESCE(chat.guid, ''),
            COALESCE(chat.display_name, ''),
            COALESCE(GROUP_CONCAT(DISTINCT participant.id), '')
          FROM message m
          LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
          LEFT JOIN chat ON chat.ROWID = cmj.chat_id
          LEFT JOIN handle sender ON sender.ROWID = m.handle_id
          LEFT JOIN chat_handle_join chj ON chj.chat_id = chat.ROWID
          LEFT JOIN handle participant ON participant.ROWID = chj.handle_id
          WHERE m.ROWID > ?
          GROUP BY m.ROWID
          ORDER BY m.ROWID ASC
          LIMIT ?
          """,
          afterRowID: afterRowID,
          limit: limit
        )
      } catch {
        return try executeEventQuery(
          db,
          sql: """
          SELECT
            m.ROWID,
            m.date,
            COALESCE(m.is_from_me, 0),
            COALESCE(sender.id, ''),
            '',
            '',
            ''
          FROM message m
          LEFT JOIN handle sender ON sender.ROWID = m.handle_id
          WHERE m.ROWID > ?
          ORDER BY m.ROWID ASC
          LIMIT ?
          """,
          afterRowID: afterRowID,
          limit: limit
        )
      }
    }
  }

  private func withSnapshotConnection<T>(_ body: (OpaquePointer?) throws -> T) throws -> T {
    let snapshotDirectory = try createSnapshotDirectory()
    defer {
      try? fileManager.removeItem(at: snapshotDirectory)
    }

    let databaseURL = snapshotDirectory.appendingPathComponent("chat.db")
    var db: OpaquePointer?
    let openStatus = sqlite3_open_v2(databaseURL.path, &db, SQLITE_OPEN_READONLY, nil)
    guard openStatus == SQLITE_OK else {
      let message = db.flatMap { String(cString: sqlite3_errmsg($0)) } ?? "Could not open Messages database snapshot."
      if let db {
        sqlite3_close(db)
      }
      throw MessagesDatabaseError.sqlite(message)
    }

    defer {
      sqlite3_close(db)
    }

    return try body(db)
  }

  private func createSnapshotDirectory() throws -> URL {
    let sourceDirectory = fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Messages", isDirectory: true)
    let chatDB = sourceDirectory.appendingPathComponent("chat.db", isDirectory: false)

    let snapshotDirectory = fileManager.temporaryDirectory.appendingPathComponent(
      "bubble-helper-messages-\(UUID().uuidString)",
      isDirectory: true
    )
    try fileManager.createDirectory(at: snapshotDirectory, withIntermediateDirectories: true)

    do {
      try fileManager.copyItem(at: chatDB, to: snapshotDirectory.appendingPathComponent("chat.db"))
      let wal = sourceDirectory.appendingPathComponent("chat.db-wal", isDirectory: false)
      let shm = sourceDirectory.appendingPathComponent("chat.db-shm", isDirectory: false)
      if fileManager.fileExists(atPath: wal.path) {
        try fileManager.copyItem(at: wal, to: snapshotDirectory.appendingPathComponent("chat.db-wal"))
      }
      if fileManager.fileExists(atPath: shm.path) {
        try fileManager.copyItem(at: shm, to: snapshotDirectory.appendingPathComponent("chat.db-shm"))
      }
    } catch {
      try? fileManager.removeItem(at: snapshotDirectory)
      throw MessagesDatabaseError.accessDenied
    }

    return snapshotDirectory
  }

  private func executeRecentParticipantsQuery(
    _ db: OpaquePointer?,
    sql: String,
    limit: Int
  ) throws -> [RecentMessageParticipant] {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
      throw MessagesDatabaseError.sqlite(errorMessage(from: db))
    }

    defer {
      sqlite3_finalize(statement)
    }

    sqlite3_bind_int(statement, 1, Int32(limit))

    var results: [RecentMessageParticipant] = []
    while sqlite3_step(statement) == SQLITE_ROW {
      let handle = stringValue(statement, index: 0)
      guard !handle.isEmpty else { continue }
      let lastSeen = dateValue(statement, index: 1)
      results.append(RecentMessageParticipant(handle: handle, lastSeenAt: lastSeen))
    }
    return results
  }

  private func executeEventQuery(
    _ db: OpaquePointer?,
    sql: String,
    afterRowID: Int64,
    limit: Int
  ) throws -> [MessageEvent] {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
      throw MessagesDatabaseError.sqlite(errorMessage(from: db))
    }

    defer {
      sqlite3_finalize(statement)
    }

    sqlite3_bind_int64(statement, 1, afterRowID)
    sqlite3_bind_int(statement, 2, Int32(limit))

    var results: [MessageEvent] = []
    while sqlite3_step(statement) == SQLITE_ROW {
      let rowID = sqlite3_column_int64(statement, 0)
      let occurredAt = dateValue(statement, index: 1) ?? Date()
      let isFromMe = sqlite3_column_int(statement, 2) == 1
      let senderHandle = nonEmptyStringValue(statement, index: 3)
      let chatGUID = nonEmptyStringValue(statement, index: 4)
      let chatDisplayName = nonEmptyStringValue(statement, index: 5)
      let participantsCSV = nonEmptyStringValue(statement, index: 6) ?? ""
      let participantHandles = participantsCSV
        .split(separator: ",")
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

      results.append(
        MessageEvent(
          rowID: rowID,
          occurredAt: occurredAt,
          isFromMe: isFromMe,
          senderHandle: senderHandle,
          participantHandles: Array(Set(participantHandles)).sorted(),
          chatGUID: chatGUID,
          chatDisplayName: chatDisplayName
        )
      )
    }

    return results
  }

  private func stringValue(_ statement: OpaquePointer?, index: Int32) -> String {
    guard let value = sqlite3_column_text(statement, index) else { return "" }
    return String(cString: value)
  }

  private func nonEmptyStringValue(_ statement: OpaquePointer?, index: Int32) -> String? {
    let value = stringValue(statement, index: index)
    return value.isEmpty ? nil : value
  }

  private func dateValue(_ statement: OpaquePointer?, index: Int32) -> Date? {
    if sqlite3_column_type(statement, index) == SQLITE_NULL {
      return nil
    }

    let raw = sqlite3_column_double(statement, index)
    guard raw != 0 else { return Date(timeIntervalSinceReferenceDate: 0) }
    let absolute = abs(raw)
    let seconds: Double
    if absolute > 1_000_000_000_000_000 {
      seconds = raw / 1_000_000_000
    } else if absolute > 1_000_000_000_000 {
      seconds = raw / 1_000_000
    } else if absolute > 10_000_000_000 {
      seconds = raw / 1_000
    } else {
      seconds = raw
    }
    return Date(timeIntervalSinceReferenceDate: seconds)
  }

  private func errorMessage(from db: OpaquePointer?) -> String {
    db.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error"
  }
}
