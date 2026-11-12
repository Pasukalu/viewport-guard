# Phase 1 / 第一阶段

## MVP acceptance checklist / MVP 验收清单

All Phase 1 acceptance items below were inspected or executed successfully. / 下列第一阶段验收项已完成实现检查或实际运行验证。

- [x] Preserve existing workspace files and add an isolated `viewport-guard` project. / 保留现有文件，在独立项目目录开发。
- [x] Set up Node.js 22+, TypeScript, Playwright, Commander, Zod and Vitest. / 配置要求的技术栈及基础配置。
- [x] Implement `viewport-guard audit <url>` with validated HTTP/HTTPS input and bounded numeric options. / 实现 CLI、URL 校验和有范围的时间参数。
- [x] Audit 360/390/768/1440px widths using isolated Chromium contexts. / 四种视口分别使用独立上下文。
- [x] Save four visible-viewport PNG screenshots in a unique run directory. / 每次运行独立保存四张视口截图。
- [x] Detect document horizontal overflow and provide measured widths and candidate elements. / 检测文档横向溢出，记录宽度和候选元素。
- [x] Collect console errors, uncaught page errors and failed network requests. / 收集三类浏览器错误。
- [x] Generate a validated JSON report and meaningful exit codes 0/1/2. / 生成经过结构校验的 JSON 报告和正确退出码。
- [x] Add normal and deliberately overflowing local HTML fixtures. / 添加正常和故意溢出的本地页面。
- [x] Cover validation, report behavior and real-browser results with automated tests. / 自动化验证输入、报告行为及真实浏览器结果。
- [x] Provide bilingual README and MIT LICENSE. / 提供中英文 README 和 MIT 许可证。
- [x] Actually run and pass typecheck. / 实际运行并通过类型检查。
- [x] Actually run and pass build. / 实际运行并通过构建。
- [x] Actually run and pass test. / 实际运行并通过自动化测试。
- [x] Actually run and pass smoke test against the built CLI. / 实际运行并通过构建后 CLI 的 smoke test。

## Verification record / 验证记录

Verified on 2026-11-12 (Asia/Shanghai), Windows x64, Node.js v24.22.1, pnpm 11.25.0, Playwright 1.65.0 / Chromium 158.0.8127.18, TypeScript 5.9.3 and Vitest 3.2.7. Node 22 itself and other operating systems were not separately run. / 已在上述环境实际验证；未单独运行 Node 22 或其他操作系统。

| Check / 检查 | Command / 命令 | Result / 结果 |
| --- | --- | --- |
| Typecheck / 类型检查 | `pnpm --config.verify-deps-before-run=false run typecheck` | PASS, exit 0 / 通过 |
| Build / 构建 | `pnpm --config.verify-deps-before-run=false run build` | PASS, exit 0 / 通过 |
| Tests / 自动化测试 | `node node_modules/vitest/vitest.mjs run` | PASS, 3 files / 27 tests, exit 0 / 全部通过 |
| Smoke test / 冒烟测试 | `pnpm --config.verify-deps-before-run=false run smoke` | PASS, normal=0, overflow=1, errors=1, invalid URL=2 / 全部通过 |

## Explicit scope boundary / 明确范围

No AI automatic fixes, HTML dashboard, GitHub Actions, or npm publication in Phase 1. No crawler, authentication flow, interaction scripting, or additional browser engine is required for acceptance. / 第一阶段不实现 AI 自动修复、HTML dashboard、GitHub Actions 或 npm 发布。爬虫、登录流程、交互脚本及额外浏览器引擎不属于本阶段验收项。

The audit samples a finite load window and only the top-level document's overflow. Diagnostic candidates do not prove which element caused the overflow. HTTP error responses and transport failures are different: the latter populate `failedRequests`; a failing main-document HTTP response is an operational error. / 检查只覆盖有限加载窗口及顶层文档溢出。候选元素不等同于已确认根因。HTTP 错误响应与传输失败分开处理：后者进入 `failedRequests`，主文档 HTTP 错误记为执行错误。

## Phase 2 proposals / 第二阶段建议

These are proposals, not implemented features or commitments. Select a small next milestone before development. / 以下仅为建议，尚未实现，也未承诺纳入；下一阶段应先确定一个小里程碑。

1. Improve overflow evidence with reproducible CSS paths and separate handling of fixed, transformed and right-to-left content; add regression fixtures first. / 先补回归页面，再改善固定定位、变换和 RTL 布局的溢出证据及 CSS 路径。
2. Add explicit readiness controls such as waiting for a selector, with time limits and tests for delayed content. / 增加有超时限制的就绪条件，例如等待指定选择器，并测试延迟内容。
3. Add optional viewport configuration and selective failure policies while keeping current defaults stable. / 增加可选视口配置和错误策略，保持默认行为稳定。
4. Consider JSON report comparison between two runs to identify newly introduced findings. / 考虑比较两次 JSON 报告，定位新增问题。

Keep AI fixes, a dashboard, workflow automation and publication as separate decisions. / AI 修复、dashboard、工作流自动化和发布仍应独立决策。

### Observed evidence / 实际证据

The smoke run produced 3 JSON reports and 12 PNG files. All PNG headers and dimensions were checked. / smoke 共生成 3 份 JSON 和 12 张 PNG，均已核对 PNG 文件头与尺寸。

| Fixture / 页面 | 360px | 390px | 768px | 1440px | CLI exit / 退出码 |
| --- | --- | --- | --- | --- | --- |
| Normal overflow / 正常页溢出量 | 0px | 0px | 0px | 0px | 0 |
| Intentional overflow / 故意溢出量 | 1440px | 1410px | 1032px | 360px | 1 |
| Runtime errors / 运行错误页 | 3 channels captured | 3 channels captured | 3 channels captured | 3 channels captured | 1 |

The runtime-error fixture captured console.error, pageerror and a disconnected HTTP request at every width. Integration tests also verified HTTP 404 continuation, internal scrollers, malformed inputs, preservation of earlier output, and pending requests at browser cleanup. / 每种宽度均收集到三类错误，集成测试另外覆盖 HTTP 404 后继续检查、内部滚动容器、非法输入、保留现有输出及关闭浏览器时的未完成请求。

Initial restricted-environment browser runs failed with ERR_NETWORK_ACCESS_DENIED; the successful real-browser test and smoke runs used approved local network access. This was an execution-environment restriction. npm is absent from this machine, so npm equivalents are documented but were not executed here. / 初次浏览器运行被环境网络限制阻断，获准访问本机页面后全部通过；本机没有 npm，因此实际使用 pnpm 执行，文档中的 npm 等价命令未在此运行。

Corrections made before final verification: malformed URLs return structured validation errors; browser cleanup cancellations do not become network findings; Vite is pinned to the compatible 6.x line to retain the Node 22 minimum. / 验证前已修复非法 URL 异常和浏览器清理导致的请求误报，并将 Vite 固定到兼容 Node 22 的 6.x 系列。

No Phase 1 acceptance item remains incomplete. Limits described above remain intentional; browser startup or output-storage failures return exit 2 and may prevent report creation. / 第一阶段验收项无未完成项；上述范围限制仍然保留，浏览器启动或输出存储失败时退出码为 2，可能无法生成报告。
