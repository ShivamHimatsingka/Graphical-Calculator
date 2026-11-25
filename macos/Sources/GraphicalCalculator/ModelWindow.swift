import SwiftUI

/// "Offline AI Models" window: pick the best model for this Mac, install / reinstall / verify / remove, or reuse one you already have.
struct ModelWindowView: View {
    @ObservedObject private var store = ModelStore.shared
    @State private var reinstallTarget: ModelEntry?
    @State private var removeTarget: ModelEntry?
    @AppStorage("gc.modelPromptDismissed") private var dismissed = false

    private let memory = ModelScanner.physicalMemory()
    private func bytes(_ n: Int64) -> String { ByteCountFormatter.string(fromByteCount: n, countStyle: .file) }
    private var ramText: String { "\(Int((Double(memory) / 1_073_741_824).rounded())) GB" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(.horizontal, 22).padding(.top, 20).padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(ModelCatalog.all.filter { $0.id != "test" || true }) { e in card(e) }
                    if !store.candidates.isEmpty { existing }
                    location
                }.padding(.horizontal, 22).padding(.bottom, 12)
            }
            Divider()
            HStack {
                Text("Models run only on your Mac. Without one, the built-in solver and your cloud AI providers still work.")
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                Spacer()
                if !store.isReady { Button("Not now") { dismissed = true; NSApp.keyWindow?.close() } }
            }.padding(14)
        }
        .frame(width: 660, height: 640)
        .onAppear { store.refresh(); store.scan() }
        .confirmationDialog("Download \(reinstallTarget?.name ?? "the model") again?", isPresented: Binding(get: { reinstallTarget != nil }, set: { if !$0 { reinstallTarget = nil } })) {
            Button("Reinstall") { if let e = reinstallTarget { store.reinstall(e) }; reinstallTarget = nil }
        } message: { Text("This deletes the current copy and downloads \(bytes(reinstallTarget?.size ?? 0)) again.") }
        .confirmationDialog("Remove \(removeTarget?.name ?? "the model")?", isPresented: Binding(get: { removeTarget != nil }, set: { if !$0 { removeTarget = nil } })) {
            Button("Remove", role: .destructive) { if let e = removeTarget { store.remove(e) }; removeTarget = nil }
        } message: { Text("The file is deleted. You can install it again at any time.") }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "cpu").font(.system(size: 28)).foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 3) {
                Text("Offline AI Models").font(.title2.bold())
                Text("Pick a model that fits your Mac (\(ramText) memory). Bigger models solve harder word problems but need more memory and time.")
                    .foregroundStyle(.secondary).font(.callout).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Image(systemName: store.isReady ? "checkmark.circle.fill" : "circle.dashed").foregroundStyle(store.isReady ? .green : .secondary)
                    Text(store.isReady ? "In use: \(store.activeName)" : "No model installed yet").font(.callout.weight(.medium))
                }.padding(.top, 2)
            }
        }
    }

    private func card(_ e: ModelEntry) -> some View {
        let st = store.state(e), rec = ModelCatalog.recommended(), fits = ModelCatalog.fits(e, memory: memory)
        let inUse = store.activeEntry?.id == e.id && !store.usingExternal
        return GroupBox {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(e.tier.uppercased()).font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 2).background(.tint.opacity(0.18), in: Capsule())
                        Text(e.name).font(.headline)
                        if rec.id == e.id { Label("Recommended", systemImage: "star.fill").font(.caption.bold()).foregroundStyle(.orange).labelStyle(.titleAndIcon) }
                        if inUse { Text("IN USE").font(.caption2.bold()).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(.green, in: Capsule()) }
                    }
                    Text(e.blurb).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Text("\(bytes(e.size)) · needs \(e.minRAMGB) GB+ memory · \(e.license) · ").font(.caption).foregroundColor(.secondary) + Text("[model page](\(e.pageURL.absoluteString))").font(.caption)
                    if !fits { Label("Too large for this Mac (\(ramText))", systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange) }
                    else if !ModelCatalog.comfortable(e, memory: memory) { Label("Heavy for \(ramText): answers will be slow", systemImage: "tortoise").font(.caption).foregroundStyle(.orange) }
                    status(e, st)
                }
                Spacer(minLength: 8)
                actions(e, st, fits: fits, inUse: inUse)
            }.padding(4)
        }
    }

    @ViewBuilder private func status(_ e: ModelEntry, _ st: ModelState) -> some View {
        switch st {
        case .downloading:
            ProgressView(value: store.progress(e))
            Text("\(bytes(store.downloaded)) of \(bytes(e.size))" + (store.speed > 0 ? " · \(bytes(Int64(store.speed)))/s" : "")).font(.caption).foregroundStyle(.secondary)
        case .verifying:
            HStack(spacing: 6) { ProgressView().controlSize(.small); Text("Checking the file…").font(.caption).foregroundStyle(.secondary) }
        case .damaged(let m): Label(m, systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.orange)
        case .failed(let m): Label(m, systemImage: "xmark.octagon.fill").font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
        case .notInstalled:
            if (store.partials[e.id] ?? 0) > 0 { ProgressView(value: store.progress(e)); Text("Paused — \(bytes(store.partials[e.id] ?? 0)) of \(bytes(e.size)) saved").font(.caption).foregroundStyle(.secondary) }
        case .ready:
            if store.verified.contains(e.id) { Label("Installed · files verified", systemImage: "checkmark.seal").font(.caption).foregroundStyle(.green) }
            else { Label("Installed", systemImage: "checkmark.circle").font(.caption).foregroundStyle(.green) }
        }
    }

    @ViewBuilder private func actions(_ e: ModelEntry, _ st: ModelState, fits: Bool, inUse: Bool) -> some View {
        VStack(alignment: .trailing, spacing: 6) {
            switch st {
            case .downloading:
                Button("Cancel") { store.cancel() }
            case .verifying:
                EmptyView()
            case .ready:
                if inUse { Text("Selected").font(.callout).foregroundStyle(.secondary) } else { Button("Use this") { store.select(e) }.buttonStyle(.borderedProminent) }
                HStack(spacing: 6) {
                    Button("Reinstall") { reinstallTarget = e }.disabled(store.isDownloading)
                    Menu {
                        Button("Verify files") { store.verify(e) }
                        Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([ModelPaths.installed(e)]) }
                        Divider()
                        Button("Remove…", role: .destructive) { removeTarget = e }
                    } label: { Image(systemName: "ellipsis.circle") }.menuStyle(.borderlessButton).fixedSize()
                }
            case .damaged:
                Button("Reinstall") { reinstallTarget = e }.buttonStyle(.borderedProminent).disabled(store.isDownloading)
                Button("Remove…", role: .destructive) { removeTarget = e }
            default:
                let resume = (store.partials[e.id] ?? 0) > 0
                Button(resume ? "Resume" : "Download") { store.install(e) }
                    .buttonStyle(.borderedProminent).disabled(store.isDownloading || !fits)
                if resume { Button("Start over") { reinstallTarget = e }.disabled(store.isDownloading) }
            }
        }
    }

    private var existing: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 8) {
                Label("Already on this Mac", systemImage: "externaldrive.badge.checkmark").font(.headline)
                Text("Models from other apps. Use one instead of downloading.").font(.callout).foregroundStyle(.secondary)
                ForEach(store.candidates.prefix(6)) { c in
                    HStack {
                        VStack(alignment: .leading) { Text(c.name).lineLimit(1); Text("\(c.source) · \(bytes(c.size))").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        if store.externalPath == c.path { Text("In use").foregroundStyle(.green).font(.callout) }
                        else { Button("Use this model") { store.useExternal(c) } }
                    }
                }
                if store.usingExternal { Button("Stop using it and go back to the models above") { store.stopUsingExternal() } }
            }.padding(4).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var location: some View {
        HStack {
            Text("Installed to ").font(.caption).foregroundColor(.secondary) + Text(store.installDir.path).font(.caption.monospaced())
            Spacer()
            Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([store.installDir]) }.font(.caption)
        }.padding(.top, 4)
    }
}
