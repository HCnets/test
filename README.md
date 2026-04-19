# 23:59 的赛博抽屉（离线静态站点）

这个仓库是一个纯静态项目（直接打开 `index.html` 或部署到任何静态托管即可运行）。

## GitHub Pages 部署

### 方式 A：使用 GitHub Actions（推荐）
1. 将本仓库推到 GitHub（默认分支建议为 `main`）
2. 打开 GitHub 仓库 → Settings → Pages
3. Source 选择 **GitHub Actions**
4. 等待 Actions 跑完后，Pages 会生成站点地址：
   - `https://<你的用户名>.github.io/<仓库名>/`

### 方式 B：从分支直接部署（不使用 Actions）
1. GitHub 仓库 → Settings → Pages
2. Source 选择 **Deploy from a branch**
3. Branch 选择 `main`，Folder 选择 `/ (root)`
4. 保存后等待发布即可。

## 入口

- 正式入口：`index.html`
- 视觉小说配置：`config/story.json`（由 `config/*.csv` 生成）
- 校验脚本：`tools/validate_story_config.ps1` / `tools/validate_story_config.mjs`

