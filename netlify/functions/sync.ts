import { getStore } from '@netlify/blobs'
import { createHash } from 'node:crypto'

type SyncBody = {
  action?: 'pull' | 'push' | 'delete'
  code?: string
  payload?: unknown
  baseRevision?: number
}

const STORE_NAME = 'palestralogger-sync'
const MAX_PAYLOAD_BYTES = 4_000_000
const CODE_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: JSON.stringify(body),
  }
}

function keyFor(code: string): string {
  return 'd/' + createHash('sha256').update(code).digest('hex')
}

type LambdaEvent = {
  httpMethod: string
  body: string | null
  blobs?: string
  headers?: Record<string, string | undefined>
}

/**
 * I handler "classic" ricevono il contesto Blobs in event.blobs (Lambda
 * compatibility). Usiamo siteID + token senza edgeURL: le letture passano
 * dall'API centrale, quindi non sono servite dalla cache edge e il controllo
 * di revisione della sync è affidabile.
 */
function getSyncStore(event: LambdaEvent) {
  try {
    if (event.blobs) {
      const context = JSON.parse(Buffer.from(event.blobs, 'base64').toString('utf8')) as {
        token?: string
      }
      const siteID = event.headers?.['x-nf-site-id']
      if (context.token && siteID) {
        return getStore({ name: STORE_NAME, siteID, token: context.token })
      }
    }
  } catch (err) {
    console.error('[sync] contesto blobs non leggibile', err)
  }
  return getStore({ name: STORE_NAME })
}

export const handler = async (event: LambdaEvent) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, {})
  if (event.httpMethod !== 'POST') return respond(405, { error: 'method_not_allowed' })

  let body: SyncBody
  try {
    body = JSON.parse(event.body || '{}') as SyncBody
  } catch {
    return respond(400, { error: 'invalid_json' })
  }

  const code = String(body.code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
  if (!CODE_RE.test(code)) return respond(400, { error: 'invalid_code' })

  const key = keyFor(code)
  const store = getSyncStore(event)

  try {
    if (body.action === 'pull') {
      const doc = (await store.get(key, { type: 'json' })) as
        | { revision?: number; payload?: unknown }
        | null
      if (!doc) return respond(200, { revision: 0, payload: null })
      return respond(200, { revision: doc.revision ?? 0, payload: doc.payload ?? null })
    }

    if (body.action === 'push') {
      if (!body.payload || typeof body.payload !== 'object') {
        return respond(400, { error: 'invalid_payload' })
      }
      if (JSON.stringify(body.payload).length > MAX_PAYLOAD_BYTES) {
        return respond(413, { error: 'payload_too_large' })
      }

      const doc = (await store.get(key, { type: 'json' })) as
        | { revision?: number; payload?: unknown }
        | null
      const revision = doc?.revision ?? 0
      const base = Number.isFinite(body.baseRevision) ? Number(body.baseRevision) : 0

      if (base !== revision) {
        return respond(409, { revision, payload: doc?.payload ?? null })
      }

      const next = revision + 1
      await store.setJSON(key, {
        revision: next,
        payload: body.payload,
        updatedAt: new Date().toISOString(),
      })
      return respond(200, { revision: next })
    }

    if (body.action === 'delete') {
      await store.delete(key)
      return respond(200, { ok: true })
    }

    return respond(400, { error: 'invalid_action' })
  } catch (err) {
    console.error('[sync] errore', err)
    return respond(500, { error: 'server_error' })
  }
}
