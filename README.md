![Viewport Guard — your whale-girl lookout for every viewport](assets/brand/banner.png)

# Viewport Guard

**鲸鱼娘帮你守住每一寸视口。**

**Your whale-girl lookout for every viewport.**

One command — or one standalone Windows desktop app — to detect horizontal viewport overflow, capture embedded screenshots, isolate suspected overflowing elements, generate a copyable AI fix prompt, and export a self-contained offline `report.html`. / 一条命令或独立 Windows 桌面端即可检测多视口横向溢出，保留内嵌截图与疑似出界元素、生成可复制 AI 修复提示词，并导出可单独复制发送的离线 `report.html`。

[English](#english) · [中文](#中文) · [Contributing / 参与贡献](CONTRIBUTING.md) · [Changelog / 更新记录](CHANGELOG.md) · [Verification / 验证记录](docs/verification.md)

---

## English

Viewport Guard is a local Chromium inspection tool built with TypeScript, Playwright, Commander, Zod, Vitest, and an Electron standalone desktop shell. It offers two workflows sharing the exact same overflow detection and offline HTML report engine:

1. **Quick Overflow Scan (`scan`) & Standalone Desktop App (`Viewport Guard.exe`)**:
   - Inspects one HTTP or HTTPS URL (including local dev servers) across **`375×812`**, **`390×844`**, and **`768×1024`** CSS pixels by default.
   - Loads each viewport in an isolated Chromium context with bounded timeouts for navigation, font readiness (`document.fonts.ready`), overflow measurement, and screenshot capture.
   - Compares `document.documentElement.scrollWidth` against `clientWidth`; differences **≤ 1 CSS px** are recorded as **`0`**.
   - Only when the document overflows, lists up to **5 visible, unclipped suspected overflowing elements** sorted by overflow protrusion (skipping zero-size elements and content clipped by ancestor overflow containers), with verified CSS selectors, bounding boxes, and an explicit note to cross-check against screenshots.
   - Outputs a single self-contained **`report.html`** with base64-embedded PNG screenshots (still displays when copied alone to another directory), escaped page titles/URLs/selectors under a strict CSP, and a **copyable AI fix prompt** (with automatic fallback to manual text selection if clipboard copy fails).
2. **Full Multi-Category Audit (`audit` / `report` / `compare`)**:
   - Audits `360, 390, 768, 1440` × `900` by default (or custom `--widths`), collecting horizontal overflow, `console.error`, uncaught page errors, failed transport requests, JSON configuration, failure policies, and compatible-baseline regression comparisons.

### Quick Start (Windows PowerShell)

Requires **Node.js 22+** and npm. From the project root:

```powershell
npm ci
npx playwright install chromium
npm run build
```

> **Windows PowerShell note**: If PowerShell blocks `npm.ps1` / `npx.ps1` due to execution policy (`PSSecurityException`), replace `npm` / `npx` with `npm.cmd` / `npx.cmd` in the commands below, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

#### Run the Two Demo Pages (`broken.html` vs `fixed.html`)

Start the local demo server in Terminal 1 (listens on `http://127.0.0.1:4174` by default; override with `$env:PORT`):

```powershell
npm run demo
```

In Terminal 2, scan both demo pages with the same command:

```powershell
# Broken demo: zero body margin, fixed width: 560px .offer-row (expected overflow: 185 / 170 / 0 px; exit 1)
npm run scan -- http://127.0.0.1:4174/broken.html --out .\reports\broken-report.html

# Fixed demo: width: 100%; max-width: 560px responsive grid (expected overflow: 0 / 0 / 0 px; exit 0)
npm run scan -- http://127.0.0.1:4174/fixed.html --out .\reports\fixed-report.html
```

Example CLI output for the broken demo:

```text
375x812: overflow=185px (document=560px, viewport=375px) | candidates=.offer-row, ...
390x844: overflow=170px (document=560px, viewport=390px) | candidates=.offer-row, ...
768x1024: overflow=0px (document=768px, viewport=768px) | candidates=none
HTML report: C:\...\reports\broken-report.html
```

Example AI fix prompt embedded inside `broken-report.html`:

```text
Please inspect and fix the horizontal viewport overflow on this page with the smallest possible CSS change.

Target URL: http://127.0.0.1:4174/broken.html
Page title: Viewport Guard Demo — Broken Layout (560px .offer-row)

Overflowing viewports:
- 375×812 CSS px: documentWidth 560px vs viewportWidth 375px (overflow +185px)
  Suspected overflowing elements (cross-check against the report screenshot first):
  1. .offer-row (left: 0px, right: 560px, width: 560px, overflow: +185px)
- 390×844 CSS px: documentWidth 560px vs viewportWidth 390px (overflow +170px)
  Suspected overflowing elements (cross-check against the report screenshot first):
  1. .offer-row (left: 0px, right: 560px, width: 560px, overflow: +170px)
```

Copy `.\reports\fixed-report.html` by itself to any other folder and open it in a browser: all three PNG screenshots remain visible and the fix prompt remains selectable offline.

### Standalone Packaged Desktop Apps (Windows, macOS & Linux)

> **Direct Download**: Prebuilt standalone desktop releases are published on [GitHub Releases](https://github.com/Pasukalu/viewport-guard/releases/latest) (no Node.js or separate Playwright setup required).

Viewport Guard includes a cross-platform Electron desktop application (`desktop/`) that bundles Playwright's headless Chromium (`chrome-headless-shell`) into the package for **Windows x64**, **macOS (Apple Silicon `arm64` & Intel `x64`)**, and **Linux (`x64` / `arm64`)**, with automatic fallback to installed system Chromium/Chrome/Edge if built without a bundled browser.

| Platform | Packaged Targets | Native Build Command |
| --- | --- | --- |
| **Windows (`x64`)** | Portable `.exe`, NSIS Installer (`-setup.exe`), unpacked folder | `npm run desktop:dist:win` |
| **macOS (`arm64` / `x64`)** | `.dmg` disk image, `.zip` archive | `npm run desktop:dist:mac` (or `:arm64` / `:x64`) |
| **Linux (`x64` / `arm64`)** | `.AppImage`, `.deb`, `.tar.gz` | `npm run desktop:dist:linux` (or `:x64` / `:arm64`) |

Desktop features:
- Native GUI for scanning any HTTP/HTTPS URL at `375×812`, `390×844`, `768×1024` (or custom widths), with native macOS `Edit` menu (`Cmd+C` / `Cmd+V` / `Cmd+A`) and Dock lifecycle support.
- Built-in local demo server with one-click **Broken Demo (`.offer-row`)** and **Fixed Demo (`0px`)** scan buttons.
- Live scan progress bar, viewport overview cards, embedded screenshot preview, candidate selector/bounds inspector, native clipboard **Copy Fix Prompt** + manual selection fallback, and native Save/Open/Reveal actions for standalone `report.html`.

Build and package commands:

```powershell
# Launch desktop app in development mode (Windows / macOS / Linux)
npm run desktop:dev

# Windows x64: portable .exe + NSIS setup.exe + unpacked folder
npm run desktop:dist:win

# macOS (run on macOS): .dmg + .zip (use :arm64 for Apple Silicon, :x64 for Intel)
npm run desktop:dist:mac

# Linux (run on Linux): .AppImage + .deb + .tar.gz
npm run desktop:dist:linux

# Offline end-to-end self-test on packaged Windows executable
Start-Process -FilePath ".\release\win-unpacked\Viewport Guard.exe" -ArgumentList "--self-test=$PWD\.artifacts\packaged-selftest.json" -Wait
```

Platform notes for unsigned community builds:
- **Windows**: SmartScreen may prompt "Windows protected your PC" on first run → click **More info → Run anyway**.
- **macOS**: Unsigned `.dmg`/`.app` builds may trigger Gatekeeper → run `xattr -cr "/Applications/Viewport Guard.app"` before launching.
- **Linux**: For `.AppImage`, mark executable (`chmod +x Viewport-Guard-*.AppImage`) and ensure FUSE (`libfuse2`) is installed; if user-namespace sandboxing is restricted (e.g., Ubuntu 24.04 AppArmor), launch with `--no-sandbox`.

Automated multi-OS builds (Windows x64, macOS arm64, macOS x64, Linux x64) are provided in [docs/ci/desktop-release.yml](docs/ci/desktop-release.yml) — copy it to `.github/workflows/desktop-release.yml` (requires GitHub `workflow` token scope or adding via the GitHub web UI) to build, self-test, and publish Windows, macOS, and Linux binaries automatically on `v*` tag pushes or manual `workflow_dispatch`. Packaged artifacts in `release/` are excluded from Git via `.gitignore`.

### `scan` CLI Options

```powershell
npm run scan -- https://example.com --out .\report.html --timeout 15000 --wait 250
```

| Option | Default | Meaning |
| --- | --- | --- |
| `<url>` | Required | HTTP or HTTPS URL (rejects non-HTTP/HTTPS schemes and embedded credentials) |
| `--out, -o <file>` | `report.html` | Output path for the standalone offline HTML report (must end with `.html` and be writable) |
| `--widths <list>` | `375,390,768` | Optional 1–8 unique integer widths (240–3840 CSS px); default heights are 812 / 844 / 1024 |
| `--timeout <ms>` | `15000` | Bounded per-operation timeout (1–120000 ms) for navigation, readiness, font wait (capped at 5s), measurement, and screenshot |
| `--wait <ms>` | `250` | Delay after DOMContentLoaded, readiness, and font wait (0–30000 ms) |
| `--wait-for <selector>` | Unset | Optional standard CSS selector to wait until visible before measuring |

Invalid URLs, unwritable output paths, and unreachable pages report clear errors to `stderr`, always close the browser cleanly, and exit with code `2`.

### Full `audit`, `report`, and `compare` Workflow

The existing multi-category audit workflow remains fully supported:

```powershell
npm run check
node dist/cli.js audit https://example.com --html
node dist/cli.js report .\saved-audit\report.json --output .\audit.html
node dist/cli.js compare .\baseline\report.json .\current\report.json --output .\comparison.json
```

| Option (`audit`) | Default | Meaning |
| --- | --- | --- |
| `-o, --output <dir>` | `viewport-guard-reports` | Parent directory for a unique audit folder |
| `--timeout <ms>` | `15000` | Per-operation timeout; integer 1–120000 |
| `--wait <ms>` | `500` | Delay after readiness and fonts; integer 0–30000 |
| `--wait-for <selector>` | Unset | Wait for the first CSS match to become visible |
| `--widths <list>` | `360,390,768,1440` | Comma-separated list of 1–8 unique widths (240–3840 CSS px; height 900) |
| `--config <file>` | Unset | Strictly validated JSON configuration (`examples/viewport-guard.config.json`) |
| `--fail-on <policy>` | `all` | `all`, `none`, or comma-separated `overflow,console,pageerror,request` |
| `--html` / `--no-html` | Disabled | Enable or disable offline HTML output alongside `report.json` |
| `--baseline <report.json>` / `--no-baseline` | Unset | Compare against a compatible baseline audit |

### Exit Codes

| Exit code | Meaning |
| --- | --- |
| `0` | No overflow (`scan`), no policy-blocking findings (`audit`), or no regressions (`compare`) |
| `1` | Horizontal overflow detected and report written (`scan`), policy-blocking findings (`audit`), or regression (`compare`) |
| `2` | Invalid URL/options, unwritable path, unreachable target page, or operational failure |

### Scope and Limitations

- **Single-page Chromium inspection**: Checks one HTTP/HTTPS URL per run in headless Chromium with `deviceScaleFactor: 1` (does not emulate full mobile browser chrome, touch input, or iOS WebKit/Firefox rendering).
- **Top-level document geometry**: Overflow is measured on `document.documentElement`; candidate elements are filtered for zero-size nodes and ancestor overflow clipping chains, sorted by protrusion, and capped at 5 (`scan`) or 20 (`audit`). Shadow DOM and cross-origin iframes are not traversed, and candidate elements are diagnostic hints that must be verified against screenshots.
- **No automatic source code editing**: Generates a copyable AI repair prompt rather than modifying user source files directly.
- **Target script execution**: Visiting a page executes its scripts and network requests; reports may contain page titles, URLs, and screenshots.
- **License & artwork**: Source code is MIT licensed ([LICENSE](LICENSE)); the generated whale-girl fan art PNGs and derived desktop icons have separate notices ([assets/brand/NOTICE.md](assets/brand/NOTICE.md)) and are not covered by the MIT license. No DeepSeek affiliation or endorsement is claimed.

---

## 中文

Viewport Guard 是基于 TypeScript、Playwright、Commander、Zod、Vitest 与 Electron 桌面壳构建的本地视口横向溢出检查工具，提供**命令行一键扫描**与**打包可独立运行的 Windows 桌面版**两种形态，共用同一套溢出检测和离线 HTML 报告引擎：

1. **一键溢出扫描（`scan`）与独立 Windows 桌面版（`Viewport Guard.exe`）**：
   - 输入一个 HTTP 或 HTTPS 地址（含本地开发地址），默认在 **`375×812`**、**`390×844`**、**`768×1024`** 三个 CSS 像素视口独立加载页面。
   - 对导航、字体等待（`document.fonts.ready`）、溢出测量与截图均设置有界超时；无论成功还是失败，浏览器都会可靠关闭。
   - 比较根文档 `scrollWidth` 与 `clientWidth`，差值 **≤ 1 CSS px 记为 `0`**。
   - 仅在文档溢出时列出最多 **5 个可见的疑似出界元素**，跳过无尺寸元素及已被溢出容器裁剪的内容，按越界量从大到小排序，提供经过验证的 CSS 选择器与边界值，并在报告中提示**结合截图核对**。
   - 输出独立离线 **`report.html`**，内嵌每个视口的 PNG 截图（单独复制到其他目录仍可显示）、安全转义页面标题/URL/选择器并配置严格 CSP，附带**可复制的 AI 修复提示词**（含异常宽度、溢出差值与候选选择器，复制失败时自动全选并提示 `Ctrl+C` 手动复制）。
2. **完整多类别审计（`audit` / `report` / `compare`）**：
   - 保留原有四视口（`360/390/768/1440 × 900`）审计、`console.error` / 页面未捕获错误 / 失败请求采集、严格 JSON 配置、失败策略与基线对比工作流。

### 快速开始（Windows PowerShell）

需要 **Node.js 22+** 和 npm。在项目根目录运行：

```powershell
npm ci
npx playwright install chromium
npm run build
```

> **Windows PowerShell 提示**：如果系统执行策略阻止运行 `npm.ps1` / `npx.ps1`（报错 `PSSecurityException`），可将命令中的 `npm` / `npx` 替换为 `npm.cmd` / `npx.cmd`，或执行 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。

#### 运行两个演示页面（故障版 vs 修复版）

在终端 1 启动本地演示服务器（默认监听 `http://127.0.0.1:4174`，可通过 `$env:PORT` 修改端口）：

```powershell
npm run demo
```

在终端 2 用同一程序检查故障版和修复版：

```powershell
# 故障版：body 边距为 0、固定 width: 560px 的 .offer-row（预期溢出 185 / 170 / 0 px，退出码 1）
npm run scan -- http://127.0.0.1:4174/broken.html --out .\reports\broken-report.html

# 修复版：width: 100%; max-width: 560px 且内容随容器自适应（预期 0 / 0 / 0 px，退出码 0）
npm run scan -- http://127.0.0.1:4174/fixed.html --out .\reports\fixed-report.html
```

故障版实跑输出示例：

```text
375x812: overflow=185px (document=560px, viewport=375px) | candidates=.offer-row, ...
390x844: overflow=170px (document=560px, viewport=390px) | candidates=.offer-row, ...
768x1024: overflow=0px (document=768px, viewport=768px) | candidates=none
HTML report: C:\...\reports\broken-report.html
```

将 `.\reports\fixed-report.html` 单独复制到任意其他目录并用浏览器打开：三张内嵌截图均可正常显示，底部的修复提示词区域仍可点击复制或手动全选。

### 多平台独立桌面版（Windows / macOS / Linux）

> **直接下载**：无需安装 Node.js 或 Playwright，可直接前往 [GitHub Releases](https://github.com/Pasukalu/viewport-guard/releases/latest) 下载各平台独立打包版本。

项目内置跨平台 Electron 桌面应用（`desktop/`），打包时自动按当前系统与架构（**Windows x64**、**macOS Apple Silicon `arm64` / Intel `x64`**、**Linux `x64` / `arm64`**）内嵌对应的 Playwright 无头 Chromium（`chrome-headless-shell`），离线即可双击运行；若精简构建未内嵌浏览器，也会自动回退检测系统安装的 Chrome / Edge / Chromium。

| 平台 | 打包格式 | 本地打包命令 |
| --- | --- | --- |
| **Windows (`x64`)** | 单文件便携版 `.exe`、安装版 `-setup.exe`、免安装目录 | `npm run desktop:dist:win` |
| **macOS (`arm64` / `x64`)** | `.dmg` 镜像、`.zip` 压缩包 | `npm run desktop:dist:mac`（或 `:arm64` / `:x64`） |
| **Linux (`x64` / `arm64`)** | `.AppImage`、`.deb`、`.tar.gz` | `npm run desktop:dist:linux`（或 `:x64` / `:arm64`） |

桌面端功能：
- 可视化输入任意 HTTP/HTTPS 地址，默认按 `375×812`、`390×844`、`768×1024` 扫描（支持自定义宽度、超时、等待时间及 `--wait-for` 选择器）；macOS 下完整支持原生菜单栏与 `Cmd+C / Cmd+V / Cmd+A` 快捷键及 Dock 恢复。
- 内置本地演示服务器，一键加载并扫描 **故障版（`.offer-row` 560px）** 与 **修复版（0px）**。
- 实时进度条、视口总览卡片、内嵌截图预览、疑似出界元素与边界值列表、原生剪贴板一键复制修复提示词（失败时自动全选）、原生打开/定位/另存独立 `report.html`。

各平台构建与打包命令：

```powershell
# 开发模式启动桌面端（Windows / macOS / Linux 通用）
npm run desktop:dev

# Windows x64：生成单文件便携版 + NSIS 安装版 + 免安装目录
npm run desktop:dist:win

# macOS（在 macOS 运行）：生成 .dmg 与 .zip（支持 :arm64 / :x64）
npm run desktop:dist:mac

# Linux（在 Linux 运行）：生成 .AppImage、.deb 与 .tar.gz
npm run desktop:dist:linux

# 对 Windows 打包产物执行离线端到端自检
Start-Process -FilePath ".\release\win-unpacked\Viewport Guard.exe" -ArgumentList "--self-test=$PWD\.artifacts\packaged-selftest.json" -Wait
```

未签名开源打包版首次启动提示：
- **Windows**：如遇 SmartScreen 提示“Windows 已保护你的电脑”，点击 **更多信息 → 仍要运行**。
- **macOS**：如遇 Gatekeeper 提示应用已损坏或无法验证开发者，可在终端执行 `xattr -cr "/Applications/Viewport Guard.app"` 后打开。
- **Linux**：运行 `.AppImage` 前需赋予执行权限（`chmod +x Viewport-Guard-*.AppImage`）并确保已安装 `libfuse2`；若系统限制用户命名空间沙盒（如部分 Ubuntu 24.04 配置），可加 `--no-sandbox` 启动。

项目在 [docs/ci/desktop-release.yml](docs/ci/desktop-release.yml) 中提供了完整的跨平台 GitHub Actions 自动构建与发布工作流模板——将其复制到 `.github/workflows/desktop-release.yml`（需 GitHub `workflow` 权限或通过网页端添加）后，推送 `v*` 标签或手动触发 `workflow_dispatch` 即可在 GitHub 云端 `windows-latest`、`macos-15`（Apple Silicon）、`macos-15-intel`（Intel Mac）与 `ubuntu-24.04`（Linux x64）并行构建、离线自检并自动上传至 GitHub Releases。`release/` 目录中的二进制产物已在 `.gitignore` 中排除。

### `scan` 命令参数

```powershell
npm run scan -- https://example.com --out .\report.html --timeout 15000 --wait 250
```

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `<url>` | 必填 | HTTP 或 HTTPS 地址（拒绝非 HTTP/HTTPS 协议及内嵌凭据） |
| `--out, -o <file>` | `report.html` | 独立离线 HTML 报告路径（须以 `.html` 结尾且可写） |
| `--widths <list>` | `375,390,768` | 可选 1～8 个唯一整数宽度（240～3840 CSS px），默认对应高度 812 / 844 / 1024 |
| `--timeout <ms>` | `15000` | 单步有界超时（1～120000 ms），覆盖导航、就绪等待、字体等待（上限 5 秒）、测量与截图 |
| `--wait <ms>` | `250` | 页面加载、就绪与字体等待后的额外稳定等待（0～30000 ms） |
| `--wait-for <selector>` | 未设置 | 可选标准 CSS 选择器，等待首个匹配元素可见后再测量 |

非法 URL、不可写路径或无法访问的目标地址都会输出清晰的中文/英文可读报错并确保关闭浏览器，返回退出码 `2`。

### 完整审计（`audit` / `report` / `compare`）与开发命令

原有完整审计、离线转换、基线对比与全套自动化验证命令均完整保留：

```powershell
npm run check
node dist/cli.js audit https://example.com --html
node dist/cli.js report .\saved-audit\report.json --output .\audit.html
node dist/cli.js compare .\baseline\report.json .\current\report.json --output .\comparison.json
```

| 退出码 | 含义 |
| --- | --- |
| `0` | 无横向溢出（`scan`）、无策略阻塞问题（`audit`）或基线无回归（`compare`） |
| `1` | 检测到横向溢出并已生成报告（`scan`）、存在阻塞问题（`audit`）或出现回归（`compare`） |
| `2` | 输入无效、输出路径不可写、目标无法访问或执行过程异常 |

### 检查范围与限制

- **专注单页 Chromium 视口检查**：每次检查单个 HTTP/HTTPS 页面，使用无头 Chromium（`deviceScaleFactor: 1`），不包含多页爬虫、登录态交互、Firefox/WebKit 引擎或完整手机系统壳模拟。
- **顶层文档几何判断**：以根元素 `scrollWidth - clientWidth > 1` 判定横向溢出，过滤无尺寸与被祖先溢出容器裁剪的节点，按越界量排序并限制数量（`scan` 最多 5 项、`audit` 最多 20 项）。不遍历 Shadow DOM 或跨域 iframe；候选元素是几何线索，修改 CSS 前须结合截图核对。
- **不直接改写用户代码**：报告生成可复制的 AI 修复提示词，由开发者或 AI 助手核对后再做最小修改并复测。
- **许可与品牌素材**：代码采用 MIT 许可（[LICENSE](LICENSE)）；鲸鱼娘二创图片及衍生的桌面图标有独立说明（[assets/brand/NOTICE.md](assets/brand/NOTICE.md)），不纳入 MIT 代码许可。与 DeepSeek 官方无隶属或背书关系。

---

## Development Records / 开发与验证记录

- Verification log & latest run results / 最新实跑命令、结果与未验证项：[docs/verification.md](docs/verification.md)
- Overflow evidence / 溢出证据说明：[docs/overflow-evidence.md](docs/overflow-evidence.md)
- Historical plans / 历史阶段记录：[Phase 1](docs/phase-1.md) · [0.2](docs/phase-2.md) · [0.3](docs/phase-2-overflow-plan.md) · [0.4](docs/github-ready-plan.md) · [0.5](docs/custom-widths-plan.md) · [1.0](docs/v1-plan.md)
