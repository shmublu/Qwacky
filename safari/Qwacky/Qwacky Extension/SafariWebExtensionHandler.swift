//
//  SafariWebExtensionHandler.swift
//  Qwacky Extension
//
//  Bridges `browser.runtime.sendNativeMessage` from JS into iCloud
//  key-value storage, so chrome.storage.sync can roam across the user's
//  Apple ID-signed-in Macs. iCloud KVS is free (no paid Apple Developer
//  Program required), encrypted by iCloud, and gives us 1 MB / 1024 keys,
//  / 1 MB per key — plenty for Qwacky's alias lists and account metadata.
//
//  Protocol — all messages are JSON dictionaries:
//    { "action": "get",    "key": "..." }            -> { "value": <any|null> }
//    { "action": "getAll" }                          -> { "items": { k: v, ... } }
//    { "action": "set",    "key": "...", "value": ... } -> { "ok": true }
//    { "action": "remove", "key": "..." }            -> { "ok": true }
//    { "action": "clear" }                           -> { "ok": true }
//    { "action": "bytes" }                           -> { "bytes": <int>, "quota": 1048576 }
//
//  If the iCloud KVS entitlement is missing (capability not enabled in
//  Xcode), the store still works locally as a no-op stand-in — the
//  extension stays functional, sync just doesn't cross devices.
//

import SafariServices
import Foundation
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = item?.userInfo?[SFExtensionMessageKey]
        } else {
            message = item?.userInfo?["message"]
        }

        let response = handle(message)

        let out = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            out.userInfo = [SFExtensionMessageKey: response]
        } else {
            out.userInfo = ["message": response]
        }
        context.completeRequest(returningItems: [out], completionHandler: nil)
    }

    // MARK: - Message dispatch

    private func handle(_ message: Any?) -> [String: Any] {
        guard let dict = message as? [String: Any],
              let action = dict["action"] as? String else {
            return ["error": "missing or invalid action"]
        }

        let store = NSUbiquitousKeyValueStore.default
        store.synchronize()

        switch action {
        case "get":
            guard let key = dict["key"] as? String else { return ["error": "missing key"] }
            return ["value": store.object(forKey: key) ?? NSNull()]

        case "getAll":
            return ["items": store.dictionaryRepresentation]

        case "set":
            guard let key = dict["key"] as? String, let value = dict["value"] else {
                return ["error": "missing key or value"]
            }
            store.set(value, forKey: key)
            store.synchronize()
            return ["ok": true]

        case "remove":
            guard let key = dict["key"] as? String else { return ["error": "missing key"] }
            store.removeObject(forKey: key)
            store.synchronize()
            return ["ok": true]

        case "clear":
            for key in store.dictionaryRepresentation.keys {
                store.removeObject(forKey: key)
            }
            store.synchronize()
            return ["ok": true]

        case "bytes":
            // NSUbiquitousKeyValueStore doesn't expose a "bytes used" API; we
            // estimate by re-encoding the dictionary representation as JSON.
            let bytes = byteSize(of: store.dictionaryRepresentation)
            return ["bytes": bytes, "quota": 1_048_576]

        default:
            os_log(.default, "Qwacky: unknown action %@", action)
            return ["error": "unknown action: \(action)"]
        }
    }

    private func byteSize(of dict: [String: Any]) -> Int {
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: []) else {
            return 0
        }
        return data.count
    }
}
