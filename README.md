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

### Standalone Packaged Windows Desktop App

Viewport Guard includes an Electron desktop application (`desktop/`) that bundles Playwright's headless Chromium (`chrome-headless-shell`) into the package so it runs completely standalone on Windows without Node.js, npm, or separate browser downloads (with automatic fallback to system Microsoft Edge/Chrome if built without a bundled browser).

Desktop features:
- Native Windows GUI for scanning any HTTP/HTTPS URL at `375×812`, `390×844`, `768×1024` (or custom widths).
- Built-in local demo server with one-click **Broken Demo (`.offer-row`)** and **Fixed Demo (`0px`)** scan buttons.
- Live scan progress bar, viewport overview cards, embedded screenshot preview, candidate selector/bounds inspector, native clipboard **Copy Fix Prompt** + manual selection fallback, and native Save/Open/Reveal actions for standalone `report.html`.

Build and package commands (Windows PowerShell):

```powershell
# Launch desktop app in development mode
npm run desktop:dev

# Package standalone unpacked folder -> release\win-unpacked\Viewport Guard.exe
npm run desktop:pack

# Package single-file portable executable -> release\Viewport-Guard-1.0.0-win-x64-portable.exe
npm run desktop:portable

# Build both unpacked folder and single-file portable executable
npm run desktop:dist

# Verify packaged standalone executable end-to-end (offline self-test)
Start-Process -FilePath ".\release\win-unpacked\Viewport Guard.exe" -ArgumentList "--self-test=$PWD\.artifacts\packaged-selftest.json" -Wait
```

Packaged artifacts in `release/` are excluded from Git via `.gitignore` because they embed Electron and Chromium (~195 MB portable `.exe`).

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

### 打包可独立运行的 Windows 桌面版

项目内置 Electron 桌面应用（`desktop/`），打包时会自动将 Playwright 无头 Chromium（`chrome-headless-shell`）打入应用资源目录 `resources/browsers/`。打包后的 Windows 可执行文件**无需本机安装 Node.js、npm 或单独下载 Playwright 浏览器**即可离线双击运行（若精简打包未内嵌浏览器，亦会自动回退使用系统自带的 Microsoft Edge / Chrome）。

桌面端功能：
- 可视化输入任意 HTTP/HTTPS 地址，默认按 `375×812`、`390×844`、`768×1024` 扫描（也支持自定义宽度、超时、等待时间及 `--wait-for` 选择器）。
- 内置本地演示服务器，一键加载并扫描 **故障版（`.offer-row` 560px）** 与 **修复版（0px）**。
- 实时进度条、视口总览卡片、内嵌截图预览、疑似出界元素与边界值列表、原生剪贴板一键复制修复提示词（失败时自动全选）、原生打开/定位/另存独立 `report.html`。

Windows PowerShell 构建与打包命令：

```powershell
# 开发模式启动桌面端
npm run desktop:dev

# 打包免安装独立目录版 -> release\win-unpacked\Viewport Guard.exe
npm run desktop:pack

# 打包单文件便携版 -> release\Viewport-Guard-1.0.0-win-x64-portable.exe
npm run desktop:portable

# 同时生成目录版与单文件便携版
npm run desktop:dist

# 对打包产物执行离线端到端自检（验证内置浏览器、故障版 185/170/0、修复版 0/0/0 与不可访问报错）
Start-Process -FilePath ".\release\win-unpacked\Viewport Guard.exe" -ArgumentList "--self-test=$PWD\.artifacts\packaged-selftest.json" -Wait
```

`release/` 中的二进制打包产物（便携单文件约 195 MB）已在 `.gitignore` 中忽略，不会污染 Git 仓库；源码拉取后通过上述一条命令即可完整复现打包。

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
