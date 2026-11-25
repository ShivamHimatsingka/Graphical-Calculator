// Renders the app icon (blue squircle + white curve + axes) into an .iconset folder.
// usage: swift make_icon.swift <out.iconset>
import AppKit

func render(_ size: Int) -> Data {
    let s = CGFloat(size)
    let img = NSImage(size: NSSize(width: s, height: s))
    img.lockFocus()
    let inset = s * 0.08
    let rect = NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
    let bg = NSBezierPath(roundedRect: rect, xRadius: s * 0.2, yRadius: s * 0.2)
    NSGradient(starting: NSColor(calibratedRed: 0.22, green: 0.55, blue: 0.86, alpha: 1), ending: NSColor(calibratedRed: 0.14, green: 0.39, blue: 0.70, alpha: 1))!.draw(in: bg, angle: -90)
    NSColor.white.withAlphaComponent(0.35).setStroke()
    let axes = NSBezierPath(); axes.lineWidth = s * 0.012
    axes.move(to: NSPoint(x: rect.minX + rect.width * 0.12, y: rect.midY)); axes.line(to: NSPoint(x: rect.maxX - rect.width * 0.12, y: rect.midY))
    axes.move(to: NSPoint(x: rect.midX, y: rect.minY + rect.height * 0.12)); axes.line(to: NSPoint(x: rect.midX, y: rect.maxY - rect.height * 0.12))
    axes.stroke()
    let curve = NSBezierPath(); curve.lineWidth = s * 0.055; curve.lineCapStyle = .round
    let x0 = rect.minX + rect.width * 0.14, x1 = rect.maxX - rect.width * 0.14
    curve.move(to: NSPoint(x: x0, y: rect.minY + rect.height * 0.30))
    curve.curve(to: NSPoint(x: rect.midX, y: rect.midY), controlPoint1: NSPoint(x: x0 + rect.width * 0.25, y: rect.minY + rect.height * 0.30), controlPoint2: NSPoint(x: rect.midX - rect.width * 0.18, y: rect.maxY - rect.height * 0.18))
    curve.curve(to: NSPoint(x: x1, y: rect.minY + rect.height * 0.70), controlPoint1: NSPoint(x: rect.midX + rect.width * 0.16, y: rect.minY + rect.height * 0.18), controlPoint2: NSPoint(x: x1 - rect.width * 0.25, y: rect.minY + rect.height * 0.70))
    NSColor.white.setStroke(); curve.stroke()
    img.unlockFocus()
    let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
    return rep.representation(using: .png, properties: [:])!
}

let out = CommandLine.arguments[1]
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    try! render(base).write(to: URL(fileURLWithPath: "\(out)/icon_\(base)x\(base).png"))
    try! render(base * 2).write(to: URL(fileURLWithPath: "\(out)/icon_\(base)x\(base)@2x.png"))
}
