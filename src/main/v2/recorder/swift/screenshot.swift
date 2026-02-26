import Cocoa
import CoreMedia
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

setbuf(stdout, nil)
setbuf(stderr, nil)

enum ScreenshotError: Error {
    case invalidArguments(String)
    case displayNotFound(UInt32)
    case captureFailed(String)
    case saveFailed(String)
}

func emitJSON(_ payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else {
        fputs("Failed to encode JSON payload\n", stderr)
        exit(1)
    }
    print(json)
}

func fail(_ message: String, exitCode: Int32 = 1) -> Never {
    fputs("\(message)\n", stderr)
    exit(exitCode)
}

func ensureOutputDirectory(for outputPath: String) throws {
    let outputURL = URL(fileURLWithPath: outputPath)
    let directoryURL = outputURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(
        at: directoryURL,
        withIntermediateDirectories: true
    )
}

// MARK: - Image Writing

func writeImage(_ image: CGImage, to outputPath: String, format: String, quality: Int) throws {
    try ensureOutputDirectory(for: outputPath)
    let outputURL = URL(fileURLWithPath: outputPath)

    let utType: UTType
    var properties: [CFString: Any]? = nil

    if format == "jpeg" {
        utType = .jpeg
        properties = [kCGImageDestinationLossyCompressionQuality: Double(quality) / 100.0]
    } else {
        utType = .png
    }

    guard let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        utType.identifier as CFString,
        1,
        nil
    ) else {
        throw ScreenshotError.saveFailed("Could not create image destination for \(outputPath)")
    }

    CGImageDestinationAddImage(destination, image, properties as CFDictionary?)
    guard CGImageDestinationFinalize(destination) else {
        throw ScreenshotError.saveFailed("Could not finalize image write to \(outputPath)")
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

    context.interpolationQuality = .medium
    context.draw(image, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))

    guard let resized = context.makeImage() else {
        throw ScreenshotError.captureFailed("Could not generate resized screenshot")
    }

    return resized
}

func listActiveDisplays() throws -> [CGDirectDisplayID] {
    var count: UInt32 = 0
    var status = CGGetActiveDisplayList(0, nil, &count)
    guard status == .success else {
        throw ScreenshotError.captureFailed("CGGetActiveDisplayList(count) failed: \(status.rawValue)")
    }

    guard count > 0 else {
        throw ScreenshotError.captureFailed("No active displays available")
    }

    var displays = Array(repeating: CGDirectDisplayID(), count: Int(count))
    status = CGGetActiveDisplayList(count, &displays, &count)
    guard status == .success else {
        throw ScreenshotError.captureFailed("CGGetActiveDisplayList(list) failed: \(status.rawValue)")
    }

    return Array(displays.prefix(Int(count)))
}

func resolveDisplayId(_ requestedDisplayId: UInt32?) throws -> CGDirectDisplayID {
    let displays = try listActiveDisplays()

    if let requestedDisplayId {
        if let display = displays.first(where: { $0 == requestedDisplayId }) {
            return display
        }
        throw ScreenshotError.displayNotFound(requestedDisplayId)
    }

    let mainDisplayId = CGMainDisplayID()
    if let mainDisplay = displays.first(where: { $0 == mainDisplayId }) {
        return mainDisplay
    }

    return displays[0]
}

// MARK: - ScreenCaptureKit Daemon

actor FrameCache {
    private var latestImage: CGImage? = nil

    func update(_ image: CGImage) {
        latestImage = image
    }

    func get() -> CGImage? {
        return latestImage
    }

    func clear() {
        latestImage = nil
    }
}

class StreamOutputDelegate: NSObject, SCStreamOutput {
    let frameCache: FrameCache

    init(frameCache: FrameCache) {
        self.frameCache = frameCache
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let ciImage = CIImage(cvImageBuffer: imageBuffer)
        let context = CIContext()
        let width = CVPixelBufferGetWidth(imageBuffer)
        let height = CVPixelBufferGetHeight(imageBuffer)
        guard let cgImage = context.createCGImage(ciImage, from: CGRect(x: 0, y: 0, width: width, height: height)) else {
            return
        }

        Task {
            await frameCache.update(cgImage)
        }
    }
}

class DaemonCapture {
    let frameCache = FrameCache()
    private var stream: SCStream? = nil
    private var outputDelegate: StreamOutputDelegate? = nil
    private var currentDisplayId: CGDirectDisplayID? = nil

    func ensureStream(displayId: CGDirectDisplayID) async throws {
        if currentDisplayId == displayId && stream != nil {
            return
        }

        // Tear down existing stream
        await stopStream()

        let content = try await SCShareableContent.current
        guard let display = content.displays.first(where: { $0.displayID == displayId }) else {
            throw ScreenshotError.displayNotFound(displayId)
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()
        config.width = display.width * 2 // Retina
        config.height = display.height * 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps
        config.showsCursor = false
        config.pixelFormat = kCVPixelFormatType_32BGRA

        let newStream = SCStream(filter: filter, configuration: config, delegate: nil)
        let delegate = StreamOutputDelegate(frameCache: frameCache)
        try newStream.addStreamOutput(delegate, type: .screen, sampleHandlerQueue: DispatchQueue(label: "com.memorylane.screenshot.daemon"))
        try await newStream.startCapture()

        self.stream = newStream
        self.outputDelegate = delegate
        self.currentDisplayId = displayId
    }

    func stopStream() async {
        if let stream = self.stream {
            try? await stream.stopCapture()
        }
        self.stream = nil
        self.outputDelegate = nil
        self.currentDisplayId = nil
        await frameCache.clear()
    }

    func captureFrame(
        outputPath: String,
        displayId: CGDirectDisplayID,
        maxDimension: Int?,
        format: String,
        quality: Int
    ) async throws -> [String: Any] {
        try await ensureStream(displayId: displayId)

        // Wait briefly for a frame if cache is empty (first capture after stream start)
        var image: CGImage? = await frameCache.get()
        if image == nil {
            for _ in 0..<20 {
                try await Task.sleep(nanoseconds: 100_000_000) // 100ms
                image = await frameCache.get()
                if image != nil { break }
            }
        }

        guard let capturedImage = image else {
            throw ScreenshotError.captureFailed("No frame available from ScreenCaptureKit stream after 2s")
        }

        let resized = try resizeIfNeeded(capturedImage, maxDimension: maxDimension)
        try writeImage(resized, to: outputPath, format: format, quality: quality)

        return [
            "status": "ok",
            "filepath": outputPath,
            "width": resized.width,
            "height": resized.height,
            "displayId": Int(displayId),
        ]
    }
}

func runDaemon() async {
    let daemon = DaemonCapture()

    while let lineData = readLine(strippingNewline: true) {
        // Parse JSON command from stdin
        guard let data = lineData.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            emitJSON(["status": "error", "error": "Invalid JSON input"])
            continue
        }

        guard let outputPath = json["output"] as? String, !outputPath.isEmpty else {
            emitJSON(["status": "error", "error": "Missing required 'output' field"])
            continue
        }

        let requestedDisplayId = json["displayId"] as? UInt32
        let maxDimension = json["maxDimension"] as? Int
        let format = (json["format"] as? String) ?? "jpeg"
        let quality = (json["quality"] as? Int) ?? 80

        do {
            let displayId = try resolveDisplayId(requestedDisplayId)
            let result = try await daemon.captureFrame(
                outputPath: outputPath,
                displayId: displayId,
                maxDimension: maxDimension,
                format: format,
                quality: quality
            )
            emitJSON(result)
        } catch {
            emitJSON(["status": "error", "error": "\(error)"])
        }
    }

    // stdin closed — shut down cleanly
    await daemon.stopStream()
}

// MARK: - Entry point

let semaphore = DispatchSemaphore(value: 0)
Task {
    await runDaemon()
    semaphore.signal()
}
semaphore.wait()
