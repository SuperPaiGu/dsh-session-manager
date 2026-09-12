/**
 * Read-only check that the plugin's path-encoding mirrors are faithful.
 *
 * `projectKey` and `encodeSegment` reproduce the shipped JSONL backend's
 * private helpers (`format.ts` is not part of the published package's exports,
 * and `logPath` needs `SESSION_FORMAT_VERSION`, which it does not re-export
 * either). A mirror can only be trusted against reality, so this checks the
 * mirrors against the session folders that actually exist on disk rather than
 * against hand-written example paths.
 *
 * The 0.4.0 plugin no longer derives paths at runtime — deletion was removed,
 * and with it the only consumer — but the encoding must keep matching, because
 * the decode direction is what tells an operator which project folder belongs
 * to a session. Re-run this after any DSH upgrade that touches session storage.
 *
 * Nothing is created, moved, or deleted.
 *
 * Usage: node tests/encoding-check.mjs [sessionsRoot]
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.argv[2]
  ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'sessions')

const plugin = await import(new URL('../index.js', import.meta.url).href)

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  ' + detail}`)
}

// 1. Encoding rules the shipped backend guarantees.
// `encodeSegment` encodes ONE path segment, so separators are escaped like any
// other unsafe code unit — that is what makes it injective over all strings and
// neutralizes `../` before any filesystem use.
{
  const cases = [
    ['', 'throws'],
    ['.', '~002E'],
    ['..', '~002E~002E'],
    ['session-1e124724-5366-4b02-9444-553c8ae6d2cd', 'session-1e124724-5366-4b02-9444-553c8ae6d2cd'],
    ['桌面', '~684C~9762'],
    ['a/b', 'a~002Fb'],
    ['a\\b', 'a~005Cb'],
    ['a~b', 'a~007Eb'],
    ['a:b', 'a~003Ab'],
  ]
  for (const [input, expected] of cases) {
    let actual
    try { actual = plugin.encodeSegment(input) } catch { actual = 'throws' }
    check(`encodeSegment(${JSON.stringify(input)})`, actual === expected, `got ${actual}`)
  }

  for (const cwd of ['D:\\dsh', 'D:\\桌面\\个人IP']) {
    let key
    try { key = plugin.projectKey(cwd) } catch (error) { key = 'throws: ' + String(error) }
    check(`projectKey(${JSON.stringify(cwd)}) is an encoded segment pair`,
      typeof key === 'string' && key.startsWith('--') && key.endsWith('--'), key)
  }

  let threw = false
  try { plugin.projectKey('') } catch { threw = true }
  check('projectKey rejects an empty path', threw)
}

// 2. Every real project folder under the sessions root must be *decodable*:
// the encoding is injective, so a folder name that round-trips to a readable
// path proves the mirror matches what actually wrote it.
{
  const dirs = (await readdir(ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  let decoded = 0
  for (const name of dirs) {
    // Rebuild the key for a candidate path and see whether the encoding is
    // self-consistent: re-encoding the decoded form must reproduce the name.
    const body = name.replace(/^--/, '').replace(/--$/, '')
    const readable = body.replace(/~([0-9A-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    const guess = readable.replace(/-/g, '\\')
    let reencoded
    try { reencoded = plugin.projectKey(guess) } catch { reencoded = '<throws>' }
    if (reencoded === name) decoded++
  }
  check(`all ${dirs.length} real project folders round-trip through the encoding`,
    decoded === dirs.length, `${decoded}/${dirs.length}`)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}  (root: ${ROOT})`)
process.exitCode = failures === 0 ? 0 : 1
