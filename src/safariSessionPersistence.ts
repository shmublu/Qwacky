// Safari periodically evicts a web extension's storage.local (the 7-day
// script-writable-storage cap plus general WebKit website-data eviction).
// That wipes the DDG session (access_token + user_data + accounts) — logging
// the user out — and drops the local address cache.
//
// storage.sync on Safari is routed through the native host to the iCloud file
// (see safariSyncShim.ts + SafariWebExtensionHandler.swift), which is NOT
// subject to that eviction. We mirror the session there and restore it on
// cold start, so an eviction no longer logs the user out. Addresses already
// ride the existing sync path and repopulate once user_data is restored.
//
// This is intentionally independent of the user-facing Sync feature
// (SyncService / options.session): it always runs on Safari, uses its own
// key, and restores silently for the same device (no "new account" prompt).
//
// Security note: the mirrored blob includes each account's access_token, so
// the DDG bearer token lands in the iCloud sync store in plaintext — the same
// exposure the opt-in session sync already has. That is the unavoidable cost
// of surviving eviction without a fresh OTP login.

declare const browser: typeof chrome

const isSafari = (): boolean => process.env.BROWSER === 'safari'
const api = (): typeof chrome => (typeof browser !== 'undefined' ? browser : chrome)

const SESSION_KEY = 'safari_session'
const DEBOUNCE_MS = 1_000

interface Account {
  userData: any
  username: string
  lastUsed: number
}

interface SafariSession {
  version: 1
  accounts: Account[]
  currentAccount: string
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

// Debounced mirror of the current local session into the iCloud-backed sync
// store. Never writes an empty session over a good backup.
export const persistSafariSession = (): void => {
  if (!isSafari()) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    persistTimer = null
    try {
      const local = await api().storage.local.get(['accounts', 'currentAccount'])
      const accounts: Account[] = Array.isArray(local.accounts) ? local.accounts : []
      if (accounts.length === 0) return // don't clobber the backup with an empty session
      const session: SafariSession = {
        version: 1,
        accounts,
        currentAccount: local.currentAccount || '',
      }
      await api().storage.sync.set({ [SESSION_KEY]: session })
    } catch (err) {
      console.error('Safari session persist failed (non-fatal):', err)
    }
  }, DEBOUNCE_MS)
}

// If local has no live session but the iCloud store does, rehydrate local.
// Returns true when it restored something. No-op (and false) off Safari.
export const restoreSafariSessionIfNeeded = async (): Promise<boolean> => {
  if (!isSafari()) return false
  try {
    const local = await api().storage.local.get(['accounts', 'currentAccount', 'user_data'])
    const hasLiveSession =
      (Array.isArray(local.accounts) && local.accounts.length > 0) || !!local.user_data
    if (hasLiveSession) return false

    const synced = await api().storage.sync.get(SESSION_KEY)
    const session: SafariSession | undefined = synced?.[SESSION_KEY]
    if (!session || !Array.isArray(session.accounts) || session.accounts.length === 0) {
      return false
    }

    const current =
      session.accounts.find(a => a.username === session.currentAccount) || session.accounts[0]

    const updates: Record<string, any> = {
      accounts: session.accounts,
      currentAccount: current.username,
    }
    if (current?.userData) {
      updates.user_data = current.userData
      updates.access_token = current.userData.user?.access_token
      updates.loginState = 'dashboard'
    }
    await api().storage.local.set(updates)
    return true
  } catch (err) {
    console.error('Safari session restore failed (non-fatal):', err)
    return false
  }
}

// Re-mirror whenever the local session changes (login, account switch, token
// refresh). Registered once from the background service worker.
export const installSafariSessionMirror = (): void => {
  if (!isSafari()) return
  api().storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes.accounts || changes.currentAccount || changes.user_data) {
      persistSafariSession()
    }
  })
}
