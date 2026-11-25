import Foundation
import WebKit
import UniformTypeIdentifiers

/// Serves the bundled web app from `gcalc://app/…` so it works offline and keeps its own localStorage.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let root: URL = {
        if let dir = ProcessInfo.processInfo.environment["GC_WEB_DIR"] { return URL(fileURLWithPath: dir) }
        if let res = Bundle.main.resourceURL?.appendingPathComponent("web"), FileManager.default.fileExists(atPath: res.path) { return res }
        // `swift run` from the macos/ folder during development
        return URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("../docs").standardized
    }()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        var path = url.path.removingPercentEncoding ?? url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = Self.root.appendingPathComponent(path).standardized
        guard file.path.hasPrefix(Self.root.standardized.path), let data = try? Data(contentsOf: file) else {
            let r = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            task.didReceive(r); task.didReceive(Data("Not found".utf8)); task.didFinish(); return
        }
        let mime = Self.mime(for: file.pathExtension)
        let headers = ["Content-Type": mime, "Content-Length": "\(data.count)", "Cache-Control": "no-cache"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "woff2": return "font/woff2"
        default: return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}
