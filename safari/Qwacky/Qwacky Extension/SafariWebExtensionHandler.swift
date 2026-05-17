//
//  SafariWebExtensionHandler.swift
//  Qwacky Extension
//
//  Bridges browser.runtime.sendNativeMessage from JS into one of three
//  storage backends, in priority order:
//
//   1. iCloud Key-Value Storage  — fastest, automatic sync across all
//      iCloud-signed-in Macs. Requires the iCloud KVS entitlement which
//      Apple gates behind a paid Apple Developer Program membership.
//
//   2. iCloud Drive file         — the user picks a folder in the host
//      app (typically inside iCloud Drive). The extension reads/writes a
//      single JSON file there; iCloud Drive syncs the file across Macs.
//      Works with any free Apple ID. Requires App Groups + user-selected
//      file access entitlements (both free).
//
//   3. Local UserDefaults        — no cross-device sync. Used when
//      neither of the above is configured. The extension still works.
//
//  Protocol — all messages are JSON dictionaries:
//    { "action": "get",    "key": "..." }                  -> { "value": <any|null>, "backend": ... }
//    { "action": "getAll" }                                -> { "items": { k: v, ... }, "backend": ... }
//    { "action": "set",    "key": "...", "value": ... }    -> { "ok": true }
//    { "action": "remove", "key": "..." }                  -> { "ok": true }
//    { "action": "clear" }                                 -> { "ok": true }
//    { "action": "bytes" }                                 -> { "bytes": <int>, "quota": <int> }
//    { "action": "backend" }                               -> { "backend": "icloud-kvs"|"icloud-file"|"local" }
//

import SafariServices
import Foundation
import os.log

private let appGroupID = "group.com.shmublu.Qwacky"
private let bookmarkKey = "syncFolderBookmark"
private let syncFileName = "qwacky-sync.json"

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = item?.userInfo?[SFExtensionMessageKey]
        } else {
            message = item?.userInfo?["message"]
        }

        let response = dispatch(message)

        let out = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            out.userInfo = [SFExtensionMessageKey: response]
        } else {
            out.userInfo = ["message": response]
        }
        context.completeRequest(returningItems: [out], completionHandler: nil)
    }

    private func dispatch(_ message: Any?) -> [String: Any] {
        guard let dict = message as? [String: Any],
              let action = dict["action"] as? String else {
            return ["error": "missing or invalid action"]
        }
        let backend = chooseBackend()
        return backend.handle(action: action, args: dict)
    }

    // Re-chosen on every request so toggling the iCloud capability or
    // picking a sync folder takes effect without rebuilding the extension.
    private func chooseBackend() -> SyncBackend {
        if let kvs = ICloudKVSBackend.tryInit() { return kvs }
        if let file = ICloudFileBackend.tryInit() { return file }
        return LocalBackend()
    }
}

// MARK: - Backend protocol

private protocol SyncBackend {
    var name: String { get }
    func handle(action: String, args: [String: Any]) -> [String: Any]
}

private func jsonByteSize(_ value: Any) -> Int {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value) else { return 0 }
    return data.count
}

// MARK: - iCloud Key-Value Storage (paid Apple Developer Program)

private final class ICloudKVSBackend: SyncBackend {
    let name = "icloud-kvs"
    private let store = NSUbiquitousKeyValueStore.default

    static func tryInit() -> ICloudKVSBackend? {
        // NSUbiquitousKeyValueStore returns nil/empty when the iCloud KVS
        // entitlement is missing. ubiquityIdentityToken is non-nil when the
        // user is signed into iCloud, which is necessary but not sufficient.
        guard FileManager.default.ubiquityIdentityToken != nil else { return nil }
        let store = NSUbiquitousKeyValueStore.default
        // Best-effort: if the entitlement is missing, .synchronize() returns
        // false. We treat false as "entitlement absent" and fall through.
        if !store.synchronize() { return nil }
        return ICloudKVSBackend()
    }

    func handle(action: String, args: [String: Any]) -> [String: Any] {
        store.synchronize()
        switch action {
        case "get":
            guard let key = args["key"] as? String else { return ["error": "missing key"] }
            return ["value": store.object(forKey: key) ?? NSNull(), "backend": name]
        case "getAll":
            return ["items": store.dictionaryRepresentation, "backend": name]
        case "set":
            guard let key = args["key"] as? String, let value = args["value"] else { return ["error": "missing key or value"] }
            store.set(value, forKey: key)
            store.synchronize()
            return ["ok": true]
        case "remove":
            guard let key = args["key"] as? String else { return ["error": "missing key"] }
            store.removeObject(forKey: key)
            store.synchronize()
            return ["ok": true]
        case "clear":
            for k in store.dictionaryRepresentation.keys { store.removeObject(forKey: k) }
            store.synchronize()
            return ["ok": true]
        case "bytes":
            return ["bytes": jsonByteSize(store.dictionaryRepresentation), "quota": 1_048_576]
        case "backend":
            return ["backend": name]
        default:
            return ["error": "unknown action: \(action)"]
        }
    }
}

// MARK: - iCloud Drive file (free Apple ID, user-picked folder)

private final class ICloudFileBackend: SyncBackend {
    let name = "icloud-file"
    private let fileURL: URL
    private let folderURL: URL

    static func tryInit() -> ICloudFileBackend? {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let bookmark = defaults.data(forKey: bookmarkKey) else { return nil }
        var isStale = false
        guard let url = try? URL(
                resolvingBookmarkData: bookmark,
                options: .withSecurityScope,
                relativeTo: nil,
                bookmarkDataIsStale: &isStale),
              url.startAccessingSecurityScopedResource() else {
            return nil
        }
        return ICloudFileBackend(folder: url)
    }

    private init(folder: URL) {
        self.folderURL = folder
        self.fileURL = folder.appendingPathComponent(syncFileName)
    }

    deinit { folderURL.stopAccessingSecurityScopedResource() }

    private func readAll() -> [String: Any] {
        guard FileManager.default.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return json
    }

    private func writeAll(_ items: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: items, options: [.sortedKeys]) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }

    func handle(action: String, args: [String: Any]) -> [String: Any] {
        var items = readAll()
        switch action {
        case "get":
            guard let key = args["key"] as? String else { return ["error": "missing key"] }
            return ["value": items[key] ?? NSNull(), "backend": name]
        case "getAll":
            return ["items": items, "backend": name]
        case "set":
            guard let key = args["key"] as? String, let value = args["value"] else { return ["error": "missing key or value"] }
            items[key] = value
            writeAll(items)
            return ["ok": true]
        case "remove":
            guard let key = args["key"] as? String else { return ["error": "missing key"] }
            items.removeValue(forKey: key)
            writeAll(items)
            return ["ok": true]
        case "clear":
            items.removeAll()
            writeAll(items)
            return ["ok": true]
        case "bytes":
            return ["bytes": jsonByteSize(items), "quota": 1_048_576]
        case "backend":
            return ["backend": name]
        default:
            return ["error": "unknown action: \(action)"]
        }
    }
}

// MARK: - Local UserDefaults (fallback, no sync)

private final class LocalBackend: SyncBackend {
    let name = "local"
    private let defaults = UserDefaults.standard
    private let prefix = "qwacky.sync."

    private func entries() -> [String: Any] {
        var out: [String: Any] = [:]
        for (k, v) in defaults.dictionaryRepresentation() where k.hasPrefix(prefix) {
            out[String(k.dropFirst(prefix.count))] = v
        }
        return out
    }

    func handle(action: String, args: [String: Any]) -> [String: Any] {
        switch action {
        case "get":
            guard let key = args["key"] as? String else { return ["error": "missing key"] }
            return ["value": defaults.object(forKey: prefix + key) ?? NSNull(), "backend": name]
        case "getAll":
            return ["items": entries(), "backend": name]
        case "set":
            guard let key = args["key"] as? String, let value = args["value"] else { return ["error": "missing key or value"] }
            defaults.set(value, forKey: prefix + key)
            return ["ok": true]
        case "remove":
            guard let key = args["key"] as? String else { return ["error": "missing key"] }
            defaults.removeObject(forKey: prefix + key)
            return ["ok": true]
        case "clear":
            for k in defaults.dictionaryRepresentation().keys where k.hasPrefix(prefix) {
                defaults.removeObject(forKey: k)
            }
            return ["ok": true]
        case "bytes":
            return ["bytes": jsonByteSize(entries()), "quota": 0]
        case "backend":
            return ["backend": name]
        default:
            return ["error": "unknown action: \(action)"]
        }
    }
}
