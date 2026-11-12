# 1.0 verification / 1.0 验证记录

Recorded on **2026-11-13, Asia/Shanghai**. Local validation is complete; GitHub creation/upload remains pending. / 本地验收已完成，GitHub 建仓与上传仍待完成。

## Final observed results / 最终实际结果

Windows, Node.js **24.22.1**, npm **10.9.9**; a clean copy used the npm client through `node <npm-cli.js>` so Node 24 ran installation and every script. The equivalent commands were run separately / 干净副本通过 Node 24 调用 npm 客户端，分别执行以下命令：

| Command / 命令 | Actual result / 实际结果 |
| --- | --- |
| `npm ci --offline --no-audit --no-fund` | PASS, 58 packages, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0 |
| `npm test` | PASS, 15 files, 227/227 tests, no skips, exit 0 |
| `npm run smoke` | PASS, 19/19 CLI scenarios, exit 0 |

Windows, Node.js **22.23.5**, npm **10.9.9**; the tested source tree `293b2649` was extracted into another clean directory / 在另一干净目录解压该源码归档后执行：

```sh
npm ci --offline --no-audit --no-fund
npm run check
```

Installation added **58 packages** from the existing cache. `npm run check` exited 0 after typecheck, build, **227/227 tests across 15 files**, no skips, and **19/19 smoke scenarios**. Existing Chromium was supplied through the browser cache; these runs did not test a fresh online browser download. / 从现有缓存安装 58 个包；统一检查全部通过，无跳过。两次均使用已有 Chromium 缓存，未验证全新在线浏览器下载。

The final HTML viewport-limit regression is included. The 45 code, test, fixture, configuration and asset files match both successful clean copies, with text newlines normalized for comparison. / 最终视口数量上限回归用例已包含；45 个代码、测试、fixture、配置及素材文件与两个成功验证的副本一致，文本比较统一换行。

A pnpm 11.25.0 offline install lacked optional AIX package metadata (`ERR_PNPM_NO_OFFLINE_META`). The main npm lockfile workflow above succeeded instead; that installation check was not disabled. / pnpm 离线安装缺少 AIX 可选包元信息，改用上述 npm 主流程通过；未关闭该安装检查。

Coverage includes default/custom viewports, invalid input, readiness, browser errors, timeouts/cleanup, configuration precedence, failure policies, baseline compatibility, offline HTML, output preservation and compiled CLI workflows. The 19 smoke scenarios include the 11 existing scenarios and 8 new 1.0 workflows. / 覆盖默认及自定义视口、非法输入、就绪、浏览器错误、超时清理、配置优先级、策略、基线、HTML、输出保留和构建后 CLI；19 个 smoke 场景由原有 11 个与新增 8 个组成。

## Source audit snapshot / 源码核对快照

The final manifest contains **67 source files**. Source checks found no credential patterns, machine-specific paths or generated audit/dependency files in the upload manifest; the npm lockfile matches package metadata. Local Markdown links were checked. / 最终清单包含 67 个源码文件，未发现凭据模式、机器路径或生成的审计、依赖文件，npm 锁文件与清单一致，本地 Markdown 链接已核对。

Source layout / 源码结构：

```text
viewport-guard/
├── .github/                 Issue and PR templates; no Actions
├── assets/brand/            Generated PNGs and separate artwork NOTICE
├── docs/                    Usage, provenance, plans and verification
├── examples/                Strict JSON configuration example
├── fixtures/                Normal, overflow, delayed and error pages
├── scripts/                 Local fixture server and CLI smoke workflows
├── src/                     Audit, CLI, config, policy, comparison and HTML
├── tests/                   Automated unit, browser and CLI tests
├── package.json
├── package-lock.json
├── pnpm-lock.yaml
├── README.md
├── CONTRIBUTING.md
├── CHANGELOG.md
└── LICENSE
```

Dependency folders, `dist/`, browser caches and generated audit reports/screenshots are excluded from the source package. / 纯源码包不包含依赖、构建、浏览器缓存和审计产物。

## Acceptance status / 验收状态

- [x] Current Node 22/24 checks, including the HTML viewport-limit guard and regression. / 两个运行时通过修正后的最终检查。
- [x] Offline HTML at 1440×1000 and 390×844, including width tabs and category filters: no layout overflow, external requests or page errors; four screenshots inspected. / 桌面与手机交互、四张实际截图验收通过。
- [x] Final source manifest and package checks. / 最终源码清单与交付包核对。
- [ ] Create/upload the intended GitHub repository and verify README, assets and default branch. / 实际建仓上传并验证页面、图片和默认分支。

The intended target is **Pasukalu/viewport-guard**; this record does not assert that the remote exists or has been uploaded. / 目标仓库尚未在本记录中声明已创建或上传。

## Limits and next proposals / 限制与后续建议

Verified platforms are Windows and Chromium. Other operating systems/browser engines, late asynchronous content beyond the observation window, authentication, interactions during audit and nested frame/shadow traversal are not covered. Candidate selectors are unique only at the measurement snapshot. Code is MIT; [generated fan-art PNGs are separately described](../assets/brand/NOTICE.md). / 已验证平台限于 Windows 和 Chromium；观察窗口外的内容、登录、审计交互、嵌套框架及 Shadow DOM 不在范围，选择器不承诺跨快照稳定，图片许可另行说明。

Possible later milestones are multi-URL batches, Firefox/WebKit coverage and screenshot comparison. These are proposals, not implemented features. AI automatic repair, GitHub Actions and npm publication remain excluded. / 后续可考虑多 URL 批量、更多浏览器及截图比较，均尚未实现；继续排除 AI 自动修复、GitHub Actions 和 npm 发布。
