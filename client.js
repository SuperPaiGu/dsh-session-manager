/**
 * dsh-session-manager, browser half (v0.3.0).
 *
 * Registers ONE Conversation View into the shipped `conversation.view` slot
 * (session-scoped list, already occupied by `chat` order 0 and `trajectory`
 * order 10). With `order: 20` the 「归档」 tab lands to the right of 「对话」 and
 * 「轨迹」: the tab strip projects every entry of that slot, and the shell
 * renders only the active one (`renderSlot(..., { only: active.id })`), so the
 * label and the panel come from this single registration.
 *
 * Why this slot carries a session-wide list: `conversation.view` publishes
 * `useSessions` and `useWorkspaces` as standard hooks, and the session list is
 * NOT archive-filtered by the Host — `session-controller`'s `list()` returns
 * every persisted Session, while the sidebar removes archived rows at render
 * time (`sessionVisible` in ui-workspace derives with `archivedSessionIds`).
 * The archived rows are therefore present here and only hidden there, which is
 * exactly the raw material an archive browser needs.
 *
 * Deletion POSTs to the host `/session-manager/delete` endpoint, which sends
 * each session folder to the Windows Recycle Bin. Nothing is archived by this
 * plugin: the registry-global archive set has no removal path in 0.1.5, so
 * appending to it would only manufacture permanent orphans.
 *
 * Loaded by the client module system as /plugins/dsh-session-manager/client.js.
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-manager',
  factory: (require) => {
    const React = require('react')

    const CSS = `
.wsm-panel{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary)}
/* Both column edges carry a resize handle whose grab zone covers the whole
   ~40px strip it sits on, and both sit ABOVE the view, so any control under a
   strip turns the pointer into a resize cursor instead of a click. Measured
   against the live shell at a 1280 window, each handle sits ~116px inside its
   edge and reaches ~39px inward from there. The handles are anchored to the
   column's own edges while the column grows with the window, so a FIXED inset
   stops clearing them as the window widens; the inset therefore scales with
   the column. The list and footer carry the controls and take the wide inset
   on both sides; the bar and notices end in text and keep the Chat view's
   32px gutter so the panel still lines up with the conversation column. */
.wsm-gutter{padding-left:32px;padding-right:32px}
.wsm-list.wsm-gutter{padding-left:calc(120px + 12%);padding-right:calc(120px + 12%)}
.wsm-foot.wsm-gutter{padding-left:calc(120px + 12%);padding-right:calc(120px + 12%)}
.wsm-bar{display:flex;align-items:center;gap:8px;padding-top:10px;padding-bottom:10px;flex-wrap:wrap}
.wsm-count{color:var(--dsw-alias-label-secondary);font-size:12.5px}
.wsm-spacer{flex:1}
.wsm-btn{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);padding:4px 10px;border-radius:7px;font-size:12.5px;cursor:pointer}
.wsm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3)}
.wsm-btn:disabled{opacity:.6;cursor:default}
.wsm-btn.danger{background:none;border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-error,#e5534b)}
.wsm-list{flex:1;min-height:0;overflow:auto;padding-top:4px;padding-bottom:12px}
.wsm-row{display:flex;align-items:flex-start;gap:9px;padding:7px 8px;border-radius:8px}
.wsm-row:hover{background:var(--dsw-alias-bg-layer-2)}
.wsm-row input[type=checkbox]{margin-top:3px;flex:none}
.wsm-main{flex:1;min-width:0}
.wsm-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsm-sub{display:block;margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsm-tag{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;font-size:10.5px;line-height:16px;vertical-align:1px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.wsm-rowbtn{background:none;border:none;color:var(--dsw-alias-label-secondary);padding:3px 6px;border-radius:6px;cursor:pointer;font-size:12px;flex:none}
.wsm-rowbtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}
.wsm-rowbtn:disabled{opacity:.55;cursor:default}
.wsm-rowbtn.danger{color:var(--dsw-alias-label-error,#e5534b)}
.wsm-empty{padding:28px 0;text-align:center;color:var(--dsw-alias-label-secondary);white-space:pre-line}
.wsm-foot{display:flex;align-items:center;gap:8px;padding-top:9px;padding-bottom:9px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.wsm-err{color:var(--dsw-alias-label-error,#e5534b);font-size:12px;padding-top:6px;padding-bottom:6px}
.wsm-note{color:var(--dsw-alias-label-secondary);font-size:12px;background:var(--dsw-alias-bg-layer-2);padding-top:6px;padding-bottom:6px}
.wsm-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
.wsm-modal{width:min(440px,92vw);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px}
.wsm-modal-title{font-size:14px;font-weight:600;margin-bottom:10px}
.wsm-modal-body{font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.wsm-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
`

    /** Read the authoritative archive set from the host. */
    async function apiArchived() {
      const res = await fetch('/session-manager/archived').then((r) => r.json())
      if (!res || !res.ok || !Array.isArray(res.ids)) throw new Error('无法读取归档集合')
      return res.ids.map(String)
    }

    /** POST a batch of session ids to one host action endpoint. */
    async function apiCall(path, ids) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => r.json())
      if (!res || !res.ok) throw new Error((res && res.error) || '请求失败')
      return res.results || []
    }

    /** Relative time, coarse on purpose. */
    function relativeTime(ts) {
      if (typeof ts !== 'number' || !Number.isFinite(ts)) return ''
      const diff = Date.now() - ts
      if (diff < 0) return '刚刚'
      const min = Math.floor(diff / 60000)
      if (min < 1) return '刚刚'
      if (min < 60) return min + ' 分钟前'
      const hr = Math.floor(min / 60)
      if (hr < 24) return hr + ' 小时前'
      const day = Math.floor(hr / 24)
      if (day < 30) return day + ' 天前'
      return new Date(ts).toLocaleDateString()
    }

    /** Shared confirmation modal. */
    function ConfirmDialog({ title, body, busy, onCancel, onConfirm, confirmLabel }) {
      return React.createElement('div', { className: 'wsm-overlay', onClick: busy ? undefined : onCancel },
        React.createElement('div', { className: 'wsm-modal', onClick: (e) => e.stopPropagation() },
          React.createElement('div', { className: 'wsm-modal-title' }, title),
          React.createElement('div', { className: 'wsm-modal-body' }, body),
          React.createElement('div', { className: 'wsm-modal-foot' },
            React.createElement('button', { type: 'button', className: 'wsm-btn', disabled: busy, onClick: onCancel }, '取消'),
            React.createElement('button', { type: 'button', className: 'wsm-btn danger', disabled: busy, onClick: onConfirm }, busy ? '处理中…' : confirmLabel),
          ),
        ),
      )
    }

    /**
     * The 「归档」 panel — the archive set is the recycle bin, so this lists
     * ONLY archived sessions. Hook calls stay unconditional at the top; the
     * session array is derived with useMemo over the two framework hooks.
     *
     * `removed` carries ids this panel has already acted on (restored or
     * deleted). The archive set a client holds arrives with the connection
     * snapshot and is not re-read afterwards, so without it a restored row
     * would reappear here until the page reloads.
     */
    function ArchivePanel(props) {
      const list = props.useSessions((s) => s)
      const hookIds = props.useWorkspaces((s) => s.archivedSessionIds)
      const [hostIds, setHostIds] = React.useState(null)
      const [selected, setSelected] = React.useState(() => new Set())
      const [removed, setRemoved] = React.useState(() => new Set())
      const [confirm, setConfirm] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)

      // The archive set a client holds arrives with the workspace snapshot and
      // is not re-read afterwards, so it can lag the Host after another
      // instance archives or restores a session. Read the authoritative set
      // from the Host on mount and after every mutation, and keep the
      // framework hook only as the initial fallback.
      const reload = React.useCallback(async () => {
        try {
          setHostIds(await apiArchived())
        } catch (reason) {
          setError(String((reason && reason.message) || reason))
        }
      }, [])

      React.useEffect(() => { void reload() }, [reload])

      // The archive set can move under this panel: another DSH instance sharing
      // the home directory, or the official sidebar's archive action in this
      // one. Neither pushes a frame the panel can subscribe to, so poll while
      // the view is mounted and let the count correct itself.
      React.useEffect(() => {
        const handle = setInterval(() => { void reload() }, 4000)
        return () => { clearInterval(handle) }
      }, [reload])

      const archived = React.useMemo(
        () => new Set(hostIds === null ? (hookIds || []) : hostIds),
        [hostIds, hookIds],
      )

      const rows = React.useMemo(() => {
        const all = list.ids
          .map((id) => list.byId[id])
          .filter((s) => s !== undefined
            && s.origin !== 'subagent'
            && archived.has(String(s.id))
            && !removed.has(String(s.id)))
        const arr = all.slice()
        arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        return arr
      }, [list, archived, removed])

      const hiddenCount = React.useMemo(() => list.ids.reduce(
        (n, id) => (list.byId[id] !== undefined && archived.has(String(id)) ? n + 1 : n), 0,
      ), [list, archived])

      const selectable = rows.filter((s) => !s.running)
      const allSelected = selectable.length > 0 && selectable.every((s) => selected.has(s.id))

      const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })

      /**
       * Drop ids from this panel's list and report the outcome. A row is only
       * removed for an operation that actually happened; `skipped` means the
       * Host did nothing (running session, nothing on disk), and reporting it
       * as a failure would be as wrong as silently dropping the row.
       */
      const settle = (results, label, refresh) => {
        const done = results.filter((r) => r.status === 'ok' || r.status === 'deleted').map((r) => r.id)
        const failed = results.filter((r) => r.status === 'error')
        const skipped = results.filter((r) => r.status === 'skipped')
        setRemoved((prev) => {
          const next = new Set(prev)
          for (const id of done) next.add(String(id))
          return next
        })
        setSelected(new Set())
        setConfirm(null)
        if (typeof refresh === 'function') refresh()
        if (failed.length > 0) {
          setError(failed.length + ' 个会话' + label + '失败：'
            + failed.map((r) => r.message || r.reason || r.status).join('；').slice(0, 400))
        }
        if (skipped.length > 0) {
          const reasons = [...new Set(skipped.map((r) => r.reason || 'skipped'))]
          setNotice(skipped.length + ' 个会话未' + label + '：' + reasons.map((reason) => (
            reason === 'running' ? '正在运行'
              : reason === 'no-artifact' ? '磁盘上没有它的文件夹（它保持在归档区，未做改动）'
                : reason === 'missing' ? '已不在会话记录里'
                  : reason === 'not-archived' ? '本来就不在归档区'
                    : reason
          )).join('；'))
        }
      }

      const runDelete = async (ids) => {
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
          settle(await apiCall('/session-manager/delete', ids), '删除', props.onChanged)
          await reload()
        } catch (reason) {
          setError(String((reason && reason.message) || reason))
        } finally {
          setBusy(false)
        }
      }

      const runRestore = async (ids) => {
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
          const results = await apiCall('/session-manager/restore', ids)
          settle(results, '恢复')
          await reload()
          const pending = results.filter((r) => r.status === 'ok' && r.registry === 'stale-until-restart').length
          if (pending > 0) setNotice('已从归档区恢复 ' + pending + ' 个会话；若侧栏没立刻出现，刷新一下页面。')
        } catch (reason) {
          setError(String((reason && reason.message) || reason))
        } finally {
          setBusy(false)
        }
      }

      const list2 = rows.map((s) => React.createElement('div', { className: 'wsm-row', key: s.id },
        React.createElement('input', {
          type: 'checkbox',
          checked: selected.has(s.id),
          disabled: s.running,
          title: s.running ? '正在运行，无法删除' : '选择',
          onChange: () => toggle(s.id),
        }),
        React.createElement('div', { className: 'wsm-main' },
          React.createElement('span', { className: 'wsm-title', title: s.title },
            s.title || s.id,
            s.running && React.createElement('span', { className: 'wsm-tag' }, '运行中'),
          ),
          React.createElement('span', { className: 'wsm-sub', title: (s.cwd || '') + '  ·  ' + s.id },
            (s.cwd || '（无目录）') + '  ·  ' + (relativeTime(s.updatedAt) || '未知时间')),
        ),
        React.createElement('button', {
          type: 'button',
          className: 'wsm-rowbtn',
          disabled: busy,
          title: '恢复到侧栏（取消归档）',
          onClick: () => { void runRestore([s.id]) },
        }, '恢复'),
        React.createElement('button', {
          type: 'button',
          className: 'wsm-rowbtn danger',
          disabled: s.running || busy,
          title: s.running ? '正在运行，无法删除' : '删除该会话（进系统回收站）',
          onClick: () => setConfirm({ kind: 'one', ids: [s.id], title: s.title || s.id }),
        }, '删除'),
      ))

      return React.createElement('div', { className: 'wsm-panel' },
        React.createElement('div', { className: 'wsm-bar wsm-gutter' },
          React.createElement('span', { className: 'wsm-count' },
            '归档区 ' + rows.length + ' 个' + (hiddenCount > rows.length ? '（共 ' + hiddenCount + ' 条归档记录）' : '')),
          React.createElement('span', { className: 'wsm-spacer' }),
          React.createElement('button', {
            type: 'button', className: 'wsm-btn', disabled: selectable.length === 0,
            onClick: () => setSelected(allSelected ? new Set() : new Set(selectable.map((s) => s.id))),
          }, allSelected ? '取消全选' : '全选'),
        ),
        error !== null && React.createElement('div', { className: 'wsm-err wsm-gutter' }, error),
        notice !== null && React.createElement('div', { className: 'wsm-note wsm-gutter' }, notice),
        rows.length === 0
          ? React.createElement('div', { className: 'wsm-empty wsm-gutter' },
            '归档区里没有还留着文件的会话。\n\n在侧栏用会话的「归档会话」把会话移进来，就会出现在这里。')
          : React.createElement('div', { className: 'wsm-list wsm-gutter' }, list2),
        React.createElement('div', { className: 'wsm-foot wsm-gutter' },
          React.createElement('span', { className: 'wsm-count' },
            selected.size > 0 ? '已选 ' + selected.size + ' 个' : '勾选后可批量恢复或删除'),
          React.createElement('span', { className: 'wsm-spacer' }),
          React.createElement('button', {
            type: 'button',
            className: 'wsm-btn',
            disabled: selected.size === 0 || busy,
            onClick: () => { void runRestore([...selected]) },
          }, '恢复选中'),
          React.createElement('button', {
            type: 'button',
            className: 'wsm-btn danger',
            disabled: selected.size === 0 || busy,
            onClick: () => setConfirm({ kind: 'batch', ids: [...selected], title: null }),
          }, '删除选中'),
        ),
        confirm !== null && React.createElement(ConfirmDialog, {
          title: confirm.kind === 'batch' ? '批量删除会话' : '删除会话',
          body: (confirm.kind === 'batch'
            ? '确定要删除选中的 ' + confirm.ids.length + ' 个会话吗？'
            : '确定要删除会话“' + confirm.title + '”吗？')
            + '\n\n它们的日志文件夹会被移入系统回收站，可以从回收站恢复。',
          busy,
          onCancel: () => { if (!busy) setConfirm(null) },
          onConfirm: () => { void runDelete(confirm.ids) },
          confirmLabel: '确定删除',
        }),
      )
    }

    /** Stable component identity: props are read through the framework hooks. */
    function ArchiveView(props) {
      return React.createElement(ArchivePanel, props)
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-session-manager'
        style.textContent = CSS
        document.head.append(style)
        ctx.effect(() => () => style.remove(), 'session-manager: styles')

        // Deleted sessions were cold by definition (a running one is skipped),
        // so the Host list re-read from disk drops them right away.
        const ArchiveEntry = (props) => React.createElement(ArchiveView, {
          ...props,
          onDeleted: () => { void ctx.sessions.refresh() },
        })

        // `conversation.view` is declared by the conversation shell, which may
        // activate after this row. A bare register would run against an
        // undeclared slot and fail the whole loader entry, so wait for the
        // declaration: `slots.inject` installs on declaration, removes the
        // contribution when the declaration collapses, and reruns on
        // redeclaration.
        ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'archive',
          order: 20,
          label: '归档',
        }, ArchiveEntry)), 'session-manager: archive view')
      },
    }
  },
})
