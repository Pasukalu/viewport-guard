# Phase 2: CSS readiness selector / 第二阶段：CSS 就绪选择器

## Milestone / 里程碑

Add one optional readiness condition for pages that render content after DOMContentLoaded. Keep one URL, the four existing viewports, PNG screenshots and JSON reporting. / 为 DOMContentLoaded 后继续渲染内容的页面增加一个可选就绪条件。保留单 URL、原有四种视口、PNG 截图和 JSON 报告的范围。

```sh
npm run fixtures
```

In a second terminal after building / 构建后在第二个终端运行：

```sh
node dist/cli.js audit http://127.0.0.1:4173/delayed.html --wait-for '#ready' --wait 0
```

The delayed fixture reveals an initially hidden 1800px panel with `id="ready"` after 120ms. The expected outcome with readiness enabled is overflow at all four viewport widths, four screenshots, a JSON report and exit code 1. This describes the acceptance target; actual execution results belong in the verification record below. / 延迟测试页面在 120ms 后显示初始隐藏的面板，其宽度为 1800px、`id="ready"`。启用就绪等待的预期结果为四种视口全部检出溢出、保存四张截图及 JSON 报告、退出码为 1。这是验收目标，实际执行结果应填写在下方记录中。

## Behavior / 行为约定

- CLI: `--wait-for <selector>`; API: optional `waitForSelector?: string`. Trim surrounding whitespace and accept 1–2000 characters. / CLI 参数为 `--wait-for <selector>`，API 为可选的 `waitForSelector?: string`；去除首尾空白后须为 1～2000 字符。
- Use browser CSS selector syntax and wait for the first match to become visible. XPath and Playwright-specific selector syntax are outside scope. / 使用浏览器 CSS 语法，等待第一个匹配元素可见；不支持 XPath 或 Playwright 特有选择器语法。
- On each successful navigation: DOMContentLoaded → optional readiness attempt → existing fixed `--wait` delay → overflow measurement → screenshot. / 每次导航成功后依次进行 DOMContentLoaded、可选就绪等待、原有 `--wait` 固定等待、溢出测量、截图。
- Apply `--timeout` to the readiness attempt at each viewport. It remains a per-operation limit, not a whole-run deadline. / `--timeout` 分别限制每种视口的就绪等待；它是每次操作的超时，不是整个任务的总时限。
- A malformed CSS selector or readiness timeout is an operational error: viewport status `error`, overall exit code 2. Still attempt evidence capture and continue all remaining viewports. A navigation failure skips readiness. / CSS 语法错误或就绪超时记为执行错误：视口状态 `error`、总体退出码 2；仍尝试获取测量和截图证据并检查后续视口。导航失败则跳过就绪等待。
- Omitting the option preserves the previous DOMContentLoaded-plus-delay behavior. / 省略该选项时保留原有的 DOMContentLoaded 加固定等待行为。
- Add optional `options.waitForSelector` to JSON only when used. Keep `schemaVersion: "1.0.0"` and accept older reports without the field. / 仅使用该功能时向 JSON 增加可选的 `options.waitForSelector`，保留 `schemaVersion: "1.0.0"`，接受缺少该字段的旧报告。

Visibility of one element is a chosen readiness signal, not proof that all asynchronous work has finished. The condition applies to the top-level document. / 单个元素可见是用户选择的就绪信号，不代表所有异步任务已完成；条件作用于顶层文档。

## Acceptance checklist / 验收清单

All checklist items were inspected and verified successfully. / 下列验收项已完成实现检查与实际验证。

- [x] Add validated CLI and API options without changing defaults. / 增加带校验的 CLI 和 API 选项，默认行为不变。
- [x] Wait for the first CSS match to be visible at every viewport. / 每种视口均等待首个 CSS 匹配元素可见。
- [x] Report readiness timeout and selector errors with exit code 2 while preserving evidence and later viewport execution. / 就绪超时和选择器错误返回 2，并保留证据获取和后续视口执行。
- [x] Preserve old report compatibility and omit the new field when unused. / 兼容旧报告，未使用时省略新字段。
- [x] Add the delayed fixture and browser regression coverage for readiness success and failure. / 增加延迟页面及真实浏览器就绪成功、失败回归测试。
- [x] Exercise readiness through the built CLI smoke test. / 通过构建后的 CLI 进行就绪功能 smoke test。
- [x] Update English and Chinese usage documentation. / 更新中英文用法说明。
- [x] Actually run typecheck, build, tests and smoke successfully. / 实际运行并通过类型检查、构建、自动化测试和 smoke test。

## Verification record / 验证记录

Verified on 2026-11-12 (Asia/Shanghai), Windows x64, Node.js v24.22.1, pnpm 11.25.0, Playwright 1.65.0 / Chromium 158.0.8127.18, TypeScript 5.9.3 and Vitest 3.2.7. Package version 0.2.0; no publication performed. Phase 1 remains a historical record. / 已在上述环境实际验证，项目版本为 0.2.0，未发布；Phase 1 记录保留。

| Check / 检查 | Command / 命令 | Result / 结果 |
| --- | --- | --- |
| Typecheck / 类型检查 | `pnpm --config.verify-deps-before-run=false run typecheck` | PASS, exit 0 / 通过 |
| Build / 构建 | `pnpm --config.verify-deps-before-run=false run build` | PASS, exit 0 / 通过 |
| Automated tests / 自动化测试 | `pnpm --config.verify-deps-before-run=false run test` | PASS, 5 files / 38 tests, exit 0 / 全部通过 |
| Built CLI smoke / CLI 冒烟测试 | `pnpm --config.verify-deps-before-run=false run smoke` | PASS, 6 scenarios, exit 0 / 全部通过 |

## Boundary / 范围边界

No viewport configuration, failure-policy configuration, report comparison, crawler, authentication, interaction scripting, iframe traversal, or additional browser engine in this milestone. AI automatic fixes, HTML dashboard, GitHub Actions and npm publication remain excluded. / 本里程碑不增加视口配置、错误策略配置、报告比较、爬虫、登录、交互脚本、iframe 遍历或额外浏览器引擎。继续排除 AI 自动修复、HTML dashboard、GitHub Actions 和 npm 发布。

### Actual outcomes / 实际结果

- All 38 tests passed, including the original Phase 1 checks and 11 additional configuration, report-compatibility and readiness cases. / 38 项全部通过，覆盖原有功能及新增的 11 项配置、报告兼容与就绪测试。
- All 6 CLI smoke scenarios passed: normal=0, overflow=1, errors=1, delayed=1, readiness-timeout=2, invalid URL=2. The five page audits saved 5 JSON reports and 20 correctly sized PNGs. / 六个场景全部通过；五个页面审计共生成 5 份 JSON 和 20 张尺寸正确的截图。
- The delayed fixture reveals the hidden panel after 120ms and updates its client-side URL to `?ready=1`. Tests verify the overflow at all widths and that `finalUrl` records this updated URL after capture. / 延迟页面显示面板时更新地址，测试验证四种视口的溢出以及截图后记录的最终地址。
- Missing selectors and malformed CSS (`[`, `text=ready`, selector-engine chains) all preserve measurements and screenshots while reporting operational errors at every viewport. / 缺失或非法选择器在四种视口中均保留测量与截图，并正确记录执行错误。
- Real-browser runs used approved local network access and `PLAYWRIGHT_BROWSERS_PATH` pointing to `.artifacts/browsers`. npm is absent in the execution environment; npm equivalents are documented, not executed here. Node 22 and other operating systems were not separately tested. / 真实浏览器运行使用获准的本机网络访问和本地 Chromium 缓存；本机无 npm，实际使用 pnpm；未单独测试 Node 22 或其他操作系统。

No acceptance item remains incomplete within this readiness milestone. Other Phase 2 proposals remain future work. / 本就绪等待里程碑无未完成验收项，其他 Phase 2 建议仍属后续工作。
