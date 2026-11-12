# Upload the source to GitHub / 上传源码到 GitHub

These steps publish a source repository; they do not publish an npm package. Choose a method below. / 以下步骤发布源码仓库，不发布 npm 包；任选一种方式。

Version 1.0 publication target: **Pasukalu/viewport-guard**. Repository creation and upload are being handled as part of the project work; remote existence and the final URL remain pending verification. These instructions also serve as maintenance notes. / 1.0 目标仓库为 **Pasukalu/viewport-guard**，建仓与上传由本次项目工作执行；远端是否已建立及最终 URL 待实际核验。以下同时作为维护操作说明。

## Prepare / 准备

Extract the source-only archive into its own `viewport-guard` directory, or use the project root. Include dotfiles, source, tests, fixtures, scripts, examples, docs, brand assets with their NOTICE, LICENSE and both lockfiles. Keep `node_modules/`, `dist/`, `.artifacts/`, browser caches, coverage and generated audit reports/screenshots out of Git. / 将纯源码包解压到独立 `viewport-guard` 目录，或使用项目根目录。保留隐藏配置文件、源码、测试、fixtures、脚本、示例、文档、带 NOTICE 的品牌图片、许可证和两个锁文件；不提交依赖、构建、缓存和审计输出。

Run locally / 先在本地运行：

```sh
npm ci
npx playwright install chromium
npm run check
```

The 1.0 source includes configuration, failure policies, baseline comparison and offline HTML reports. Code is MIT; brand PNGs have separate [artwork notices](../assets/brand/NOTICE.md), which must remain with the repository. / 1.0 源码包含配置、失败策略、基线比较及离线 HTML。代码采用 MIT，品牌 PNG 有独立[图片说明](../assets/brand/NOTICE.md)，仓库中应一并保留。

## Option A: GitHub Desktop / 方式 A：GitHub Desktop

1. If the folder has no `.git`, initialize it with `git init -b main`. / 若没有 `.git`，先运行 `git init -b main`。
2. Sign in to GitHub Desktop; choose **File → Add Local Repository** and select the project root. / 登录后选择该项目根目录。
3. Review Changes, confirm only source files are included, enter `Prepare Viewport Guard source repository`, and commit to `main`. Skip this if an initial commit already exists and there are no new changes. / 检查文件后提交；已有初始提交且无新改动可跳过。
4. Select **Publish repository**, choose the actual account/organization and repository name. Uncheck **Keep this code private** for a public open-source repository, then publish. / 选择实际归属和仓库名；公开开源仓库需取消私有选项，再发布。

This flow assumes no remote is configured. If one exists, inspect it first rather than removing it automatically. UI details follow [GitHub's Desktop documentation](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop?platform=windows).

以上流程假设尚未配置远端；已有远端时先检查，不要自动删除。界面步骤见上方官方文档。

## Option B: Git / 方式 B：Git 命令

Create an **empty** repository in your actual GitHub account: do not add a README, license or `.gitignore` there, because the source already includes them. Authenticate Git to that account. / 在实际 GitHub 账户创建空仓库，不要在线添加 README、许可证或 `.gitignore`；本项目已包含这些文件。先完成 Git 身份验证。

In the project root, initialize only if `.git` is absent / 在项目根目录运行，仅在没有 `.git` 时初始化：

```sh
git init -b main
```

Review and commit the source; skip the commit if the existing repository is already committed and clean / 检查并提交源码；已有提交且工作区干净时跳过提交：

Use your real Git author name and email. If Git reports that identity is missing, configure those values locally for this repository before committing; no author identity is prefilled. / 使用本人真实的 Git 作者姓名及邮箱。若 Git 提示缺少身份，提交前仅为本仓库配置实际信息；项目未预填作者身份。

```sh
git status --short
git add .
git diff --cached --stat
git commit -m "Prepare Viewport Guard source repository"
```

Copy the real repository URL from GitHub's Quick Setup page. Replace the entire placeholder below before running; no remote URL is supplied by this project. / 从 GitHub Quick Setup 复制真实仓库地址，运行前替换下面的完整占位字符串；项目未预设远端。

```sh
git remote -v
git remote add origin "PASTE_THE_ACTUAL_REPOSITORY_URL_HERE"
git remote -v
git push -u origin main
```

If `origin` already exists, confirm its destination and use it if correct. To intentionally change it, use `git remote set-url origin "PASTE_THE_ACTUAL_REPOSITORY_URL_HERE"`. / 若已有 `origin`，先确认目标，正确则直接使用；确需改动时才更新地址。See [GitHub's remote documentation](https://docs.github.com/en/get-started/git-basics/managing-remote-repositories).

Initialization and push steps follow [GitHub's local-code upload guide](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github?platform=windows).

## Confirm / 核对

Open the real repository page after upload. Confirm README, LICENSE, source, tests and lockfiles are present, and generated files are absent. A fresh clone should pass the setup and check commands above. Neither method creates a GitHub Actions workflow or publishes to npm. / 上传后打开实际仓库，核对文档、源码、测试和锁文件已包含，生成文件未上传；全新克隆应能运行上述安装与检查命令。两种方式均不创建 GitHub Actions 或发布 npm。
