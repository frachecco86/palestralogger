/**
 * Store in memoria con la stessa interfaccia minima di @netlify/blobs,
 * usato solo dai test (`npm run smoke:account`).
 */

type Entry = string

// stato condiviso anche tra bundle separati (account.mjs / fake-blobs.mjs)
const globalScope = globalThis as unknown as { __plBlobStores?: Map<string, Map<string, Entry>> }
const stores: Map<string, Map<string, Entry>> =
  globalScope.__plBlobStores ?? (globalScope.__plBlobStores = new Map())

function storeMap(name: string): Map<string, Entry> {
  let map = stores.get(name)
  if (!map) {
    map = new Map()
    stores.set(name, map)
  }
  return map
}

export function __reset() {
  stores.clear()
}

export function __setBlob(storeName: string, key: string, value: unknown) {
  storeMap(storeName).set(key, typeof value === 'string' ? value : JSON.stringify(value))
}

export function __dump(storeName: string): string[] {
  return [...storeMap(storeName).keys()].sort()
}

export function getStore({ name }: { name: string }) {
  const map = storeMap(name)

  return {
    async get(key: string, options?: { type?: 'json' | 'text' }) {
      const raw = map.get(key)
      if (raw === undefined) return null
      if (options?.type === 'json') return JSON.parse(raw)
      return raw
    },
    async getJSON(key: string) {
      const raw = map.get(key)
      return raw === undefined ? null : JSON.parse(raw)
    },
    async set(key: string, data: unknown, options?: { onlyIfNew?: boolean }) {
      if (options?.onlyIfNew && map.has(key)) return { modified: false }
      map.set(key, String(data))
      return { modified: true }
    },
    async setJSON(key: string, data: unknown) {
      map.set(key, JSON.stringify(data))
      return { modified: true }
    },
    async delete(key: string) {
      map.delete(key)
    },
    async *list({ prefix = '' }: { prefix?: string; paginate?: boolean }) {
      const blobs = [...map.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key, etag: 'etag-' + key }))
      yield { blobs, directories: [] }
    },
  }
}
