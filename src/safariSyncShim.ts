// On Safari, chrome.storage.sync is local-only — it does not roam between the
// user's Macs. This shim replaces chrome.storage.sync with a wrapper that
// routes through browser.runtime.sendNativeMessage to the host app's
// SafariWebExtensionHandler, which is backed by NSUbiquitousKeyValueStore
// (iCloud key-value storage). The user must enable the iCloud Key-Value
// Storage capability in Xcode for the Qwacky Extension target; without it,
// the native handler still responds but the store stays local to this Mac.
//
// We preserve chrome.storage.sync's API surface (get/set/remove/clear/
// getBytesInUse/QUOTA_BYTES) so the existing SyncService code keeps working
// unchanged.

declare const browser: typeof chrome

const QUOTA_BYTES = 1_048_576 // 1 MB, matches NSUbiquitousKeyValueStore

const send = (msg: Record<string, unknown>): Promise<any> =>
  (browser ?? chrome).runtime.sendNativeMessage('com.shmublu.Qwacky', msg)

const normalizeValue = (v: any) => (v === null || v === undefined ? undefined : v)

const get = async (keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, any>> => {
  if (keys == null) {
    const resp = await send({ action: 'getAll' })
    return resp?.items ?? {}
  }
  if (typeof keys === 'string') {
    const resp = await send({ action: 'get', key: keys })
    const value = normalizeValue(resp?.value)
    return value === undefined ? {} : { [keys]: value }
  }
  if (Array.isArray(keys)) {
    const out: Record<string, any> = {}
    for (const key of keys) {
      const resp = await send({ action: 'get', key })
      const value = normalizeValue(resp?.value)
      if (value !== undefined) out[key] = value
    }
    return out
  }
  // Defaults-object form: { key: defaultValue, ... }
  const out: Record<string, any> = {}
  for (const [key, fallback] of Object.entries(keys)) {
    const resp = await send({ action: 'get', key })
    const value = normalizeValue(resp?.value)
    out[key] = value === undefined ? fallback : value
  }
  return out
}

const set = async (items: Record<string, any>): Promise<void> => {
  for (const [key, value] of Object.entries(items)) {
    await send({ action: 'set', key, value })
  }
}

const remove = async (keys: string | string[]): Promise<void> => {
  const list = Array.isArray(keys) ? keys : [keys]
  for (const key of list) {
    await send({ action: 'remove', key })
  }
}

const clear = async (): Promise<void> => {
  await send({ action: 'clear' })
}

const getBytesInUse = async (): Promise<number> => {
  const resp = await send({ action: 'bytes' })
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
