import Foundation

enum BubbleAPIClientError: LocalizedError {
  case invalidBaseURL
  case invalidResponse
  case server(status: Int, message: String)

  var errorDescription: String? {
    switch self {
    case .invalidBaseURL:
      return "Enter a valid Bubble URL in settings."
    case .invalidResponse:
      return "Bubble returned an unexpected response."
    case .server(_, let message):
      return message
    }
  }
}

actor BubbleAPIClient {
  private let session: URLSession

  init(session: URLSession = .shared) {
    self.session = session
  }

  func fetchBootstrap(baseURL: String, helperToken: String) async throws -> HelperBootstrapResponse {
    try await performJSONRequest(
      baseURL: baseURL,
      helperToken: helperToken,
      path: "/api/helper/bootstrap",
      method: "GET",
      body: Optional<Data>.none
    )
  }

  func createBubble(
    baseURL: String,
    helperToken: String,
    request: CreateBubbleRequest
  ) async throws -> HelperCreateBubbleResponse {
    let encoder = JSONEncoder()
    let body = try encoder.encode(request)
    return try await performJSONRequest(
      baseURL: baseURL,
      helperToken: helperToken,
      path: "/api/helper/bubbles",
      method: "POST",
      body: body
    )
  }

  func sendInteractionUpdate(
    baseURL: String,
    helperToken: String,
    bubbleIDs: [String],
    occurredAt: Date,
    timeZone: String
  ) async throws {
    struct RequestBody: Encodable {
      let bubbleIds: [String]
      let occurredAt: String
      let timeZone: String
    }

    let encoder = JSONEncoder()
    let body = try encoder.encode(
      RequestBody(
        bubbleIds: bubbleIDs,
        occurredAt: iso8601String(occurredAt),
        timeZone: timeZone
      )
    )

    struct EmptyResponse: Decodable {}
    let _: EmptyResponse = try await performJSONRequest(
      baseURL: baseURL,
      helperToken: helperToken,
      path: "/api/helper/events/interactions",
      method: "POST",
      body: body
    )
  }

  private func performJSONRequest<Response: Decodable>(
    baseURL: String,
    helperToken: String,
    path: String,
    method: String,
    body: Data?
  ) async throws -> Response {
    guard let url = resolveBubbleBaseURL(from: baseURL)?.appending(path: path) else {
      throw BubbleAPIClientError.invalidBaseURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("Bearer \(helperToken)", forHTTPHeaderField: "Authorization")
    if let body {
      request.httpBody = body
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw BubbleAPIClientError.invalidResponse
    }

    guard (200 ..< 300).contains(httpResponse.statusCode) else {
      let message = serverMessage(from: data) ?? "Bubble rejected the helper request."
      throw BubbleAPIClientError.server(status: httpResponse.statusCode, message: message)
    }

    let decoder = JSONDecoder()
    return try decoder.decode(Response.self, from: data)
  }

  private func serverMessage(from data: Data) -> String? {
    guard
      let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let message = value["error"] as? String,
      !message.isEmpty
    else {
      return nil
    }
    return message
  }
}
