import Cocoa
import CoreGraphics
import CoreImage
import CoreMedia
import CoreVideo
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

let screenshotDebugEnabled = ProcessInfo.processInfo.environment["MEMORYLANE_SCREENSHOT_DEBUG"] == "1"
let screenshotIncludeTestMeta = ProcessInfo.processInfo.environment["MEMORYLANE_SCREENSHOT_TEST_META"] == "1"
let helperFrameTimeoutMs = 2_000

enum ScreenshotError: Error {
    case invalidArguments(String)
    case displayNotFound(UInt32)
    case captureFailed(String)
    case saveFailed(String)
    case invalidRequest(String)
    case frameTimeout(String)
}

struct CachedFrame {
    let image: CGImage
    let displayId: UInt32
    let capturedAtMs: Double
    let frameSequence: UInt64
}

func debugLog(_ message: String) {
    guard screenshotDebugEnabled else { return }
    fputs("[ScreenshotHelper] \(message)\n", stderr)
}

func nowMs() -> Double {
    CFAbsoluteTimeGetCurrent() * 1000
}

func emitJSON(_ payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else {
        fputs("Failed to encode JSON payload\n", stderr)
        exit(1)
    }
    print(json)
}

func emitErrorJSON(code: String, message: String) {
    emitJSON([
        "status": "error",
        "code": code,
        "message": message,
    ])
}

func fail(_ message: String, exitCode: Int32 = 1) -> Never {
    fputs("\(message)\n", stderr)
    exit(exitCode)
}

func parseOptions(_ args: [String]) throws -> [String: String] {
    var options: [String: String] = [:]
    var i = 0

    while i < args.count {
        let key = args[i]
        guard key.hasPrefix("--") else {
            throw ScreenshotError.invalidArguments("Unexpected argument: \(key)")
        }
        guard i + 1 < args.count else {
            throw ScreenshotError.invalidArguments("Missing value for option: \(key)")
        }
        options[key] = args[i + 1]
        i += 2
    }

    return options
}

func ensureOutputDirectory(for outputPath: String) throws {
    let outputURL = URL(fileURLWithPath: outputPath)
    let directoryURL = outputURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(
        at: directoryURL,
        withIntermediateDirectories: true
    )
}

func writePNG(_ image: CGImage, to outputPath: String) throws {
    try ensureOutputDirectory(for: outputPath)

    let outputURL = URL(fileURLWithPath: outputPath)
    guard let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        throw ScreenshotError.saveFailed("Could not create PNG destination for \(outputPath)")
    }

    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw ScreenshotError.saveFailed("Could not finalize PNG write to \(outputPath)")
    }
}

func resizeIfNeeded(_ image: CGImage, maxDimension: Int?) throws -> CGImage {
    guard let maxDimension, maxDimension > 0 else {
        return image
    }

    let width = image.width
    let height = image.height
    let longestEdge = max(width, height)
    if longestEdge <= maxDimension {
        return image
    }

    let scale = Double(maxDimension) / Double(longestEdge)
    let targetWidth = max(1, Int((Double(width) * scale).rounded()))
    let targetHeight = max(1, Int((Double(height) * scale).rounded()))

    guard let context = CGContext(
        data: nil,
        width: targetWidth,
        height: targetHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        throw ScreenshotError.captureFailed("Could not allocate resize context")
    }

    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))

    guard let resized = context.makeImage() else {
        throw ScreenshotError.captureFailed("Could not generate resized screenshot")
    }

    return resized
}

func resolveDisplayId(_ requestedDisplayId: UInt32?) throws -> CGDirectDisplayID {
    if let requestedDisplayId {
        var displayCount: UInt32 = 0
        CGGetOnlineDisplayList(0, nil, &displayCount)
        var displayIds = Array(repeating: CGDirectDisplayID(), count: Int(displayCount))
        CGGetOnlineDisplayList(displayCount, &displayIds, &displayCount)

        if displayIds.contains(requestedDisplayId) {
            return requestedDisplayId
        }

        throw ScreenshotError.displayNotFound(requestedDisplayId)
    }

    return CGMainDisplayID()
}

func shareableContent() async throws -> SCShareableContent {
    if #available(macOS 14.4, *) {
        return try await SCShareableContent.current
    } else {
        return try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    }
}

func findDisplay(_ displayId: CGDirectDisplayID, in content: SCShareableContent) -> SCDisplay? {
    content.displays.first(where: { $0.displayID == displayId })
}

final class StreamOutputHandler: NSObject, SCStreamOutput {
    private let displayId: UInt32
    private let generation: UInt64
    private let ciContext = CIContext()
    private let onFrame: (CGImage, UInt32, UInt64) -> Void

    init(
        displayId: UInt32,
        generation: UInt64,
        onFrame: @escaping (CGImage, UInt32, UInt64) -> Void
    ) {
        self.displayId = displayId
        self.generation = generation
        self.onFrame = onFrame
        super.init()
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        guard outputType == .screen else { return }
        guard CMSampleBufferIsValid(sampleBuffer), CMSampleBufferDataIsReady(sampleBuffer) else { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        guard width > 0, height > 0 else { return }

        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let rect = CGRect(x: 0, y: 0, width: width, height: height)
        guard let cgImage = ciContext.createCGImage(ciImage, from: rect) else {
            debugLog("frame callback createCGImage failed display=\(displayId) gen=\(generation)")
            return
        }

        onFrame(cgImage, displayId, generation)
    }
}

final class StreamDelegateHandler: NSObject, SCStreamDelegate {
    private let displayId: UInt32
    private let generation: UInt64
    private let onStopWithError: (Error, UInt32, UInt64) -> Void

    init(
        displayId: UInt32,
        generation: UInt64,
        onStopWithError: @escaping (Error, UInt32, UInt64) -> Void
    ) {
        self.displayId = displayId
        self.generation = generation
        self.onStopWithError = onStopWithError
        super.init()
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onStopWithError(error, displayId, generation)
    }
}

actor DisplayStreamManager {
    private var currentDisplayId: UInt32?
    private var currentStream: SCStream?
    private var currentOutputHandler: StreamOutputHandler?
    private var currentDelegateHandler: StreamDelegateHandler?
    private var currentSampleQueue: DispatchQueue?
    private var currentGeneration: UInt64 = 0

    private var latestFrame: CachedFrame?
    private var nextFrameSequence: UInt64 = 0
    private var lastServedFrameSequence: UInt64 = 0
    private var streamFailureMessage: String?

    func ensureStream(for displayId: UInt32) async throws {
        if currentDisplayId == displayId, currentStream != nil, streamFailureMessage == nil {
            return
        }

        try await stopStreamIfNeeded()

        let ensureStart = nowMs()
        let content = try await shareableContent()
        guard let display = findDisplay(displayId, in: content) else {
            throw ScreenshotError.displayNotFound(displayId)
        }

        currentGeneration &+= 1
        let generation = currentGeneration

        let config = SCStreamConfiguration()
        config.showsCursor = false
        config.minimumFrameInterval = CMTime(seconds: 1, preferredTimescale: 600)
        config.queueDepth = 1
        config.width = CGDisplayPixelsWide(displayId)
        config.height = CGDisplayPixelsHigh(displayId)

        let filter = SCContentFilter(
            display: display,
            excludingApplications: [],
            exceptingWindows: []
        )

        let queue = DispatchQueue(label: "memorylane.screenshot.stream.\(generation)")
        let outputHandler = StreamOutputHandler(displayId: displayId, generation: generation) { image, callbackDisplayId, callbackGeneration in
            Task {
                await self.receiveFrame(image: image, displayId: callbackDisplayId, generation: callbackGeneration)
            }
        }
        let delegateHandler = StreamDelegateHandler(displayId: displayId, generation: generation) { error, callbackDisplayId, callbackGeneration in
            Task {
                await self.handleStreamStopped(error: error, displayId: callbackDisplayId, generation: callbackGeneration)
            }
        }

        let stream = SCStream(filter: filter, configuration: config, delegate: delegateHandler)
        do {
            try stream.addStreamOutput(outputHandler, type: .screen, sampleHandlerQueue: queue)
        } catch {
            throw ScreenshotError.captureFailed("Could not attach SCStream output for display \(displayId): \(error.localizedDescription)")
        }

        currentDisplayId = displayId
        currentStream = stream
        currentOutputHandler = outputHandler
        currentDelegateHandler = delegateHandler
        currentSampleQueue = queue
        latestFrame = nil
        nextFrameSequence = 0
        lastServedFrameSequence = 0
        streamFailureMessage = nil

        do {
            let startCaptureStart = nowMs()
            try await stream.startCapture()
            debugLog("ensureStream startCapture \(Int(nowMs() - startCaptureStart))ms display=\(displayId) gen=\(generation)")
            debugLog("ensureStream total \(Int(nowMs() - ensureStart))ms display=\(displayId) gen=\(generation)")
        } catch {
            currentDisplayId = nil
            currentStream = nil
            currentOutputHandler = nil
            currentDelegateHandler = nil
            currentSampleQueue = nil
            latestFrame = nil
            streamFailureMessage = nil
            throw ScreenshotError.captureFailed("Could not start SCStream for display \(displayId): \(error.localizedDescription)")
        }
    }

    func waitForFreshFrame(for displayId: UInt32, timeoutMs: Int) async throws -> CachedFrame {
        let minSequence = lastServedFrameSequence &+ 1
        let start = nowMs()

        while true {
            if currentDisplayId != displayId || currentStream == nil {
                throw ScreenshotError.captureFailed("SCStream is not active for display \(displayId)")
            }

            if let streamFailureMessage {
                throw ScreenshotError.captureFailed("SCStream stopped for display \(displayId): \(streamFailureMessage)")
            }

            if let latestFrame, latestFrame.displayId == displayId, latestFrame.frameSequence >= minSequence {
                lastServedFrameSequence = latestFrame.frameSequence
                return latestFrame
            }

            if nowMs() - start >= Double(timeoutMs) {
                if let latestFrame, latestFrame.displayId == displayId {
                    let ageMs = Int(nowMs() - latestFrame.capturedAtMs)
                    debugLog(
                        "waitFreshFrame timeout using cached frame display=\(displayId) seq=\(latestFrame.frameSequence) age=\(ageMs)ms"
                    )
                    lastServedFrameSequence = latestFrame.frameSequence
                    return latestFrame
                }
                throw ScreenshotError.frameTimeout(
                    "No frame available for display \(displayId) within \(timeoutMs)ms"
                )
            }

            try await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    func shutdown() async {
        do {
            try await stopStreamIfNeeded()
        } catch {
            debugLog("shutdown stop stream error: \(error)")
        }
    }

    private func stopStreamIfNeeded() async throws {
        guard let stream = currentStream else {
            currentDisplayId = nil
            currentOutputHandler = nil
            currentDelegateHandler = nil
            currentSampleQueue = nil
            latestFrame = nil
            nextFrameSequence = 0
            lastServedFrameSequence = 0
            streamFailureMessage = nil
            return
        }

        currentStream = nil
        currentDisplayId = nil
        currentOutputHandler = nil
        currentDelegateHandler = nil
        currentSampleQueue = nil
        latestFrame = nil
        nextFrameSequence = 0
        lastServedFrameSequence = 0
        streamFailureMessage = nil

        do {
            try await stream.stopCapture()
        } catch {
            throw ScreenshotError.captureFailed("Could not stop SCStream cleanly: \(error.localizedDescription)")
        }
    }

    private func receiveFrame(image: CGImage, displayId: UInt32, generation: UInt64) {
        guard generation == currentGeneration, displayId == currentDisplayId else {
            return
        }

        nextFrameSequence &+= 1
        let frame = CachedFrame(
            image: image,
            displayId: displayId,
            capturedAtMs: nowMs(),
            frameSequence: nextFrameSequence
        )
        latestFrame = frame
        streamFailureMessage = nil
        debugLog("frame callback display=\(displayId) seq=\(frame.frameSequence) size=\(image.width)x\(image.height)")
    }

    private func handleStreamStopped(error: Error, displayId: UInt32, generation: UInt64) {
        guard generation == currentGeneration, displayId == currentDisplayId else {
            return
        }
        streamFailureMessage = error.localizedDescription
        currentStream = nil
        currentOutputHandler = nil
        currentDelegateHandler = nil
        currentSampleQueue = nil
        debugLog("stream stopped display=\(displayId) gen=\(generation): \(error.localizedDescription)")
    }
}

let sharedDisplayStreamManager = DisplayStreamManager()

func captureScreen(
    outputPath: String,
    requestedDisplayId: UInt32?,
    maxDimension: Int?
) async throws -> [String: Any] {
    let totalStart = nowMs()
    let displayId = try resolveDisplayId(requestedDisplayId)

    let ensureStreamStart = nowMs()
    try await sharedDisplayStreamManager.ensureStream(for: displayId)
    debugLog("ensureStream \(Int(nowMs() - ensureStreamStart))ms display=\(displayId)")

    let waitFrameStart = nowMs()
    let cachedFrame = try await sharedDisplayStreamManager.waitForFreshFrame(
        for: displayId,
        timeoutMs: helperFrameTimeoutMs
    )
    debugLog("waitFreshFrame \(Int(nowMs() - waitFrameStart))ms display=\(displayId) frameSeq=\(cachedFrame.frameSequence)")

    let resizeStart = nowMs()
    let image = try resizeIfNeeded(cachedFrame.image, maxDimension: maxDimension)
    debugLog("resize \(Int(nowMs() - resizeStart))ms display=\(displayId)")

    let writeStart = nowMs()
    try writePNG(image, to: outputPath)
    debugLog("writePNG \(Int(nowMs() - writeStart))ms output=\(outputPath)")
    debugLog("total \(Int(nowMs() - totalStart))ms display=\(displayId)")

    var payload: [String: Any] = [
        "status": "ok",
        "mode": "screen_only",
        "filepath": outputPath,
        "width": image.width,
        "height": image.height,
        "displayId": Int(displayId),
    ]
    if screenshotIncludeTestMeta {
        payload["helperPid"] = Int(ProcessInfo.processInfo.processIdentifier)
    }
    return payload
}

func intValue(_ any: Any?) -> Int? {
    guard let any else { return nil }
    if let n = any as? NSNumber { return n.intValue }
    if let s = any as? String { return Int(s) }
    return nil
}

func uint32Value(_ any: Any?) -> UInt32? {
    guard let any else { return nil }
    if let n = any as? NSNumber {
        let v = n.int64Value
        guard v >= 0 && v <= Int64(UInt32.max) else { return nil }
        return UInt32(v)
    }
    if let s = any as? String { return UInt32(s) }
    return nil
}

func parseServerRequest(_ line: String) throws -> [String: Any] {
    guard let data = line.data(using: .utf8) else {
        throw ScreenshotError.invalidRequest("Request was not valid UTF-8")
    }
    let json = try JSONSerialization.jsonObject(with: data)
    guard let dict = json as? [String: Any] else {
        throw ScreenshotError.invalidRequest("Request must be a JSON object")
    }
    return dict
}

func handleServerCommand(_ line: String) async -> Bool {
    let requestStart = nowMs()
    do {
        let request = try parseServerRequest(line)
        guard let type = request["type"] as? String else {
            throw ScreenshotError.invalidRequest("Missing request type")
        }

        switch type {
        case "capture":
            guard let outputPath = request["outputPath"] as? String, !outputPath.isEmpty else {
                throw ScreenshotError.invalidRequest("Missing outputPath")
            }

            let requestedDisplayId = uint32Value(request["displayId"])
            if request["displayId"] != nil && requestedDisplayId == nil {
                throw ScreenshotError.invalidRequest("Invalid displayId")
            }

            let maxDimension: Int?
            if request["maxDimensionPx"] != nil {
                guard let parsed = intValue(request["maxDimensionPx"]), parsed > 0 else {
                    throw ScreenshotError.invalidRequest("Invalid maxDimensionPx")
                }
                maxDimension = parsed
            } else {
                maxDimension = nil
            }

            debugLog("request parse \(Int(nowMs() - requestStart))ms type=capture")
            let response = try await captureScreen(
                outputPath: outputPath,
                requestedDisplayId: requestedDisplayId,
                maxDimension: maxDimension
            )
            emitJSON(response)
            return true

        case "ping":
            emitJSON([
                "status": "ok",
                "type": "pong",
                "helperPid": Int(ProcessInfo.processInfo.processIdentifier),
            ])
            return true

        case "quit":
            debugLog("quit requested")
            await sharedDisplayStreamManager.shutdown()
            return false

        default:
            throw ScreenshotError.invalidRequest("Unknown request type: \(type)")
        }
    } catch ScreenshotError.invalidRequest(let message) {
        emitErrorJSON(code: "invalid_request", message: message)
        return true
    } catch ScreenshotError.displayNotFound(let displayId) {
        emitErrorJSON(code: "display_not_found", message: "Display not found: \(displayId)")
        return true
    } catch ScreenshotError.frameTimeout(let message) {
        emitErrorJSON(code: "frame_timeout", message: message)
        return true
    } catch ScreenshotError.captureFailed(let message) {
        emitErrorJSON(code: "capture_failed", message: message)
        return true
    } catch ScreenshotError.saveFailed(let message) {
        emitErrorJSON(code: "save_failed", message: message)
        return true
    } catch {
        emitErrorJSON(code: "internal_error", message: "Unexpected error: \(error)")
        return true
    }
}

func runServerLoop() async {
    debugLog("server mode start pid=\(ProcessInfo.processInfo.processIdentifier)")
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            continue
        }
        let shouldContinue = await handleServerCommand(line)
        if !shouldContinue {
            break
        }
    }
    await sharedDisplayStreamManager.shutdown()
    debugLog("server mode exit")
}

func runOneShotCLI(args: [String]) async throws {
    let options = try parseOptions(args)

    guard let outputPath = options["--output"], !outputPath.isEmpty else {
        throw ScreenshotError.invalidArguments("Missing required --output")
    }

    let requestedDisplayId: UInt32?
    if let displayIdRaw = options["--display-id"] {
        guard let parsed = UInt32(displayIdRaw) else {
            throw ScreenshotError.invalidArguments("Invalid --display-id value: \(displayIdRaw)")
        }
        requestedDisplayId = parsed
    } else {
        requestedDisplayId = nil
    }

    let maxDimension: Int?
    if let maxDimensionRaw = options["--max-dimension"] {
        guard let parsed = Int(maxDimensionRaw), parsed > 0 else {
            throw ScreenshotError.invalidArguments("Invalid --max-dimension value: \(maxDimensionRaw)")
        }
        maxDimension = parsed
    } else {
        maxDimension = nil
    }

    emitJSON(
        try await captureScreen(
            outputPath: outputPath,
            requestedDisplayId: requestedDisplayId,
            maxDimension: maxDimension
        )
    )

    await sharedDisplayStreamManager.shutdown()
}

@main
struct ScreenshotCLI {
    static let usage = """
    Usage:
      screenshot.swift --output <path> [--display-id <id>] [--max-dimension <px>]
      screenshot.swift            # server mode (JSON lines over stdin/stdout)
    """

    static func main() async {
        setbuf(stdout, nil)
        setbuf(stderr, nil)

        let args = Array(CommandLine.arguments.dropFirst())
        if args.isEmpty {
            await runServerLoop()
            return
        }

        do {
            try await runOneShotCLI(args: args)
        } catch ScreenshotError.invalidArguments(let message) {
            fail(message + "\n\n" + Self.usage, exitCode: 2)
        } catch ScreenshotError.displayNotFound(let displayId) {
            fail("Display not found: \(displayId)")
        } catch ScreenshotError.frameTimeout(let message) {
            fail(message)
        } catch ScreenshotError.captureFailed(let message) {
            fail(message)
        } catch ScreenshotError.saveFailed(let message) {
            fail(message)
        } catch {
            fail("Unexpected error: \(error)")
        }
    }
}
