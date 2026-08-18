/**
 * dsh-session-manager host plugin: physically delete DSH sessions into the
 * system Recycle Bin. The Web sidebar (client.js) posts session ids to the
 * `/session-manager/delete` endpoint; this half resolves each session's on-disk
 * directory through `sessionPersistence.locate`, guards the path, and recycles
 * it with `Microsoft.VisualBasic.FileIO` (SendToRecycleBin) — never an
 * irreversible rm. Running sessions are skipped.
 */

export const name = 'session-manager'
export const inject = ['webServer', 'sessionPersistence', 'shell', 'agents']

/** Safe dirname of an absolute path (both separators). */
function dirnameOf(p) {
  if (typeof p !== 'string') return p
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i === -1 ? p : p.slice(0, i)
}

/** Send one directory to the Windows Recycle Bin; failures carry a message. */
async function recycle(shell, dir) {
  if (shell === undefined) return { ok: false, message: 'shell service unavailable' }
  const esc = (s) => String(s).replace(/'/g, "''")
  const script =
    "Add-Type -AssemblyName Microsoft.VisualBasic; " +
    "if (Test-Path -LiteralPath '" + esc(dir) + "') { " +
    "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('" + esc(dir) + "','OnlyErrorDialogs','SendToRecycleBin') }"
  const base = {
    command: 'powershell -NoProfile -NonInteractive -Command "' + script + '"',
    timeoutMs: 30000,
  }
  let spec
  try {
    spec = shell.resolve({ ...base, sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: 'C:\\' } })
  } catch (error) {
    spec = shell.resolve(base)
  }
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const stderr = result.stderr && result.stderr.text ? result.stderr.text : ''
    return { ok: false, message: 'recycle-bin delete failed (exit ' + result.exitCode + '): ' + stderr.trim().slice(0, 300) }
  }
  return { ok: true }
}

/** Delete one persisted session; skip when running / missing / no artifact. */
async function deleteOne(sessionId, headersByString, deps) {
  const { agents, persistence, shell } = deps
  // 「正在运行」= 有 live agent 且该 agent 状态为 running。
  // Web 环境下已打开的会话通常常驻 live agent（idle），所以不能只看 agent 是否存在。
  const agent = agents !== undefined ? agents.get(sessionId) : undefined
  if (agent !== undefined && agent.status === 'running') {
    return { id: sessionId, status: 'skipped', reason: 'running' }
  }
  const header = headersByString.get(sessionId)
  if (header === undefined) return { id: sessionId, status: 'skipped', reason: 'missing' }
  if (persistence === undefined) return { id: sessionId, status: 'error', message: 'session persistence unavailable' }
  const loc = persistence.locate(header)
  if (loc === undefined) return { id: sessionId, status: 'skipped', reason: 'no-artifact' }
  const dir = dirnameOf(loc.path)
  if (!dir || !String(loc.path).includes('sessions')) {
    return { id: sessionId, status: 'error', message: 'refusing suspicious path: ' + String(loc.path) }
  }
  const outcome = await recycle(shell, dir)
  if (!outcome.ok) return { id: sessionId, status: 'error', message: outcome.message }
  return { id: sessionId, status: 'deleted' }
}

/** JSON-response helper (mirrors dsh-mcp-panel). */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** Read a small JSON request body. */
async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** The host plugin body. */
export function apply(ctx) {
  const deps = {
    agents: ctx.get('agents'),
    persistence: ctx.get('sessionPersistence'),
    shell: ctx.get('shell'),
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/session-manager/delete',
    handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : []
        if (ids.length === 0) {
          sendJson(res, 200, { ok: true, results: [] })
          return
        }
        let headers = []
        if (deps.persistence !== undefined) {
          try { headers = await deps.persistence.list() } catch (error) { headers = [] }
        }
        const byId = new Map()
        for (const h of headers) byId.set(String(h.id), h)
        const results = []
        for (const id of ids) {
          try { results.push(await deleteOne(id, byId, deps)) }
          catch (error) { results.push({ id, status: 'error', message: error instanceof Error ? error.message : String(error) }) }
        }
        sendJson(res, 200, { ok: true, results })
      } catch (error) {
        sendJson(res, 200, { ok: false, error: String(error?.message || error) })
      }
    },
  }), 'session-manager: delete route')
}
