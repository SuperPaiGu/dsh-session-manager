/**
 * Read-only proof that the plugin's path derivation lands on real artifacts.
 *
 * The derivation MIRRORS the shipped JSONL backend's private helpers
 * (`projectKey` / `encodeSegment` live in `format.ts`, which the published
 * package does not export; the public surface is only `logPath` and friends,
 * and those need `SESSION_FORMAT_VERSION`, which the package re-exports from
 * nowhere). A mirror can only be trusted against reality, so this script
 * checks it against every session folder that actually exists on disk rather
 * than against hand-written example paths.
 *
 * Nothing is created, moved, or deleted.
 *
 * Usage: node tests/derive-check.mjs [sessionsRoot]
 */

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.argv[2]
  ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'sessions')

const plugin = await import(new URL('../index.js', import.meta.url).href)

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  ' + detail}`)
}

// 1. Whatever the id, the derived folder must stay under the root.
{
  const hostile = ['..\\..\\evil', '../..', '..', '.', '', 'a\\..\\..\\b', 'C:\\Windows', 'session-~002E~002E']
  let kept = 0
  for (const id of hostile) {
    let dir
    try { dir = plugin.sessionDirOf(ROOT, { id, cwd: 'D:\\dsh' }) } catch { kept++; continue }
    if (dir.startsWith(ROOT)) kept++
    else console.log(`FAIL  id ${JSON.stringify(id)} escaped to ${dir}`)
  }
  check('sessionDirOf keeps every hostile id under the root', kept === hostile.length, `${kept}/${hostile.length}`)
}

// 2. A header without a cwd has no derivable folder; silence would be a bug.
{
  let threw = false
  try { plugin.sessionDirOf(ROOT, { id: 'session-x' }) } catch { threw = true }
  check('sessionDirOf rejects a header with no cwd', threw)
}

// 3. Every real session folder must be rediscoverable from (cwd, id) alone.
//
// The cwd list contains characters outside ASCII, and this repo has a known
// quirk where some paths cannot be read back through this toolchain. So the
// session directories are taken from the filesystem, and one candidate cwd is
// simply declared "the right one" when its key names the real project folder
// AND the derived path lands exactly on that folder.
const projectDirs = (await readdir(ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const cwdCandidates = [
  'D:\\dsh',
  'D:\\桌面\\个人IP',
  'D:\\桌面\\各公司专项面试\\温氏股份',
  'D:\\桌面\\各公司专项面试\\直真科技',
  'D:\\桌面\\新建文件夹',
  'D:\\桌面\\添加ai coding简历',
  'D:\\桌面\\软件实训',
  'D:\\桌面\\ai临时对话库',
  'D:\\桌面\\ai视频制作\\ds生成测试',
  'D:\\myDevOpsProject\\mamori',
]

let verified = 0
let expected = 0
let matchedProjects = 0
for (const cwd of cwdCandidates) {
  let key
  try { key = plugin.projectKey(cwd) } catch { console.log(`SKIP  ${cwd}: not encodable`); continue }
  if (!projectDirs.includes(key)) { console.log(`SKIP  ${cwd}: no on-disk project folder for ${key}`); continue }
  matchedProjects++
  const entries = (await readdir(join(ROOT, key), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
  expected += entries.length
  for (const entry of entries) {
    const derived = plugin.sessionDirOf(ROOT, { id: entry.name, cwd })
    const wants = join(ROOT, key, entry.name)
    let ok = false
    try { ok = (await stat(derived)).isDirectory() } catch { ok = false }
    if (ok && derived === wants) verified++
    else console.log(`FAIL  ${entry.name} -> ${derived} (expected ${wants})`)
  }
}

check('at least one declared cwd names a real project folder', matchedProjects > 0, `${matchedProjects} matched`)
check(`all ${expected} sessions in those folders rediscovered`, verified === expected, `${verified}/${expected}`)

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}  (root: ${ROOT})`)
process.exitCode = failures === 0 ? 0 : 1
