# 同步到 GitHub（本机操作指南）

当前环境未检测到 Git（无法执行 `git` 命令），且目录内也没有 `.git`，因此需要在你的电脑终端里完成初始化与推送。

## 方案A：命令行（推荐）

### 1) 安装 Git
- Windows：安装 Git for Windows（确保勾选“Add Git to PATH”）

### 2) 初始化仓库并提交
在项目根目录（黑客松）打开终端，执行：

```bash
git init
git add .
git commit -m "sync: gameplay + content + perf optimizations"
```

### 3) 绑定远端并推送
先在 GitHub 创建一个新仓库（空仓库），然后执行：

```bash
git branch -M main
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

后续更新只需：

```bash
git add .
git commit -m "update"
git push
```

## 方案B：GitHub Desktop（更省事）
1) GitHub Desktop → Add existing repository（或 Create）  
2) 选择该项目目录  
3) Commit → Push origin

