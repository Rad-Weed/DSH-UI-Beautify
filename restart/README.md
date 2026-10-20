# 重启键 · 桌面壳补丁（随 DSH UI Beautify v0.8.5 分发）

让 DSH 标题栏出现「重启」按钮，点一下干净重启**应用 + Host**（等价于开发模式的
「重启应用与 Host」菜单项）。

> **两半设计**：
> - **按钮 UI（半区 A）** —— 已内置在 **DSH UI Beautify v0.8.0+** 插件里：
>   往桌面壳 preload 挂的 shadow-DOM 菜单栏注入「重启」按钮；壳补丁缺失时点击会明确提示。
> - **真重启能力（半区 B）** —— 就是本目录的**桌面壳补丁**：给 `resources\app.asar` 的
>   `lib/main.js` 加主进程 IPC、`lib/preload-app.cjs` 暴露 `window.dshDesktop.restart()`。
>   插件跑在 Host 里没有 API 能 `app.relaunch()`，所以这一半必须改 app.asar。

## 快速开始

| 操作 | 方式 |
|---|---|
| 安装 | 双击 **`install-restart-key.cmd`** → 若 DSH 在运行，按提示从托盘退出 → 独立后台进程自动打补丁、校验、**自动重启 DSH** |
| 使用 | 标题栏「应用」「编辑」右边点「重启」；有任务在跑时会先弹确认框 |
| 体检 | 双击 **`verify-restart-key.cmd`**（补丁 / 备份 / SHA256 / 按钮 UI / 运行态） |
| 卸载 | 双击 **`uninstall-restart-key.cmd`** → 按提示退出 DSH → 自动还原 app.asar（双 SHA 校验）、删备份、重启 DSH |
| 只看不做 | 任意脚本加 `-DryRun`：只打印将做什么，不改任何文件 |

> 安装/卸载要改 `app.asar`，**必须等 DSH 完全退出**（只关窗口只是隐藏到托盘，要右键托盘图标 → 退出）。
> 脚本会自动处理等待——在 DSH 进程树里启动时会用 **WMI 逃逸成独立进程**，DSH 退出不会把它杀掉。

## 外部副作用声明（规范 §3.2）

| 声明项 | 值 |
|---|---|
| 改了哪些文件 | DSH 安装目录 `resources\app.asar` 中两个**已存在**条目：`lib/main.js`、`lib/preload-app.cjs` |
| 改了什么 | 主进程新增 IPC `dsh-desktop:restart-app` + preload 暴露 `window.dshDesktop.restart()`。只追加带 BEGIN/END 标记的补丁块，其余上万个条目**一个字节不动** |
| 是否可在线还原 | **否**。改/还原 app.asar 必须 DSH **完全退出** |
| 备份位置与校验 | `<DSH 安装目录>\resources\.dsh-restart-button-backup\`：`app.asar.header.bin` + `meta.json`（originalSize / originalSha256 / patchedSha256）。还原做**双 SHA 校验**：当前 == patched → 写回 → 结果 == original |
| 反向操作 | `uninstall-restart-key.cmd`（或 `scripts\uninstall-restart-key.ps1`） |
| 用户数据 | **无**。本目录不写用户数据、不装插件包 |
| 网络 | **无**（纯本地文件操作） |
| 日志 | `logs\install-* / uninstall-* / verify-*`（时间戳、输出、SHA256、错误） |
| 平台 | Windows 10/11 桌面端（标题栏 `data-windows-titlebar`；网页版无按钮） |

## 退出码

`0` 成功（含"已是目标状态"）/ `1` 失败 / `2` 参数错误 / `3` 等待超时 / `4` 校验失败。

## 结构

| 文件 | 作用 |
|---|---|
| `scripts\install-restart-key.ps1` | 安装编排（幂等；DSH 在运行 → 独立进程等待退出后打补丁） |
| `scripts\uninstall-restart-key.ps1` | 卸载编排（双 SHA 还原；幂等可重入） |
| `scripts\verify-restart-key.ps1` | 体检：补丁 / 备份 / SHA / 按钮 UI / 运行态 |
| `scripts\restore-on-exit.ps1` | 独立编排进程（等 DSH 完全退出 → 应用/还原 → 校验 → 重启） |
| `scripts\common.ps1` | 公共函数（日志、等待、WMI 逃逸、SHA256、退出码…） |
| `shell\tools\apply-shell-patch.mjs` | 壳补丁工具（apply / status / verify / restore；只读校验 + 原地补丁） |
| `shell\patch-spec.json` + `shell\patches\` | 补丁规格与两段片段（带 BEGIN/END 标记 + 锚点 + 语法/内容校验） |

## 说明

- 补丁工具来自「DSH 重启键项目 v1.1.0」——其插件测试 25 项、壳补丁测试 12 项、
  脚本编排自测 58 项在原项目里全绿；本包内保留工具与脚本，按钮 UI 已并入美化插件。
- DSH 客户端升级会覆盖 app.asar：升级后按钮点击会提示装补丁，重新双击
  `install-restart-key.cmd` 并退出一次 DSH 即可。
- 补丁只追加 IPC 与 preload 桥，不改启动路径；还原后与安装前**逐字节一致**（SHA256 校验）。
