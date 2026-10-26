import { getStore } from '@netlify/blobs'
import { createHash, randomBytes } from 'node:crypto'

const SYNC_STORE = 'palestralogger-sync'
const SOCIAL_STORE = 'palestralogger-social'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SYNC_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/
const FRIEND_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/
const MAX_FRIENDS = 100
const MAX_REQUESTS = 100
const MAX_SNAPSHOT_BYTES = 300_000

type Event = {
  httpMethod: string
  body: string | null
  blobs?: string
  headers?: Record<string, string | undefined>
}

type FriendRequest = { uid: string; name: string; at: string }

interface SocialDoc {
  uid: string
  name: string
  friendCode: string
  snapshot: unknown | null
  friends: string[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
  updatedAt: string
}

class HttpError extends Error {
  status: number
  error: string
  constructor(status: number, error: string, message?: string) {
    super(message ?? error)
    this.status = status
    this.error = error
  }
}

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

function blobOptions(event: Event) {
  try {
    if (event.blobs) {
      const context = JSON.parse(Buffer.from(event.blobs, 'base64').toString('utf8')) as {
        token?: string
      }
      const siteID = event.headers?.['x-nf-site-id']
      if (context.token && siteID) return { siteID, token: context.token }
    }
  } catch (err) {
    console.error('[social] contesto blobs non leggibile', err)
  }
  return {}
}

function syncStore(event: Event) {
  return getStore({ name: SYNC_STORE, ...blobOptions(event) })
}

function socialStore(event: Event) {
  return getStore({ name: SOCIAL_STORE, ...blobOptions(event) })
}

function syncKey(code: string): string {
  return 'd/' + createHash('sha256').update(code).digest('hex')
}

function newFriendCode(): string {
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out.replace(/(.{4})(?=.)/g, '$1-')
}

function normalizeFriendCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}

async function authenticate(
  event: Event,
  codeRaw: string,
): Promise<{ uid: string; name: string }> {
  const code = String(codeRaw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
  if (!SYNC_RE.test(code)) throw new HttpError(401, 'auth')
  const doc = (await syncStore(event).get(syncKey(code), { type: 'json' })) as
    | { payload?: { profile?: { id?: string; name?: string } } }
    | null
  const profile = doc?.payload?.profile
  if (!profile?.id) throw new HttpError(401, 'auth')
  return { uid: profile.id, name: profile.name || 'Atleta' }
}

async function getDoc(event: Event, uid: string): Promise<SocialDoc | null> {
  const doc = (await socialStore(event).get('u/' + uid, { type: 'json' })) as SocialDoc | null
  return doc && doc.uid ? doc : null
}

async function saveDoc(event: Event, doc: SocialDoc): Promise<void> {
  doc.updatedAt = new Date().toISOString()
  await socialStore(event).setJSON('u/' + doc.uid, doc)
}

async function uniqueFriendCode(event: Event): Promise<string> {
  const store = socialStore(event)
  for (let i = 0; i < 6; i++) {
    const code = newFriendCode()
    const owner = await store.get('code/' + code)
    if (!owner) return code
  }
  throw new HttpError(500, 'code_generation')
}

async function activate(event: Event, uid: string, name: string): Promise<SocialDoc> {
  const existing = await getDoc(event, uid)
  if (existing) {
    if (existing.name !== name) {
      existing.name = name
      await saveDoc(event, existing)
    }
    return existing
  }
  const friendCode = await uniqueFriendCode(event)
  const doc: SocialDoc = {
    uid,
    name,
    friendCode,
    snapshot: null,
    friends: [],
    incoming: [],
    outgoing: [],
    updatedAt: new Date().toISOString(),
  }
  await socialStore(event).set('code/' + friendCode, uid)
  await socialStore(event).setJSON('u/' + uid, doc)
  return doc
}

async function stateFor(event: Event, doc: SocialDoc) {
  const store = socialStore(event)
  const friends = (
    await Promise.all(
      doc.friends.map((uid) => store.get('u/' + uid, { type: 'json' }) as Promise<SocialDoc | null>),
    )
  )
    .filter((f): f is SocialDoc => !!f && f.uid !== doc.uid)
    .map((f) => ({
      uid: f.uid,
      name: f.name,
      snapshot: f.snapshot,
      updatedAt: f.updatedAt,
    }))

  return {
    exists: true,
    me: {
      uid: doc.uid,
      name: doc.name,
      friendCode: doc.friendCode,
      snapshot: doc.snapshot,
      updatedAt: doc.updatedAt,
    },
    friends,
    incoming: doc.incoming,
    outgoing: doc.outgoing,
  }
}

function sanitizeSnapshot(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object') throw new HttpError(400, 'invalid_snapshot')
  const size = JSON.stringify(snapshot).length
  if (size > MAX_SNAPSHOT_BYTES) throw new HttpError(413, 'snapshot_too_large')
  return snapshot
}

export const handler = async (event: Event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, {})
  if (event.httpMethod !== 'POST') return respond(405, { error: 'method_not_allowed' })

  let body: Record<string, unknown>
  try {
    body = JSON.parse(event.body || '{}') as Record<string, unknown>
  } catch {
    return respond(400, { error: 'invalid_json' })
  }

  const action = String(body.action ?? '')
  const code = String(body.code ?? '')

  try {
    const identity = await authenticate(event, code)
    const uid = identity.uid
    const store = socialStore(event)

    if (action === 'me') {
      const doc = await getDoc(event, uid)
      if (!doc) return respond(200, { exists: false })
      return respond(200, await stateFor(event, doc))
    }

    if (action === 'activate') {
      const doc = await activate(event, uid, identity.name)
      return respond(200, await stateFor(event, doc))
    }

    if (action === 'publish') {
      const doc = await getDoc(event, uid)
      if (!doc) throw new HttpError(409, 'not_active')
      doc.snapshot = sanitizeSnapshot(body.snapshot)
      doc.name = identity.name
      await saveDoc(event, doc)
      return respond(200, { ok: true, updatedAt: doc.updatedAt })
    }

    if (action === 'request') {
      const friendCode = normalizeFriendCode(String(body.friendCode ?? ''))
      if (!FRIEND_RE.test(friendCode)) throw new HttpError(400, 'invalid_code')
      const targetUid = await store.get('code/' + friendCode)
      if (!targetUid || typeof targetUid !== 'string') throw new HttpError(404, 'not_found')
      if (targetUid === uid) throw new HttpError(400, 'self')

      const own = await activate(event, uid, identity.name)
      const target = await getDoc(event, targetUid)
      if (!target) throw new HttpError(404, 'not_found')

      if (own.friends.includes(targetUid)) {
        return respond(200, { status: 'already_friends', target: { uid: target.uid, name: target.name } })
      }
      if (own.outgoing.length >= MAX_REQUESTS || target.incoming.length >= MAX_REQUESTS) {
        throw new HttpError(429, 'too_many_requests')
      }

      const now = new Date().toISOString()
      own.outgoing = [
        ...own.outgoing.filter((r) => r.uid !== targetUid),
        { uid: targetUid, name: target.name, at: now },
      ]
      target.incoming = [
        ...target.incoming.filter((r) => r.uid !== uid),
        { uid: own.uid, name: own.name, at: now },
      ]
      await saveDoc(event, own)
      await saveDoc(event, target)

      return respond(200, { status: 'requested', target: { uid: target.uid, name: target.name } })
    }

    if (action === 'respond') {
      const fromUid = String(body.fromUid ?? '')
      const accept = body.accept === true
      const own = await getDoc(event, uid)
      if (!own) throw new HttpError(409, 'not_active')
      const request = own.incoming.find((r) => r.uid === fromUid)
      if (!request) throw new HttpError(404, 'request_not_found')

      const other = await getDoc(event, fromUid)
      own.incoming = own.incoming.filter((r) => r.uid !== fromUid)

      if (other) {
        other.outgoing = other.outgoing.filter((r) => r.uid !== uid)
        if (accept) {
          if (own.friends.length >= MAX_FRIENDS || other.friends.length >= MAX_FRIENDS) {
            throw new HttpError(400, 'too_many_friends')
          }
          if (!own.friends.includes(other.uid)) own.friends.push(other.uid)
          if (!other.friends.includes(own.uid)) other.friends.push(own.uid)
        }
        await saveDoc(event, other)
      }

      await saveDoc(event, own)
      return respond(200, await stateFor(event, own))
    }

    if (action === 'remove') {
      const friendUid = String(body.friendUid ?? '')
      const own = await getDoc(event, uid)
      if (!own) throw new HttpError(409, 'not_active')
      own.friends = own.friends.filter((id) => id !== friendUid)
      own.outgoing = own.outgoing.filter((r) => r.uid !== friendUid)
      own.incoming = own.incoming.filter((r) => r.uid !== friendUid)
      await saveDoc(event, own)

      const other = await getDoc(event, friendUid)
      if (other) {
        other.friends = other.friends.filter((id) => id !== uid)
        other.outgoing = other.outgoing.filter((r) => r.uid !== uid)
        other.incoming = other.incoming.filter((r) => r.uid !== uid)
        await saveDoc(event, other)
      }
      return respond(200, await stateFor(event, own))
    }

    if (action === 'delete') {
      const own = await getDoc(event, uid)
      if (own) {
        await Promise.all(
          own.friends.map(async (friendUid) => {
            const other = await getDoc(event, friendUid)
            if (!other) return
            other.friends = other.friends.filter((id) => id !== uid)
            other.outgoing = other.outgoing.filter((r) => r.uid !== uid)
            other.incoming = other.incoming.filter((r) => r.uid !== uid)
            await saveDoc(event, other)
          }),
        )
        await store.delete('code/' + own.friendCode)
        await store.delete('u/' + uid)
      }
      return respond(200, { ok: true })
    }

    return respond(400, { error: 'invalid_action' })
  } catch (err) {
    if (err instanceof HttpError) {
      return respond(err.status, { error: err.error })
    }
    console.error('[social] errore', err)
    return respond(500, { error: 'server_error' })
  }
}
