import Foundation

/// One downloadable model (open source, pinned by size and SHA-256).
struct ModelEntry: Identifiable, Equatable {
    let id: String
    let tier: String
    let name: String
    let blurb: String
    let fileName: String
    let url: URL
    let size: Int64
    let sha256: String
    let license: String
    let pageURL: URL
    /// Smallest Mac memory (GB) this model runs comfortably on.
    let minRAMGB: Int

    var partialName: String { fileName + ".part" }
}

/// Best model at each size, ordered small to large. Chosen from published maths benchmarks and
/// from running tools/bench/bench.js (word problems, the app's JSON format) on these exact files.
enum ModelCatalog {
    private static func hf(_ repo: String, _ file: String) -> URL { URL(string: "https://huggingface.co/\(repo)/resolve/main/\(file)")! }
    private static func page(_ repo: String) -> URL { URL(string: "https://huggingface.co/\(repo)")! }

    static let all: [ModelEntry] = {
        var list: [ModelEntry] = [
            ModelEntry(id: "compact", tier: "Compact", name: "Qwen3-1.7B",
                       blurb: "Tiny and very fast (about 2 s per answer). Handles everyday problems; measured 17/24 on our word-problem test.",
                       fileName: "Qwen3-1.7B-Q4_K_M.gguf", url: hf("unsloth/Qwen3-1.7B-GGUF", "Qwen3-1.7B-Q4_K_M.gguf"),
                       size: 1_107_409_472, sha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",
                       license: "Apache-2.0", pageURL: page("unsloth/Qwen3-1.7B-GGUF"), minRAMGB: 4),
            ModelEntry(id: "balanced", tier: "Balanced", name: "Qwen3-4B-Instruct-2507",
                       blurb: "Best result in our tests at its size: 22/24 word problems, always valid answers. The default for most Macs.",
                       fileName: "Qwen3-4B-Instruct-2507-Q3_K_M.gguf", url: hf("unsloth/Qwen3-4B-Instruct-2507-GGUF", "Qwen3-4B-Instruct-2507-Q3_K_M.gguf"),
                       size: 2_075_618_400, sha256: "9c6e0763577125a994a9bea0bbd7a737ac4498b8a6a4e0f788727553af1806c9",
                       license: "Apache-2.0", pageURL: page("unsloth/Qwen3-4B-Instruct-2507-GGUF"), minRAMGB: 8),
            ModelEntry(id: "precise", tier: "Precise", name: "Qwen3-4B-Instruct-2507 (high precision)",
                       blurb: "The same model with less compression (Q6), so a little more accurate. Not separately measured.",
                       fileName: "Qwen3-4B-Instruct-2507-Q6_K.gguf", url: hf("unsloth/Qwen3-4B-Instruct-2507-GGUF", "Qwen3-4B-Instruct-2507-Q6_K.gguf"),
                       size: 3_306_261_600, sha256: "cd7b21b38b3e71400587c184b6a9b04d3beb4d13fdae6464d4075dee4f1bc5ad",
                       license: "Apache-2.0", pageURL: page("unsloth/Qwen3-4B-Instruct-2507-GGUF"), minRAMGB: 12),
            ModelEntry(id: "pro", tier: "Pro", name: "Qwen3-30B-A3B-Instruct-2507",
                       blurb: "A much larger model from the same family, but only 3B parameters work per word, so it stays fast. Published maths scores are well above the 4B model; not yet measured here.",
                       fileName: "Qwen3-30B-A3B-Instruct-2507-Q3_K_M.gguf", url: hf("unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF", "Qwen3-30B-A3B-Instruct-2507-Q3_K_M.gguf"),
                       size: 14_711_847_328, sha256: "e145c9d2f5d11c9583eb099aa75100b7ab943e77d5240c9a2cd936f81c89ef43",
                       license: "Apache-2.0", pageURL: page("unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF"), minRAMGB: 24),
            ModelEntry(id: "max", tier: "Max", name: "Qwen3-30B-A3B-Instruct-2507 (higher quality)",
                       blurb: "The same model with less compression (Q4) for the best answers. For 32 GB+ Macs.",
                       fileName: "Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf", url: hf("unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF", "Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf"),
                       size: 18_556_686_752, sha256: "6c997b8af17debdfb01d890214400ccbab00db6acc0ba8da5de1cc906c4774d0",
                       license: "Apache-2.0", pageURL: page("unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF"), minRAMGB: 32)
        ]
        #if DEBUG
        // Debug builds only: point one entry at a local test server.
        let env = ProcessInfo.processInfo.environment
        if let u = env["GC_TEST_MODEL_URL"], let url = URL(string: u), let size = Int64(env["GC_TEST_MODEL_SIZE"] ?? ""), let sha = env["GC_TEST_MODEL_SHA"] {
            list.insert(ModelEntry(id: "test", tier: "Test", name: "Test model", blurb: "Debug only.", fileName: env["GC_TEST_MODEL_NAME"] ?? "gc-test-model.gguf", url: url, size: size, sha256: sha, license: "-", pageURL: url, minRAMGB: 1), at: 0)
        }
        #endif
        return list
    }()

    static func entry(_ id: String?) -> ModelEntry? { all.first { $0.id == id } }

    static func ramGB(_ memory: Int64) -> Double { Double(memory) / 1_073_741_824 }
    /// Hard limit: the file must fit in memory with room left for macOS.
    static func fits(_ e: ModelEntry, memory: Int64 = ModelScanner.physicalMemory()) -> Bool { Double(e.size) <= Double(memory) * 0.6 }
    /// Soft limit: enough memory that answers stay quick and other apps are not squeezed.
    static func comfortable(_ e: ModelEntry, memory: Int64 = ModelScanner.physicalMemory()) -> Bool { ramGB(memory) + 0.5 >= Double(e.minRAMGB) }
    /// The strongest model this Mac runs comfortably.
    static func recommended(memory: Int64 = ModelScanner.physicalMemory()) -> ModelEntry {
        let real = all.filter { $0.id != "test" }
        return real.last { fits($0, memory: memory) && comfortable($0, memory: memory) } ?? real[0]
    }
}

enum ModelPaths {
    /// ~/Library/Application Support/Graphical Calculator/Models
    static var modelsDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Graphical Calculator/Models", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    static func installed(_ e: ModelEntry) -> URL { modelsDir.appendingPathComponent(e.fileName) }
    static func partial(_ e: ModelEntry) -> URL { modelsDir.appendingPathComponent(e.partialName) }
}

/// A model file found elsewhere on this Mac.
struct ModelCandidate: Identifiable, Equatable {
    let path: String
    let name: String
    let size: Int64
    let source: String
    var id: String { path }
}

enum GGUF {
    /// True when the file starts with the GGUF magic bytes.
    static func hasMagic(_ url: URL) -> Bool {
        guard let h = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? h.close() }
        return (try? h.read(upToCount: 4)) == Data("GGUF".utf8)
    }
}

/// Finds GGUF chat models that other tools (LM Studio, Ollama, llama.cpp, Hugging Face, Jan, GPT4All) already put on this Mac.
enum ModelScanner {
    static let minSize: Int64 = 400_000_000

    static func physicalMemory() -> Int64 { Int64(ProcessInfo.processInfo.physicalMemory) }

    /// Pure rule: is this file name/size plausible as a chat model this Mac can run?
    static func isUsable(name: String, size: Int64, memory: Int64 = physicalMemory()) -> Bool {
        let n = name.lowercased()
        guard n.hasSuffix(".gguf"), size >= minSize else { return false }
        for bad in ["mmproj", "embed", "bge-", "nomic", "rerank", "whisper", "clip", "vocab", "-coder", "tts", "flux", "stable"] where n.contains(bad) { return false }
        // the model plus working memory has to fit comfortably
        return Double(size) <= Double(memory) * 0.55
    }

    /// Higher is better: prefer instruct/chat models of a size that runs fast.
    static func score(name: String, size: Int64) -> Int {
        let n = name.lowercased(); var s = 0
        if n.contains("instruct") || n.contains("chat") || n.contains("-it") { s += 40 }
        if n.contains("qwen3") { s += 30 } else if n.contains("qwen2.5") { s += 22 } else if n.contains("llama-3") || n.contains("llama3") { s += 20 } else if n.contains("gemma") || n.contains("phi") || n.contains("mistral") { s += 14 }
        let gb = Double(size) / 1e9
        if gb >= 1.5 && gb <= 6 { s += 25 } else if gb <= 9 { s += 10 }
        if n.contains("q4_k") || n.contains("q5_k") || n.contains("q6_k") || n.contains("q8") { s += 8 }
        return s
    }

    static func scan(home: URL = FileManager.default.homeDirectoryForCurrentUser, memory: Int64 = physicalMemory()) -> [ModelCandidate] {
        let fm = FileManager.default
        var found: [String: ModelCandidate] = [:]
        let ourDir = ModelPaths.modelsDir.standardizedFileURL.path

        func consider(_ url: URL, name: String? = nil, source: String) {
            let real = url.resolvingSymlinksInPath()
            let display = name ?? real.lastPathComponent
            guard let size = (try? real.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) else { return }
            guard real.standardizedFileURL.path.hasPrefix(ourDir) == false else { return }
            guard isUsable(name: display.hasSuffix(".gguf") ? display : display + ".gguf", size: size, memory: memory), GGUF.hasMagic(real) else { return }
            found[real.path] = ModelCandidate(path: real.path, name: display, size: size, source: source)
        }
        func walk(_ dir: URL, depth: Int, source: String) {
            guard depth >= 0, let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) else { return }
            for u in items {
                let isDir = (try? u.resolvingSymlinksInPath().resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
                if isDir { walk(u, depth: depth - 1, source: source) } else if u.pathExtension.lowercased() == "gguf" { consider(u, source: source) }
            }
        }

        walk(home.appendingPathComponent(".lmstudio/models"), depth: 4, source: "LM Studio")
        walk(home.appendingPathComponent(".cache/lm-studio/models"), depth: 4, source: "LM Studio")
        walk(home.appendingPathComponent("Library/Caches/llama.cpp"), depth: 1, source: "llama.cpp")
        walk(home.appendingPathComponent(".cache/huggingface/hub"), depth: 5, source: "Hugging Face cache")
        walk(home.appendingPathComponent("jan/models"), depth: 3, source: "Jan")
        walk(home.appendingPathComponent("Library/Application Support/nomic.ai/GPT4All"), depth: 1, source: "GPT4All")
        walk(home.appendingPathComponent("models"), depth: 3, source: "~/models")
        walk(home.appendingPathComponent("Downloads"), depth: 1, source: "Downloads")

        // Ollama stores GGUF blobs named by hash; its manifests tell us which blob is which model.
        let oll = home.appendingPathComponent(".ollama/models")
        let manifests = oll.appendingPathComponent("manifests")
        if let en = fm.enumerator(at: manifests, includingPropertiesForKeys: [.isRegularFileKey]) {
            for case let f as URL in en where (try? f.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true {
                guard let data = try? Data(contentsOf: f), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let layers = json["layers"] as? [[String: Any]] else { continue }
                for l in layers where (l["mediaType"] as? String) == "application/vnd.ollama.image.model" {
                    guard let d = l["digest"] as? String else { continue }
                    let blob = oll.appendingPathComponent("blobs/" + d.replacingOccurrences(of: ":", with: "-"))
                    let parts = f.pathComponents.suffix(2)
                    consider(blob, name: parts.joined(separator: ":"), source: "Ollama")
                }
            }
        }
        return found.values.sorted { (score(name: $0.name, size: $0.size), $1.name) > (score(name: $1.name, size: $1.size), $0.name) }
    }
}
