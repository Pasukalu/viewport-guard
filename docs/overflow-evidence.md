# Overflow evidence / 溢出证据

## English

Local version 0.3.0 improves `overflow.elements[].selector` so a reported candidate can be located precisely in the measured top-level document. The [implementation plan](phase-2-overflow-plan.md) records the milestone and its verification status. The report fields and `schemaVersion: "1.0.0"` are unchanged.

The document root still determines whether a page overflows: `scrollWidth - clientWidth > 1` CSS pixel. The report keeps measured widths, candidate geometry and the limit of 20 candidates. A candidate extends beyond the viewport; this is a diagnostic hint rather than proof that it caused the page overflow.

Each selector is verified with native `document.querySelectorAll`: there must be exactly one match and it must be the candidate node. Escaped IDs are used only if that check succeeds. For duplicate IDs, missing IDs or repeated classes, the selector uses child combinators and `:nth-child()` positions, anchored at a verified unique ancestor or `:root`. Repeated class names never establish uniqueness by themselves.

For example, a unique ID may produce `#wide-panel`. Two sibling candidates sharing an ID or class can instead produce different positional paths. Exact paths depend on the measured DOM; the paths identify nodes at that snapshot and do not promise stability across later DOM changes or reloads.

After building, run the local fixture server with `npm run fixtures`, then audit in another terminal:

```sh
node dist/cli.js audit http://127.0.0.1:4173/overflow-evidence.html
```

The fixture contains two 1800px panels with duplicate IDs and the same class. The expected outcome is distinct selectors for their candidate entries, four screenshots, a JSON report and exit code 1. These are acceptance expectations, not a claim that a command has passed.

To inspect a returned selector, open the corresponding page at the reported viewport width, copy the candidate's selector JSON string, and pass it to the native DOM query in the browser console. For a candidate with a unique ID, the interaction looks like this:

```js
// Replace this string with the selector copied from the report.
const selector = "#wide-panel";
const matches = document.querySelectorAll(selector);
console.log(matches.length, matches[0]);
```

Copying the JSON string preserves escaping for special ID characters. A separately opened or changed page is a new DOM snapshot: recheck the match and its identity. This is a browser inspection technique; it adds no CLI flag.

This milestone does not add clipping-chain analysis, candidate ranking, Shadow DOM or iframe traversal, or automatic fixes. Unique selectors improve evidence lookup while candidate selection remains a geometry heuristic.

## 中文

本地 0.3.0 版本改善 `overflow.elements[].selector`，使报告中的候选节点可以在测量时的顶层文档中准确定位。[开发计划](phase-2-overflow-plan.md)记录了里程碑及验证状态。报告字段与 `schemaVersion: "1.0.0"` 保持不变。

页面溢出仍由根元素判断：`scrollWidth - clientWidth > 1` CSS 像素。报告继续保留宽度测量、候选节点几何数据，最多返回 20 个候选元素。越过视口的候选节点只是排查线索，不代表已经确认它导致了页面溢出。

每个选择器都通过原生 `document.querySelectorAll` 验证：匹配结果必须只有一个，且就是对应候选节点。转义后的 ID 只有通过该检查才会采用。重复 ID、无 ID 或重复类名使用父子组合路径及 `:nth-child()` 位置，以经过验证的唯一祖先或 `:root` 为锚；仅有重复类名无法证明唯一。

例如，唯一 ID 可以生成简短的 `#wide-panel`。两个 ID 或类名重复的兄弟候选节点则可以通过不同的位置路径区分。实际路径取决于测量时的 DOM，只承诺该快照中的定位准确性，不承诺跨 DOM 修改或跨加载稳定。

构建后运行 `npm run fixtures`，再在另一个终端运行：

```sh
node dist/cli.js audit http://127.0.0.1:4173/overflow-evidence.html
```

该页面包含两个 ID 重复、类名相同的 1800px 面板。预期结果为两个候选条目使用不同选择器、保存四张截图和 JSON 报告、退出码为 1。这是验收预期，不是命令已通过的声明。

检查报告中的选择器时，以报告对应的视口宽度打开页面，将候选条目的选择器 JSON 字符串复制到浏览器控制台的原生 DOM 查询中。唯一 ID 的示例：

```js
// 将这里的字符串替换为从报告复制的 selector。
const selector = "#wide-panel";
const matches = document.querySelectorAll(selector);
console.log(matches.length, matches[0]);
```

直接复制 JSON 字符串可以保留特殊 ID 字符的转义。单独打开或修改后的页面属于新 DOM 快照，应重新检查匹配数量及节点身份。这只是浏览器检查方法，没有新增 CLI 参数。

本轮不增加裁剪链分析、候选根因排序、Shadow DOM 或 iframe 遍历，也不自动修复。唯一选择器改善的是证据定位，候选元素的选取仍基于几何启发式规则。
