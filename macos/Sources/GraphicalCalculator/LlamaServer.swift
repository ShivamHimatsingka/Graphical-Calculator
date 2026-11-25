import Foundation
import Darwin

/// Runs the bundled `llama-server` (llama.cpp) on 127.0.0.1 for the selected model, on demand.
final class LlamaServer {
    static let shared = LlamaServer()
    enum ServerError: LocalizedError {
        case noBinary, noModel, failed(String)
        var errorDescription: String? {
            switch self {
            case .noBinary: return "The offline AI engine is missing from this build of the app."
            case .noModel: return "The offline AI model is not installed."
            case .failed(let m): return m
            }
        }
    }

    private var process: Process?
    private var port: Int = 0
    private var loadedPath: String?
    private var idleTimer: Timer?
    private let lock = NSLock()
    private var starting: Task<Int, Error>?

    static var binaryURL: URL? {
        #if arch(arm64)
        let sub = "llama-arm64"
        #else
        let sub = "llama-x64"
        #endif
        let dev = ProcessInfo.processInfo.environment["GC_LLAMA_DIR"].map { URL(fileURLWithPath: $0) }
        let candidates = [dev, Bundle.main.resourceURL?.appendingPathComponent("llama/" + sub)].compactMap { $0 }
        return candidates.map { $0.appendingPathComponent("llama-server") }.first { FileManager.default.isExecutableFile(atPath: $0.path) }
    }

    private final class Tail { private var d = Data(); private let l = NSLock()
        func add(_ x: Data) { l.lock(); d.append(x); if d.count > 6000 { d = d.suffix(6000) }; l.unlock() }
        var text: String { l.lock(); defer { l.unlock() }; return String(data: d, encoding: .utf8)?.split(separator: "\n").suffix(3).joined(separator: " ") ?? "" } }

    // Synchronous state helpers (so the lock never spans an `await`).
    private enum Plan { case reuse(Int), join(Task<Int, Error>), start(Task<Int, Error>) }
    private func plan(modelPath: String, make: () -> Task<Int, Error>) -> Plan {
        lock.lock(); defer { lock.unlock() }
        if let p = process, p.isRunning, loadedPath == modelPath { return .reuse(port) }
        if let t = starting, loadedPath == modelPath { return .join(t) }
        stopLocked(); loadedPath = modelPath
        let t = make(); starting = t; return .start(t)
    }
    private func finish(failed: Bool) { lock.lock(); starting = nil; if failed { stopLocked() }; lock.unlock() }
    private func record(_ p: Process, _ port: Int) { lock.lock(); process = p; self.port = port; lock.unlock() }

    /// Returns the local port, starting (or restarting for a different model) as needed.
    func ensureRunning(modelPath: String?) async throws -> Int {
        guard let modelPath = modelPath, FileManager.default.fileExists(atPath: modelPath) else { throw ServerError.noModel }
        guard let bin = Self.binaryURL else { throw ServerError.noBinary }
        switch plan(modelPath: modelPath, make: { Task { try await self.launch(bin: bin, modelPath: modelPath) } }) {
        case .reuse(let p): bumpIdle(); return p
        case .join(let t): return try await t.value
        case .start(let t):
            do { let p = try await t.value; finish(failed: false); bumpIdle(); return p }
            catch { finish(failed: true); throw error }
        }
    }

    private func launch(bin: URL, modelPath: String) async throws -> Int {
        let port = Self.freePort()
        let p = Process()
        p.executableURL = bin
        p.currentDirectoryURL = bin.deletingLastPathComponent()
        p.arguments = ["-m", modelPath, "--host", "127.0.0.1", "--port", "\(port)", "-c", "8192", "-ngl", "99", "--no-webui", "--alias", "local", "-np", "1"]
        let errPipe = Pipe(); p.standardError = errPipe; p.standardOutput = FileHandle.nullDevice
        let tail = Tail()
        errPipe.fileHandleForReading.readabilityHandler = { h in let d = h.availableData; if !d.isEmpty { tail.add(d) } }
        do { try p.run() } catch { throw ServerError.failed("Could not start the offline AI engine: \(error.localizedDescription)") }
        record(p, port)

        let deadline = Date().addingTimeInterval(180)
        while Date() < deadline {
            if !p.isRunning { throw ServerError.failed(Self.friendly(tail.text)) }
            if await Self.healthy(port: port) { return port }
            try await Task.sleep(nanoseconds: 400_000_000)
        }
        throw ServerError.failed("The offline AI model took too long to load.")
    }

    /// Turns llama.cpp's log tail into one sentence a person can act on.
    static func friendly(_ log: String) -> String {
        let l = log.lowercased()
        if l.contains("out of memory") || l.contains("failed to allocate") || l.contains("insufficient memory") { return "This Mac does not have enough free memory for the selected model. Close other apps or choose a smaller model." }
        if l.contains("unknown model architecture") || l.contains("unsupported") { return "The selected model uses a format this engine does not support. Choose another model." }
        return "The offline AI model could not be loaded. The file may be damaged: open Offline AI Models and press Reinstall, or choose another model."
    }

    private static func healthy(port: Int) async -> Bool {
        var r = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/health")!); r.timeoutInterval = 2
        guard let (_, resp) = try? await URLSession.shared.data(for: r) else { return false }
        return (resp as? HTTPURLResponse)?.statusCode == 200
    }

    private static func freePort() -> Int {
        let s = socket(AF_INET, SOCK_STREAM, 0); defer { close(s) }
        var a = sockaddr_in(); a.sin_family = sa_family_t(AF_INET); a.sin_addr.s_addr = inet_addr("127.0.0.1"); a.sin_port = 0
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        withUnsafeMutablePointer(to: &a) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { _ = bind(s, $0, len); _ = getsockname(s, $0, &len) } }
        return Int(UInt16(bigEndian: a.sin_port))
    }

    /// Frees the model's memory after a quiet period.
    private func bumpIdle() {
        DispatchQueue.main.async {
            self.idleTimer?.invalidate()
            self.idleTimer = Timer.scheduledTimer(withTimeInterval: 15 * 60, repeats: false) { _ in self.stop() }
        }
    }

    private func stopLocked() {
        if let p = process, p.isRunning { p.terminate() }
        process = nil; loadedPath = nil
    }
    func stop() { lock.lock(); stopLocked(); lock.unlock() }
}
