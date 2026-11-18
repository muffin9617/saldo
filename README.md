# Saldo

Saldo 的正式地址是 https://saldo.tobmarket.ing 。

## 开发与发布

- 使用 Codex 开发，GitHub `muffin9617/saldo` 管理版本。
- Cloudflare Workers Builds 连接 `main`，推送后自动部署。
- 仓库根目录执行部署；静态文件目录为 `dist`，无需构建命令。
- 部署命令：`npx wrangler deploy --name saldo --assets ./dist --compatibility-date 2026-11-18`。
- Supabase 提供账号验证与个人钱包数据存储。服务端密钥不可放入静态文件。
- GitHub Pages 的部署工作流已经移除；旧站的取消发布需在仓库 Settings → Pages 中完成。

此次托管迁移沿用原线上应用，待预览确认的本地功能未包含在此发布中。
