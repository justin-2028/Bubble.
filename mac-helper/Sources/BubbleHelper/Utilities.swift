import Foundation

func iso8601String(_ date: Date) -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.string(from: date)
}

func dateFromISO8601String(_ value: String) -> Date? {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}

func normalizedHandle(_ raw: String) -> String {
  let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmed.isEmpty {
    return trimmed
  }

  if trimmed.contains("@") {
    return trimmed.lowercased()
  }

  let hadPlusPrefix = trimmed.hasPrefix("+")
  let digits = trimmed.unicodeScalars.filter { CharacterSet.decimalDigits.contains($0) }
  guard !digits.isEmpty else {
    return trimmed.lowercased()
  }

  let numeric = String(String.UnicodeScalarView(digits))
  return hadPlusPrefix ? "+\(numeric)" : numeric
}

func handleLookupKeys(_ raw: String) -> Set<String> {
  let normalized = normalizedHandle(raw)
  guard !normalized.isEmpty else { return [] }

  if normalized.contains("@") {
    return [normalized]
  }

  let digits = normalized.filter(\.isNumber)
  guard !digits.isEmpty else {
    return [normalized]
  }

  var keys: Set<String> = [normalized, digits]
  if normalized.hasPrefix("+") {
    keys.insert("+\(digits)")
  } else {
    keys.insert("+\(digits)")
  }
  if digits.count >= 10 {
    keys.insert(String(digits.suffix(10)))
  }
  return keys
}

func maskedHandle(_ raw: String) -> String {
  let normalized = normalizedHandle(raw)
  if normalized.contains("@") {
    let parts = normalized.split(separator: "@", maxSplits: 1, omittingEmptySubsequences: false)
    let local = String(parts.first ?? "")
    let domain = String(parts.count > 1 ? parts[1] : "")
    let visible = String(local.prefix(2))
    let redacted = local.count <= 2 ? visible : "\(visible)\(String(repeating: "•", count: min(6, max(1, local.count - 2))))"
    return domain.isEmpty ? redacted : "\(redacted)@\(domain)"
  }

  let digits = normalized.filter(\.isNumber)
  guard !digits.isEmpty else { return normalized }
  let suffix = String(digits.suffix(min(4, digits.count)))
  return "•••\(suffix)"
}

func containsQuery(_ value: String, query: String) -> Bool {
  let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmedQuery.isEmpty else { return true }
  return value.localizedCaseInsensitiveContains(trimmedQuery)
}

func initials(from value: String) -> String {
  let parts = value.split(whereSeparator: \.isWhitespace).map(String.init).filter { !$0.isEmpty }
  let first = parts.first?.first.map(String.init) ?? "?"
  let second = parts.count > 1 ? parts.last?.first.map(String.init) ?? "" : ""
  return (first + second).uppercased()
}

func relativeDateDescription(_ date: Date?) -> String {
  guard let date else { return "Not seen recently" }
  let elapsedSeconds = max(0, Int(Date().timeIntervalSince(date)))
  if elapsedSeconds < 5 {
    return "just now"
  }

  let formatter = DateComponentsFormatter()
  formatter.allowedUnits = elapsedSeconds >= 86_400
    ? [.day]
    : elapsedSeconds >= 3_600
      ? [.hour, .minute]
      : elapsedSeconds >= 60
        ? [.minute]
        : [.second]
  formatter.maximumUnitCount = 1
  formatter.unitsStyle = .full
  return "\(formatter.string(from: TimeInterval(elapsedSeconds)) ?? "recently") ago"
}

func calendarDayKey(for date: Date, timeZone: TimeZone) -> String {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = timeZone
  let components = calendar.dateComponents([.year, .month, .day], from: date)
  let year = components.year ?? 0
  let month = components.month ?? 0
  let day = components.day ?? 0
  return String(format: "%04d-%02d-%02d", year, month, day)
}
