// On Safari, chrome.storage.sync is local-only — it does not roam between the
// user's Macs. This shim replaces chrome.storage.sync with a wrapper that
// routes through browser.runtime.sendNativeMessage to the host app's
// SafariWebExtensionHandler, which is backed by either iCloud KVS or a
// user-picked iCloud Drive folder (see SafariWebExtensionHandler.swift).
//
// We preserve chrome.storage.sync's API surface (get/set/remove/clear/
// getBytesInUse/QUOTA_BYTES) so the existing SyncService code keeps working
// unchanged.
//
// Two reliability rules:
//   1. Every native-messaging call has a hard timeout. If sendNativeMessage
//      ever stops resolving (e.g. when the host app isn't built or is in
//      a bad state), an await on chrome.storage.sync.* would otherwise hang
//      forever — which would freeze the popup mid-click on operations like
//      deleteAddress that fall through to a sync write.
//   2. If a call fails, we back off for a short cooldown and short-circuit
//      subsequent calls during it, then automatically retry. We deliberately
//      do NOT latch "unavailable" for the whole session: the old permanent
//      latch meant a single slow iCloud round-trip disabled sync for the rest
//      of the session, so a freshly generated address silently never synced.

declare const browser: typeof chrome

const QUOTA_BYTES = 1_048_576 // 1 MB, matches NSUbiquitousKeyValueStore
// iCloud-backed native round-trips (file read/write + security-scoped bookmark
// resolution) routinely take longer than the old 250ms budget on a cold worker.
const TIMEOUT_MS = 2_000
// After a failure, stop hammering the host for this long, then retry once more.
const COOLDOWN_MS = 15_000

let unavailableUntil = 0

const send = async (msg: Record<string, unknown>): Promise<any> => {
  if (Date.now() < unavailableUntil) throw new Error('native messaging cooling down')

  const api = (typeof browser !== 'undefined' ? browser : chrome)
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('native messaging timeout')), TIMEOUT_MS)
  })

  try {
    const result = await Promise.race([api.runtime.sendNativeMessage('com.shmublu.Qwacky', msg), timeout])
    unavailableUntil = 0 // a success clears any lingering cooldown
    return result
  } catch (err) {
    // Temporary backoff only — the next call after COOLDOWN_MS retries.
    unavailableUntil = Date.now() + COOLDOWN_MS
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const trySend = async (msg: Record<string, unknown>): Promise<any | null> => {
  try { return await send(msg) } catch { return null }
}

const normalizeValue = (v: any) => (v === null || v === undefined ? undefined : v)

const get = async (keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, any>> => {
  if (keys == null) {
    const resp = await trySend({ action: 'getAll' })
    return resp?.items ?? {}
  }
  if (typeof keys === 'string') {
    const resp = await trySend({ action: 'get', key: keys })
    const value = normalizeValue(resp?.value)
    return value === undefined ? {} : { [keys]: value }
  }
  if (Array.isArray(keys)) {
    const responses = await Promise.all(keys.map(key => trySend({ action: 'get', key })))
    const out: Record<string, any> = {}
    keys.forEach((key, i) => {
      const value = normalizeValue(responses[i]?.value)
      if (value !== undefined) out[key] = value
    })
    return out
  }
  const entries = Object.entries(keys)
  const responses = await Promise.all(entries.map(([key]) => trySend({ action: 'get', key })))
  const out: Record<string, any> = {}
  entries.forEach(([key, fallback], i) => {
    const value = normalizeValue(responses[i]?.value)
    out[key] = value === undefined ? fallback : value
  })
  return out
}

const set = async (items: Record<string, any>): Promise<void> => {
  await Promise.all(Object.entries(items).map(([key, value]) => trySend({ action: 'set', key, value })))
}

const remove = async (keys: string | string[]): Promise<void> => {
  const list = Array.isArray(keys) ? keys : [keys]
  await Promise.all(list.map(key => trySend({ action: 'remove', key })))
}

const clear = async (): Promise<void> => { await trySend({ action: 'clear' }) }

const getBytesInUse = async (): Promise<number> => {
  const resp = await trySend({ action: 'bytes' })
  return typeof resp?.bytes === 'number' ? resp.bytes : 0
}

export const installSafariSyncShim = (): void => {
  if (process.env.BROWSER !== 'safari') return
  const target = (chrome.storage as any)
  target.sync = {
    get,
    set,
    remove,
    clear,
    getBytesInUse,
    QUOTA_BYTES,
    // No-op listener container — Safari can't push KVS-change events into JS
    // without a persistent native channel, so onChanged for sync is effectively
    // poll-on-next-active. Existing chrome.storage.onChanged listeners still
    // fire for `local` writes, which is what the popup uses.
    onChanged: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
  }
}
