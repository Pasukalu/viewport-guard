# 0.3.0 开发计划：可准确定位的溢出候选元素

本计划在实现修改前建立。继续沿用单 URL、四种视口和 PNG/JSON 的项目范围。

## 问题与交付目标

0.2.0 使用 ID 或标签加两个类名描述候选元素。重复 ID、重复类名和复杂嵌套会使这些选择器不唯一，使用报告排查时可能定位到其他元素。

本轮使每个返回的 `overflow.elements[].selector` 在**测量时的顶层文档 DOM** 中只匹配对应元素。唯一 ID 保持简短；重复 ID、无 ID 或重复类名使用有明确层级及位置的 CSS 路径。选择器不承诺跨 DOM 修改、跨加载或跨版本稳定。

## 实施顺序

1. **补回归用例**：重复 ID 和祖先 ID、重复类名、混合标签兄弟、需要转义的 ID、超过 20 个候选元素；另覆盖 transform、fixed、RTL 和内部滚动布局。
2. **隔离测量逻辑**：将 `measureOverflow` 移至 `src/overflow.ts`，在同一真实浏览器 DOM 中测试返回路径的唯一性与节点身份，审计流程继续调用该函数。
3. **实现路径生成**：使用 `CSS.escape`；仅在原生 `querySelectorAll` 验证唯一且指向目标后采用 ID；其余情况构造以唯一祖先或 `:root` 为锚、带 `:nth-child()` 的父子路径，并验证目标身份。
4. **集成验证**：增加可本地访问的溢出证据 fixture，将重复 ID 场景加入构建后 CLI smoke test。原有正常、溢出、报错、就绪等待及失败场景继续验证。
5. **验收与交付**：运行类型检查、构建、全量测试和 smoke；更新 README 中英文说明、填写真实记录；保留旧交付包，输出新的 0.3.0 项目与报告。

## 行为边界

- 文档根 `scrollWidth - clientWidth > 1` 的溢出判定保持不变，仍记录当前几何信息，最多返回 20 个候选元素。
- 当前报告字段及 `schemaVersion: "1.0.0"` 保持不变，无需迁移旧报告。
- 路径在测量时验证唯一；页面后续改动可能使位置路径失效。
- 候选元素并不等同于确认根因；本轮不增加裁剪链分析、根因排序、Shadow DOM/iframe 遍历或自动修复。
- 本轮不增加视口配置、失败策略、报告比较、dashboard、GitHub Actions 或 npm 发布。

## 验收清单

- [x] 回归用例验证选择器只匹配对应节点，且覆盖重复 ID、重复类名及特殊字符。
- [x] 简单唯一 ID 继续返回简短路径，例如 `#wide-panel`。
- [x] transform、fixed、RTL、内部滚动及 20 项上限用例通过。
- [x] 现有审计、就绪等待、报告兼容和退出码用例继续通过。
- [x] CLI smoke test 中的重复 ID 证据得到正确区分。
- [x] 中英文 README 更新，范围与限制明确。
- [x] 实际运行 typecheck、build、test、smoke 并记录结果。
- [x] 新交付包和验证记录已生成，历史交付物保留。

## 实际执行记录

2026-11-12（Asia/Shanghai）完成。Windows x64、Node.js v24.22.1、pnpm 11.25.0、Playwright 1.65.0 / Chromium 158.0.8127.18、TypeScript 5.9.3、Vitest 3.2.7。

1. **先复现**：旧算法运行最初 14 项新增用例，12 通过、2 失败，确认重复 ID 和候选上限中的路径重复问题。
2. **实现**：提取 `src/overflow.ts`；增加 ID 唯一性及身份验证、父子位置路径和位置回退；补充两个边界用例。
3. **最终验证**：`pnpm --config.verify-deps-before-run=false run typecheck`、`build`、`test`、`smoke` 均实际运行并退出 0。完整测试为 6 个文件、54 项通过；CLI smoke 为 7 个场景通过，生成 6 份 JSON、24 张尺寸正确的 PNG。
4. **质量修正**：初次类型检查的遍历变量推断问题已通过显式类型解决。真实 DOM 用例验证每条路径只匹配原节点，特殊 ID、NUL ID、唯一祖先、transform、fixed、RTL、内部滚动和 20 项上限均通过。
5. **交付**：源代码、对应构建、双语文档和验收记录进入新的 0.3.0 交付包，历史交付物保留。重复 ID fixture 的路径分别为 `:root > body:nth-child(2) > div:nth-child(2)` 和 `:root > body:nth-child(2) > div:nth-child(3)`。

本轮无未完成验收项。实际使用本地 `.artifacts/browsers` 缓存，并获准连接本机测试服务；机器无 npm，实际使用 pnpm。未单独运行 Node 22 或其他操作系统。其余后续功能保持未实现。
