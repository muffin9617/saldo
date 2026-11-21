# G01–G03 账号邮件品牌化与验收

日期：2026-11-21。对应产品逻辑图固定编号，不修改账号产品逻辑或通知调度。

## 本轮实际完成与未完成

| 缺口 | 本地交付 | 线上状态 |
| --- | --- | --- |
| G01 | M01–M13 共用品牌外壳；新增 M02 重置、M03 密码变更及其他条件邮件；生成 HTML、可复制源码、主题与纯文本参考；统一支持邮箱。 | 用户已确认最新 M01 保存到 Supabase；M02、M03 及其他实际开启邮件仍待保存。M01 未独立读回或实测注册链接。 |
| G02 | 配置核对清单、官方 Management API 审计／应用工具；脱敏报告、模板回滚备份、应用后读回检查。 | 连接工具无 Auth 配置接口；控制台连接超时。用户选择手动设置，不使用 Token 工具。不能据此断言 SMTP、模板或安全开关已完成核验。 |
| G03 | 模板与生成物一致性、回调模拟、登录回归、提醒回归、浏览器排版通过。 | 尚未发送本轮真实验证／重置／安全邮件；真实收信、链接过期／复用／跨设备仍待验收。 |

用户已确认品牌模板并授权部署。M14 已部署到 saldo-notifications v19，代码读回与本地一致；本提交保存源码和模板。M01–M13 线上 Auth 配置仍待用户手动保存；本轮没有发送测试邮件或创建测试账号。邮件预览服务端口 4176，发布记录见 email-release-20261121.md。

后续本地迭代：M01–M14 已按 [内容规范](email-content-guidelines.md) 统一主题、独立预览摘要、事件信息、操作权重和分场景异常处理；M01 也改为从同一场景表渲染，避免单独维护。已重新生成全部主题和 HTML，控制台粘贴时请使用预览页最新内容。新增变量仅使用官方对应模板支持的字段，并隐藏空值；本地检查不替代线上 Go 模板保存与真实收信验收。

## 1. 手动配置 G01／G02

项目：https://supabase.com/dashboard/project/drmwnngessqqbszhleja

进入 Authentication → Emails（旧版可能标为 Email Templates）。本地 http://127.0.0.1:4176/ 选择相应编号，使用「复制主题」和「复制 Supabase HTML」，分别粘贴到 Subject 与正文。复制的是正式模板变量，不是预览链接；浏览器拒绝复制时显示可全选的源码。

也可使用 `*-source.txt` 的全文；这是 HTML 源码文本，不是浏览器中的邮件预览。`*-subject.txt` 仅用于 Subject。

先完成当前产品链路所需三项：

| 编号 | 控制台模板名称 | 主题文件 | 正文源码 |
| --- | --- | --- | --- |
| M01 | Confirm sign up / Confirm signup | emails/auth-confirmation-subject.txt | emails/auth-confirmation-source.txt |
| M02 | Reset password | emails/auth-recovery-subject.txt | emails/auth-recovery-source.txt |
| M03 | Password changed | emails/auth-password-changed-notification-subject.txt | emails/auth-password-changed-notification-source.txt |

M03 需同时启用 Password changed 安全通知，保存主题与正文。它是密码修改成功后的安全提醒，不是重置密码申请邮件。其他安全通知开关保持原状；凡当前已经开启的类型，也替换成对应品牌模板。其余备用模板不会创建新产品入口，不需要为了品牌化而开启所有开关。

| 编号 | 控制台类型 | 源码文件 |
| --- | --- | --- |
| M04 | Change email address | emails/auth-email-change-source.txt |
| M05 | Email address changed | emails/auth-email-changed-notification-source.txt |
| M06 | Sign-in method linked | emails/auth-identity-linked-notification-source.txt |
| M07 | Sign-in method removed | emails/auth-identity-unlinked-notification-source.txt |
| M08 | Reauthentication | emails/auth-reauthentication-source.txt |
| M09 | Invite user | emails/auth-invite-source.txt |
| M10 | Magic link | emails/auth-magic-link-source.txt |
| M11 | Phone number changed | emails/auth-phone-changed-notification-source.txt |
| M12 | Verification method added | emails/auth-mfa-factor-enrolled-notification-source.txt |
| M13 | Verification method removed | emails/auth-mfa-factor-unenrolled-notification-source.txt |

相应 Subject 文件与源码同名，将 `-source.txt` 换成 `-subject.txt`。备用流程的文案已生成，但尚未开放的邀请、无密码、邮箱变更、MFA 等完整业务流程不因此视为已验收。

### 配置核对记录

| 配置 | 应有值／判断 | 本轮线上证据 |
| --- | --- | --- |
| Site URL | https://saldo.tobmarket.ing（无尾斜线） | 待用户核对 |
| Redirect URLs | 保留必要已有地址；含 https://saldo.tobmarket.ing/ 及 https://saldo.tobmarket.ing/?type=recovery | 待用户核对 |
| Email confirmation | 开启注册邮箱验证 | 待用户核对 |
| Custom SMTP | 已启用，使用 Resend；不把 API Key 粘贴到聊天或代码中 | 待用户核对 |
| Sender name | Saldo | 待用户核对 |
| Sender email | noreply@saldo.tobmarket.ing | 待用户核对 |
| Password changed notice | 开启 | 待用户保存 |
| 其他安全通知 | 记录已开启类型；保持原选择，并替换其品牌模板 | 待用户提供列表 |
| Send Email Hook | 若启用，需审查 Hook 实际渲染来源；不能只核对 Dashboard 模板 | 待用户核对 |
| OTP 有效期／邮件限流 | 记录当前配置；本轮不随意修改 | 待用户核对 |
| Resend tracking | Auth 邮件禁用会改写链接的点击追踪 | 待用户核对／实收验证 |

## 2. G03 真实用户链路验收

使用一个自有测试邮箱或 Gmail 加号别名，例如以自己的 Gmail 地址加 `+saldo-g3-20261121`。测试账号与日常账号分开；不修改日常账号密码，不填真实钱包数据。真实邮件应由正式注册／找回入口触发，不能用手工发送样式稿代替。

| 用例 | 操作 | 通过标准 | 当前状态 |
| --- | --- | --- | --- |
| T01／M01 | 新邮箱在正式站输入密码、勾选条款并继续 | 收到 Saldo 品牌验证邮件；发件人／域名正确，支持邮箱可见，无旧模板或预览链接 | 待真实测试 |
| T02／M01 | 点击有效注册验证链接 | 回到正式域名，邮箱验证成功，测试账号可登录 | 待真实测试 |
| T03／M01 | 申请重发，使用最新邮件 | 最新链接能验证；核对旧链接实际状态与产品提示 | 待真实测试 |
| T04／M01 | 再次使用已经成功验证的链接 | 不因旧链接创建新账号或错误会话；能看到失效／重新申请提示 | 待真实测试 |
| T05／M02 | 用已验证测试账号执行忘记密码 | 收到 M02 品牌重置邮件，页面不泄露陌生邮箱是否存在 | 待真实测试 |
| T06／M02 | 点击有效链接、设置新密码 | 打开重置界面；新密码登录成功，旧密码失败且不会误注册 | 待真实测试 |
| T07／M03 | T06 修改密码成功 | 收到品牌安全通知；包含非本人操作的补救指引和联系邮箱 | 待真实测试 |
| T08／M01、M02 | 用第二台设备／独立浏览器打开未消费的 token_hash 链接 | 不依赖发起设备的 PKCE verifier；进入正确验证／重置流程 | 待真实测试 |
| T09／M01、M02 | 链接超过项目实际有效期后打开 | 明确失效提示，可重新申请；不能进入有效重置会话 | 待真实测试；需等待配置有效期 |
| T10／M02 | 二次点击已消费的重置链接 | 不允许再次用该链接取得重置会话 | 待真实测试 |
| T11／M01、M02、M03 | Gmail／Apple Mail／Outlook 的可用真实客户端检查 | 手机／桌面、深色／图片关闭可读；按钮、支持链接和纯文本替代符合实际客户端表现 | 待真实测试 |
| T12／M01、M02、M03 | 检查原始邮件认证结果 | SPF、DKIM 和 From 正确；DMARC 缺口独立记录为 G06 | 待真实测试 |

过期和重复使用已在本地验证 API 返回错误时的回调分支；这不等于真实服务器令牌生命周期已经实测。G03 只有上述必需业务用例完成且证据留存后才能关闭；未能测试的邮件客户端需保留限制说明。

## 3. 本地验证记录

- `node emails/build-auth-template.mjs`：生成 13 类账号邮件的 HTML、相同内容的 source.txt、主题和纯文本参考，以及配置补丁。SMTP 的实际纯文本部分由 Auth／SMTP 链路决定，text.txt 不代表已配置到 Auth。
- `node tests/auth-emails.cjs`：13 类生成物一致性、M01／M02 类型与 token_hash、M03 安全提示、验证码场景、URL 约束、配置差异检测与脱敏、回调成功／失效／取消／无效类型／PKCE／独立上下文通过。
- `node tests/unified-account.cjs`：统一登录注册、错误密码不误注册、待验证、条款与限流通过。
- `node tests/notification-delivery.cjs`：原有到期规则、时区、通道选择、去重与关闭偏好回归通过。
- 浏览器：14 类邮件 × 320／390／1280px × 浅色／深色；超长订阅／无图片；无横向溢出和浏览器错误。已目视检查 M02／M03 手机截图。

浏览器检查不代表 Gmail／Apple Mail／Outlook 渲染，也不能替代真实 Supabase 邮件配置读回。M14 的 G04–G08 不在本轮关闭范围。

## 4. 可选 Management API 工具

用户本轮选择手动设置；下列为后续可复用工具，不会自行执行：

```sh
node emails/manage-auth-config.mjs plan
node emails/manage-auth-config.mjs audit
node emails/manage-auth-config.mjs apply
```

`plan` 不联网；`audit` 只读；`apply` 先核对基础配置，备份所修改模板字段，再更新 26 个主题／正文及密码变更通知开关，最后读回比对。其他登录设置、SMTP 密钥和其他安全通知开关不变。Token 在交互终端隐藏输入，不保存、不进参数、不写日志；不要把 Token 发到聊天。脱敏报告输出到 `/private/tmp/saldo-auth-config-audit.json`。SMTP 实际有效性仍需收信验证。

官方依据：
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/api/v1-get-auth-service-config
- https://supabase.com/docs/reference/api/v1-update-auth-service-config
