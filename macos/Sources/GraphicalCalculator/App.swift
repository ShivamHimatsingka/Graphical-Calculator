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

        Window("Offline AI Models", id: "model") {
            ModelWindowView()
        }
        .windowResizability(.contentSize)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationWillTerminate(_ notification: Notification) { LlamaServer.shared.stop() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

struct CalculatorView: View {
    @Environment(\.openWindow) private var openWindow
    @AppStorage("gc.modelPromptDismissed") private var dismissed = false

    var body: some View {
        WebView()
            .onAppear {
                WebController.shared.openModelWindow = { openWindow(id: "model"); NSApp.activate(ignoringOtherApps: true) }
                let store = ModelStore.shared
                store.scan()
                // First run: offer to install (or reuse an existing model) once.
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    if !dismissed && store.activePath == nil { openWindow(id: "model") }
                }
            }
    }
}

struct WebView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { WebController.shared.webView }
    func updateNSView(_ nsView: NSView, context: Context) {}
}
