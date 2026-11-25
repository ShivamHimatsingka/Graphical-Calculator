import XCTest
@testable import GraphicalCalculator

final class ModelTests: XCTestCase {
    private func tmp() -> URL {
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("gc-test-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: u, withIntermediateDirectories: true); return u
    }
    /// Sparse file that starts with the GGUF magic and reports `size` bytes.
    private func fakeGGUF(_ url: URL, size: UInt64, magic: String = "GGUF") {
        try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: url.path, contents: Data(magic.utf8))
        let h = try! FileHandle(forWritingTo: url); try! h.truncate(atOffset: size); try! h.close()
    }

    func testUsableRules() {
        let mem: Int64 = 16_000_000_000
        XCTAssertTrue(ModelScanner.isUsable(name: "Qwen3-8B-Q4_K_M.gguf", size: 5_000_000_000, memory: mem))
        XCTAssertFalse(ModelScanner.isUsable(name: "nomic-embed-text.gguf", size: 600_000_000, memory: mem), "embedding models are not chat models")
        XCTAssertFalse(ModelScanner.isUsable(name: "mmproj-model-f16.gguf", size: 900_000_000, memory: mem))
        XCTAssertFalse(ModelScanner.isUsable(name: "tiny.gguf", size: 50_000_000, memory: mem), "too small")
        XCTAssertFalse(ModelScanner.isUsable(name: "Llama-70B-Q4.gguf", size: 40_000_000_000, memory: mem), "does not fit in memory")
        XCTAssertFalse(ModelScanner.isUsable(name: "model.bin", size: 2_000_000_000, memory: mem))
    }

    func testScoringPrefersInstructQwen() {
        XCTAssertGreaterThan(ModelScanner.score(name: "Qwen3-4B-Instruct-Q4_K_M.gguf", size: 2_500_000_000),
                             ModelScanner.score(name: "random-base-model.gguf", size: 2_500_000_000))
    }

    func testGGUFMagic() {
        let d = tmp(); defer { try? FileManager.default.removeItem(at: d) }
        fakeGGUF(d.appendingPathComponent("a.gguf"), size: 10); fakeGGUF(d.appendingPathComponent("b.gguf"), size: 10, magic: "NOPE")
        XCTAssertTrue(GGUF.hasMagic(d.appendingPathComponent("a.gguf")))
        XCTAssertFalse(GGUF.hasMagic(d.appendingPathComponent("b.gguf")))
        XCTAssertFalse(GGUF.hasMagic(d.appendingPathComponent("missing.gguf")))
    }

    func testScanFindsLMStudioAndOllamaModels() {
        let home = tmp(); defer { try? FileManager.default.removeItem(at: home) }
        fakeGGUF(home.appendingPathComponent(".lmstudio/models/org/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf"), size: 2_000_000_000)
        fakeGGUF(home.appendingPathComponent(".lmstudio/models/org/bad/not-a-model.gguf"), size: 2_000_000_000, magic: "XXXX")
        fakeGGUF(home.appendingPathComponent(".lmstudio/models/org/emb/nomic-embed.gguf"), size: 800_000_000)
        // Ollama: manifest -> blob
        let blobs = home.appendingPathComponent(".ollama/models/blobs"); let digest = "sha256:abc123"
        fakeGGUF(blobs.appendingPathComponent("sha256-abc123"), size: 1_900_000_000)
        let man = home.appendingPathComponent(".ollama/models/manifests/registry.ollama.ai/library/llama3.2/3b")
        try! FileManager.default.createDirectory(at: man.deletingLastPathComponent(), withIntermediateDirectories: true)
        let json: [String: Any] = ["layers": [["mediaType": "application/vnd.ollama.image.model", "digest": digest]]]
        try! JSONSerialization.data(withJSONObject: json).write(to: man)

        let found = ModelScanner.scan(home: home, memory: 16_000_000_000)
        let names = found.map(\.name)
        XCTAssertTrue(names.contains("Qwen3-8B-Q4_K_M.gguf"), "\(names)")
        XCTAssertTrue(found.contains { $0.source == "Ollama" && $0.name.contains("llama3.2") }, "\(names)")
        XCTAssertFalse(names.contains("not-a-model.gguf"))
        XCTAssertFalse(names.contains("nomic-embed.gguf"))
        XCTAssertEqual(found.first?.source, "LM Studio", "best-scored model is suggested first")
    }

    func testSHA256() throws {
        let d = tmp(); defer { try? FileManager.default.removeItem(at: d) }
        let f = d.appendingPathComponent("x"); try Data("hello".utf8).write(to: f)
        XCTAssertEqual(ModelStore.sha256(of: f), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    }

    func testCatalogIsPinnedAndOrdered() {
        let real = ModelCatalog.all.filter { $0.id != "test" }
        XCTAssertGreaterThanOrEqual(real.count, 4)
        for e in real {
            XCTAssertEqual(e.sha256.count, 64, e.name)
            XCTAssertTrue(e.url.absoluteString.hasSuffix(e.fileName), e.name)
            XCTAssertTrue(e.url.absoluteString.hasPrefix("https://huggingface.co/"), e.name)
            XCTAssertGreaterThan(e.size, 1_000_000_000, e.name)
        }
        XCTAssertEqual(real.map(\.size), real.map(\.size).sorted(), "catalog goes from small to large")
        XCTAssertEqual(Set(real.map(\.id)).count, real.count)
        XCTAssertEqual(Set(real.map(\.fileName)).count, real.count)
    }

    func testRecommendationFollowsMemory() {
        let gb: Int64 = 1_073_741_824
        XCTAssertEqual(ModelCatalog.recommended(memory: 4 * gb).id, "compact", "tiny Macs still get the smallest model")
        XCTAssertEqual(ModelCatalog.recommended(memory: 8 * gb).id, "balanced")
        XCTAssertEqual(ModelCatalog.recommended(memory: 16 * gb).id, "precise")
        XCTAssertEqual(ModelCatalog.recommended(memory: 24 * gb).id, "pro")
        XCTAssertEqual(ModelCatalog.recommended(memory: 64 * gb).id, "max")
        let max = ModelCatalog.entry("max")!
        XCTAssertFalse(ModelCatalog.fits(max, memory: 16 * gb))
        XCTAssertTrue(ModelCatalog.fits(max, memory: 32 * gb))
    }
}
