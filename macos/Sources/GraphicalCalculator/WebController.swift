import AppKit
import WebKit

/// Owns the one WKWebView that hosts the calculator and bridges it to macOS:
/// native file dialogs, downloads, printing, alerts, external links and a network bridge
/// (so AI providers work without browser CORS limits).
final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandlerWithReply, WKScriptMessageHandler {
    static let shared = WebController()
    let webView: WKWebView
    private var downloadTargets: [ObjectIdentifier: URL] = [:]
    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 120
        return URLSession(configuration: c)
    }()

    private static let bootstrap = """
    window.__native = 'macos';
    window.__nativeFetch = async (url, o) => {
      o = o || {};
      const r = await window.webkit.messageHandlers.fetch.postMessage({ url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body == null ? null : String(o.body) });
      if (r.error) { const e = new TypeError(r.error); throw e; }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body, json: async () => JSON.parse(r.body) };
    };
    window.print = () => window.webkit.messageHandlers.print.postMessage(null);
    window.__nativeModel = {
      status: () => window.webkit.messageHandlers.model.postMessage({ a: 'status' }),
      manage: () => window.webkit.messageHandlers.model.postMessage({ a: 'manage' })
    };
    """

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "gcalc")
        cfg.websiteDataStore = .default()
        let script = WKUserScript(source: Self.bootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        cfg.userContentController.addUserScript(script)
        webView = WKWebView(frame: .zero, configuration: cfg)
        super.init()
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "fetch")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "model")
        cfg.userContentController.add(self, name: "print")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        webView.load(URLRequest(url: URL(string: "gcalc://app/index.html")!))
        Task { @MainActor in
            ModelStore.shared.onChange = { [weak self] in self?.run("window.dispatchEvent(new Event('gc-model'))") }
        }
    }

    /// Set by the SwiftUI layer so the web page can open the model window.
    var openModelWindow: (() -> Void)?

    // MARK: driving the web app

    func run(_ js: String) { webView.evaluateJavaScript(js, completionHandler: nil) }
    private func q(_ s: String) -> String { "'" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'") + "'" }
    func click(_ selector: String) { run("(function(){var e=document.querySelector(\(q(selector))); if(e) e.click();})()") }
    func menu(_ key: String) { click("#mainMenu [data-m=\"\(key)\"]") }
    func app(_ key: String) { click("#mainMenu [data-app=\"\(key)\"]") }
    func add(_ kind: String) { click("#addMenu [data-add=\"\(kind)\"]") }
    func toggleList() { run("(function(){var a=document.querySelector('#btnCollapse'),b=document.querySelector('#btnExpand'); var t=(b&&!b.hidden)?b:a; if(t) t.click();})()") }
    func printPage() {
        let info = NSPrintInfo.shared
        info.isHorizontallyCentered = true; info.isVerticallyCentered = true
        info.orientation = .landscape
        let op = webView.printOperation(with: info)
        op.view?.frame = webView.bounds
        if let w = webView.window { op.runModal(for: w, delegate: nil, didRun: nil, contextInfo: nil) } else { op.run() }
    }

    // MARK: JS → native messages

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "print" { DispatchQueue.main.async { self.printPage() } }
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        if message.name == "model" {
            let action = (message.body as? [String: Any])?["a"] as? String
            Task { @MainActor in
                if action == "manage" { self.openModelWindow?(); replyHandler(["ok": true], nil) }
                else { replyHandler(ModelStore.shared.statusJSON(), nil) }
            }
            return
        }
        guard message.name == "fetch", let d = message.body as? [String: Any], let s = d["url"] as? String, let url = URL(string: s), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            replyHandler(["error": "Bad request"], nil); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = (d["method"] as? String)?.uppercased() == "GET" ? "GET" : "POST"
        for (k, v) in (d["headers"] as? [String: Any]) ?? [:] { req.setValue("\(v)", forHTTPHeaderField: k) }
        if let b = d["body"] as? String { req.httpBody = Data(b.utf8) }

        // The on-device model: start the bundled engine on demand and forward to it.
        if url.host == "local.model" {
            Task {
                do {
                    let path = await MainActor.run { ModelStore.shared.activePath }
                    let port = try await LlamaServer.shared.ensureRunning(modelPath: path)
                    req.url = URL(string: "http://127.0.0.1:\(port)\(url.path)")
                    req.timeoutInterval = 300
                    let (data, resp) = try await self.session.data(for: req)
                    replyHandler(["status": (resp as? HTTPURLResponse)?.statusCode ?? 0, "body": String(data: data, encoding: .utf8) ?? ""], nil)
                } catch let e as LlamaServer.ServerError {
                    replyHandler(["status": 503, "body": e.errorDescription ?? "Offline AI is unavailable."], nil)
                } catch { replyHandler(["error": error.localizedDescription], nil) }
            }
            return
        }
        session.dataTask(with: req) { data, resp, err in
            if let err = err { replyHandler(["error": err.localizedDescription], nil); return }
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            replyHandler(["status": status, "body": String(data: data ?? Data(), encoding: .utf8) ?? ""], nil)
        }.resume()
    }

    // MARK: navigation, links, downloads

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if let url = action.request.url, let scheme = url.scheme, ["http", "https", "mailto"].contains(scheme) {
            if action.navigationType == .linkActivated || action.targetFrame == nil { NSWorkspace.shared.open(url); decisionHandler(.cancel); return }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        DispatchQueue.main.async {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = suggestedFilename
            panel.canCreateDirectories = true
            let done: (NSApplication.ModalResponse) -> Void = { r in
                guard r == .OK, let url = panel.url else { completionHandler(nil); return }
                try? FileManager.default.removeItem(at: url)
                completionHandler(url)
            }
            if let w = self.webView.window { panel.beginSheetModal(for: w, completionHandler: done) } else { panel.begin(completionHandler: done) }
        }
    }

    // MARK: file input, alerts

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        if let w = webView.window { panel.beginSheetModal(for: w) { completionHandler($0 == .OK ? panel.urls : nil) } }
        else { panel.begin { completionHandler($0 == .OK ? panel.urls : nil) } }
    }

    private func alert(_ message: String, buttons: [String], field: NSTextField? = nil, then: @escaping (NSApplication.ModalResponse) -> Void) {
        let a = NSAlert()
        a.messageText = "Graphical Calculator"
        a.informativeText = message
        buttons.forEach { a.addButton(withTitle: $0) }
        a.accessoryView = field
        if let w = webView.window { a.beginSheetModal(for: w, completionHandler: then) } else { then(a.runModal()) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        alert(message, buttons: ["OK"]) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        alert(message, buttons: ["OK", "Cancel"]) { completionHandler($0 == .alertFirstButtonReturn) }
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let f = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24)); f.stringValue = defaultText ?? ""
        alert(prompt, buttons: ["OK", "Cancel"], field: f) { completionHandler($0 == .alertFirstButtonReturn ? f.stringValue : nil) }
    }
}
