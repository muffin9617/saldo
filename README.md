# Saldo · 琥珀钱包

Saldo 记录储值卡余额与订阅到期日。首次登录会打开空白钱包。储值卡、余额快照、订阅、归档和提醒偏好保存在当前账号。应用显示未来 30 天内即将到期的订阅，设备推送尚未接入。

## 本地开发

用静态服务器提供 `dist`，例如 `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`。在 Supabase 的 Redirect URLs 中允许本地测试地址后，即可测试本地 OAuth 回调。浏览器端使用 `dist/supabase-config.js` 中的项目 URL 和 publishable key。SDK 由仓库自带，版本固定为 2.119.0，许可位于 `dist/vendor`。

## 发布到 Cloudflare Pages

- Git 仓库保持私有。Pages 的生产分支使用 `main`，Framework preset 选 None，构建命令留空，发布目录设为 `dist`。
- 在 Pages 项目的 Custom domains 绑定 `saldo.tobmarket.ing`，等待域名状态变为 Active 后验证 HTTPS。
- Supabase Site URL 使用 `https://saldo.tobmarket.ing`，Redirect URLs 包含 `https://saldo.tobmarket.ing/` 及 `https://saldo.tobmarket.ing/?type=recovery`。
- 沿用现有 SMTP 发信设置。若要让确认邮件和重置邮件支持跨设备，请分别使用 `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=signup`（确认）和 `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery`（重置）。邮件模板也可以保留标准 PKCE 确认链接，收件人需用发起操作的浏览器打开。
- Google OAuth 使用 Web application 客户端。Google 的重定向 URI 是 `https://drmwnngessqqbszhleja.supabase.co/auth/v1/callback`，Supabase Google 登录设置持有客户端密钥。公开注册需要 Google 的 OAuth 发布状态允许目标用户。
- `supabase/migrations/202611080001_initial.sql` 记录已有的表与 RLS。在已有这三张表的 Saldo 项目中无需重放。客户端按记录版本更新，保留余额更新快照，Supabase 按用户限制读写权限。

发布后在浏览器分别验证邮箱注册确认、密码登录与重置、Google 登录，以及两个账号对钱包记录的隔离。
