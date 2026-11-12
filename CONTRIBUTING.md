# Contributing / 参与贡献

## English

Use Node.js 22+ and npm. Start from a clean checkout:

```sh
npm ci
npx playwright install chromium
npm run check
```

The check command runs typecheck, build, Vitest tests and built-CLI smoke tests. Tests use local fixture servers and require loopback access. Use `npm run fixtures` to serve manual examples at `http://127.0.0.1:4173`; stop it with Ctrl+C. Individual checks are listed in the README. `pnpm install --frozen-lockfile` and equivalent pnpm scripts are an alternative; synchronize both lockfiles when changing dependencies.

For a bug report, include:

- Node.js, package-manager, operating-system and Viewport Guard versions.
- Exact command, expected result, actual result and exit code.
- Relevant JSON configuration, failure policy and baseline compatibility details when those features are involved.
- A small reproducible HTML page, preferably using only local resources.
- Relevant report entries or screenshots. Remove private URLs, query tokens, personal data and page content you do not intend to share.

For changes, create a focused branch, describe the concrete behavior being changed and add a regression test when fixing audit behavior. Run `npm run check` and state the actual result in the pull request. Report any platform or browser limitation you could not verify. Keep unrelated edits out of the change.

`src/` contains the audit, CLI, validation, overflow measurement, policy, comparison and offline HTML code; `tests/` contains Vitest coverage; `fixtures/` and `scripts/` support local browser tests. Do not commit `node_modules/`, `dist/`, browser caches, generated audit reports/screenshots or coverage output. Project brand assets belong in `assets/brand/` with provenance and their separate artwork notice. Keep report compatibility and default CLI behavior unless a change explicitly calls for otherwise.

Version 1.0 covers one URL, four default widths or a validated custom list, JSON configuration, failure policies, baseline comparison and self-contained offline HTML reports. Test configuration precedence, preserved raw facts, operational-error exit codes, report compatibility, HTML escaping and local screenshot-path boundaries when changing these areas. Discuss broader features before implementation. AI automatic repair, GitHub Actions and npm publication remain outside scope. `private: true` guards against accidental npm publication. Code is MIT; fan-art PNGs are excluded and governed by [their notice](assets/brand/NOTICE.md). Do not submit artwork with unsupported ownership or official-affiliation claims.

## 中文

需要 Node.js 22+ 和 npm。从干净的源码副本开始：

```sh
npm ci
npx playwright install chromium
npm run check
```

检查命令包含类型检查、构建、Vitest 测试和构建后 CLI 的 smoke test。测试使用本地服务，需要回环网络访问。`npm run fixtures` 在 `http://127.0.0.1:4173` 提供手动示例，按 Ctrl+C 停止。单项命令见 README。也可使用 `pnpm install --frozen-lockfile` 和对应脚本；修改依赖时同步两个锁文件。

反馈问题时请提供：

- Node.js、包管理器、操作系统及 Viewport Guard 版本。
- 完整命令、预期行为、实际行为与退出码。
- 涉及配置、失败策略或基线时，提供相关 JSON 设置及兼容性信息。
- 尽量仅使用本地资源的最小可复现 HTML 页面。
- 相关报告条目或截图；先移除私人 URL、查询参数中的令牌、个人信息和不打算公开的页面内容。

提交修改时创建专门分支，说明具体行为变化；修复审计行为时补充回归测试。运行 `npm run check`，在 PR 中说明真实结果及尚未验证的平台或浏览器限制，避免混入无关修改。

`src/` 包含审计、CLI、校验、溢出测量、策略、比较及离线 HTML 代码，`tests/` 为 Vitest 测试，`fixtures/` 与 `scripts/` 支持本地浏览器测试。不要提交 `node_modules/`、`dist/`、浏览器缓存、审计生成的报告与截图或覆盖率输出。项目品牌图片放入 `assets/brand/`，附制作来源及独立图片说明。除非明确调整，应保持报告兼容与默认 CLI 行为。

1.0 范围为单 URL、默认四种或自定义宽度、JSON 配置、失败策略、基线比较及自包含离线 HTML 报告。修改相关逻辑时应验证配置优先级、原始事实保留、执行错误退出码、报告兼容、HTML 转义和本地截图路径边界。更大功能应先讨论。AI 自动修复、GitHub Actions 和 npm 发布仍不在范围。`private: true` 防止误发 npm 包。代码采用 MIT，二创 PNG 不纳入该许可，详见[图片说明](assets/brand/NOTICE.md)；不要提交无依据的作品权属或官方关系声明。
