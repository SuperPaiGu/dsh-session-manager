# dsh-session-manager

给 DeepSeek Harness（DSH）的 Web GUI 侧栏加一个**批量管理会话**工具：
- 每个**工作区**的「…」菜单新增「**批量管理会话**」，进入后可以多选会话、全选，一键删除选中
- 每个**会话**的「…」菜单新增「**删除会话**」，直接删除单个会话
- 删除是**物理删除并送进系统回收站**（`Microsoft.VisualBasic` + `SendToRecycleBin`），不是不可恢复的 `rm`；正在运行的会话会被跳过

不需要归档功能，所以**没有**「归档区」，会话菜单里也**没有**「归档会话」按钮——只保留删除。

## 功能

- 工作区「…」菜单：**重命名工作区 / 删除工作区 / 批量管理会话**
- 进入「批量管理会话」后，每个会话前出现勾选框，底部有「已选 n 个会话 / 全选 / 删除选中 / 退出」
- 会话「…」菜单：**重命名会话 / 分叉会话 / 删除会话**
- 删除通过 DSH Host 的 `sessionPersistence.locate` 精确定位会话目录，再移入系统回收站；路径带护栏，不会误删 Work 区外的东西
- 自动生效：装好后每次打开 DSH Web 都直接是这个侧栏，无需手动激活或审批

> **v0.1.2 修复**：修好了点击侧栏会话无法切换的问题（`ctx.sessions.open` 丢失 `this` 绑定导致报错），并修复工作区「新建会话」加号图标不显示的问题，去掉归档区/归档按钮。

## 怎么安装（手动安装）

### 你需要先有

- 电脑上已经能用的 DSH（终端里 `dsh` 命令能跑）

### 两步装好

**第 1 步**：到本仓库的 Release 页面下载 `dsh-session-manager-0.1.2.tgz`，然后在终端执行：

```sh
dsh plugin --profile web add ./dsh-session-manager-0.1.2.tgz
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

卸载并重启后，侧栏恢复 DSH 默认的工作区浏览界面。

## 注意事项

- **删除是回收站删除**：会话目录被移进系统回收站，可以从回收站恢复。它不是立即永久删除。
- **正在运行的会话会跳过**：删除会检查会话是否处于运行中，运行中一律跳过并在界面提示。
- **取代默认侧栏**：本插件会遮蔽 DSH 自带的侧栏工作区浏览区，提供简化版（批量管理 + 会话删除）。原版搜索、平铺视图、拖拽排序不在本插件范围内。

## 目录结构

```
dsh-session-manager/   组合包根
├── package.json        dsh.bundle + dsh.client 声明
├── cordis.patch.yml    插件层（id session-manager → dsh-session-manager）
├── index.js            Host 插件：/session-manager/delete 端点 + 回收站删除
├── client.js           Web 客户端 bundle：遮蔽侧栏，提供批量管理 / 删除会话
└── README.md
```

## License

MIT
