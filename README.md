![Viewport Guard — your whale-girl lookout for every viewport](assets/brand/banner.png)

# Viewport Guard

**鲸鱼娘帮你守住每一寸视口。**

**Your whale-girl lookout for every viewport.**

Audit responsive pages, keep the evidence, choose what blocks, and compare against a baseline. / 检查响应式页面、保留证据、自选失败策略，并与基线比较。

[English](#english) · [中文](#中文) · [Contributing / 参与贡献](CONTRIBUTING.md) · [Changelog / 更新记录](CHANGELOG.md)

## English

Viewport Guard is a small local CLI built with TypeScript, Playwright, Commander and Zod, with Vitest tests. It audits one HTTP/HTTPS URL at **360, 390, 768 and 1440 CSS pixels by default**, or at a custom list of widths, saves one PNG per viewport and reports:

- Horizontal page overflow, measured widths and up to 20 candidate elements with verified CSS selectors.
- `console.error` messages, uncaught JavaScript errors and failed network requests.
- Operational failures, such as navigation, readiness or screenshot errors.
- Strict JSON configuration, explicit failure policies and compatible-baseline regression comparisons.
- A self-contained offline HTML report with screenshots, evidence and policy/comparison summaries.

### Quick start

Use **Node.js 22+** with npm. From the project root:

```sh
npm ci
npx playwright install chromium
npm run check
node dist/cli.js audit https://example.com --html
```

`npm ci` uses the committed `package-lock.json`. `npm run check` runs typecheck, build, automated tests and built-CLI smoke tests in sequence. Tests use local fixtures and start their own servers; they need Chromium and loopback access, but no external audit target. Chromium is downloaded separately from the Node dependencies.

The package defines `viewport-guard audit <url>`. Run the local build with `node dist/cli.js`, or use `npm run audit -- https://example.com`; global installation is unnecessary. Code is MIT licensed; the generated fan-art PNGs have [separate notices](assets/brand/NOTICE.md) and are excluded from that license. `private: true` prevents accidental npm publication and does not restrict the code license.

### CLI options

```sh
node dist/cli.js audit https://example.com --output ./reports --timeout 20000 --wait 1000
```

| Option | Default | Meaning |
| --- | --- | --- |
| `-o, --output <dir>` | `viewport-guard-reports` | Parent directory for a unique audit folder |
| `--timeout <ms>` | `15000` | Per-operation navigation, readiness, measurement and screenshot timeout; integer 1–120000 |
| `--wait <ms>` | `500` | Delay after DOMContentLoaded and optional readiness; integer 0–30000 |
| `--wait-for <selector>` | Unset | Wait for the first CSS match to become visible before the fixed delay |
| `--widths <list>` | `360,390,768,1440` | Comma-separated list of 1–8 unique integer widths, each 240–3840 CSS pixels |
| `--config <file>` | Unset | Read an explicitly selected, strictly validated JSON configuration |
| `--fail-on <policy>` | `all` | `all`, `none`, or a comma-separated selection of `overflow,console,pageerror,request` |
| `--html` / `--no-html` | Disabled | Enable HTML output, or override a configuration that enables it |
| `--baseline <report.json>` / `--no-baseline` | Unset | Compare with a compatible saved audit, or clear a configured baseline |

Only HTTP/HTTPS URLs are accepted; embedded URL credentials are rejected. All viewports have height **900** and device scale factor **1**, and run sequentially in fresh Chromium contexts. PNGs capture the visible viewport. These settings do not emulate a complete mobile device.

Custom widths preserve input order. Spaces around comma-separated decimal tokens and leading zeros are accepted; duplicate detection happens after numeric conversion, so `0360,360` is rejected. Empty tokens, trailing commas, fractions, scientific notation, units, out-of-range values and lists longer than eight are invalid. Invalid input returns exit code 2 before starting a browser or creating output. The programmatic API accepts optional `widths?: number[]` with the same limits and does not convert strings to numbers. Height remains fixed at 900.

For asynchronous content, pass a standard CSS selector with `--wait-for`. Values are trimmed and must contain 1–2000 characters; quote selectors containing spaces. XPath and Playwright-specific selector engines are unsupported. After DOMContentLoaded, the CLI waits for the first match to be visible, applies `--wait`, then measures and captures. Readiness CSS validation and overflow measurement are also bounded by `--timeout`; it is a per-operation limit, not a whole-run deadline. Browser/context cleanup uses a separate 5-second limit.

A missing or malformed selector causes an operational error, but measurement and screenshot capture are still attempted and the remaining viewports continue. Navigation failure skips readiness. Omitting `--wait-for` keeps the default DOMContentLoaded-plus-delay behavior.

### Configuration and failure policy

Configuration precedence is **defaults → configuration file → explicitly supplied CLI flags**. No configuration is searched for implicitly and no JavaScript configuration is executed. The target URL remains the positional argument. Supported JSON keys are `outputDir`, `timeoutMs`, `waitMs`, `waitForSelector`, `widths`, `failOn`, `html` and `baseline`; unknown keys are rejected. JSON uses typed values, so `failOn` is an array of category names, `html` is boolean, and `baseline` is a path string or `false`.

For example, save this as `viewport-guard.config.json`:

```json
{
  "outputDir": "./reports",
  "widths": [360, 390, 768, 1440],
  "timeoutMs": 15000,
  "waitMs": 500,
  "failOn": ["overflow", "console", "pageerror", "request"],
  "html": true,
  "baseline": false
}
```

```sh
node dist/cli.js audit https://example.com --config viewport-guard.config.json --fail-on overflow
```

An included [example configuration](examples/viewport-guard.config.json) can also be passed directly with `--config examples/viewport-guard.config.json`. Relative paths inside the file are resolved from the configuration file's directory; CLI paths are resolved from the working directory. `--no-html` and `--no-baseline` explicitly clear those file settings. An empty JSON `failOn` array is equivalent to CLI `--fail-on none`.

Failure policy changes the blocking decision, **not the observed facts**. `--fail-on overflow` still collects console/page/request errors. `--fail-on none` can return 0 while raw viewport status and statistics show findings. Operational errors always return 2, regardless of policy. The report's policy evaluation is separate from the original result entries and summary.

### Offline HTML and baseline comparison

Generate an HTML report during an audit with `--html`, or convert an existing report without launching a browser:

```sh
node dist/cli.js report ./saved-audit/report.json --output ./audit.html
```

The HTML file embeds available screenshots and project artwork, uses no CDN, and displays evidence, policy verdicts and an optional comparison summary. Target-page strings are escaped rather than executed. Screenshot inputs must be PNG files safely contained within the audit report's directory; missing evidence is shown as unavailable. This file is an offline report, not a hosted service.

`audit --html` saves `report.html` in the run folder. Standalone `report` defaults to `<report-name>.html` beside the JSON input, and returns 0 when conversion succeeds; it does not re-audit the target or use findings as its own exit status.

Compare two saved audits, or compare a new audit as it runs:

```sh
node dist/cli.js compare ./baseline/report.json ./current/report.json --output ./comparison.json
node dist/cli.js audit https://example.com --baseline ./baseline/report.json --html
```

Inputs must be complete, operational-error-free reports with the same normalized target URL, viewport set and effective failure policy. Viewport order may differ. The comparison reports added/resolved selected findings and worsened/improved overflow. It ignores timestamps, duration, screenshot paths, stacks and snapshot-specific CSS selectors; it does not compare pixels. New or worsened selected findings return 1; unchanged existing findings or improvements return 0. Incompatible inputs and operational failures return 2. Standalone `report` and `compare` output paths are protected against accidental overwrite; use `--force` to replace an existing output file intentionally.

`compare` prints a `Changes:` summary; `--output` additionally saves JSON and prints its path as `Comparison:`. An audit using a compatible baseline saves `comparison.json` in its run folder. Raw audit JSON and screenshots remain available independently of that comparison.

### Local examples

Start `npm run fixtures` in one terminal, then run these after building in another:

```sh
node dist/cli.js audit http://127.0.0.1:4173/normal.html
node dist/cli.js audit http://127.0.0.1:4173/overflow.html
node dist/cli.js audit http://127.0.0.1:4173/delayed.html --wait-for '#ready' --wait 0
node dist/cli.js audit http://127.0.0.1:4173/overflow-evidence.html
node dist/cli.js audit http://127.0.0.1:4173/overflow.html --widths "1920,320,1024"
```

The normal fixture should exit 0. The overflow fixture should exit 1. The delayed fixture reveals a hidden 1800px panel after 120ms, so waiting for `#ready` should detect overflow and exit 1. The evidence fixture has two 1800px panels sharing an ID and class; its report should identify them with distinct CSS paths and exit 1.

The custom-width example should retain the order 1920, 320, 1024: the 1800px panel fits at 1920 and overflows at the other two widths. Expect one passed viewport, two failed viewports, three PNGs and exit code 1. Examples without `--widths` continue to use all four default widths.

### Output and exit codes

Each invocation creates a new folder and prints the report path. A default audit produces:

```text
viewport-guard-reports/
└── audit-<timestamp>-<unique suffix>/
    ├── report.json
    └── screenshots/
        ├── 360.png
        ├── 390.png
        ├── 768.png
        └── 1440.png
```

`report.json` uses `schemaVersion: "1.0.0"`. It contains `targetUrl`, `startedAt`, `durationMs`, `options`, a `summary` with `total/passed/failed/errors`, and one entry in `results` per selected width, in input order. Counts and screenshots follow the selected list; filenames remain `screenshots/<width>.png`. There are four results by default. `options.waitForSelector` is omitted when unused. Optional `options.widths` is included only when widths are explicitly supplied, including an explicit list matching the defaults. Reports without either optional field remain accepted.

Failure policy is represented by optional `options.failOn` and an optional `evaluation` block containing `failOn`, `passed` and `blockingViewports`. Older reports omit these fields and use the default all-category policy when evaluated. Baseline differences are saved separately rather than changing the audit's raw findings.

Each result includes `viewport`, `status`, `finalUrl`, `screenshot`, `overflow`, `consoleErrors`, `pageErrors`, `failedRequests` and operational `errors`. Screenshot paths are relative to the report folder. An unavailable screenshot or overflow measurement is `null`, with a reason in `errors`. Browser startup or output-storage failures can prevent report creation.

Optional top-level `errors` records audit-wide operational failures such as browser cleanup errors; it is omitted when unused. `summary.errors` counts viewport errors only. A top-level error still produces exit code 2 even if that count is zero. Older reports without this optional field remain accepted.

| Exit code | Meaning |
| --- | --- |
| `0` | Audit has no policy-blocking findings, or a baseline comparison has no regressions |
| `1` | Audit has policy-blocking findings, or comparison has new/worsened selected findings |
| `2` | Invalid input or an operational failure; takes precedence over findings |

Overflow means the root document's `scrollWidth - clientWidth` is **greater than 1 CSS pixel**. Body width is supporting data. Internal scrollers or clipped content do not automatically count as page overflow. Candidate geometry helps investigation and does not prove the root cause.

Each returned `overflow.elements[].selector` is verified with native `document.querySelectorAll` to match exactly the corresponding node **at the measurement snapshot**. A verified unique ID stays short; other cases use anchored child paths with `:nth-child()`, including a positional fallback. IDs are escaped and repeated classes do not establish uniqueness. Later DOM changes or reloads can invalidate a path. See [overflow evidence](docs/overflow-evidence.md) for native DOM query examples.

`failedRequests` contains transport failures from Playwright's `requestfailed` event. HTTP 404/500 responses alone are not transport failures. A main-document HTTP response of 400 or greater is an operational navigation error. See [Playwright's event documentation](https://playwright.dev/docs/api/class-page#page-event-requestfailed).

### Development and limits

Individual commands are `npm run typecheck`, `npm run build`, `npm test` and `npm run smoke`. Build before running smoke by itself. Contributors can use `pnpm install --frozen-lockfile` and corresponding `pnpm run` commands; npm is the primary documented workflow. Keep the npm and pnpm lockfiles synchronized when dependencies change.

The audit observes DOMContentLoaded, optional readiness, a fixed delay, measurement and screenshot capture. One visible element does not prove all content has settled. Late/lazy content, authenticated flows, interactions, nested frames and full accessibility coverage are outside scope. Widths can be selected and explicit JSON configuration is supported; height customization and device presets are not provided. Selectors inspect the top-level document; no Shadow DOM or iframe traversal, clipping-chain analysis or root-cause ranking is provided.

Auditing executes the target page's scripts and may make its usual network requests. Reports and screenshots may contain target-page data. There is no AI automatic repair, GitHub Actions workflow or npm publication.

The whale-girl art is newly generated unofficial fan art inspired by the community DeepSeek whale-girl maid design. Inspiration credits: **溟月：上善无形** and **ZipZipPipe**. No DeepSeek affiliation or endorsement is claimed. See [artwork notice](assets/brand/NOTICE.md) and [branding provenance](docs/branding.md).

See [CONTRIBUTING](CONTRIBUTING.md) for development and bug reports, [GitHub upload instructions](docs/github-upload.md) for publishing the source repository, and [LICENSE](LICENSE) for MIT terms.

## 中文

Viewport Guard 是使用 TypeScript、Playwright、Commander 和 Zod 构建、以 Vitest 测试的本地 CLI。每次检查一个 HTTP/HTTPS URL，默认按 **360、390、768、1440 CSS 像素**四种宽度截图，也可以使用自定义宽度列表，并报告：

- 页面横向溢出、宽度测量，以及最多 20 个带经过验证的 CSS 选择器的候选元素。
- `console.error`、未捕获的 JavaScript 错误及失败网络请求。
- 导航、就绪等待或截图等执行过程中的错误。
- 严格 JSON 配置、自选失败策略及兼容基线的回归比较。
- 自包含离线 HTML 报告，展示截图、证据、策略结论和比较摘要。

### 快速开始

需要 **Node.js 22+** 和 npm。在项目根目录运行：

```sh
npm ci
npx playwright install chromium
npm run check
node dist/cli.js audit https://example.com --html
```

`npm ci` 按提交的 `package-lock.json` 安装依赖。`npm run check` 顺序运行类型检查、构建、自动化测试和构建后 CLI 的 smoke test。测试使用本地页面并自行启动服务，需要 Chromium 及本机回环网络访问，无需外部检查目标；Chromium 在 Node 依赖之外单独下载。

项目定义命令 `viewport-guard audit <url>`。可通过 `node dist/cli.js` 直接运行本地构建，或使用 `npm run audit -- https://example.com`，无需全局安装。代码采用 MIT 许可；生成的二创 PNG 有[独立说明](assets/brand/NOTICE.md)，不纳入该许可。`private: true` 用于防止误发 npm 包，不限制代码许可证。

### CLI 参数

```sh
node dist/cli.js audit https://example.com --output ./reports --timeout 20000 --wait 1000
```

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `-o, --output <dir>` | `viewport-guard-reports` | 唯一审计目录的上级目录 |
| `--timeout <ms>` | `15000` | 每次导航、就绪等待、测量和截图的超时；1～120000 的整数 |
| `--wait <ms>` | `500` | DOMContentLoaded 及可选就绪检查后的等待；0～30000 的整数 |
| `--wait-for <selector>` | 未设置 | 等待第一个 CSS 匹配元素可见，再进行固定等待 |
| `--widths <list>` | `360,390,768,1440` | 逗号分隔的 1～8 个唯一整数宽度，每项为 240～3840 CSS 像素 |
| `--config <file>` | 未设置 | 读取显式指定、经过严格校验的 JSON 配置 |
| `--fail-on <policy>` | `all` | `all`、`none` 或从 `overflow,console,pageerror,request` 选择的逗号分隔列表 |
| `--html` / `--no-html` | 关闭 | 开启 HTML 输出，或覆盖配置中的开启设置 |
| `--baseline <report.json>` / `--no-baseline` | 未设置 | 比较兼容的历史审计，或清除配置中的基线 |

仅接受 HTTP/HTTPS URL，拒绝包含内嵌用户名或密码的 URL。所有视口高度为 **900**，设备缩放比例为 **1**，按顺序使用全新 Chromium 上下文执行。PNG 保存可见视口，不包含完整手机设备模拟。

自定义宽度保留输入顺序。逗号分隔的十进制数字前后允许空格，也允许前导零；转换为数字后检查重复，因此 `0360,360` 会被拒绝。空项、尾逗号、小数、科学计数、单位、越界值或超过八项的列表均无效，在启动浏览器或创建输出前返回退出码 2。程序 API 支持可选的 `widths?: number[]`，限制相同，不会把字符串转为数字。高度仍固定为 900。

异步内容可以通过 `--wait-for` 指定标准 CSS 选择器，去除首尾空白后须为 1～2000 字符，包含空格时请加引号。不支持 XPath 或 Playwright 特有选择器引擎。DOMContentLoaded 后先等待首个匹配元素可见，再执行 `--wait`，随后测量和截图。就绪 CSS 校验和溢出测量也受 `--timeout` 限制；它是每次操作的时限，不是整个任务的总时限。浏览器及上下文清理使用独立的 5 秒时限。

选择器缺失或语法错误会记为执行错误，但仍尝试测量、截图并继续后续视口。导航失败跳过就绪检查。不传 `--wait-for` 时保留默认的 DOMContentLoaded 加固定等待行为。

### 配置与失败策略

优先级为**默认值 → 配置文件 → 显式 CLI 参数**。不隐式搜索配置，不执行 JavaScript 配置；目标 URL 仍通过位置参数传入。JSON 仅支持 `outputDir`、`timeoutMs`、`waitMs`、`waitForSelector`、`widths`、`failOn`、`html` 和 `baseline`，未知字段会被拒绝。`failOn` 使用类别名称数组，`html` 为布尔值，`baseline` 为路径字符串或 `false`。

例如，保存为 `viewport-guard.config.json`：

```json
{
  "outputDir": "./reports",
  "widths": [360, 390, 768, 1440],
  "timeoutMs": 15000,
  "waitMs": 500,
  "failOn": ["overflow", "console", "pageerror", "request"],
  "html": true,
  "baseline": false
}
```

```sh
node dist/cli.js audit https://example.com --config viewport-guard.config.json --fail-on overflow
```

也可以直接使用仓库中的[示例配置](examples/viewport-guard.config.json)：`--config examples/viewport-guard.config.json`。文件中的相对路径以配置文件目录为基准，CLI 路径以当前工作目录为基准。`--no-html`、`--no-baseline` 可显式清除配置中的对应设置；JSON 的空 `failOn` 数组等价于 CLI 的 `--fail-on none`。

失败策略只改变阻塞判断，**不改写收集到的事实**。`--fail-on overflow` 仍收集其他三类错误。`--fail-on none` 可以在原始视口状态与统计仍有问题时返回 0；执行错误始终返回 2。报告中的策略结论与原始结果、统计分开记录。

### 离线 HTML 与基线比较

审计时传入 `--html`，或在不启动浏览器的情况下转换已有报告：

```sh
node dist/cli.js report ./saved-audit/report.json --output ./audit.html
```

HTML 内嵌可用截图与项目图片，无需 CDN，展示证据、策略结论及可选比较摘要。目标页面字符串经过转义，不会作为脚本执行。截图必须是安全限制在审计报告目录内的 PNG，缺失证据显示为不可用。这是离线报告文件，不是托管服务。

`audit --html` 在本次运行目录保存 `report.html`。独立 `report` 默认在 JSON 旁生成 `<报告名>.html`，转换成功返回 0，不会重新访问目标，也不将原报告的问题作为转换命令的退出状态。

比较两份已有审计，或在新审计中使用基线：

```sh
node dist/cli.js compare ./baseline/report.json ./current/report.json --output ./comparison.json
node dist/cli.js audit https://example.com --baseline ./baseline/report.json --html
```

输入必须完整、无执行错误，并使用相同的规范化目标 URL、视口集合及有效失败策略；视口顺序可以不同。比较所选类别的新增、消失，以及溢出的加重、改善，忽略时间戳、耗时、截图路径、堆栈和快照 CSS 路径，不做像素比较。新增或加重返回 1，已有问题不变或改善返回 0；输入不兼容、执行失败返回 2。独立 `report` 和 `compare` 命令防止误覆盖已有输出；确需替换时传入 `--force`。

`compare` 打印 `Changes:` 摘要，传入 `--output` 时额外保存 JSON，并以 `Comparison:` 打印文件路径。使用兼容基线的审计会在本次运行目录保存 `comparison.json`；原始审计 JSON 和截图独立保留。

### 本地示例

在一个终端启动 `npm run fixtures`，构建后在另一个终端运行：

```sh
node dist/cli.js audit http://127.0.0.1:4173/normal.html
node dist/cli.js audit http://127.0.0.1:4173/overflow.html
node dist/cli.js audit http://127.0.0.1:4173/delayed.html --wait-for '#ready' --wait 0
node dist/cli.js audit http://127.0.0.1:4173/overflow-evidence.html
node dist/cli.js audit http://127.0.0.1:4173/overflow.html --widths "1920,320,1024"
```

正常页面预期退出码为 0，故意溢出页面为 1。延迟页面在 120ms 后显示初始隐藏的 1800px 面板，等待 `#ready` 后预期检出溢出、退出码为 1。证据页面的两个 1800px 面板使用重复 ID 和相同类名，预期报告通过不同 CSS 路径区分节点、退出码为 1。

自定义宽度示例预期保留 1920、320、1024 的顺序：1800px 面板在 1920px 视口中通过，在其余两种宽度下溢出。预期统计为 1 个通过、2 个失败，保存 3 张 PNG，退出码为 1。未指定 `--widths` 的示例仍使用四种默认宽度。

### 输出与退出码

每次运行都会创建新的 `audit-<时间戳>-<随机后缀>` 目录并打印报告路径，包含 `report.json`。截图沿用 `screenshots/<width>.png`，数量和尺寸对应实际选择的宽度；默认生成 `360.png`、`390.png`、`768.png`、`1440.png` 四张截图，重复运行不会覆盖旧报告。

`report.json` 的 `schemaVersion` 为 `"1.0.0"`，包含 `targetUrl`、`startedAt`、`durationMs`、`options` 和 `summary` 中的 `total/passed/failed/errors` 统计。`results` 按输入顺序为每个实际宽度记录一项，默认四项。未使用就绪选择器时省略可选的 `options.waitForSelector`；只有显式传入宽度时才写入可选的 `options.widths`，即使传入列表与默认值相同也会记录。仍接受不含这些可选字段的旧报告。

失败策略使用可选的 `options.failOn` 和 `evaluation`，后者包含 `failOn`、`passed`、`blockingViewports`。旧报告可以不含这些字段，评估时使用默认的全部类别策略。基线差异另行保存，不修改原始审计发现。

每个结果包含 `viewport`、`status`、`finalUrl`、`screenshot`、`overflow`、`consoleErrors`、`pageErrors`、`failedRequests` 和执行过程中的 `errors`。截图路径相对于报告目录。无法获取的截图或测量结果为 `null`，原因写入 `errors`。浏览器启动或输出存储失败时，可能无法生成报告。

可选的顶层 `errors` 记录浏览器清理失败等整体执行错误，未使用时省略。`summary.errors` 只统计发生执行错误的视口数；即使该值为 0，只要存在顶层错误，退出码仍为 2。仍接受不含此可选字段的旧报告。

| 退出码 | 含义 |
| --- | --- |
| `0` | 审计没有策略阻塞问题，或基线比较没有回归 |
| `1` | 审计存在策略阻塞问题，或比较发现所选类别的新增、加重 |
| `2` | 输入无效或执行失败；优先于问题退出码 |

根元素 `scrollWidth - clientWidth` **大于 1 CSS 像素**时判定横向溢出，body 宽度仅作辅助。内部滚动或裁剪内容不会自动计为页面溢出。候选节点的几何数据供排查，不等于确认根因。

每个 `overflow.elements[].selector` 都经过原生 `document.querySelectorAll` 检查，确保在**测量时的 DOM 快照**中只匹配对应节点。唯一 ID 保持简短，其余情况使用带锚点和 `:nth-child()` 的父子路径，必要时回退为纯位置路径。ID 会转义；重复类名不能证明唯一。后续 DOM 修改或重新加载后，路径可能失效。原生 DOM 查询示例见[溢出证据说明](docs/overflow-evidence.md)。

`failedRequests` 记录 Playwright `requestfailed` 事件中的传输失败。HTTP 404/500 响应本身不属于传输失败；主文档 HTTP 状态码大于等于 400 时，记为导航执行错误。区分方式见 [Playwright 官方事件文档](https://playwright.dev/docs/api/class-page#page-event-requestfailed)。

### 开发与限制

可分别执行 `npm run typecheck`、`npm run build`、`npm test`、`npm run smoke`；单独运行 smoke 前先构建。贡献者也可以使用 `pnpm install --frozen-lockfile` 和对应 `pnpm run` 命令；npm 是主要文档流程。修改依赖时应同步 npm 与 pnpm 锁文件。

观察窗口为 DOMContentLoaded、可选就绪条件、固定等待、测量和截图。单个元素可见不代表所有内容已稳定。窗口外的延迟或懒加载内容、登录流程、交互、嵌套 iframe 和完整无障碍检查不在范围内。可以选择宽度并使用显式 JSON 配置，但不提供自定义高度或设备预设；不遍历 Shadow DOM 或 iframe，也不分析裁剪链或排序根因。

检查会执行目标页面脚本，并可能触发页面通常发出的网络请求。报告和截图可能包含页面数据。项目不实现 AI 自动修复、GitHub Actions 或 npm 发布。

鲸鱼娘图片为新生成的非官方项目二创，灵感来自社区 DeepSeek 女仆鲸鱼娘设计，鸣谢 **溟月：上善无形** 与 **ZipZipPipe**。不代表 DeepSeek 官方，也无官方背书。详见[图片说明](assets/brand/NOTICE.md)和[品牌制作记录](docs/branding.md)。

开发及问题反馈见 [CONTRIBUTING](CONTRIBUTING.md)，上传源码仓库见 [GitHub 上传说明](docs/github-upload.md)，MIT 条款见 [LICENSE](LICENSE)。

## Development records / 开发记录

Historical implementation and verification records / 历史实现与验证记录：[Phase 1](docs/phase-1.md) · [0.2 readiness / 就绪等待](docs/phase-2.md) · [0.3 overflow plan and results / 溢出计划及结果](docs/phase-2-overflow-plan.md)。

Repository preparation plan and verification / 仓库整理计划及验证：[0.4 GitHub readiness](docs/github-ready-plan.md)。

Custom-width milestone plan and verification / 自定义宽度计划及验证：[0.5 custom widths](docs/custom-widths-plan.md)。

Full 1.0 plan and actual verification / 完整版计划及实际验证：[1.0 plan](docs/v1-plan.md)。

Recorded commands, results and remaining validation / 实际命令、结果与剩余验证：[verification record](docs/verification.md)。
