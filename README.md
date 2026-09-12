# dsh-session-manager

给 DeepSeek Harness（DSH）的 Web GUI 加一个 **「归档」 面板**：在会话顶部的 **对话 / 轨迹 标签右边**再多一个 **归档** 标签，把官方的**归档区当成回收站**用——能看见里面有什么，能**恢复**回侧栏，也能**批量删除**进系统回收站。

> **0.3.0 是重写。** 旧版（0.2.x）在侧栏底部加「批量管理会话」按钮，靠 `sessionPersistence.locate(header)` 拿路径。**那个 API 在 DSH 0.1.5 已被删除**，所以旧版在新版 DSH 上根本无法工作。0.3.0 改成推导路径 + 归档面板。

## 界面

标签栏变成 **对话 | 轨迹 | 归档**。「归档」面板里**只列出真正被归档、且日志还在磁盘上的会话**：

- 每行：标题、工作目录、最后活动时间
- 每行两个按钮：**恢复**（取消归档，回到侧栏）/ **删除**（日志文件夹进系统回收站）
- **勾选后可批量恢复 / 批量删除**，支持全选
- 删除前弹确认框，明确告知「移入系统回收站，可从回收站恢复」
- 正在运行的会话置灰不可勾选

**不替换任何官方界面**：侧栏、官方三点菜单（含官方「归档会话」）、对话、轨迹全部原样保留，插件只是往官方 `conversation.view` 插槽**追加**一个条目。卸载后官方界面恢复原状。

## 怎么用

1. 在侧栏用会话的「**归档会话**」（官方三点菜单）把不想看见的会话移进归档区
2. 打开 **归档** 标签，它就出现在列表里
3. 想让它回来就点 **恢复**；想彻底清理就点 **删除**（进系统回收站）

## 怎么安装（手动安装）

**第 1 步**：到本仓库 Release 下载 `dsh-session-manager-0.3.0.tgz`，然后执行：

```sh
dsh plugin --profile web add ./dsh-session-manager-0.3.0.tgz
```

**第 2 步**：**把插件加进 profile 的 bundles 列表**。这一步不能省——`dsh plugin add` 只把包装进 `node_modules`，不会自动启用它：

打开 `%DSH_HOME%\profiles\web\package.json`（默认即 `C:\Users\<你>\.dsh\profiles\web\package.json`），在 `dsh.profile.bundles` 数组末尾加上：

```json
"dsh-session-manager"
```

**第 3 步**：重启 DSH Web 服务（先停当前的 `dsh web`，再重新启动）。

**验收**：任意打开一个**有内容的历史会话**（空白新会话的顶部会被官方隐藏），顶部标签栏出现 **对话 | 轨迹 | 归档** 三个标签。

> 注意：空白新会话看不到标签栏，这是 DSH 官方行为（`hideChrome`），不是插件问题。

### 从 GitHub 直接安装

```sh
dsh plugin --profile web add github:SuperPaiGu/dsh-session-manager
```

装完同样需要第 2、3 步。

### 卸载

```sh
dsh plugin --profile web remove dsh-session-manager
```

再把 `bundles` 里那行删掉并重启即可。

## 删除是怎么做的

**删除 = 把该会话的整个文件夹送进 Windows 回收站**（`Microsoft.VisualBasic.FileIO.FileSystem::DeleteDirectory(..., SendToRecycleBin)`），不是不可恢复的删除。整个会话文件夹（含所有世代的日志文件）一起走，所以 DSH 以后换 Session 格式版本也不影响。

文件夹位置由**三样公开信息推导**得出，不依赖任何已删除的 API：

```
<root>/<projectKey(header.cwd)>/<encodeSegment(header.id)>/
```

- `<root>` 取自 jsonl 后端自己的公开字段 `sessionPersistence.config.root`（本机即 `~/.dsh/sessions`）
- 两段编码规则与官方后端**逐字符一致**（非 ASCII 走 `~XXXX` 十六进制转义）
- **删的是目录**，所以 `session.v3.jsonl.zstd` 还是将来的 v4 都跟着一起走

已用真实磁盘做过实证：本机 **10 个项目目录、31 个会话目录 100% 命中**（`tests/derive-check.mjs`，只读，可随时自己跑）。

**正在运行的会话会被跳过**：它的日志被写入租约持有，硬抽走不是用户想要的结果。

## 恢复是怎么做的（以及为什么需要它）

DSH 0.1.5 的归档是**单向**的：`WorkspaceRegistry` 只公开 `archiveSession()`，官方 README 明确写着「no unarchive action exists yet」。也就是说**取消归档在官方接口层面根本不存在**。

本插件通过 DSH 的 **storage 域**直接改写那份归档名单（`~/.dsh/storages/workspace.json` 的 `archivedSessionIds`）来实现恢复。归档从来不碰 workspace 的成员记账，所以把 id 从名单里摘掉，会话就回到了它原来的位置。

代价有两点，都已做进产品行为里：

- **官方侧栏要刷新一次页面才会看到**：运行中的 `WorkspaceRegistry` 持有一份内存副本，直接改盘不会通知它。恢复后面板会提示「若侧栏没立刻出现，刷新一下页面」。
- **用的是标注为诊断用途的内部面**：`storage.domain` 在官方文档里是诊断接口。DSH 升级后它有可能变化，届时恢复会失败并**明确报错**（不会静默）；删除通道完全不依赖它。

## 已知限制

- **面板读的是 Host 权威归档集合**（而非浏览器端快照）：浏览器端那份是连接时的快照，另一个 DSH 实例改了归档状态它不会自动更新，所以插件改为每次打开面板、每次操作后都问 Host 要一次。
- **删除后的侧栏残留**：已被内存常驻（打开过）的会话，删掉文件后仍会留在官方侧栏，直到 DSH 重启。**这是 DSH 内核限制**——没有任何公开 API 能让插件释放一个内存会话（`AgentHandle.dispose()` 是创建者专属能力）。删除本身是完整、安全的。
- **删除会顺手清掉归档名单里的那条 id**，避免留下指向空洞的悬空记录（本机原本已积了 253 条这种历史垃圾）。
- **只显示"日志还在磁盘上"的归档会话**：归档名单里那些文件早被删掉的旧记录不会出现在面板里（它们本来也无从恢复或删除）。
- 仅 Windows（回收站调用依赖 `Microsoft.VisualBasic`）。

## 怎么安装（Agent 安装）

> 由 AI Agent 在用户机器上执行的确定性指令，按顺序执行，每步有验收条件。

### 0. 环境检测

```sh
dsh --version    # 命令不存在则提示用户先安装 DSH
```

### 1. 安装插件

```sh
dsh plugin --profile web add github:SuperPaiGu/dsh-session-manager
```

**验收**：退出码 0，输出含 `+ dsh-session-manager`。

（如需固定版本：从 Release 下载 `dsh-session-manager-0.3.0.tgz`，用 `dsh plugin --profile web add ./dsh-session-manager-0.3.0.tgz`。）

### 2. 启用 bundle（关键步骤）

编辑 `$DSH_HOME/profiles/web/package.json`，把 `"dsh-session-manager"` 加进 `dsh.profile.bundles` 数组，并在 `dependencies` 里确认有 `"dsh-session-manager"` 条目。

**验收**：`dsh --profile web --dump-config` 输出含 `dsh-session-manager` 层。

### 3. 重启 DSH Web 服务

停止当前 `dsh web`，再以用户原有方式重新启动。

**验收**：启动日志无报错；打开一个有内容的历史会话，顶部出现 **对话 | 轨迹 | 归档**。

### 4. 验收清单

- [ ] 第 1 步退出码 0
- [ ] `--dump-config` 含 `dsh-session-manager` 层
- [ ] 重启后设置 → 插件 → 插件列表 中 `session-manager` 行 active
- [ ] 历史会话顶部出现「归档」标签；无归档会话时显示引导文案
- [ ] 归档一个会话 → 出现在面板；点「恢复」→ 面板移除、磁盘名单减少
- [ ] `node tests/derive-check.mjs` 全绿（路径推导与真实磁盘一致）

## 目录结构

```
dsh-session-manager/   组合包根
├── package.json        dsh.bundle + dsh.client 声明
├── cordis.patch.yml    插件层（id session-manager → dsh-session-manager）
├── index.js            Host：/session-manager/{archived,restore,delete} + 路径推导 + 回收站删除
├── client.js           Web 客户端：向 conversation.view 注册「归档」面板
├── tests/              路径推导只读实证
└── README.md
```

## License

MIT
