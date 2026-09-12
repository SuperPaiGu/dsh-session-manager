/**
 * dsh-session-manager host plugin (v0.3.0).
 *
 * Serves the 「归档」 Conversation View panel (client.js) and performs the only
 * operation that needs the Host: sending a Session's on-disk folder to the
 * Windows Recycle Bin.
 *
 * Locating the folder — the 0.1.5 break.
 * `SessionPersistence.locate(header) → { path }` no longer exists: the abstract
 * service is now `create/open/flush/stat/list`, and `SessionPersistenceSnapshot`
 * carries only `header`, `revision`, optional `eventCount` and `sizeBytes` — no
 * path. The location is still fully determined by public values, so this plugin
 * derives it instead of asking for it:
 *
 *   <root>/<projectKey(header.cwd)>/<encodeSegment(header.id)>/
 *
 * `root` is the jsonl backend's own public `config.root` (the composition sets
 * it to `dshHomePath('sessions')`), and the two segment encodings are the
 * documented, injective schemes that backend uses. Deriving the DIRECTORY — not
 * a versioned filename — keeps this working across Session format generations
 * (v3 today, v4 later) and across compression changes, because whatever
 * `session.vN.jsonl[.zstd]` lives inside travels with the folder.
 *
 * Deletion never calls `workspaceRegistry.archiveSession`. That earlier
 * workaround appended an id to the registry-global archive set, which has no
 * removal path in 0.1.5 — the id would outlive the deleted log forever as an
 * orphan. Deleting only the folder leaves no new residue.
 *
 * Running sessions are skipped: their log is held under a write lease, and
 * yanking it out from under the writer is never what the user meant.
 */

import { readdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

export const name = 'session-manager'
export const inject = ['webServer', 'sessionPersistence', 'shell']

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

/**
 * Resolve one stored session's folder, refusing anything that escapes the root.
 * @param root - configured sessions root.
 * @param header - the stored session header.
 * @returns the absolute folder path.
 */
export function sessionDirOf(root, header) {
  const dir = resolve(join(root, projectKey(header.cwd), encodeSegment(String(header.id))))
  const prefix = resolve(root) + sep
  if (!dir.startsWith(prefix)) throw new Error('derived path escapes the sessions root')
  return dir
}

/** Whether the folder exists and is a directory (every other errno must surface). */
async function directoryExists(dir) {
  try {
    return (await stat(dir)).isDirectory()
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Send one existing folder to the Windows Recycle Bin. Mirrors the shipped
 * recycle helper: `resolve` applies the implementation's own defaults, and the
 * policy is requested because session storage lives outside any workspace.
 * @param shell - the shell service, when available.
 * @param dir - absolute folder to recycle; must already exist.
 * @returns `{ ok }` plus a diagnostic message on failure.
 */
async function recycle(shell, dir) {
  if (shell === undefined) return { ok: false, message: 'shell service unavailable' }
  const esc = (value) => String(value).replace(/'/g, "''")
  const script =
    'Add-Type -AssemblyName Microsoft.VisualBasic; ' +
    "if (Test-Path -LiteralPath '" + esc(dir) + "') { " +
    "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('" + esc(dir) + "','OnlyErrorDialogs','SendToRecycleBin') }"
  const base = {
    command: 'powershell -NoProfile -NonInteractive -Command "' + script + '"',
    timeoutMs: 30000,
  }
  let spec
  try {
    spec = shell.resolve({ ...base, sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: 'C:\\' } })
  } catch {
    spec = shell.resolve(base)
  }
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const stderr = result.stderr !== undefined && typeof result.stderr.text === 'string' ? result.stderr.text : ''
    return { ok: false, message: 'recycle-bin delete failed (exit ' + String(result.exitCode) + '): ' + stderr.trim().slice(0, 300) }
  }
  return { ok: true }
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
 *
 * `archivedSessionIds` is a durable display filter owned by the workspace
 * plugin, and 0.1.5 exposes exactly one operation on it — `archiveSession`,
 * which only appends. The workspace README states the omission outright
 * ("Archiving is one-way ... no unarchive action exists yet"), so the storage
 * domain is the only route to the removal an unarchive needs.
 *
 * `storage.domain` is documented as a diagnostic surface, which is why every
 * caller here treats it as best-effort: an unavailable or incompatible domain
 * degrades to a reported status and never throws into the request.
 *
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
 * Remove one id from the archive set, restoring the session to every grouping
 * surface at its recorded position — the workspace accounting was never
 * touched by archiving, so nothing else has to be repaired.
 *
 * The removal always goes through the storage domain, because that is the only
 * route to a removal that exists. Archiving (the shipped path) writes to BOTH
 * the running `WorkspaceRegistry` and the domain, so a running registry that
 * was booted from the same store holds the same set — but a second `dsh web`
 * instance sharing the home directory can hold a stale in-memory copy, and a
 * registry that never saw an id would still have to yield to the durable one.
 * The domain is therefore the authority here, and the registry is only
 * consulted to report whether grouping surfaces pick the change up before a
 * restart.
 *
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
    // Read back rather than trust the write: a durable store that accepted the
    // call without dropping the entry would otherwise look like a success and
    // leave the id pointing at a session that no longer exists.
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

/**
 * Drop one id from the archive set after its log was deleted.
 *
 * Deleting a session's log would otherwise leave its id in `archivedSessionIds`
 * forever — the orphan this plugin stopped manufacturing, and the reason a
 * machine can accumulate hundreds of entries naming sessions that no longer
 * exist (253 on the one this was developed on).
 *
 * @param ctx - the plugin context.
 * @param id - the session id to remove.
 * @returns a short status note for the response row.
 */
async function forgetArchived(ctx, id) {
  const result = await restoreOne(ctx, id)
  if (result.status === 'ok') return 'archive-entry-cleared'
  if (result.status === 'skipped') return 'not-archived'
  return result.message === undefined ? 'archive-clear-failed' : 'archive-clear-failed: ' + result.message
}

/**
 * Delete one stored session's folder.
 * @param id - the session id from the request.
 * @param deps - resolved services.
 * @returns one per-session result row.
 */
async function deleteOne(id, deps) {
  const { agents, persistence, shell, root, ctx } = deps
  if (persistence === undefined) return { id, status: 'error', message: 'session persistence unavailable' }

  const agent = agents === undefined ? undefined : agents.get(id)
  if (agent !== undefined && agent.status === 'running') return { id, status: 'skipped', reason: 'running' }

  let header
  try {
    const snapshot = await persistence.stat(id)
    if (snapshot === undefined) return { id, status: 'skipped', reason: 'missing' }
    header = snapshot.header
  } catch (error) {
    return { id, status: 'error', message: String(error instanceof Error ? error.message : error).slice(0, 300) }
  }

  let dir
  try {
    dir = sessionDirOf(root, header)
  } catch (error) {
    return { id, status: 'error', message: String(error instanceof Error ? error.message : error) }
  }

  if (!(await directoryExists(dir))) {
    // A session can be known to persistence with no materialized artifact yet.
    return { id, status: 'skipped', reason: 'no-artifact' }
  }

  const outcome = await recycle(shell, dir)
  if (!outcome.ok) return { id, status: 'error', message: outcome.message }
  return { id, status: 'deleted', archive: await forgetArchived(ctx, id) }
}

/** Read the requested id batch, or answer 400 and return null. */
function readIds(body, res) {
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : []
  if (ids.length === 0) {
    sendJson(res, 400, { ok: false, error: 'no session ids supplied' })
    return null
  }
  return ids
}

/**
 * Register one batch endpoint. Both operations share request parsing and
 * response shape; only the per-session work differs.
 * @param ctx - the plugin context.
 * @param path - exact route path.
 * @param label - diagnostic label for failures.
 * @param run - per-session operation returning one result row.
 */
function registerBatch(ctx, path, label, run) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path,
    handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const ids = readIds(body, res)
        if (ids === null) return
        const results = []
        for (const id of ids) results.push(await run(id, body))
        sendJson(res, 200, { ok: true, results })
      } catch (error) {
        ctx.logger.warn(`session-manager ${label} failed: ` + String(error))
        sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
      }
    },
  }), `session-manager: ${label} endpoint`)
}

/** The host plugin body. */
export function apply(ctx) {
  registerBatch(ctx, '/session-manager/delete', 'delete', async (id) => {
    const persistence = ctx.get('sessionPersistence')
    const config = persistence === undefined ? undefined : persistence.config
    const root = config !== undefined && typeof config.root === 'string' ? config.root : undefined
    if (persistence === undefined || root === undefined) {
      return { id, status: 'error', message: 'session persistence exposes no configured root' }
    }
    return deleteOne(id, {
      agents: ctx.get('agents'),
      persistence,
      shell: ctx.get('shell'),
      root,
      ctx,
    })
  })

  registerBatch(ctx, '/session-manager/restore', 'restore', id => restoreOne(ctx, id))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/session-manager/archived',
    handler: (req, res) => {
      try {
        const registry = ctx.get('workspaceRegistry')
        const ids = registry === undefined
          ? undefined
          : [...registry.archivedSessionIds].map(String)
        const set = openArchiveSet(ctx)
        let domainIds
        if (set.ok) {
          try {
            domainIds = [...set.global.get().archivedSessionIds].map(String)
          } catch (error) {
            domainIds = ['<read failed: ' + String(error instanceof Error ? error.message : error) + '>']
          }
        }
        sendJson(res, 200, {
          ok: true,
          source: 'registry',
          ids,
          domainIds,
          domainReason: set.ok ? null : set.reason,
        })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String(error instanceof Error ? error.message : error) })
      }
    },
  }), 'session-manager: archived endpoint')
}
