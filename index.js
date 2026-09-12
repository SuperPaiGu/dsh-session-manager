/**
 * dsh-session-manager host plugin (v0.4.0) — restore-only.
 *
 * Serves the 「归档」 Conversation View panel (client.js). The panel lists the
 * archived sessions that still have logs on disk and puts a chosen one back
 * into the sidebar by dropping its id from the registry-global archive set.
 *
 * Why the storage domain is the only route.
 * `archivedSessionIds` is a durable display filter owned by the workspace
 * plugin, and 0.1.5 publishes exactly one operation on it — `archiveSession`,
 * which only appends. The workspace README states the omission outright
 * ("Archiving is one-way ... no unarchive action exists yet"), so reading and
 * writing the domain's global slot is the only way to implement an unarchive.
 * `storage.domain` is documented as a diagnostic surface, so every use here is
 * best-effort and reports its failure instead of throwing into the request.
 *
 * No deletion.
 * An earlier build deleted a session by recycling its folder and then dropping
 * its archive entry. That pairing is what makes the feature dangerous:
 * clearing the entry un-hides the session on every grouping surface, so any
 * path where the entry is cleared without the folder actually going away is
 * indistinguishable from a restore — which is exactly what users saw. The
 * official product owns session lifetime; this plugin no longer competes with
 * it.
 */

export const name = 'session-manager'
export const inject = ['webServer']

/** Project-directory key, mirroring the shipped JSONL backend's `projectKey`. */
export function projectKey(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) throw new Error('session header carries no cwd')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return '--' + slug.slice(0, 251) + '--'
}

/** One safe path segment, mirroring the shipped JSONL backend's `encodeSegment`. */
export function encodeSegment(raw) {
  if (typeof raw !== 'string' || raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/** JSON-response helper. */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** Read a small JSON request body; malformed input becomes `{}`. */
async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Open the registry-global archive set through the storage domain.
 * @param ctx - the plugin context.
 * @returns the open global handle, or a reason it is unusable.
 */
function openArchiveSet(ctx) {
  const storage = ctx.get('storage')
  const facility = storage === undefined ? undefined : storage.domain
  if (facility === undefined || typeof facility.get !== 'function') {
    return { ok: false, reason: 'archive-set-unavailable' }
  }
  let domain
  try {
    domain = facility.get('workspace')
  } catch {
    return { ok: false, reason: 'archive-set-unavailable' }
  }
  if (domain === undefined || domain.global === undefined) {
    return { ok: false, reason: 'archive-set-unavailable' }
  }
  return { ok: true, global: domain.global }
}

/**
 * Read the archive set that the panel should render.
 *
 * The running registry is preferred when present, because it is the copy every
 * grouping surface derives from in THIS process. A second `dsh web` instance
 * sharing the home directory keeps its own in-memory copy and does not republish
 * it after another process writes, so the durable domain serves as the fallback
 * — and the two can legitimately disagree until one of them restarts.
 *
 * @param ctx - the plugin context.
 * @returns `{ ids, source }` where `source` names the authority that answered.
 */
function readArchiveIds(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (registry !== undefined) {
    try {
      return { ids: [...registry.archivedSessionIds].map(String), source: 'registry' }
    } catch {
      /* fall through to the durable copy */
    }
  }
  const set = openArchiveSet(ctx)
  if (!set.ok) return { ids: undefined, source: set.reason }
  try {
    return { ids: [...set.global.get().archivedSessionIds].map(String), source: 'storage' }
  } catch (error) {
    return { ids: undefined, source: 'storage-read-failed: ' + String(error instanceof Error ? error.message : error) }
  }
}

/**
 * Remove one id from the archive set, restoring the session to every grouping
 * surface at its recorded position — archiving never touched workspace
 * accounting, so nothing else has to be repaired.
 * @param ctx - the plugin context.
 * @param id - the session id to restore.
 * @returns one result row for the response.
 */
async function restoreOne(ctx, id) {
  const set = openArchiveSet(ctx)
  if (!set.ok) return { id, status: 'error', message: set.reason }
  try {
    const current = set.global.get()
    if (!current.archivedSessionIds.some(entry => String(entry) === id)) {
      return { id, status: 'skipped', reason: 'not-archived' }
    }
    await set.global.set({
      initialized: current.initialized,
      workspaceIds: [...current.workspaceIds],
      archivedSessionIds: current.archivedSessionIds.filter(entry => String(entry) !== id),
    })
    // Read back rather than trust the write: a store that accepted the call
    // without dropping the entry would otherwise look like a success.
    const after = set.global.get()
    if (after.archivedSessionIds.some(entry => String(entry) === id)) {
      return { id, status: 'error', message: 'archive entry survived the write' }
    }
    const registry = ctx.get('workspaceRegistry')
    const fresh = registry === undefined
      || ![...registry.archivedSessionIds].some(entry => String(entry) === id)
    return { id, status: 'ok', registry: fresh ? 'fresh' : 'stale-until-restart' }
  } catch (error) {
    return { id, status: 'error', message: String(error instanceof Error ? error.message : error).slice(0, 300) }
  }
}

/** The host plugin body. */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/session-manager/archived',
    handler: (req, res) => {
      const { ids, source } = readArchiveIds(ctx)
      if (ids === undefined) {
        sendJson(res, 503, { ok: false, error: source })
        return
      }
      sendJson(res, 200, { ok: true, source, ids })
    },
  }), 'session-manager: archived endpoint')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/session-manager/restore',
    handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : []
        if (ids.length === 0) {
          sendJson(res, 400, { ok: false, error: 'no session ids supplied' })
          return
        }
        const results = []
        for (const id of ids) results.push(await restoreOne(ctx, id))
        sendJson(res, 200, { ok: true, results })
      } catch (error) {
        ctx.logger.warn('session-manager restore failed: ' + String(error))
        sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
      }
    },
  }), 'session-manager: restore endpoint')
}
