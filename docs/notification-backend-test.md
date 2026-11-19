# 后台推送验收

`saldo-notifications` 的 `test-push` 操作用于部署后的单设备连通性检查。它必须使用服务器端的调度 token，不能使用普通用户 JWT。请求须明确指定 `user_id` 和 `device_id`；两者必须匹配已登记设备，且用户推送偏好必须开启。

此操作只发送固定测试正文，不接受自定义 endpoint 或正文，不发送邮件，不读取订阅，不启用每日调度。响应 `accepted: true` 仅表示推送提供商接受请求，实际送达须由设备用户确认。

```json
{"action":"test-push","user_id":"<owner UUID>","device_id":"<registered device UUID>"}
```

调度 token 仅从服务端 secret/Vault 获取，不能放进网页或提交到仓库。

本地验证：在仓库根目录使用支持 `stripTypeScriptTypes` 的 Node 运行 `node tests/notification-delivery.cjs`。测试采用内存数据和模拟推送/发信服务，无外部发送。覆盖调度鉴权、开关、重复抑制、全部关闭，以及测试推送的管理员权限、设备归属与用户偏好检查。

2026-11-19：用户确认系统通知显示测试成功后，部署函数 version 11 并向已登记设备发送一次后台测试。提供商接受（HTTP 200，accepted=true），用户反馈暂未收到，设备送达尚未通过，继续排查实际登记设备及浏览器接收情况。每日 cron 保持 inactive，自动发送开关关闭。
