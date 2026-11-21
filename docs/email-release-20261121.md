# 2026-11-21 品牌邮件发布

用户确认 M01–M14 最新邮件设计并授权部署。

## 发布范围

- M01–M13：统一场景表、品牌外壳、主题、独立预览文案、事件详情、操作权重与异常处理；生成 HTML、复制源码、主题及纯文本参考。
- M14：新版主题／摘要／正文、支持邮箱、当天到期措辞；「管理通知偏好」仅在相关异常说明中提供文字链接，不在页脚重复。
- 安全事件不再单列「打开 Saldo」，异常说明就近提供打开应用／联系支持的链接；重复支持入口移除。
- 配套产品编号图、内容规范、配置检查工具及 G01–G03 验收清单。预览内容均为虚构；不发布本地环境密钥、附件、用户数据或旧 Pages 工作流。

## 已部署与核对

Supabase 项目 drmwnngessqqbszhleja 的 saldo-notifications 从 v18 更新为 **v19 ACTIVE**。读回 index.ts、reminders.js、email-templates.js，内容与本地待发布文件完全一致。

只改变邮件渲染模块。入口与提醒规则文件和 v18 完全一致；保持原有 verify_jwt=false，由函数内验证用户身份和专用调度凭据。未改变定时开关、发送密钥、数据库结构、用户偏好或投递记录。

只读核对 Cron：saldo-subscription-reminders，active=true，0 1 * * *，GMT，即香港时间每日 09:00。发布核验不执行 dispatch，不发送测试邮件或推送。

通过数据库已有 pg_net／Vault 调用函数 diagnostics，HTTP 200；scheduled、email_configured、push_configured 均为 true，发件人为 Saldo <noreply@saldo.tobmarket.ing>。凭据未读出或写入本记录。

GitHub 提交保存源码；Cloudflare 继续从 main 自动构建。此次没有修改 dist 静态资源，前端应用版本仍为 2026.11.20.2。GitHub／Cloudflare 发布不负责应用 Supabase Auth 模板。

## 待手动保存与验收

用户选择 Supabase 控制台手动配置，已确认最新 M01 保存完成；M02、M03 仍待保存并开启 Password changed 安全通知。其他已开启安全邮件也使用相应品牌模板；不为应用模板而开启其他未使用功能。M01 的确认依据为用户反馈，未独立读取线上模板或测试邮件链接。

G01–G03 仍未关闭：线上 Auth 配置及真实注册、重发、重置、密码修改通知、链接过期／复用／跨设备尚需验收。步骤见 auth-email-acceptance-20261121.md。纯文本参考文件不等同于已为 Auth 配置独立纯文本模板。

M14 点击仍打开首页，直达具体订阅保持为 G05 待办。服务商最终投递／退信与失败补偿仍按原缺口记录，不因品牌模板发布视为完成。

## 验证与回退

已通过 tests/auth-emails.cjs 和 tests/notification-delivery.cjs，以及 14 类邮件在 320／390／1280px、浅色／深色、极长名称／无图片下的浏览器检查和复制功能检查。

如需回退 M14，以本次提交的父版本中 email-templates.js 配合相同 index.ts／reminders.js 重新部署函数，不改定时任务或用户数据。Auth 模板若手动替换，需使用控制台保存前的模板备份独立恢复。
