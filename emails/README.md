# Saldo 邮件设计预览

## 2026-11-21 当前状态（优先于下方历史说明）

M01–M14 品牌稿已获用户确认；M14 已部署到 saldo-notifications v19 并读回核对代码一致。M01–M13 仍需在 Supabase 控制台保存，G01–G03 尚未关闭。本轮没有发送测试邮件，真实链路仍待验收。当前发布记录见 docs/email-release-20261121.md。

运行 `python3 emails/dev-server.py`，打开 http://127.0.0.1:4176/ 可预览 M01 注册、M02 重置、M03 密码变更、M14 到期提醒，以及下拉菜单中的其他条件模板。按钮不调用真实业务。

选中账号邮件后可「复制主题」和「复制 Supabase HTML」。复制内容保留正式 Auth 变量；浏览器不允许复制时显示源码供手动复制。M14 不复制到 Auth，其模板由提醒后台代码控制。

`node emails/build-auth-template.mjs` 现生成全部 13 类账号模板。每类提供 `.html`、相同内容的 `-source.txt`、`-subject.txt` 和纯文本参考 `-text.txt`。全部场景表与品牌渲染以 `supabase/functions/saldo-notifications/email-templates.js` 为准；不要只改生成文件。text.txt 不代表 SMTP 的实际纯文本部分已配置。

M01–M14 已按 [邮件内容规范](../docs/email-content-guidelines.md) 统一主题、独立预览文案、事件详情、操作层级与异常处理。安全事件使用文字链接，M08 保留验证码而不加按钮；页面预览只使用虚构详情，复制时保留正式 Auth 变量。

[当前配置步骤与真实验收清单](../docs/auth-email-acceptance-20261121.md) · [产品固定编号](../docs/product-map.md)

M01 使用 token_hash/signup 回调；M02 使用 token_hash/recovery 回调；M03 需要启用密码变更安全通知。其他安全通知保持原有开关。备用模板不代表邀请、无密码或 MFA 产品入口已经开放。

检查命令：`node tests/auth-emails.cjs`、`node tests/unified-account.cjs`、`node tests/notification-delivery.cjs`。配置工具 `node emails/manage-auth-config.mjs plan|audit|apply` 不会自行执行；用户手动配置时无需 Token。

下方内容为历史记录，配置与验收以本节和新验收清单为准。

此目录仅供本地设计审核，不放入 `dist`。示例均为虚构，不会注册账号或发送邮件。

## 2026-11-20 本地品牌复核

运行 `python3 emails/dev-server.py` 后，邮件预览在 `http://127.0.0.1:4176/`，安装图标与品牌信息预览在 `http://127.0.0.1:4176/brand`。本轮尚未 push、部署或发送测试邮件；线上自动提醒继续使用已验收版本。

PWA 使用最新金色 S 标识；安装名称为 Saldo，描述为「轻松管理你的储值卡和各类订阅」。新增 180px Apple touch icon、32px favicon、独立的 512px Android maskable 图标和透明单色通知栏 badge。保留 manifest id/start_url/scope，避免改变应用身份。普通图标、邮件 Logo 来源为 `dist/icon.svg`；maskable 与 badge 有各自 SVG 源文件。图标 URL 增加版本标记，便于发布后更新缓存。

提醒邮件保留原来的圆角卡片和卡片内部短金色线条，改进主题分隔符、按续约状态区分的说明、简洁页脚与直达通知设置的链接。移除旧英文钱包定位；注册验证邮件预览文案与当前产品定位统一，保留原验证回调变量。已重新生成 Auth HTML 和可复制的 source.txt；本轮确认后，Auth 模板仍需在 Dashboard 单独保存。

验证覆盖图标尺寸、资源一致性、maskable 条目、手机 320/390 与桌面布局、两种邮件、深色、无图片、超长名称/金额、空字段、链接安全与原通知发送回归。浏览器预览不代表所有邮件客户端效果，发布后可在用户授权下再做真实收信检查。

以下为先前邮件接入历史，其中尚未上线或未启用的状态已由后续正式上线记录取代。每日任务已于 2026-11-20 启用，详见 `supabase/ops/notifications.md`。

共用模板源文件：`supabase/functions/saldo-notifications/email-templates.js`。注册验证与到期提醒共用外壳、品牌、字体、按钮和深色模式。

确认设计前，不替换 Supabase Auth 模板，不接入生产发送函数。注册模板保留 `{{ .ConfirmationURL }}`，正式接入前仍需核对当前验证链接流程。提醒支持费用和自动续约状态的可选展示；空值不推断为 0 或否。

2026-11-19 向用户指定的自用邮箱发送了两封带 `[测试]` 标记的 HTML 样式邮件，Resend 均返回 200；logo 使用 CID 内嵌图片。用户已确认视觉设计与真实收信效果。注册验证测试无真实验证链接；Supabase Auth 模板仍待在 Dashboard 保存。每日任务保持停用，临时测试发送入口已移除。

用户已确认真实邮件效果。通知发送函数版本 7 已接入本目录对应的共用品牌 HTML 与纯文本备用内容，自动发送仍关闭。邮件 Logo 单独发布为 `/email-logo.png`，没有发布其余本地 PWA 迭代。

Logo 资源提交 `636b65b8c7c42f61d5b5d2469d93e4c5594d1175` 已自动构建成功。从 Supabase 服务端下载完整图片返回 200，19,380 字节，SHA-256 为 `0947c4f79879686492b76dfc514f99f6989bf6a69abd4a7c4497a7724325f237`，与本地已确认图片一致。临时资源校验入口随后移除，生产函数恢复为版本 9。

## 配置正式注册验证邮件

运行 `node emails/build-auth-template.mjs` 生成 `auth-confirmation.html` 和 `auth-confirmation-subject.txt`。在 Supabase Auth → Email Templates → Confirm signup 中粘贴主题和完整 HTML。当前连接的 Supabase 工具没有 Auth 配置修改接口，这一步需要在 Dashboard 中保存。

模板使用 `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=signup`，现有正式站 `auth.js` 已支持此回调；正式验收仍需用新注册邮箱完成验证。不要使用样式测试中的链接。保持 Site URL 为 `https://saldo.tobmarket.ing`，并确认 SMTP 发件人名称是 Saldo、发件邮箱为 `noreply@saldo.tobmarket.ing`。

预览提供两类邮件、手机宽度、深色模式、图片隐藏及极端输入。浏览器预览不能替代 Gmail、Apple Mail 和 Outlook 的实际收信验收。正式使用前，logo 需随已确认的前端版本发布，必要的服务提供方与联系信息沿用经用户确认的条款内容。
