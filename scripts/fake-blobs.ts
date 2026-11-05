/**
 * Store in memoria con la stessa interfaccia minima di @netlify/blobs,
 * usato solo dai test (`npm run smoke:account`).
 */

type Entry = string | Uint8Array

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
    async get(key: string, options?: { type?: 'json' | 'text' | 'arrayBuffer' }) {
      const raw = map.get(key)
      if (raw === undefined) return null
      if (options?.type === 'json') return JSON.parse(String(raw))
      if (options?.type === 'arrayBuffer') {
        if (typeof raw === 'string') return new TextEncoder().encode(raw).buffer
        return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
      }
      return typeof raw === 'string' ? raw : Buffer.from(raw).toString()
    },
    async set(key: string, data: unknown, options?: { onlyIfNew?: boolean }) {
      if (options?.onlyIfNew && map.has(key)) return { modified: false }
      if (typeof data === 'string') map.set(key, data)
      else if (data instanceof Uint8Array) map.set(key, new Uint8Array(data))
      else map.set(key, new Uint8Array(data as ArrayBuffer))
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
