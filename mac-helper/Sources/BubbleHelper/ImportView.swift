import AppKit
import SwiftUI

struct ImportView: View {
  @EnvironmentObject private var model: AppModel
  @State private var query = ""

  var body: some View {
    HStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 10) {
          TextField("Search iMessage contacts or recent handles", text: $query)
            .textFieldStyle(.roundedBorder)
            .onSubmit {
              Task {
                await model.performImportSearch(query: query)
              }
            }

          Button("Search") {
            Task {
              await model.performImportSearch(query: query)
            }
          }
        }

        Text("Search saved contacts and recent Messages participants. Nothing is added to Bubble until you explicitly create or link a Bubble.")
          .font(.caption)
          .foregroundStyle(.secondary)

        if let feedback = model.importFeedbackMessage {
          Text(feedback)
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        ScrollView {
          LazyVStack(spacing: 10) {
            ForEach(model.importResults) { candidate in
              CandidateRow(
                candidate: candidate,
                status: model.candidateStatus(for: candidate),
                isSelected: model.selectedCandidateID == candidate.id
              )
              .onTapGesture {
                model.selectedCandidateID = candidate.id
              }
            }
          }
          .padding(.vertical, 2)
        }
      }
      .padding(20)
      .frame(minWidth: 360, maxWidth: 400, maxHeight: .infinity, alignment: .topLeading)

      Divider()

      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          if let candidate = model.selectedCandidate {
            selectedCandidatePanel(candidate)
          } else {
            VStack(alignment: .leading, spacing: 8) {
              Text("Select A Person")
                .font(.title2.weight(.semibold))
              Text("Search on the left, then choose whether to create a new Bubble or link the person to one you already have.")
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
          }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .topLeading)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    .toolbar {
      ToolbarItemGroup {
        Button("Refresh Bubble Catalog") {
          Task {
            await model.refreshBubbleCatalog(showErrors: true)
          }
        }
        Button("Run Sync Now") {
          Task {
            await model.runSyncNow()
          }
        }
      }
    }
    .onAppear {
      if model.bootstrap == nil {
        Task {
          await model.refreshBubbleCatalog(showErrors: false)
        }
      }
    }
  }

  @ViewBuilder
  private func selectedCandidatePanel(_ candidate: ImportCandidate) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 16) {
        AvatarBadge(name: candidate.displayName, imageData: candidate.avatarJPEGData, size: 72)

        VStack(alignment: .leading, spacing: 6) {
          Text(candidate.displayName)
            .font(.title2.weight(.semibold))
          Text(candidate.subtitle)
            .font(.subheadline)
            .foregroundStyle(.secondary)
          Text(candidate.sourceLabel)
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
          Text("Last seen \(relativeDateDescription(candidate.lastSeenAt))")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      candidateStatusSummary(candidate)

      GroupBox("Create New Bubble") {
        VStack(alignment: .leading, spacing: 12) {
          if let categories = model.bootstrap?.categories, !categories.isEmpty {
            Picker(
              "Category",
              selection: Binding(
                get: {
                  model.selectedCategoryID ?? model.bootstrap?.defaultCategoryId ?? categories.first?.id ?? ""
                },
                set: { model.selectedCategoryID = $0 }
              )
            ) {
              ForEach(categories) { category in
                Text(category.name).tag(category.id)
              }
            }

            Button("Create Bubble From This Person") {
              Task {
                await model.createBubbleForSelection()
              }
            }
          } else {
            Text("Create at least one category in Bubble before importing people from iMessage.")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      GroupBox("Link To Existing Bubble") {
        VStack(alignment: .leading, spacing: 12) {
          TextField("Search your existing Bubbles", text: $model.bubbleSearch)
            .textFieldStyle(.roundedBorder)

          ScrollView {
            LazyVStack(spacing: 8) {
              ForEach(model.filteredBubbles) { bubble in
                HStack {
                  AvatarBadge(name: bubble.fullName, imageDataURL: bubble.image, size: 38)

                  VStack(alignment: .leading, spacing: 2) {
                    Text(bubble.fullName)
                      .font(.body.weight(.medium))
                    if let duplicateCount = bubble.duplicateCount, duplicateCount > 1 {
                      Text(duplicateSummary(for: bubble))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    } else if let categoryName = bubble.categoryNames?.first, !categoryName.isEmpty {
                      Text(categoryName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    Text("Last interaction \(relativeDateDescription(dateFromISO8601String(bubble.lastInteraction)))")
                      .font(.caption)
                      .foregroundStyle(.secondary)
                  }

                  Spacer()

                  if bubble.id == model.selectedBubbleID {
                    Image(systemName: "checkmark.circle.fill")
                      .foregroundStyle(Color.accentColor)
                  }
                }
                .padding(10)
                .background(
                  RoundedRectangle(cornerRadius: 12)
                    .fill(bubble.id == model.selectedBubbleID ? Color.accentColor.opacity(0.12) : Color.secondary.opacity(0.08))
                )
                .contentShape(RoundedRectangle(cornerRadius: 12))
                .onTapGesture {
                  model.selectedBubbleID = bubble.id
                }
              }
            }
            .padding(.vertical, 2)
          }
          .frame(minHeight: 180)

          Button("Link Selected Bubble") {
            Task {
              await model.linkSelectionToBubble()
            }
          }
          .disabled(model.selectedBubble == nil)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      HStack(spacing: 10) {
        switch model.candidateStatus(for: candidate) {
        case .linked:
          Button("Unlink") {
            Task {
              await model.unlinkSelection()
            }
          }
        case .unlinked:
          EmptyView()
        }
      }

      EmptyView()
    }
  }

  @ViewBuilder
  private func candidateStatusSummary(_ candidate: ImportCandidate) -> some View {
    switch model.candidateStatus(for: candidate) {
    case .linked(let link):
      statusCallout(
        title: "Linked",
        detail: "\(candidate.displayName) is already linked to Bubble “\(link.bubbleName)”.",
        tint: .green
      )
    case .unlinked:
      statusCallout(
        title: "Unlinked",
        detail: "This person is not yet connected to a Bubble.",
        tint: .blue
      )
    }
  }

  private func statusCallout(title: String, detail: String, tint: Color) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.subheadline.weight(.semibold))
      Text(detail)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
  }

  private func duplicateSummary(for bubble: HelperBubbleSummary) -> String {
    let duplicateCount = bubble.duplicateCount ?? 1
    let categoryNames = (bubble.categoryNames ?? []).filter { !$0.isEmpty }
    if categoryNames.isEmpty {
      return "\(duplicateCount) copies across multiple categories"
    }
    return "\(duplicateCount) copies across \(categoryNames.joined(separator: ", "))"
  }
}

private struct CandidateRow: View {
  let candidate: ImportCandidate
  let status: CandidateStatus
  let isSelected: Bool

  var body: some View {
    HStack(spacing: 12) {
      AvatarBadge(name: candidate.displayName, imageData: candidate.avatarJPEGData, size: 44)

      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline) {
          Text(candidate.displayName)
            .font(.body.weight(.medium))
            .foregroundStyle(.primary)
          Spacer()
          statusBadge
        }

        Text(candidate.subtitle)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)

        Text("Last seen \(relativeDateDescription(candidate.lastSeenAt))")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 14)
        .fill(isSelected ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.06))
    )
  }

  @ViewBuilder
  private var statusBadge: some View {
    switch status {
    case .linked:
      badge("Linked", color: .green)
    case .unlinked:
      badge("New", color: .blue)
    }
  }

  private func badge(_ title: String, color: Color) -> some View {
    Text(title)
      .font(.caption2.weight(.semibold))
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(color.opacity(0.12), in: Capsule())
      .foregroundStyle(color)
  }
}

private struct AvatarBadge: View {
  let name: String
  let imageData: Data?
  var imageDataURL: String?
  let size: CGFloat

  init(name: String, imageData: Data?, size: CGFloat) {
    self.name = name
    self.imageData = imageData
    self.imageDataURL = nil
    self.size = size
  }

  init(name: String, imageDataURL: String?, size: CGFloat) {
    self.name = name
    self.imageData = nil
    self.imageDataURL = imageDataURL
    self.size = size
  }

  var body: some View {
    Group {
      if let nsImage {
        Image(nsImage: nsImage)
          .resizable()
          .scaledToFill()
      } else {
        ZStack {
          Circle()
            .fill(Color.accentColor.opacity(0.15))
          Text(initials(from: name))
            .font(.system(size: size * 0.34, weight: .semibold, design: .rounded))
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
  }

  private var nsImage: NSImage? {
    if let imageData, let image = NSImage(data: imageData) {
      return image
    }
    if let imageDataURL, let image = imageFromDataURL(imageDataURL) {
      return image
    }
    return nil
  }

  private func imageFromDataURL(_ value: String) -> NSImage? {
    guard let commaIndex = value.firstIndex(of: ",") else { return nil }
    let dataPart = String(value[value.index(after: commaIndex)...])
    guard let data = Data(base64Encoded: dataPart) else { return nil }
    return NSImage(data: data)
  }
}
