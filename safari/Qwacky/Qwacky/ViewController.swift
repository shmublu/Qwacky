//
//  ViewController.swift
//  Qwacky
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "com.shmublu.Qwacky.Extension"
let appGroupID = "group.com.shmublu.Qwacky"
let bookmarkKey = "syncFolderBookmark"
let pathKey = "syncFolderPath"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self

        let cc = webView.configuration.userContentController
        cc.add(self, name: "controller")
        cc.add(self, name: "pickSyncFolder")
        cc.add(self, name: "clearSyncFolder")

        webView.loadFileURL(
            Bundle.main.url(forResource: "Main", withExtension: "html")!,
            allowingReadAccessTo: Bundle.main.resourceURL!
        )
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, error in
            guard let state = state, error == nil else { return }
            DispatchQueue.main.async {
                let useSettings: Bool = {
                    if #available(macOS 13, *) { return true } else { return false }
                }()
                webView.evaluateJavaScript("show(\(state.isEnabled), \(useSettings))")
                self.refreshSyncFolderUI()
            }
        }
    }

    private func refreshSyncFolderUI() {
        let path = UserDefaults(suiteName: appGroupID)?.string(forKey: pathKey) ?? ""
        let json = (try? String(data: JSONSerialization.data(withJSONObject: path, options: [.fragmentsAllowed]), encoding: .utf8)) ?? "\"\""
        webView.evaluateJavaScript("setSyncFolder(\(json))")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "controller":
            if let body = message.body as? String, body == "open-preferences" {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in
                    DispatchQueue.main.async { NSApplication.shared.terminate(nil) }
                }
            }
        case "pickSyncFolder":
            pickSyncFolder()
        case "clearSyncFolder":
            clearSyncFolder()
        default:
            break
        }
    }

    private func pickSyncFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.message = "Pick a folder for Qwacky sync. Choose a folder inside iCloud Drive to sync your aliases across Macs."
        panel.prompt = "Use This Folder"

        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                let bookmark = try url.bookmarkData(
                    options: [.withSecurityScope],
                    includingResourceValuesForKeys: nil,
                    relativeTo: nil
                )
                let defaults = UserDefaults(suiteName: appGroupID)
                defaults?.set(bookmark, forKey: bookmarkKey)
                defaults?.set(url.path, forKey: pathKey)
                self.refreshSyncFolderUI()
            } catch {
                let alert = NSAlert(error: error)
                alert.runModal()
            }
        }
    }

    private func clearSyncFolder() {
        let defaults = UserDefaults(suiteName: appGroupID)
        defaults?.removeObject(forKey: bookmarkKey)
        defaults?.removeObject(forKey: pathKey)
        refreshSyncFolderUI()
    }
}

