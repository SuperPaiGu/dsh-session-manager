# dsh-session-manager

给 DeepSeek Harness（DSH）的 Web GUI 加一个**批量管理会话**工具，**纯增量、完全不动官方界面**：
- 侧栏**底部**出现「**批量管理会话**」按钮，点开一个批量面板：列出所有会话、勾选、全选、一键删除选中；每行也有独立的「删除」按钮（单删）
- 删除是**物理删除并送进系统回收站**（`Microsoft.VisualBasic` + `SendToRecycleBin`），不是不可恢复的 `rm`；正在运行的会话会被置灰、不可删除

**不替换官方侧栏**：DSH 自带的搜索、视图切换、分组/未分组、排序、拖拽、官方三点菜单全部原样保留，插件只通过 DSH 官方的加性插槽（additive slots）额外加了入口。卸载后官方界面恢复。

## 功能

- **批量管理面板**：侧栏底部「批量管理会话」按钮 → 面板列出全部会话（含未分组），支持：
  - 每个会话一行 + 勾选框
  - **每行独立「删除」按钮**（单删，确认后进回收站）
  - 全选 / 清空
  - 已选计数
  - 「删除选中」（进回收站）
  - **运行中的会话置灰，不可勾选、不可删除**（提示"进行中（不可删除）"）
- 删除通过 DSH Host 的 `sessionPersistence.locate` 精确定位会话目录，再移入系统回收站；路径带护栏，不会误删 Work 区外的东西
- 自动生效：装好后每次打开 DSH Web 就有，无需手动激活或审批

> **v0.2.x 起改为纯增量**，不再遮蔽官方侧栏。
> **v0.2.4**：删除统一收进批量面板（每行单删 + 多选批量），移除了会话顶栏垃圾桶——原单删只能作用于当前打开的（几乎总是运行中的）会话，没有实用价值。

## 怎么安装（手动安装）

### 你需要先有

- 电脑上已经能用的 DSH（终端里 `dsh` 命令能跑）

### 两步装好

**第 1 步**：到本仓库的 Release 页面下载 `dsh-session-manager-0.2.4.tgz`，然后在终端执行：

```sh
dsh plugin --profile web add ./dsh-session-manager-0.2.4.tgz
```

**第 2 步**：重启 DSH Web 服务（先停止当前的 `dsh web`，再重新启动）。

打开侧栏即可使用。安装后，在 **设置 → 插件 → 插件列表** 中会显示为 **`session-manager`**。

### 从 GitHub 直接安装（不下载文件）

```sh
dsh plugin --profile web add github:SuperPaiGu/dsh-session-manager
```

装完同样需要重启 DSH Web 服务。

### 卸载

```sh
dsh plugin --profile web remove dsh-session-manager
```

卸载并重启后，官方界面一切照旧（本就不受影响）。

## 注意事项

- **删除是回收站删除**：会话目录被移进系统回收站，可以从回收站恢复。它不是立即永久删除。
- **正在运行的会话不可删**：运行中的会话置灰，勾选框与删除按钮均不可用（Host 端也会保护跳过）。
- **未持久化的会话**：新建但还没有日志落盘的会话无法删除（Host 报 missing），这类空会话重启后会自然消失。
- **纯增量**：本插件不遮蔽、不替换任何官方区域，只通过 `sidebar.footer.action` 官方加性插槽叠加功能（批量面板作为按钮组件的子组件渲染）。

## 目录结构

```
dsh-session-manager/   组合包根
├── package.json        dsh.bundle + dsh.client 声明
├── cordis.patch.yml    插件层（id session-manager → dsh-session-manager）
├── index.js            Host 插件：/session-manager/delete 端点 + 回收站删除
├── client.js           Web 客户端 bundle：纯增量（侧栏底部批量按钮 + 批量面板）
└── README.md
```

## License

MIT
