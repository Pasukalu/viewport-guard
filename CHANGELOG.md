# Changelog / 更新记录

Versions below describe local source milestones, not npm publications. / 以下版本为本地源码里程碑，并非 npm 发布。

## 1.0.0 — Whale-girl lookout / 鲸鱼娘守护视口 — 2026-11-13

Verified on 2026-11-13 (Asia/Shanghai): clean Windows installs with Node.js 22.23.5 and 24.22.1/npm 10.9.9 each passed typecheck, build, 227/227 tests and 19/19 smoke scenarios. Desktop/mobile offline HTML and interactions passed visual checks. GitHub creation/upload remains pending. / 两个运行时的干净安装、类型检查、构建、227 项测试及 19 个 smoke 场景均通过；离线报告桌面、手机布局与交互已验收。GitHub 建仓上传尚未完成。See [verification / 验证记录](docs/verification.md).

- Add explicit, strictly validated JSON configuration with defaults → file → explicit CLI precedence and source-relative path resolution. / 增加显式 JSON 配置、优先级及相对路径处理。
- Add failure policies that preserve raw evidence and statistics while evaluating selected blocking categories; operational errors retain exit code 2. / 失败策略保留原始证据与统计，执行错误始终返回 2。
- Add compatible-baseline comparison for added/resolved findings and worsened/improved overflow, independently of snapshot selectors or screenshots. / 增加兼容基线的新增、消失及溢出变化比较。
- Add self-contained offline HTML generation through audit and standalone report commands, with escaped page strings and restricted screenshot reads. / 增加审计及独立离线 HTML 生成，转义页面字符串并限制截图读取。
- Create project-specific generated whale-girl fan art, a matching banner, bilingual usage guidance and separate artwork provenance/rights notices. / 新生成项目吉祥物及配套横幅，提供双语文档与独立图片来源、权利说明。
- Retain one URL, Chromium, 1–8 widths, height 900 and older JSON input support. No AI automatic repair, GitHub Actions or npm publication. / 保留单 URL、Chromium、最多八种宽度、高度及旧报告读取，不增加 AI 自动修复、GitHub Actions 或 npm 发布。

See [the 1.0 plan and actual verification / 完整版计划及实际验证](docs/v1-plan.md).

## 0.5.0 — Custom widths / 自定义宽度 — 2026-11-12

Verified on Windows with Node.js 22.23.5/npm 10.9.9 and Node.js 24.22.1/pnpm 11.25.0: typecheck, build, 125 tests and 11 CLI smoke scenarios passed. / 已在上述 Node 22 和 Node 24 环境验证：类型检查、构建、125 项测试和 11 个 CLI smoke 场景全部通过。

- Add CLI `--widths <list>` and API `widths?: number[]`: 1–8 unique integer widths from 240 to 3840 CSS pixels, preserving input order. / 增加 CLI 与 API 自定义宽度，保留输入顺序。
- Accept comma-separated decimal CLI tokens with surrounding spaces and leading zeros; validate duplicates after conversion and reject invalid input before browser startup or output creation. / CLI 接受各项前后空格和前导零，转换后检查重复，无效输入在浏览器及输出创建前拒绝。
- Make result counts and screenshots follow the selected list, retaining height 900 and `screenshots/<width>.png`. / 统计和截图对应实际列表，高度及文件命名不变。
- Record optional `options.widths` only when explicitly supplied, including an explicit default list; keep schema version 1.0.0 and old-report compatibility. / 仅显式传入时记录可选宽度字段，保持报告版本及旧报告兼容。
- Preserve 360/390/768/1440px defaults, existing audit/error behavior and source-only delivery; no height customization, device presets, GitHub Actions or npm publication. / 保留默认视口、审计与错误处理及纯源码交付，不增加自定义高度、设备预设、GitHub Actions 或 npm 发布。

See [the custom-width plan and actual results / 自定义宽度计划及实际结果](docs/custom-widths-plan.md).

## 0.4.0 — Repository preparation / 仓库整理 — 2026-11-12

Verified on Windows with a fresh Node.js 22.23.5/npm 10.9.9 install and Node.js 24.22.1/pnpm 11.25.0: typecheck, build, 74 tests and 7 smoke scenarios passed. / 已在 Windows 的全新 Node 22/npm 安装及 Node 24/pnpm 环境验证：类型检查、构建、74 项测试与 7 个 smoke 场景全部通过。

- Make `npm ci` the primary setup path with pinned direct dependencies and an npm lockfile; retain pnpm's frozen-lockfile workflow. / 固定直接依赖并增加 npm 锁文件，以 `npm ci` 为主要安装流程，保留 pnpm 锁文件流程。
- Add `npm run check` for typecheck, build, tests and CLI smoke. / 增加统一检查命令。
- Prepare bilingual README, contribution guidance, GitHub upload instructions and a source-only handoff. / 整理双语仓库文档及纯源码交付。
- Bound in-page CSS validation and overflow measurement by the configured timeout. / 为页面内 CSS 校验和溢出测量增加配置超时。
- Harden operational error reporting: optional top-level report `errors` retains audit-wide cleanup errors with exit code 2; old reports remain accepted. / 可选顶层 `errors` 保留清理等整体执行错误并返回退出码 2，兼容旧报告。
- Keep the four viewports, audit features and schema version 1.0.0; no GitHub Actions or npm publication. / 保留四种视口、现有功能及报告版本，不增加 GitHub Actions 或 npm 发布。

See [the repository preparation plan and results / 仓库整理计划及结果](docs/github-ready-plan.md).

## 0.3.0 — Overflow evidence / 溢出证据

- Verify every returned candidate selector uniquely matches its original node at the measurement snapshot. / 验证候选选择器在测量快照中唯一匹配原节点。
- Handle duplicate IDs, repeated classes and escaped IDs with verified ancestor paths and positional fallbacks. / 使用经过验证的祖先路径和位置回退，处理重复 ID、类名及 ID 转义。
- Add browser regression cases and the duplicate-ID fixture; retain the root overflow metric, 20-candidate cap and report schema. / 增加浏览器回归与重复 ID 页面，保留溢出判定、20 项上限和报告结构。

Recorded validation: 54 tests and 7 smoke scenarios passed on Windows/Node 24. / 已记录验证：Windows/Node 24 下 54 项测试和 7 个 smoke 场景通过。See [record / 记录](docs/phase-2-overflow-plan.md).

## 0.2.0 — Readiness selector / 就绪选择器

- Add optional `--wait-for <selector>` and API `waitForSelector` to wait for the first CSS match to become visible. / 增加可选 CSS 就绪等待。
- Preserve measurement, screenshots and later viewport execution on readiness failure; record the selector only when used. / 等待失败仍尝试收集证据并继续后续视口，仅使用时记录选择器。
- Add delayed-content and failure regression cases. / 增加延迟内容及失败回归用例。

Recorded validation: 38 tests and 6 smoke scenarios passed on Windows/Node 24. / 已记录验证：Windows/Node 24 下 38 项测试和 6 个 smoke 场景通过。See [record / 记录](docs/phase-2.md).

## 0.1.0 — Initial MVP / 初始 MVP

- Audit one HTTP/HTTPS URL at 360/390/768/1440px widths using isolated Chromium contexts. / 独立上下文检查四种视口。
- Save viewport PNGs, detect horizontal page overflow, collect console/page/network errors and write validated JSON reports. / 保存截图，检测横向溢出，收集三类错误，输出经过校验的 JSON。
- Add local fixtures, automated tests, bilingual README, MIT license and exit codes 0/1/2. / 增加本地测试页面、自动化测试、双语文档、许可证和退出码。

See [Phase 1 acceptance and actual results / 第一阶段验收及真实结果](docs/phase-1.md).
