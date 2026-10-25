import AppKit
import Foundation

// Reuse the workbench's wave mark; no external artwork or font files.
let fm = FileManager.default
let destination = URL(fileURLWithPath: "assets/icon.iconset")
try fm.createDirectory(at: destination, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
          bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
          colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        let transform = NSAffineTransform()
        transform.scale(by: CGFloat(pixels) / 1024)
        transform.concat()
        NSColor(calibratedRed: 54/255, green: 93/255, blue: 196/255, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 76, y: 76, width: 872, height: 872), xRadius: 200, yRadius: 200).fill()
        NSColor.white.setFill()
        for (i, height) in [240, 440, 340, 240].enumerated() {
            NSBezierPath(roundedRect: NSRect(x: 300 + i * 120, y: (1024-height)/2, width: 60, height: height), xRadius: 30, yRadius: 30).fill()
        }
        NSGraphicsContext.restoreGraphicsState()
        let suffix = scale == 2 ? "@2x" : ""
        try rep.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
        if pixels == 1024 { try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "assets/icon.png")) }
    }
}
let task = Process()
task.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
task.arguments = ["-c", "icns", "assets/icon.iconset", "-o", "assets/icon.icns"]
try task.run()
task.waitUntilExit()
if task.terminationStatus != 0 { exit(task.terminationStatus) }
try fm.removeItem(at: destination)
