/**
 * dsh-session-manager, browser half — additive-only build (v0.2.3).
 *
 * Does NOT replace the official sidebar. It adds pieces through DSH's own
 * additive slots, so every official feature is preserved:
 *   - conversation.session.header.actions : a「删除会话」button per open
 *     session header (deletes the current session into the Recycle Bin).
 *   - sidebar.footer.action               : a「批量管理会话」button at the
 *     sidebar foot; the batch panel renders as a child component of the
 *     button (independent hooks, no React #310).
 *
 * Deletion POSTs to the host `/session-manager/delete` endpoint, which recycles
 * the session folders into the OS Recycle Bin and skips running sessions.
 *
 * Loaded by the client module system as /plugins/dsh-session-manager/client.js.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-manager',
  factory: (require) => {
    const React = require('react')

    const CSS = `
.wsm-ibtn{background:none;border:none;color:var(--dsw-alias-label-secondary);padding:4px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.wsm-ibtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.wsm-fbtn{background:none;border:none;color:var(--dsw-alias-label-primary);padding:4px 8px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;white-space:nowrap}
.wsm-fbtn:hover{background:var(--dsw-alias-bg-layer-2)}
.wsm-fbtn .wsm-lbl{font-size:12px}
.wsm-modal-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:10px}
.wsm-modal-body{font-size:12.5px;color:var(--dsw-alias-label-secondary);margin-bottom:14px;max-height:40vh;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
.wsm-modal-foot{display:flex;justify-content:flex-end;gap:8px}
.wsm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:1000}
.wsm-modal{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;min-width:300px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.25)}
.wsm-btn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 10px;font-size:12.5px;cursor:pointer}
.wsm-btn:hover{filter:brightness(1.08)}
.wsm-btn.danger{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:#fff}
.wsm-btn:disabled{opacity:.6;cursor:default}
.wsm-panel{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;width:min(560px,92vw);max-height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.3);pointer-events:auto}
.wsm-panel-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.wsm-panel-title{flex:1;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.wsm-panel-x{background:none;border:none;color:var(--dsw-alias-label-secondary);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:6px;line-height:1}
.wsm-panel-x:hover{background:var(--dsw-alias-bg-layer-2)}
.wsm-panel-list{flex:1;overflow-y:auto;border-top:1px solid var(--dsw-alias-border-l1);padding-top:8px;display:flex;flex-direction:column;gap:2px}
.wsm-pitem{display:flex;align-items:center;gap:8px;padding:6px 6px;border-radius:6px}
.wsm-pitem:hover{background:var(--dsw-alias-bg-layer-1)}
.wsm-pitem input{accent-color:var(--dsw-alias-brand-primary);flex:none;margin:0;cursor:pointer}
.wsm-pitem-title{flex:1;font-size:12.5px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsm-pitem-meta{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}
.wsm-panel-bar{display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px;margin-top:10px}
.wsm-panel-bar span{flex:1;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.wsm-error{color:var(--dsw-alias-state-error-primary);font-size:12px;padding:8px 4px}
`

    const svg = (d, size) => React.createElement('svg', {
      width: size || 15, height: size || 15, viewBox: '0 0 16 16', fill: 'currentColor',
    }, React.createElement('path', { d }))
    const IconTrash = () => svg('M5.5 3.5h5M6.8 2.4h2.4v1.1H6.8V2.4ZM4 4.6h8l-.8 8.6a1 1 0 0 1-1 .9H5.8a1 1 0 0 1-1-.9L4 4.6Z')
    const IconBatch = () => svg('M3 3h2v2H3V3Zm0.6 0Zm3.2 0H10v2H6.8V3Zm4.2 0h2v2h-2V3ZM3 7h2v2H3V7Zm0 4h2v2H3v-2Zm3.8-4H10v2H6.8V7Zm4.2 0h2v2h-2V7ZM6.8 11H10v2H6.8v-2Zm4.2 0h2v2h-2v-2Z')
    const IconClose = () => svg('M4 4l8 8M12 4l-8 8')

    /** POST a batch of session ids to the host delete endpoint; returns per-session results. */
    async function apiDelete(ids) {
      const res = await fetch('/session-manager/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => r.json())
      if (!res || !res.ok) throw new Error((res && res.error) || '删除请求失败')
      return res.results || []
    }

    /** Shared confirmation modal (fixed overlay, additive-safe). */
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

    /** ① 会话头部动作：「删除会话」 */
    function DeleteHeaderButton(props) {
      const [confirm, setConfirm] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const sessionId = props.sessionId
      const snapshot = props.useSession((s) => s)
      const title = (snapshot && snapshot.session && snapshot.session.title) || sessionId

      const doDelete = async () => {
        if (busy) return
        setBusy(true); setError(null)
        try {
          const results = await apiDelete([sessionId])
          const deleted = results.filter((r) => r.status === 'deleted')
          if (deleted.length === 0) {
            const first = results[0]
            const reason = first && (first.reason || first.message)
            let why = reason === 'running' ? '该会话正在运行，已被跳过'
              : reason === 'missing' ? '该会话不存在（可能已删除）'
                : (reason || '未知原因')
            setError('未删除：' + why)
            setBusy(false)
            return
          }
          setBusy(false)
          setConfirm(false)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }

      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button', className: 'wsm-ibtn', title: '删除会话',
          onClick: () => { setConfirm(true); setError(null) },
        }, React.createElement(IconTrash)),
        confirm && React.createElement(ConfirmDialog, {
          title: '删除会话', busy,
          body: '确定要删除会话“' + (title || sessionId) + '”吗？其日志将移入系统回收站（可从回收站恢复）。' + (error ? '\n' + error : ''),
          onCancel: () => { if (!busy) setConfirm(false) },
          onConfirm: doDelete,
          confirmLabel: '确定',
        }),
      )
    }

    /** ② 侧栏底部：批量管理会话按钮（独立组件，面板作为子组件元素渲染） */
    function FooterButton(props) {
      const [open, setOpen] = React.useState(false)
      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button', className: 'wsm-fbtn', title: '批量管理会话',
          onClick: () => setOpen(true),
        },
          React.createElement(IconBatch),
          props.wide && React.createElement('span', { className: 'wsm-lbl' }, '批量管理会话'),
        ),
        open && React.createElement(BatchPanel, { ...props, onClose: () => setOpen(false) }),
      )
    }

    /** ③ 批量管理面板（独立组件，hooks 恒定，避免 React #310） */
    function BatchPanel(props) {
      const list = props.useSessions((s) => s)
      const workspaces = props.useWorkspaces((s) => s.items)
      const onClose = props.onClose
      const [selected, setSelected] = React.useState(new Set())
      const [confirm, setConfirm] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      // 全部可见会话（工作区成员 + 未分组），最新在前
      const sessions = React.useMemo(() => {
        const arr = list.ids
          .map((id) => list.byId[id])
          .filter((s) => s !== undefined && s.origin !== 'subagent')
        arr.sort((a, b) => b.updatedAt - a.updatedAt)
        return arr
      }, [list])
      const allSelected = sessions.length > 0 && sessions.every((s) => selected.has(s.id))

      const toggle = (id) => setSelected((prev) => {
        const n = new Set(prev)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })

      const doDeleteSelected = async () => {
        if (busy) return
        const ids = [...selected]
        if (ids.length === 0) return
        setBusy(true); setError(null)
        try {
          const results = await apiDelete(ids)
          const deleted = new Set(results.filter((r) => r.status === 'deleted').map((r) => r.id))
          const skipped = results.filter((r) => r.status !== 'deleted')
          setSelected((prev) => new Set([...prev].filter((id) => !deleted.has(id))))
          setConfirm(false)
          setBusy(false)
          if (skipped.length > 0) {
            setError('部分未删除：' + skipped.map((s) => s.reason || s.message || s.status).join('；'))
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        }
      }

      const rows = sessions.map((s) =>
        React.createElement('div', { key: s.id, className: 'wsm-pitem' },
          React.createElement('input', {
            type: 'checkbox', checked: selected.has(s.id),
            onChange: () => toggle(s.id),
          }),
          React.createElement('span', { className: 'wsm-pitem-title' }, s.title || s.id),
          React.createElement('span', { className: 'wsm-pitem-meta' },
            s.running ? '进行中' : (s.completed === true ? '已完成' : '空闲')),
        ))

      return React.createElement('div', { className: 'wsm-overlay', onClick: busy ? undefined : onClose },
        React.createElement('div', { className: 'wsm-panel', onClick: (e) => e.stopPropagation() },
          React.createElement('div', { className: 'wsm-panel-head' },
            React.createElement('span', { className: 'wsm-panel-title' }, '批量管理会话'),
            React.createElement('button', { type: 'button', className: 'wsm-panel-x', onClick: onClose }, React.createElement(IconClose)),
          ),
          React.createElement('div', { className: 'wsm-panel-list' }, rows),
          error && React.createElement('div', { className: 'wsm-error' }, error),
          React.createElement('div', { className: 'wsm-panel-bar' },
            React.createElement('span', {}, '已选 ' + selected.size + ' 个会话'),
            React.createElement('button', {
              type: 'button', className: 'wsm-btn',
              onClick: () => setSelected(allSelected ? new Set() : new Set(sessions.map((s) => s.id))),
            }, allSelected ? '清空' : '全选'),
            React.createElement('button', {
              type: 'button', className: 'wsm-btn danger', disabled: selected.size === 0 || busy,
              onClick: () => { setError(null); setConfirm(true) },
            }, '删除选中'),
          ),
          confirm && React.createElement(ConfirmDialog, {
            title: '批量删除会话', busy,
            body: '确定要删除选中的 ' + selected.size + ' 个会话吗？其日志将移入系统回收站（可从回收站恢复）。',
            onCancel: () => { if (!busy) setConfirm(false) },
            onConfirm: doDeleteSelected,
            confirmLabel: '确定',
          }),
        ),
      )
    }

    return {
      inject: ['slots', 'sessions', 'workspaces', 'locale'],
      apply(ctx) {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-session-manager'
        style.textContent = CSS
        document.head.append(style)
        ctx.effect(() => () => style.remove(), 'session-manager: styles')

        // ① 会话头部「删除会话」(header.actions, list/session)
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'session-manager-delete',
          order: 100,
        }, DeleteHeaderButton))

        // ② 侧栏底部「批量管理会话」(footer.action, list/root) —— 独立组件，
        // 批量面板作为其子组件按 open 渲染，无 hooks 顺序问题。
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'session-manager-batch',
          order: 100,
        }, FooterButton))
      },
    }
  },
})
