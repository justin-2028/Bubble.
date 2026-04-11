import SwiftUI

@main
struct BubbleHelperApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel()

  var body: some Scene {
    MenuBarExtra("Bubble Helper", systemImage: model.statusIconName) {
      MenuContentView()
        .environmentObject(model)
    }
    .menuBarExtraStyle(.window)

    Window("Import from iMessage", id: "import") {
      ImportView()
        .environmentObject(model)
        .frame(minWidth: 980, minHeight: 640)
    }
    .defaultSize(width: 980, height: 640)

    Window("Bubble Helper Settings", id: "settings") {
      SettingsView()
        .environmentObject(model)
        .frame(minWidth: 720, minHeight: 520)
    }
    .defaultSize(width: 720, height: 520)
  }
}
