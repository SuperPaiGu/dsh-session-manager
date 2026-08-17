/**
 * dsh-session-manager, browser half.
 *
 * Replaces the shell's workspace-browser region (`sidebar.workspaces`) with a
 * compact manager:
 *   - each workspace's "…" menu gains「批量管理会话」(batch select + delete);
 *   - each session's "…" menu gains「删除会话」(single delete);
 *   - batch mode puts a checkbox in front of every session row.
 * Deletes POST to the host `/session-manager/delete` endpoint, which recycles
 * the session folders into the OS Recycle Bin and skips running sessions.
 * No archive region and no "archive" menu action (the user does not archive).
 *
 * Loaded by the client module system as /plugins/dsh-session-manager/client.js;
 * the factory returns a real cordis plugin ({ inject, apply }).
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-manager',
  factory: (require) => {
    const React = require('react')

    const CSS = `
.wsm-root{display:flex;flex-direction:column;height:100%;overflow:hidden}
.wsm-header{display:flex;align-items:center;gap:6px;padding:8px 10px}
.wsm-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsm-iconbtn{background:none;border:none;color:var(--dsw-alias-label-secondary);padding:4px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center}
.wsm-iconbtn:hover{background:var(--dsw-alias-bg-layer-2)}
.wsm-tree{flex:1;overflow-y:auto;padding:4px 6px 14px}
.wsm-group{margin:2px 0}
.wsm-grouphead{display:flex;align-items:center;gap:5px;padding:6px 8px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-primary)}
.wsm-grouphead:hover{background:var(--dsw-alias-bg-layer-1)}
.wsm-icon{width:15px;height:15px;flex:none;color:var(--dsw-alias-label-secondary)}
.wsm-chev{width:12px;height:12px;flex:none;color:var(--dsw-alias-label-secondary);transition:transform .15s}
.wsm-chev.open{transform:rotate(90deg)}
.wsm-grouplabel{flex:1;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsm-count{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}
.wsm-rowactions{display:flex;gap:2px;align-items:center;opacity:0}
.wsm-grouphead:hover .wsm-rowactions,.wsm-row:hover .wsm-rowactions{opacity:1}
.wsm-batchbar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
.wsm-btn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 10px;font-size:12.5px;cursor:pointer}
.wsm-btn:hover{filter:brightness(1.08)}
.wsm-btn.danger{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:#fff}
.wsm-btn:disabled{opacity:.6;cursor:default}
.wsm-row{display:flex;align-items:center;gap:6px;padding:5px 8px 5px 18px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-primary)}
.wsm-row:hover{background:var(--dsw-alias-bg-layer-1)}
.wsm-row.selected{background:var(--dsw-alias-bg-layer-2)}
.wsm-check{accent-color:var(--dsw-alias-brand-primary);flex:none;margin:0;cursor:pointer}
.wsm-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary)}
.wsm-dot.warn{background:var(--dsw-alias-state-warn-primary)}
.wsm-rowtitle{flex:1;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wsm-time{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}
.wsm-empty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:6px 12px}
.wsm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:1000}
.wsm-modal{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;min-width:300px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.25)}
.wsm-modal-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:10px}
.wsm-modal-body{font-size:12.5px;color:var(--dsw-alias-label-secondary);margin-bottom:14px;max-height:40vh;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
.wsm-modal-foot{display:flex;justify-content:flex-end;gap:8px}
.wsm-menu-layer{position:fixed;inset:0;z-index:950}
.wsm-menu{position:fixed;min-width:150px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.2);display:flex;flex-direction:column}
.wsm-menu-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 10px;border:none;background:none;border-radius:6px;cursor:pointer;font-size:12.5px;color:var(--dsw-alias-label-primary)}
.wsm-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}
.wsm-menu-item.danger{color:var(--dsw-alias-state-error-primary)}
.wsm-input{width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 9px;font-size:12.5px;color:var(--dsw-alias-label-primary);margin-bottom:10px}
.wsm-error{color:var(--dsw-alias-state-error-primary);font-size:12px;margin-bottom:8px}
`

    const ZH = {
      'section.workspaces': '工作区',
      'group.ungrouped': '未分组',
      'session.new': '新会话',
      'workspace.add': '添加工作区',
      'batch.manage': '批量管理会话',
      'batch.exit': '退出',
      'batch.selectAll': '全选',
      'batch.clear': '清空',
      'batch.selected': '已选 {n} 个会话',
      'batch.delete': '删除选中',
      'batch.deleteTitle': '批量删除会话',
      'batch.deleteDesc': '确定要删除选中的 {n} 个会话吗？会话日志将移入系统回收站（可从回收站恢复）。',
      'delete.session': '删除会话',
      'delete.sessionTitle': '删除会话',
      'delete.sessionDesc': '确定要删除会话“{name}”吗？其日志将移入系统回收站（可从回收站恢复）。',
      'rename': '重命名',
      'rename.workspace': '重命名工作区',
      'rename.session': '重命名会话',
      'delete.workspace': '删除工作区',
      'menu.fork': '分叉会话',
      'confirm': '确定',
      'cancel': '取消',
      'busy': '处理中…',
      'empty': '暂无会话',
      'time.now': '刚刚',
      'time.minutes': '{n}分钟',
      'time.hours': '{n}小时',
      'time.days': '{n}天',
      'time.months': '{n}个月',
      'time.years': '{n}年',
      'status.idle': '空闲',
      'status.running': '进行中',
      'status.completed': '已完成',
      'status.waitingApproval': '等待审批',
      'status.planReview': '计划待审',
      'status.waitingAnswer': '等待回答',
      'sessions.expand': '展开其余 {n} 个会话',
    }
    const EN = Object.fromEntries(Object.entries(ZH).map(([k, v]) => [k, v]))

    /** Translate bound to zh for now; kept as a pure function for parity. */
    function makeT(dict) {
      return (key, params) => {
        let text = dict[key] ?? key
        if (params !== undefined) {
          for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
          }
        }
        return text
      }
    }

    const svg = (d, size) => React.createElement('svg', {
      width: size || 15, height: size || 15, viewBox: '0 0 16 16', fill: 'currentColor',
    }, React.createElement('path', { d }))
    const IconMore = () => svg('M2 8a1.6 1.6 0 1 1 3.2 0A1.6 1.6 0 0 1 2 8Zm4.4 0a1.6 1.6 0 1 1 3.2 0 1.6 1.6 0 0 1-3.2 0Zm4.4 0a1.6 1.6 0 1 1 3.2 0 1.6 1.6 0 0 1-3.2 0Z')
    const IconFolder = () => svg('M1.5 3.5A1.5 1.5 0 0 1 3 2h3l1.5 2H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9Z')
    const IconArrow = () => svg('M5.5 3l5 5-5 5V3Z')
    const IconPlus = () => svg('M8 3v10M3 8h10')
    const IconTrash = () => svg('M5.5 3.5h5M6.8 2.4h2.4v1.1H6.8V2.4ZM4 4.6h8l-.8 8.6a1 1 0 0 1-1 .9H5.8a1 1 0 0 1-1-.9L4 4.6Z')
    const IconEdit = () => svg('M11.4 1.6l3 3L6 13H3v-3l8.4-8.4Z')
    const IconBranch = () => svg('M4 2.5v3M4 5.5a3 3 0 0 0 3 3h2a3 3 0 0 1 3 3v1.5M4 5.5v8M12 5.5v3')

    function timeText(updatedAt, now, t) {
      const MIN = 60000, HOUR = 3600000, DAY = 86400000
      const diff = Math.max(0, now - updatedAt)
      if (diff < MIN) return t('time.now')
      if (diff < HOUR) return t('time.minutes', { n: Math.floor(diff / MIN) })
      if (diff < DAY) return t('time.hours', { n: Math.floor(diff / HOUR) })
      if (diff < 30 * DAY) return t('time.days', { n: Math.floor(diff / DAY) })
      if (diff < 365 * DAY) return t('time.months', { n: Math.floor(diff / (30 * DAY)) })
      return t('time.years', { n: Math.floor(diff / (365 * DAY)) })
    }

    function buildGroups(list, workspaces, deleted, t) {
      const deletedSet = new Set(deleted)
      const current = list.current
      const visible = (s) => s !== undefined
        && s.origin !== 'subagent'
        && !deletedSet.has(s.id)
        && (!s.blank || s.id === current)
      const groups = []
      const accounted = new Set()
      for (const w of workspaces) {
        const members = []
        for (const id of w.sessionIds) {
          const s = list.byId[id]
          if (s === undefined) continue
          accounted.add(s.id)
          if (visible(s)) members.push(s)
        }
        if (members.length > 0) groups.push({ key: w.workspaceId, workspaceId: w.workspaceId, label: w.title, sessions: members })
      }
      const stray = list.ids
        .map((id) => list.byId[id])
        .filter((s) => s !== undefined && !accounted.has(s.id) && visible(s))
      if (stray.length > 0) groups.push({ key: '', workspaceId: undefined, label: t('group.ungrouped'), sessions: stray })
      return groups
    }

    const Modal = ({ title, body, busy, onCancel, onConfirm, confirmLabel, danger, t }) => React.createElement(
      'div', { className: 'wsm-overlay', onClick: busy ? undefined : onCancel },
      React.createElement('div', { className: 'wsm-modal', onClick: (e) => e.stopPropagation() },
        React.createElement('div', { className: 'wsm-modal-title' }, title),
        React.createElement('div', { className: 'wsm-modal-body' }, body),
        React.createElement('div', { className: 'wsm-modal-foot' },
          React.createElement('button', { type: 'button', className: 'wsm-btn', disabled: busy, onClick: onCancel }, t('cancel')),
          React.createElement('button', { type: 'button', className: danger ? 'wsm-btn danger' : 'wsm-btn', disabled: busy, onClick: onConfirm }, busy ? t('busy') : confirmLabel),
        ),
      ),
    )

    const SessionRow = ({ s, currentId, now, batchMode, selected, onToggle, onOpen, onMenu, t }) => {
      const statusLabel = s.running ? t('status.running')
        : (s.completed === true ? t('status.completed') : t('status.idle'))
      const warn = s.pendingInteraction ? ' warn' : ''
      return React.createElement(
        'div', {
          className: 'wsm-row' + (s.id === currentId ? ' selected' : ''),
          role: 'treeitem',
          onClick: () => onOpen(s.id),
        },
        batchMode && React.createElement('input', {
          type: 'checkbox', className: 'wsm-check',
          checked: !!selected,
          onChange: (e) => { e.stopPropagation(); onToggle(s.id) },
          onClick: (e) => e.stopPropagation(),
        }),
        React.createElement('span', { className: 'wsm-dot' + warn, title: statusLabel }),
        React.createElement('span', { className: 'wsm-rowtitle' }, s.blank ? t('session.new') : s.title),
        !s.blank && React.createElement('span', { className: 'wsm-time' }, timeText(s.updatedAt, now, t)),
        !s.blank && React.createElement('span', { className: 'wsm-rowactions' },
          React.createElement('button', {
            type: 'button', className: 'wsm-iconbtn', 'aria-label': '会话操作',
            onClick: (e) => { e.stopPropagation(); onMenu(s.id, e) },
          }, React.createElement(IconMore)),
        ),
      )
    }

    function createManager(ctx) {
      const t = makeT(ZH)

      function Manager(props) {
        const { wide, expandSidebar, useSessions, useWorkspaces } = props
        const list = useSessions((s) => s)
        const workspaces = useWorkspaces((s) => s.items)
        const [expanded, setExpanded] = React.useState({})
        const [batchMode, setBatchMode] = React.useState(false)
        const [selected, setSelected] = React.useState(new Set())
        const [deleted, setDeleted] = React.useState(new Set())
        const [menu, setMenu] = React.useState(null)
        const [renameWs, setRenameWs] = React.useState(null)
        const [renameSession, setRenameSession] = React.useState(null)
        const [deleteWs, setDeleteWs] = React.useState(null)
        const [deleteSession, setDeleteSession] = React.useState(null)
        const [batchDelete, setBatchDelete] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState(null)
        const now = Date.now()
        const groups = React.useMemo(
          () => buildGroups(list, workspaces, [...deleted], t),
          [list, workspaces, deleted],
        )
        const allSelectable = React.useMemo(() => {
          const ids = []
          for (const g of groups) for (const s of g.sessions) ids.push(s.id)
          return ids
        }, [groups])

        const toggleSelect = (id) => setSelected((prev) => {
          const n = new Set(prev)
          if (n.has(id)) n.delete(id)
          else n.add(id)
          return n
        })
        const onMenuOpen = (kind, id, e) => {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ kind, id, x: r.right - 170, y: r.bottom + 4 })
        }

        const apiDelete = async (ids) => {
          const res = await fetch('/session-manager/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids }),
          }).then((r) => r.json())
          if (!res || !res.ok) throw new Error((res && res.error) || '删除请求失败')
          return res.results || []
        }

        const runDelete = async (ids) => {
          setBusy(true); setError(null)
          try {
            const results = await apiDelete(ids)
            const okIds = results.filter((r) => r.status === 'deleted').map((r) => r.id)
            const skipped = results.filter((r) => r.status !== 'deleted')
            setDeleted((prev) => new Set([...prev, ...okIds]))
            setSelected((prev) => new Set([...prev].filter((id) => !okIds.includes(id))))
            if (skipped.length > 0) {
              setError('部分会话未删除：' + skipped.map((s) => s.reason || s.message || s.status).join('；'))
              return false
            }
            return true
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            return false
          } finally {
            setBusy(false)
          }
        }

        const confirmDeleteSession = async () => {
          if (deleteSession === null) return
          const ok = await runDelete([deleteSession.id])
          if (ok) { setDeleteSession(null); setError(null) }
        }
        const confirmBatchDelete = async () => {
          const ids = [...selected]
          if (ids.length === 0) { setBatchDelete(false); return }
          const ok = await runDelete(ids)
          if (ok) { setBatchDelete(false); setError(null) }
        }

        const addWorkspace = async () => {
          try {
            const path = await ctx.workspaces.pickDirectory()
            if (path) { const ws = await ctx.workspaces.create({ path }); await ctx.workspaces.startSession(ws.workspaceId) }
          } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
        }

        const currentMenuItems = () => {
          if (menu === null) return []
          if (menu.kind === 'ws') {
            return [
              { id: 'rename', label: t('rename.workspace'), icon: React.createElement(IconEdit) },
              { id: 'delete', label: t('delete.workspace'), icon: React.createElement(IconTrash), danger: true },
              { id: 'batch', label: t('batch.manage'), icon: React.createElement(IconEdit) },
            ]
          }
          return [
            { id: 'rename', label: t('rename.session'), icon: React.createElement(IconEdit) },
            { id: 'fork', label: t('menu.fork'), icon: React.createElement(IconBranch) },
            { id: 'delete', label: t('delete.session'), icon: React.createElement(IconTrash), danger: true },
          ]
        }
        const onMenuSelect = (id) => {
          const m = menu
          setMenu(null)
          if (m === null) return
          if (m.kind === 'ws') {
            if (id === 'rename') { const w = workspaces.find((x) => x.workspaceId === m.id); if (w) setRenameWs({ id: w.workspaceId, title: w.title }) }
            else if (id === 'delete') { const w = workspaces.find((x) => x.workspaceId === m.id); if (w) setDeleteWs({ id: w.workspaceId, title: w.title }) }
            else if (id === 'batch') { setBatchMode(true); setSelected(new Set()); setError(null) }
          } else {
            const s = list.byId[m.id]
            if (s === undefined) return
            if (id === 'rename') setRenameSession({ id: s.id, title: s.title })
            else if (id === 'fork') {
              ctx.sessions.fork({ sessionId: s.id, increaseTitle: true }).then((childId) => ctx.sessions.open(childId)).catch(() => {})
            } else if (id === 'delete') setDeleteSession({ id: s.id, title: s.title })
          }
        }

        const doRenameSession = async (sessionId, title) => {
          const session = ctx.sessions.binding(sessionId)?.session
          if (session === undefined) throw new Error('unknown session')
          const result = await session.rename(title)
          if (!result.ok) throw new Error(result.error.message)
        }

        const allSelected = allSelectable.length > 0 && allSelectable.every((id) => selected.has(id))

        return React.createElement('div', { className: 'wsm-root' },
          React.createElement('div', { className: 'wsm-header' },
            React.createElement('span', { className: 'wsm-title' }, batchMode ? t('batch.manage') : t('section.workspaces')),
            wide && React.createElement('button', {
              type: 'button', className: 'wsm-iconbtn', title: t('workspace.add'), onClick: addWorkspace,
            }, React.createElement(IconPlus)),
            !wide && React.createElement('button', {
              type: 'button', className: 'wsm-iconbtn', title: t('section.workspaces'), onClick: () => expandSidebar(),
            }, React.createElement(IconArrow)),
          ),
          error !== null && React.createElement('div', { className: 'wsm-error', role: 'alert' }, error),
          React.createElement('div', { className: 'wsm-tree' },
            groups.length === 0 && React.createElement('div', { className: 'wsm-empty' }, t('empty')),
            groups.map((g) => {
              const open = expanded[g.key] !== false
              const rows = open ? g.sessions : g.sessions.slice(0, 5)
              return React.createElement('div', { key: g.key, className: 'wsm-group' },
                React.createElement('div', {
                  className: 'wsm-grouphead',
                  onClick: () => setExpanded((p) => ({ ...p, [g.key]: !(p[g.key] !== false) })),
                },
                  React.createElement('span', { className: 'wsm-icon' }, React.createElement(IconFolder)),
                  React.createElement('span', { className: 'wsm-chev' + (open ? ' open' : '') }, React.createElement(IconArrow)),
                  React.createElement('span', { className: 'wsm-grouplabel' }, g.label),
                  React.createElement('span', { className: 'wsm-count' }, String(g.sessions.length)),
                  React.createElement('span', { className: 'wsm-rowactions' },
                    g.workspaceId !== undefined && React.createElement('button', {
                      type: 'button', className: 'wsm-iconbtn',
                      onClick: (e) => { e.stopPropagation(); onMenuOpen('ws', g.workspaceId, e) },
                    }, React.createElement(IconMore)),
                    React.createElement('button', {
                      type: 'button', className: 'wsm-iconbtn',
                      onClick: (e) => {
                        e.stopPropagation()
                        if (g.workspaceId !== undefined) ctx.workspaces.startSession(g.workspaceId)
                        else ctx.workspaces.startSession()
                      },
                    }, React.createElement(IconPlus)),
                  ),
                ),
                rows.map((s) => React.createElement(SessionRow, {
                  key: s.id, s, currentId: list.current, now, batchMode,
                  selected: selected.has(s.id), onToggle: toggleSelect,
                  onOpen: props.open || ctx.sessions.open,
                  onMenu: (id, e) => onMenuOpen('session', id, e), t,
                })),
                g.sessions.length > 5 && !open && React.createElement('div', {
                  className: 'wsm-grouphead', style: { paddingLeft: 24 },
                  onClick: () => setExpanded((p) => ({ ...p, [g.key]: true })),
                }, React.createElement('span', {
                  className: 'wsm-grouplabel', style: { fontSize: 12, fontWeight: 400 },
                }, t('sessions.expand', { n: g.sessions.length - 5 }))),
              )
            }),
          ),
          batchMode && React.createElement('div', { className: 'wsm-batchbar' },
            React.createElement('span', { style: { flex: 1, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' } }, t('batch.selected', { n: selected.size })),
            React.createElement('button', {
              type: 'button', className: 'wsm-btn',
              onClick: () => setSelected(allSelected ? new Set() : new Set(allSelectable)),
            }, allSelected ? t('batch.clear') : t('batch.selectAll')),
            React.createElement('button', {
              type: 'button', className: 'wsm-btn danger', disabled: selected.size === 0 || busy,
              onClick: () => { setError(null); setBatchDelete(true) },
            }, t('batch.delete')),
            React.createElement('button', {
              type: 'button', className: 'wsm-btn',
              onClick: () => { setBatchMode(false); setSelected(new Set()); setError(null) },
            }, t('batch.exit')),
          ),
          menu !== null && React.createElement('div', { className: 'wsm-menu-layer', onClick: () => setMenu(null) },
            React.createElement('div', {
              className: 'wsm-menu',
              style: { left: Math.max(8, menu.x), top: Math.max(8, menu.y) },
              onClick: (e) => e.stopPropagation(),
            },
              currentMenuItems().map((item) => React.createElement('button', {
                key: item.id, type: 'button',
                className: item.danger ? 'wsm-menu-item danger' : 'wsm-menu-item',
                onClick: () => onMenuSelect(item.id),
              }, item.icon, item.label)),
            ),
          ),
          (renameWs !== null || renameSession !== null) && React.createElement(Modal, {
            title: renameWs !== null ? t('rename.workspace') : t('rename.session'), busy, t,
            onCancel: () => { if (!busy) { setRenameWs(null); setRenameSession(null) } },
            onConfirm: async () => {
              setBusy(true); setError(null)
              try {
                if (renameWs !== null) await ctx.workspaces.rename(renameWs.id, renameWs.title)
                else if (renameSession !== null) await doRenameSession(renameSession.id, renameSession.title)
                setRenameWs(null); setRenameSession(null)
              } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
            },
            confirmLabel: t('rename'),
            body: React.createElement('input', {
              className: 'wsm-input',
              value: renameWs !== null ? renameWs.title : (renameSession !== null ? renameSession.title : ''),
              onChange: (e) => {
                const v = e.target.value
                if (renameWs !== null) setRenameWs({ ...renameWs, title: v })
                else setRenameSession({ ...renameSession, title: v })
              },
            }),
          }),
          deleteWs !== null && React.createElement(Modal, {
            title: t('delete.workspace'), busy, danger: true, t,
            onCancel: () => { if (!busy) setDeleteWs(null) },
            onConfirm: async () => {
              setBusy(true); setError(null)
              try { await ctx.workspaces.delete(deleteWs.id); setDeleteWs(null) }
              catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
            },
            confirmLabel: t('confirm'),
            body: '将把工作区从列表中移除，文件夹与会话记录保留。其后代会话会出现在“未分组”下。',
          }),
          deleteSession !== null && React.createElement(Modal, {
            title: t('delete.sessionTitle'), busy, danger: true, t,
            onCancel: () => { if (!busy) setDeleteSession(null) },
            onConfirm: confirmDeleteSession,
            confirmLabel: t('confirm'),
            body: t('delete.sessionDesc', { name: deleteSession.title }),
          }),
          batchDelete && React.createElement(Modal, {
            title: t('batch.deleteTitle'), busy, danger: true, t,
            onCancel: () => { if (!busy) setBatchDelete(false) },
            onConfirm: confirmBatchDelete,
            confirmLabel: t('confirm'),
            body: t('batch.deleteDesc', { n: selected.size }),
          }),
        )
      }

      return Manager
    }

    return {
      inject: ['slots', 'sessions', 'workspaces', 'locale'],
      apply(ctx) {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-session-manager'
        style.textContent = CSS
        document.head.append(style)
        ctx.effect(() => () => style.remove(), 'session-manager: styles')

        // Shadow the shell's workspace browser (single slot) with our manager.
        // Static bundle (not the dynamic guard), so an explicit low priority
        // wins over the default-0 official occupant.
        ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
          name: 'sidebar.workspaces',
          priority: -100,
        }, createManager(ctx)))
      },
    }
  },
})
