<p align="center">
  <img src="assets/icons/qwacky.png" alt="Qwacky Logo" width="128" height="128">
</p>

<p align="center">
  <a href="#what-is-this">What is this?</a> &nbsp;•&nbsp;
  <a href="#install">Install</a> &nbsp;•&nbsp;
  <a href="#features">Features</a> &nbsp;•&nbsp;
  <a href="#permissions">Permissions</a> &nbsp;•&nbsp;
  <a href="#development">Development</a> &nbsp;•&nbsp;
  <a href="#credits">Credits</a>
</p>

# Qwacky for Safari

A lightweight client for **DuckDuckGo Email Protection** — generate and manage `@duck.com` aliases without installing the full DuckDuckGo extension.

This is a Safari (macOS) port of [Lanshuns/Qwacky](https://github.com/Lanshuns/Qwacky). The Chrome and Firefox builds in this fork still work and remain at upstream feature parity.

## What is this?

[DuckDuckGo Email Protection](https://duckduckgo.com/email) is a great service. Using it on Safari normally requires the full DuckDuckGo extension, which changes your default search engine and bundles tracker protection you may not want. Qwacky strips it down to just the email-alias workflow.

The Safari port adds:
- A native Safari Web Extension (macOS), packaged as a small host app.
- Bitwarden / 1Password coexistence — alias generation copies to the clipboard via a click-to-copy banner instead of typing into the focused field, so your password manager keeps owning the save-credentials flow.
- A `safari` build target alongside the existing `chrome` / `firefox` ones.

## Install

### Safari (macOS) — build locally

Safari requires extensions to be packaged in a native macOS app and code-signed. Until there's a Mac App Store listing, you build and sign it yourself with a free Apple ID — this takes ~5 minutes.

1. Install **Xcode** (full app from the Mac App Store, not just Command Line Tools).
2. After Xcode installs, run once:
   ```bash
   sudo xcodebuild -runFirstLaunch
   ```
3. Clone, install, build, generate the Xcode project:
   ```bash
   git clone git@github.com:shmublu/Qwacky.git
   cd Qwacky
   git checkout safari
   npm install
   npm run build:safari
   npm run safari:convert
   ```
4. Open the project in Xcode:
   ```bash
   open safari/Qwacky/Qwacky.xcodeproj
   ```
5. In Xcode, set signing on **both** targets (Qwacky + Qwacky Extension):
   - Project navigator (blue icon) → target → **Signing & Capabilities**.
   - Check **Automatically manage signing**, pick your Personal Team. If empty, add your Apple ID via **Xcode → Settings → Accounts**.
6. Press **⌘R** to build and run. A small "Qwacky" window will open — you can close it.
7. Enable the extension in Safari:
   1. Safari → Settings → Advanced → check **Show features for web developers**.
   2. Develop → Developer Settings → check **Allow unsigned extensions**. ⚠️ Resets every time you quit Safari.
   3. Safari → Settings → Extensions → toggle on **Qwacky**.
   4. Click the puzzle-piece icon in Safari's toolbar → pin Qwacky.
8. Optional — set a keyboard shortcut (see [Behavior differences on Safari](#behavior-differences-on-safari) below for the version-dependent steps). Avoid `Option+anything-letter` on Mac because Option emits Unicode characters (e.g. Option+Shift+Q types `⅝`, not a shortcut). Safe choices: `Cmd+Shift+E`, `Ctrl+Cmd+Q`, or `Cmd+Shift+9`.

### Chrome / Firefox

Use the upstream store listings — those builds in this fork track upstream feature parity but the canonical releases live there:
- [Qwacky on the Chrome Web Store](https://chromewebstore.google.com/detail/qwacky/kieehbhdbincplacegpjdkoglfakboeo)
- [Qwacky on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/qwacky/)

## Features

- Generate and manage private `@duck.com` aliases.
- Multiple DDG accounts, switch with one click.
- Reverse aliases (turn any address into a sendable duck alias).
- Notes and tags per alias, with search and filtering.
- Cross-device sync of aliases, reverse aliases, and session data via the browser's built-in sync (Chrome/Firefox only — see Safari notes below).
- Backup / restore (selective per account).
- Keyboard shortcut and right-click context menu for quick alias generation. The generated alias is tagged with the originating site as a note, e.g. `github.com`.

### Behavior differences on Safari

- **Click-to-copy banner** instead of input fill. On Chrome and Firefox the shortcut and context menu type the alias into the focused input. On Safari, they show a small banner in the top-right with the alias; clicking it copies to the clipboard. This is deliberate so password managers (Bitwarden, 1Password, iCloud Keychain) still own the save-credentials flow.
- **Keyboard shortcut needs to be assigned manually.** Safari ignores `suggested_key` in the manifest. On **Safari 26+ (macOS Tahoe)** you can bind it under Safari → Settings → Extensions → Qwacky → Keyboard Shortcuts. On **Safari 17/18** there is no built-in GUI for extension shortcuts — use **System Settings → Keyboard → Keyboard Shortcuts → App Shortcuts → +**, pick Safari, and enter the exact menu-item title `Generate and fill duck address`. Until you bind one, use the toolbar icon's **Generate** button.
- **Host permission is time-of-use.** Safari prompts for `quack.duckduckgo.com` access the first time the extension actually calls DDG, not at install time.
- **Cross-device sync is disabled on Safari.** Safari's `storage.sync` is local-only (it doesn't route to iCloud), so your aliases stay on the current Mac. Use Settings → Backup to roam between machines manually. A future version may add CloudKit sync via the host app.

## Permissions

Required:
- `storage` — store aliases, settings, and the access token locally.

Optional (granted only when you enable the Autofill toggle in Settings):
- `contextMenus`, `activeTab`, `scripting` — for the right-click and keyboard-shortcut generators.
- `clipboardWrite` — for copy-to-clipboard.

Host permission:
- `https://quack.duckduckgo.com/*` — the DDG API endpoint. Granted at install time on Chrome/Firefox, time-of-use on Safari.

All data stays on your device. No telemetry, no analytics.

## Development

Requires Node 18+ and npm 9+. macOS for the Safari target.

```bash
git clone git@github.com:shmublu/Qwacky.git
cd Qwacky
git checkout safari
npm install
```

Build any target:

```bash
npm run build           # Chrome  -> dist_chrome/
npm run build:firefox   # Firefox -> dist_firefox/
npm run build:safari    # Safari  -> dist_safari/
```

Watch mode (rebuilds on save):

```bash
npm run dev             # Chrome
npm run dev:firefox     # Firefox
npm run dev:safari      # Safari
```

Safari-specific scripts:

```bash
npm run safari:convert  # Regenerate the Xcode wrapper (only when manifest/layout changes)
npm run safari:sync     # rsync dist_safari/ into the Xcode project's Resources/ folder
npm run safari          # build:safari + safari:sync (typical dev loop)
```

Typical Safari iteration loop:
1. Edit a file under `src/`.
2. `npm run safari` — rebuilds JS and copies it into the Xcode project.
3. In Xcode, **Product → Clean Build Folder** (⌘⇧K) then **⌘R**.
4. Quit and reopen Safari (it caches extension code).

### Project layout

```
src/                            Web-extension source (TS + Preact via react alias)
  background.ts                 Service worker
  contentScript.ts              Page-side fill/copy banner
  bypassExtensionRequirement.ts MAIN-world fetch sniffer for auto-login
  ddgEmailAuth.ts               ISOLATED-world bridge for the sniffer
  pages/                        Popup pages (Login, OTP, Dashboard, Settings, ...)
  services/                     DDG API, storage, sync, import/export
  context/                      React contexts (app state, permissions)
manifest.chrome.json
manifest.firefox.json
manifest.safari.json
vite.config.ts                  Builds 3 targets with the same source
safari/                         Generated Xcode project (host app + extension)
```

## Credits

This fork is built on top of [Lanshuns/Qwacky](https://github.com/Lanshuns/Qwacky) — the entire popup UI, alias workflow, sync, and DDG API integration are upstream. The Safari port adds packaging, build-target plumbing, Preact swap for popup cold-start, and a handful of Safari-specific reliability fixes.

Issues with the **Safari port** specifically: [shmublu/Qwacky/issues](https://github.com/shmublu/Qwacky/issues).
Issues with the **upstream** Chrome/Firefox app: [Lanshuns/Qwacky/issues](https://github.com/Lanshuns/Qwacky/issues).

Donations to the **upstream** maintainer (who built the app): see the [Lanshuns/Qwacky README](https://github.com/Lanshuns/Qwacky#-support-the-project).

This project is a derivative work based on DuckDuckGo's Email Protection service, licensed under the Apache License 2.0.
Copyright (c) 2010-2021 Duck Duck Go, Inc. — see [APACHE-LICENSE](https://github.com/duckduckgo/duckduckgo-privacy-extension/blob/main/LICENSE.md).
