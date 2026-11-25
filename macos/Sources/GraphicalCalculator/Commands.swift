import SwiftUI

/// Native menu bar. Every item drives the same web app (single source of truth), so the Mac app
/// always has exactly the features of the website.
struct CalculatorCommands: Commands {
    private let web = WebController.shared

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Graph") { web.menu("new") }.keyboardShortcut("n")
            Button("Open…") { web.menu("open") }.keyboardShortcut("o")
            Divider()
            Button("Save Graph…") { web.menu("save") }.keyboardShortcut("s")
            Button("Export Image…") { web.menu("png") }.keyboardShortcut("e", modifiers: [.command, .shift])
            Button("Copy Share Link") { web.menu("link") }
        }
        CommandGroup(replacing: .printItem) {
            Button("Print…") { web.printPage() }.keyboardShortcut("p")
        }
        CommandMenu("Graph") {
            Button("✨ Ask…") { web.click("#btnAsk") }.keyboardShortcut("k")
            Divider()
            Button("Fit to Graph") { web.click("#btnFit") }.keyboardShortcut("f", modifiers: [.command, .shift])
            Button("Reset View") { web.click("#btnHome") }.keyboardShortcut("0")
            Button("Square Zoom (1:1)") { web.click("#btnSquare") }.keyboardShortcut("1", modifiers: [.command, .shift])
            Button("Zoom In") { web.click("#btnZoomIn") }.keyboardShortcut("=")
            Button("Zoom Out") { web.click("#btnZoomOut") }.keyboardShortcut("-")
            Divider()
            Button("2D / 3D") { web.click("#btn3d") }.keyboardShortcut("3")
            Button("Graph Settings…") { web.click("#btnSettings") }.keyboardShortcut(",", modifiers: [.command, .shift])
            Button("Show / Hide Expression List") { web.toggleList() }.keyboardShortcut("\\")
            Divider()
            Button("Add Expression") { web.add("expr") }.keyboardShortcut("t")
            Button("Add Note") { web.add("note") }
            Button("Add Table") { web.add("table") }
            Button("Add Folder") { web.add("folder") }
        }
        CommandMenu("Calculator") {
            Button("Graphing") { web.app("graph") }.keyboardShortcut("1", modifiers: [.command, .option])
            Button("Geometry") { web.app("geometry") }.keyboardShortcut("2", modifiers: [.command, .option])
            Button("Scientific") { web.app("scientific") }.keyboardShortcut("3", modifiers: [.command, .option])
            Button("Four-Function") { web.app("basic") }.keyboardShortcut("4", modifiers: [.command, .option])
            Button("Matrix") { web.app("matrix") }.keyboardShortcut("5", modifiers: [.command, .option])
        }
        CommandGroup(replacing: .help) {
            Button("Help & Syntax") { web.menu("help") }
            Button("Keyboard Shortcuts") { web.menu("keys") }
            Divider()
            Button("Website") { NSWorkspace.shared.open(URL(string: "https://shivamhimatsingka.github.io/Graphical-Calculator/")!) }
        }
    }
}
