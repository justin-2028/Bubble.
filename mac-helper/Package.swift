// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "BubbleHelper",
  platforms: [
    .macOS(.v15),
  ],
  products: [
    .executable(name: "BubbleHelper", targets: ["BubbleHelper"]),
  ],
  targets: [
    .executableTarget(
      name: "BubbleHelper",
      linkerSettings: [
        .linkedLibrary("sqlite3"),
      ]
    ),
  ]
)
