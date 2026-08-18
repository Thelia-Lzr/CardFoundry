# GitHub Pages 部署

仓库已经包含 `.github/workflows/deploy-pages.yml`。它会在 `main` 分支有新提交时，自动将 `index.html`、`styles.css` 和 `app.js` 发布到 GitHub Pages；也可以在 Actions 页面手动运行。

## 第一次启用

在 GitHub 仓库 `https://github.com/Thelia-Lzr/CardFoundry` 中完成以下设置：

1. 打开 **Settings → Actions → General → Workflow permissions**。
2. 选择 **Read and write permissions**，保存设置。
3. 打开 **Settings → Pages**。
4. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
5. 确认默认分支为 `main`，并将本次提交推送到 `main`。

工作流成功后，站点地址通常是：

```text
https://thelia-lzr.github.io/CardFoundry/
```

也可以在 **Settings → Pages** 或工作流的 `github-pages` environment 中查看实际地址。

## 后续发布

以后只要将代码推送到 `main`：

```bash
git add .
git commit -m "deploy CardFoundry"
git push origin main
```

GitHub Actions 会自动构建并部署。需要手动重新发布时，打开 **Actions → Deploy CardFoundry to GitHub Pages → Run workflow**。

## 重要说明

- 这是纯静态网页，不需要 Node.js、npm 或构建命令。
- AI API Key 仍由用户在浏览器设置向导中填写，工作流不会读取或上传它。
- API Key 会保存在访问者自己的浏览器中；生产使用时建议配置后端代理，避免在浏览器端暴露长期密钥。
- 设计数据和 AI 上下文保存在访问者浏览器的 IndexedDB/localStorage 中，不会自动同步到 GitHub。
- 当前页面使用 Google Fonts 和 SheetJS CDN；如果仓库需要完全离线运行，需要将这些资源改为仓库内静态文件。
