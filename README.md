# Saldo

轻松管理你的储值卡和各类订阅。正式地址：[saldo.tobmarket.ing](https://saldo.tobmarket.ing)。

## 开发与发布

- GitHub `muffin9617/saldo` 管理版本，Cloudflare Workers Builds 连接 `main` 自动部署。
- 静态资源位于 `dist`；仓库根目录执行部署，无需构建命令。
- 部署命令：`npx wrangler deploy --name saldo --assets ./dist --compatibility-date 2026-11-18`。
- GitHub Pages 工作流已移除，旧站已取消发布。
- 本地运行：`python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`。该方式使用真实 Supabase；隔离模拟预览工具不包含在发布目录。

## 账号与数据

Supabase 提供邮箱密码、Google 账号验证和个人数据存储。统一账号入口调用 `saldo-auth`；错误密码不会触发注册。新账号需验证邮箱。条款同意记录保存在当前账号，钱包和记录操作受 RLS 限制。服务端密钥只保存在后端。

「我的」提供通知设置、主屏幕安装指引、记录恢复与永久删除、JSON 导出及条款与联系信息。已安装模式隐藏重复安装入口。通知开关控制账号接收偏好，设备推送另需用户主动授权。

## 后端与验证

- `supabase/functions` 保存已部署的认证和提醒函数源码；提交前端不会自动部署这些函数。
- `supabase/migrations` 与线上已应用版本对齐。不要在已有项目上重新执行初始化 SQL。
- 每日提醒使用既有 Cron，香港时间每日 09:00 检查一次。配置说明见 [通知运维](supabase/ops/notifications.md)。
- 本地检查：`node tests/unified-account.cjs`、`node tests/notification-delivery.cjs`。数据库测试需要 PGlite，通过 `SALDO_PGLITE_MODULE` 指定模块路径后执行 `node tests/account-database.cjs`。
- 发布范围与验收见 [2026-11-20 发布记录](docs/release-20261120.md)。

本轮交互约定见 [交互规范](docs/interaction-guidelines.md)，导航回归测试为 `node tests/navigation.cjs`。当前草稿仅保留在页面内存，离线不自动同步。

邮件场景 M01–M14 及功能编号见 [产品逻辑图](docs/product-map.md)；文案与交互遵循 [邮件内容规范](docs/email-content-guidelines.md)。提醒模板已部署到 saldo-notifications v19，账号邮件模板需在 Supabase Auth 独立保存；详见 [邮件发布记录](docs/email-release-20261121.md)。
