// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "GraphicalCalculator",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "GraphicalCalculator", path: "Sources/GraphicalCalculator"),
        .testTarget(name: "GraphicalCalculatorTests", dependencies: ["GraphicalCalculator"], path: "Tests/GraphicalCalculatorTests")
    ]
)
