import SwiftUI

@main
struct GraphicalCalculatorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        // A single window: every window would share (and overwrite) the same saved graph.
        Window("Graphical Calculator", id: "main") {
            CalculatorView()
                .frame(minWidth: 780, minHeight: 540)
                .ignoresSafeArea()
        }
        .defaultSize(width: 1180, height: 780)
        .windowToolbarStyle(.unified(showsTitle: false))
        .commands { CalculatorCommands() }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

struct CalculatorView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { WebController.shared.webView }
    func updateNSView(_ nsView: NSView, context: Context) {}
}
