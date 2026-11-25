import Foundation
import CryptoKit
import SwiftUI

enum ModelState: Equatable {
    case notInstalled
    case downloading
    case verifying
    case ready
    case damaged(String)
    case failed(String)
}

/// Installs, verifies, repairs and selects on-device models from the catalog. All state lives here.
@MainActor
final class ModelStore: NSObject, ObservableObject, URLSessionDataDelegate {
    static let shared = ModelStore()

    @Published private(set) var states: [String: ModelState] = [:]
    @Published private(set) var partials: [String: Int64] = [:]
    @Published private(set) var verified: Set<String> = []
    @Published private(set) var current: ModelEntry?          // the one being downloaded right now
    @Published private(set) var downloaded: Int64 = 0
    @Published private(set) var speed: Double = 0
    @Published private(set) var candidates: [ModelCandidate] = []
    @Published private(set) var externalPath: String? = UserDefaults.standard.string(forKey: "gc.externalModelPath")
    @Published private(set) var activeID: String? = UserDefaults.standard.string(forKey: "gc.activeModelID")
    var onChange: (() -> Void)?

    private var session: URLSession?
    private var handle: FileHandle?
    private var offset: Int64 = 0
    private var lastTick = Date()
    private var lastBytes: Int64 = 0
    private var httpStatus = 0
    private let fm = FileManager.default
    var installDir: URL { ModelPaths.modelsDir }

    // MARK: derived

    func state(_ e: ModelEntry) -> ModelState { states[e.id] ?? .notInstalled }
    func isComplete(_ e: ModelEntry) -> Bool {
        guard let a = try? fm.attributesOfItem(atPath: ModelPaths.installed(e).path), let s = a[.size] as? NSNumber else { return false }
        return s.int64Value == e.size
    }
    func isUsable(_ e: ModelEntry) -> Bool {
        guard isComplete(e) else { return false }
        if case .damaged = state(e) { return false }
        return true
    }
    func progress(_ e: ModelEntry) -> Double {
        let n = current?.id == e.id ? downloaded : (partials[e.id] ?? 0)
        return e.size > 0 ? min(1, Double(n) / Double(e.size)) : 0
    }
    var anyBusy: Bool { states.values.contains { $0 == .downloading || $0 == .verifying } }
    var isDownloading: Bool { current != nil }

    /// The model the engine should load, if any: an external model you chose, else the selected one, else the best installed.
    var activePath: String? {
        if let e = externalPath, fm.fileExists(atPath: e) { return e }
        return activeEntry.map { ModelPaths.installed($0).path }
    }
    var activeEntry: ModelEntry? {
        if let e = ModelCatalog.entry(activeID), isUsable(e) { return e }
        return ModelCatalog.all.last { isUsable($0) }
    }
    var activeName: String {
        if usingExternal, let e = externalPath { return URL(fileURLWithPath: e).deletingPathExtension().lastPathComponent }
        return activeEntry?.name ?? "No model"
    }
    var usingExternal: Bool { if let e = externalPath { return fm.fileExists(atPath: e) }; return false }
    /// Usable right now. A background check never blocks use; only a download of the same file would.
    var isReady: Bool { activePath != nil }

    override init() { super.init(); refresh(); silentVerifyActive() }

    func refresh() {
        for e in ModelCatalog.all {
            let busy = state(e) == .downloading || state(e) == .verifying
            let part = (try? fm.attributesOfItem(atPath: ModelPaths.partial(e).path)[.size] as? NSNumber)?.int64Value ?? 0
            partials[e.id] = part < e.size ? part : 0
            if busy { continue }
            if fm.fileExists(atPath: ModelPaths.installed(e).path) {
                if isComplete(e) { if case .damaged = state(e) { /* keep until reinstalled */ } else { states[e.id] = .ready } }
                else { states[e.id] = .damaged("The installed file has the wrong size. Reinstall to fix it.") }
            } else if case .failed = state(e) { /* keep the message */ } else { states[e.id] = .notInstalled }
        }
        if let p = externalPath, !fm.fileExists(atPath: p) { externalPath = nil; UserDefaults.standard.removeObject(forKey: "gc.externalModelPath") }
        notify()
    }

    func scan() {
        Task.detached(priority: .utility) {
            let list = ModelScanner.scan()
            await MainActor.run { self.candidates = list; self.notify() }
        }
    }
    private func notify() { onChange?(); objectWillChange.send() }

    // MARK: choosing

    func select(_ e: ModelEntry) {
        guard isUsable(e) else { return }
        activeID = e.id; externalPath = nil
        UserDefaults.standard.set(e.id, forKey: "gc.activeModelID"); UserDefaults.standard.removeObject(forKey: "gc.externalModelPath")
        LlamaServer.shared.stop(); notify()
    }
    func useExternal(_ c: ModelCandidate) {
        externalPath = c.path; UserDefaults.standard.set(c.path, forKey: "gc.externalModelPath")
        LlamaServer.shared.stop(); notify()
    }
    func stopUsingExternal() {
        externalPath = nil; UserDefaults.standard.removeObject(forKey: "gc.externalModelPath")
        LlamaServer.shared.stop(); notify()
    }

    // MARK: install / reinstall

    func install(_ e: ModelEntry, fresh: Bool = false) {
        guard current == nil else { return }
        if isComplete(e) && !fresh && isUsable(e) { return }
        if activePath == ModelPaths.installed(e).path { LlamaServer.shared.stop() }
        if fresh { try? fm.removeItem(at: ModelPaths.partial(e)) }
        try? fm.removeItem(at: ModelPaths.installed(e))
        verified.remove(e.id)
        if let free = try? installDir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage, free < e.size + 500_000_000 {
            states[e.id] = .failed("Not enough free disk space. You need about \(ByteCountFormatter.string(fromByteCount: e.size + 500_000_000, countStyle: .file)) free.")
            notify(); return
        }
        let part = ModelPaths.partial(e)
        if !fm.fileExists(atPath: part.path) { fm.createFile(atPath: part.path, contents: nil) }
        offset = (try? fm.attributesOfItem(atPath: part.path)[.size] as? NSNumber)?.int64Value ?? 0
        if offset > e.size { try? fm.removeItem(at: part); fm.createFile(atPath: part.path, contents: nil); offset = 0 }
        handle = try? FileHandle(forWritingTo: part)
        _ = try? handle?.seekToEnd()
        current = e; downloaded = offset; lastBytes = offset; lastTick = Date(); speed = 0; httpStatus = 0
        states[e.id] = .downloading; notify()

        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 60; cfg.waitsForConnectivity = true
        session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
        var req = URLRequest(url: e.url)
        if offset > 0 { req.setValue("bytes=\(offset)-", forHTTPHeaderField: "Range") }
        session?.dataTask(with: req).resume()
    }
    func reinstall(_ e: ModelEntry) { install(e, fresh: true) }

    func cancel() {
        guard let e = current else { return }
        session?.invalidateAndCancel(); session = nil
        try? handle?.close(); handle = nil
        current = nil; states[e.id] = .notInstalled; refresh()
    }

    func remove(_ e: ModelEntry) {
        if current?.id == e.id { cancel() }
        if activePath == ModelPaths.installed(e).path { LlamaServer.shared.stop() }
        try? fm.removeItem(at: ModelPaths.installed(e)); try? fm.removeItem(at: ModelPaths.partial(e))
        states[e.id] = .notInstalled; verified.remove(e.id)
        if activeID == e.id { activeID = nil; UserDefaults.standard.removeObject(forKey: "gc.activeModelID") }
        refresh()
    }

    // MARK: verification

    private func stamp(_ e: ModelEntry) -> String {
        let a = try? fm.attributesOfItem(atPath: ModelPaths.installed(e).path)
        let m = (a?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        return "\(e.sha256.prefix(12))|\(e.size)|\(Int(m))"
    }
    private func saveStamp(_ e: ModelEntry) { UserDefaults.standard.set(stamp(e), forKey: "gc.verified." + e.id) }

    /// Full SHA-256 check. `silent` runs in the background without changing what the window shows while it runs.
    func verify(_ e: ModelEntry, silent: Bool = false) {
        guard fm.fileExists(atPath: ModelPaths.installed(e).path), state(e) != .downloading, state(e) != .verifying else { return }
        if !silent { states[e.id] = .verifying }
        verified.remove(e.id); notify()
        let url = ModelPaths.installed(e), want = e.sha256
        Task.detached(priority: .utility) {
            let ok = Self.sha256(of: url) == want
            await MainActor.run {
                if ok {
                    self.verified.insert(e.id); self.saveStamp(e)
                    if self.state(e) == .verifying { self.states[e.id] = .ready }
                } else if self.state(e) != .downloading {
                    self.states[e.id] = .damaged("The installed model is corrupt. Press Reinstall to download it again.")
                }
                self.notify()
            }
        }
    }

    /// At launch, re-check the active model only if the file changed since it was last verified (hashing 10+ GB every launch would be wasteful).
    private func silentVerifyActive() {
        guard let e = activeEntry, externalPath == nil else { return }
        if UserDefaults.standard.string(forKey: "gc.verified." + e.id) == stamp(e) { verified.insert(e.id); return }
        verify(e, silent: true)
    }

    nonisolated static func sha256(of url: URL) -> String? {
        guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? h.close() }
        var hasher = SHA256()
        while true {
            let chunk = autoreleasepool { try? h.read(upToCount: 8 * 1024 * 1024) }
            guard let d = chunk, !d.isEmpty else { break }
            hasher.update(data: d)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    // MARK: URLSessionDataDelegate (background queue)

    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        Task { @MainActor in
            self.httpStatus = code
            if code == 200 && self.offset > 0 {   // server ignored Range: start over
                try? self.handle?.truncate(atOffset: 0); try? self.handle?.seek(toOffset: 0)
                self.offset = 0; self.downloaded = 0; self.lastBytes = 0
            }
        }
        completionHandler(.allow)
    }

    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        Task { @MainActor in
            guard self.httpStatus == 200 || self.httpStatus == 206 else { return }
            try? self.handle?.write(contentsOf: data)
            self.downloaded += Int64(data.count)
            let now = Date(); let dt = now.timeIntervalSince(self.lastTick)
            if dt >= 0.7 {
                let inst = Double(self.downloaded - self.lastBytes) / dt
                self.speed = self.speed == 0 ? inst : self.speed * 0.6 + inst * 0.4
                self.lastTick = now; self.lastBytes = self.downloaded; self.notify()
            }
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        Task { @MainActor in
            guard self.session === session, let e = self.current else { return }
            try? self.handle?.close(); self.handle = nil; self.session = nil
            @MainActor func fail(_ m: String) { self.states[e.id] = .failed(m); self.current = nil; self.refreshKeeping(e) }
            if let error = error as NSError? {
                if error.code == NSURLErrorCancelled { return }
                fail("Download interrupted: \(error.localizedDescription) Press Resume to continue where it stopped."); return
            }
            if self.httpStatus == 416 { try? self.fm.removeItem(at: ModelPaths.partial(e)); fail("The download restarted — press Download to try again."); return }
            guard self.httpStatus == 200 || self.httpStatus == 206 else { fail("The download server answered with an error (\(self.httpStatus)). Try again in a moment."); return }
            self.finishDownload(e)
        }
    }

    private func refreshKeeping(_ e: ModelEntry) {
        let s = state(e); refresh(); states[e.id] = s; notify()
    }

    private func finishDownload(_ e: ModelEntry) {
        let part = ModelPaths.partial(e)
        let size = (try? fm.attributesOfItem(atPath: part.path)[.size] as? NSNumber)?.int64Value ?? 0
        guard size == e.size else {
            states[e.id] = .failed("The download ended early (\(ByteCountFormatter.string(fromByteCount: size, countStyle: .file)) of \(ByteCountFormatter.string(fromByteCount: e.size, countStyle: .file))). Press Resume.")
            current = nil; refreshKeeping(e); return
        }
        states[e.id] = .verifying; notify()
        let dest = ModelPaths.installed(e), want = e.sha256
        Task.detached(priority: .utility) {
            let ok = Self.sha256(of: part) == want
            await MainActor.run {
                self.current = nil
                if ok {
                    try? self.fm.removeItem(at: dest)
                    do {
                        try self.fm.moveItem(at: part, to: dest)
                        self.states[e.id] = .ready; self.verified.insert(e.id); self.saveStamp(e); self.partials[e.id] = 0
                        self.select(e)    // a model you just installed becomes the one in use
                    } catch { self.states[e.id] = .failed("Could not save the model: \(error.localizedDescription)") }
                } else {
                    try? self.fm.removeItem(at: part)
                    self.states[e.id] = .failed("The downloaded file failed its integrity check, so it was discarded. Press Download to try again.")
                    self.partials[e.id] = 0
                }
                self.notify()
            }
        }
    }

    // MARK: status for the web app

    func statusJSON() -> [String: Any] {
        let busy = current
        var stateName = isReady ? "ready" : "none"
        if let b = busy, !isReady { stateName = state(b) == .verifying ? "verifying" : "downloading" }
        else if let a = activeEntry, case .damaged = state(a) { stateName = "damaged" }
        return ["state": stateName, "ready": isReady, "name": activeName, "external": usingExternal,
                "progress": busy.map { progress($0) } ?? 0, "downloading": busy?.name ?? "",
                "recommended": ModelCatalog.recommended().name, "found": candidates.count, "dir": installDir.path]
    }
}
