# 到期提醒运维

## 当前配置

- 前端托管于 Cloudflare Workers，正式域名 https://saldo.tobmarket.ing。
- Supabase `saldo-notifications` version 18，邮件由 Resend 发送，浏览器推送使用 Web Push。
- 唯一 Cron：`saldo-subscription-reminders`，计划 `0 1 * * *`（GMT），即香港时间每日 09:00。
- 发送开关 `SALDO_NOTIFICATIONS_SCHEDULED=true`，Cron 已启用。发布前端不需要更改这些设置。
- 「我的 → 管理通知」分别保存邮件和推送偏好，允许全部关闭。关闭推送偏好不撤销其他设备的浏览器权限，服务器按账号偏好停止发送。退出登录会解除当前设备的账号关联。

推送偏好与设备连接独立：用户主动点击授权按钮后才申请通知权限；iPhone 需从主屏幕安装的应用打开。已连接状态同时检查浏览器订阅和当前账号的设备记录。普通界面没有通知连接测试入口，内部排查页不代表送达保证。

## 密钥与初始化

后端需要 `RESEND_API_KEY`、`SALDO_FROM_EMAIL`、`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` 和专用 `SALDO_REMINDER_TOKEN`。私钥与调度令牌只放在 Secrets / Vault，绝不可提交到仓库或静态目录。

四个 20261118 / 20261119 迁移已经在线上应用，文件版本与线上历史对齐。`schedule-reminders.sql` 仅供新环境初始化，最后会停用任务；正常部署严禁重跑。Cron 的 Vault URL 与令牌沿用现有配置。

如需紧急停发，先停用 Cron，再关闭函数发送开关。恢复前核对渠道配置和任务唯一性。

## 投递行为与验收

服务器按用户时区判断当天是否满足提醒规则。香港上午 09:00 是统一检查时间，不是每位用户的当地 09:00；当天扫描后新增或修改的订阅将在下次扫描时重新判断。

每条订阅、到期日、提前天数、渠道及设备均有独立投递记录；原子租约、Resend 幂等键及稳定的 Push topic / tag 限制重复投递。扫描、领取和发送前均检查接收偏好。推送服务接受请求不等于设备已收到，网络和系统可能造成延迟。

邮件和 Android Chrome 后台推送已由用户确认收到，普通优先级存在延迟；并发、重复执行、关闭渠道和账号隔离已有验证。详细记录见 `docs/notification-dispatch-acceptance.md`。本次前端发布不新增测试订阅或发送测试消息，也不宣称已验证新的每日定时运行。
