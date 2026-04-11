import AppKit
import Foundation

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    terminateDuplicateInstanceIfNeeded()
  }

  private func terminateDuplicateInstanceIfNeeded() {
    guard let bundleIdentifier = Bundle.main.bundleIdentifier else {
      return
    }

    let currentProcessID = ProcessInfo.processInfo.processIdentifier
    let otherInstances = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
      .filter { $0.processIdentifier != currentProcessID }

    guard let existing = otherInstances.first else {
      return
    }

    existing.activate(options: [])
    NSApp.terminate(nil)
  }
}
