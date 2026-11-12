# Viewport Guard branding / 品牌说明

**鲸鱼娘帮你守住每一寸视口。**  
**Your whale-girl lookout for every viewport.**

Playful character, accurate technical output: the mascot welcomes the reader; the audit facts, policy verdict and operational errors remain explicit. / 角色可以活泼，技术结论必须准确；吉祥物负责亲和，审计事实、策略结论和执行错误明确呈现。

## Identity / 视觉

| Role / 用途 | Color / 颜色 |
| --- | --- |
| Deep-sea background / 深海背景 | `#0B1630` |
| Ocean accent / 海蓝强调 | `#2463EB` |
| Viewport corners / 视口边角 | `#35D6EC` |
| Surface and text / 浅色面板与文字 | `#F5FAFF` |

Use the wordmark **Viewport Guard** in a readable sans-serif. Keep the cyan viewport-corner motif simple, and reserve error colors for actual findings. Preserve the mascot's blue-to-cyan hair, whale features and navy-white outfit. Do not add a DeepSeek wordmark or an official affiliation badge. Do not turn a mascot smile or checkmark into an audit-pass claim. / 字标保持可读，边角图形简洁；错误色用于真实问题。保留角色蓝青渐变头发、鲸鱼特征及深蓝白服装，不添加 DeepSeek 字标或官方标记；角色表情和图案中的勾号不代表审计通过。

`assets/brand/mascot.png` is transparent and intended for the offline report. `assets/brand/banner.png` is a wide README hero. The generated outputs were inspected; the mascot is RGBA with sampled alpha spanning 0–255, and the banner is opaque RGB. / 吉祥物用于离线报告，横幅用于 README。已检查生成结果；吉祥物包含真实透明度，横幅为不透明 RGB。

Character inspiration and rights are documented separately in [the artwork notice](../assets/brand/NOTICE.md). Code is MIT; these fan-art PNGs are excluded. Community design inspiration is credited to 溟月：上善无形 and ZipZipPipe. No official DeepSeek affiliation is claimed. / 图片来源与权利见独立说明，PNG 不纳入代码 MIT 许可，非 DeepSeek 官方项目。

## Provenance / 制作记录

- Built-in image generation, no CLI/API-key fallback. / 内置图片生成，未改用 CLI 或 API 密钥流程。
- Mascot: a new text-generated project pose, 2026-11-12; original output copied into the project without deleting the generated source.
- Banner: 2026-11-13, using only the generated project mascot as its image reference, preserving the same character identity.
- Primary sources inspected: [community reference repository](https://github.com/TreapGoGo/deepseek-whale-girl) and [Whaleychan credits](https://whaleychan.com/). A community picture was inspected outside the repository; no gallery file is shipped.
- SHA-256 `mascot.png`: `1076A131FAC50FEA59FFF392030D668E0EC3FBCFA6F794E79ADFF115E67B30CA`.
- SHA-256 `banner.png`: `687867F0A5CB15636A64CEF40CBE31783F7A3E70A9A665B05849E79BEC27C752`.

## Generation prompts / 生成提示词

These are the exact prompts used. The requested dimensions are prompt instructions; the actual saved dimensions are recorded above and in NOTICE. / 以下为实际提示词，提示词尺寸是生成请求，实际保存尺寸见文件说明。

<details>
<summary>Mascot — text generation, transparent background / 吉祥物</summary>

```text
Use case: stylized-concept
Asset type: transparent PNG mascot for the open-source project Viewport Guard and its offline HTML reports.
Primary request: Create a newly drawn unofficial fan-art project pose inspired by the community DeepSeek whale-girl maid character. A cute clearly adult anime whale-girl lookout, rounded chibi proportions, big bright blue eyes, long flowing hair with dark royal-blue roots fading through azure to luminous cyan tips, small dark-blue whale-fin ears, curled whale-spout hair tuft, a visible curved whale tail. Navy blue and white modest maid-inspired outfit, white frilled headband and apron, tiny cyan bow. This is a playful competent adult character, fully clothed, wholesome.
Pose/composition: one single character, full body centered, slight three-quarter turn, lively confident smile. She steadies a clean cyan glowing rectangular viewport frame with one hand and points at its protected corner with the other, as if guarding a webpage from spilling out. A small generic shield-shaped check emblem at the frame corner is okay. Strong silhouette readable as a 200px mascot. Keep every body part and frame fully inside the canvas, generous transparent margin. Original pose and new illustration, do not reproduce a specific existing image.
Style: polished contemporary anime game UI mascot illustration, crisp expressive linework, soft cel shading, tasteful highlights, warm charming personality.
Color palette: midnight navy #0B1630, ocean blue #2463EB, cyan #35D6EC, clean warm white #F5FAFF.
Background: genuinely transparent alpha, no floor, no rectangular background, no fake checkerboard.
Text: none.
Constraints: no DeepSeek logo, no whale corporate logo, no wordmarks, no official affiliation badge, no lettering, no watermark, no extra characters, no sexualized pose or outfit. Generate square 1024x1024 PNG with real transparency.
```

</details>

<details>
<summary>Banner — project mascot identity reference, opaque background / 横幅</summary>

```text
Use case: compositing
Asset type: wide GitHub README hero banner for Viewport Guard, target 1792x768 landscape.
Input image 1 is the project's generated mascot identity reference and main character insert. Preserve her recognizable face, dark-blue to cyan long hair, whale-fin ears, curled whale-spout tuft, navy-and-white modest maid outfit, white headband, cyan bow, whale tail and viewport-guarding theme. Recompose into a new wide branded banner without redesigning her identity.
Scene: refined deep midnight navy #0B1630 to ocean-blue background, subtle cyan #35D6EC glow, a few elegant browser-viewport corner lines, tiny bubbles, generous negative space. Warm approachable anime illustration with crisp cel shading. One mascot only, positioned on the right, her full head and tail visible, holding her protected cyan viewport frame. Leave the left half calm and legible.
Text on left, exact spelling, beautifully typeset simple contemporary sans serif: large "Viewport Guard"; beneath in smaller text "Your whale-girl lookout for every viewport."; very small supporting line "PNG · JSON · Offline HTML". Keep all text comfortably inside margins and perfectly readable. No Chinese text needed in this image.
Mood: playful character, trustworthy technical tool, restrained attractive open-source project hero. Use navy, ocean blue, cyan and white; no busy dashboard mockup, no fake audit numbers or test badges.
Constraints: no DeepSeek logo or wordmark, no corporate whale mark, no claims of affiliation or endorsement, no extra characters, no watermark, no sexualization. This is original project fan art. Output one wide opaque PNG banner with clean generous margins.
```

</details>

