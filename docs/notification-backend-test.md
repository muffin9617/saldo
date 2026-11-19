# 后台推送验收

`saldo-notifications` 的 `test-push` 操作用于部署后的单设备连通性检查。它必须使用服务器端的调度 token，不能使用普通用户 JWT。请求须明确指定 `user_id` 和 `device_id`；两者必须匹配已登记设备，且用户推送偏好必须开启。

此操作只发送固定测试正文，不接受自定义 endpoint 或正文，不发送邮件，不读取订阅，不启用每日调度。响应 `accepted: true` 仅表示推送提供商接受请求，实际送达须由设备用户确认。

```json
{"action":"test-push","user_id":"<owner UUID>","device_id":"<registered device UUID>"}
```

调度 token 仅从服务端 secret/Vault 获取，不能放进网页或提交到仓库。

本地验证：在仓库根目录使用支持 `stripTypeScriptTypes` 的 Node 运行 `node tests/notification-delivery.cjs`。测试采用内存数据和模拟推送/发信服务，无外部发送。覆盖调度鉴权、开关、重复抑制、全部关闭，以及测试推送的管理员权限、设备归属与用户偏好检查。

2026-11-19：用户确认系统通知显示测试成功后，部署函数 version 11 并向已登记设备发送一次后台测试。提供商接受（HTTP 200，accepted=true），用户反馈暂未收到，设备送达尚未通过，继续排查实际登记设备及浏览器接收情况。每日 cron 保持 inactive，自动发送开关关闭。

复测准备：测试推送使用 high urgency，普通订阅提醒仍为 normal。响应保留提供商 HTTP 状态；它仍不能作为设备送达证据。用户已确认 Android Chrome、Google Play 服务已启用；将保持亮屏前台做一次复测。

2026-11-19 香港时间约 23:47：用户确认通知栏收到后台测试通知，Chrome GCM Internals 截图出现 Saldo 的 Data msg received 记录，Message Decryption Failure Log 为空。对应服务端请求 27 返回 HTTP 200 / provider_status 201。后台到 Android Chrome 设备的单次推送连通性验收通过。

此前请求 25、26 虽被提供商接受，用户当时反馈未收到；不能据此判定具体原因，也不能把本次成功直接归因于开启日志或 high urgency（请求 26 已使用 high）。正常优先级、关闭应用后的送达、真实订阅到期选择、邮件与跨调用去重的线上验收仍未完成；每日调度继续关闭。

## 邮件实际发送验收

用户随后明确同意向此前指定邮箱发送一封到期提醒测试邮件。2026-11-19 使用正式 `reminderEmail` 模板生成带「非真实订阅」标记的内容，标题加 `[测试]`，示例到期日 2026-11-20、提前 1 天。未创建或改动用户订阅。

发送前校验账号已验证且邮件偏好开启。临时 scheduler-authenticated 入口限定单个已授权收件人，使用固定 Resend Idempotency-Key，防止同一次测试重复发送。请求 28 返回 HTTP 200 / provider_status 200，Resend email_id 为 `01a1f47f-d7e0-7121-9757-edad3318456a`。这只表示邮件服务接受，收件箱送达与实际排版等待用户确认。

发送完成后立即移除临时入口，部署回正式代码 version 14，其代码 hash 与发送前 version 12 相同。自动发送开关及每日 cron 保持关闭。本次验证邮件模板和服务发送，不代表真实订阅扫描、提醒日期或跨任务去重已完成线上验收。
