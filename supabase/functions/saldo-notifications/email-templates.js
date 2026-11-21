const brand = {
  background: '#171512', paper: '#faf5e9', ink: '#30271e', muted: '#796c5b',
  gold: '#e9c484', line: '#e4d7c1', display: "Georgia, 'Times New Roman', serif",
  font: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif",
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
function safeUrl(value) {
  if (value === 'cid:saldo-brand') return value;
  if (String(value).startsWith('{{')) return escape(value); // Supabase template variable, expanded by Auth.
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Email links must use HTTPS');
  }
  return escape(url.href);
}
const gap = height => `<tr><td height="${height}" style="height:${height}px;font-size:0;line-height:0">&nbsp;</td></tr>`;

function button(label, href, weight = 'primary') {
  const url = safeUrl(href);
  if (weight === 'secondary') return `<a class="email-link action-secondary" href="${url}" target="_blank" style="font-family:${brand.font};font-size:14px;line-height:24px;color:#8c632a;text-decoration:underline">${escape(label)}&nbsp; →</a>`;
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" bgcolor="${brand.gold}" style="background-color:${brand.gold};border-radius:12px;mso-padding-alt:17px 24px"><a href="${url}" target="_blank" style="display:block;padding:17px 24px;border:1px solid ${brand.gold};border-radius:12px;font-family:${brand.font};font-size:15px;line-height:22px;font-weight:600;text-decoration:none;color:#332719">${escape(label)}&nbsp; →</a></td></tr></table>`;
}

export function shell({ preheader, category, title, introduction, content = '', cta, href, actionWeight = 'primary', note, footer, logoUrl,
  footerTagline = '轻松管理你的储值卡和各类订阅', signature = '' }) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(title)} · Saldo</title>
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none}a{color:inherit}p{margin:0}a:focus-visible{outline:2px solid #b27835;outline-offset:4px}
  @media only screen and (max-width:600px){.outer-pad{padding:24px 16px!important}.card-pad{padding:30px 24px!important}.email-title{font-size:27px!important;line-height:1.4!important}.brand-row{padding-bottom:24px!important}}
  @media(prefers-color-scheme:dark){.paper{background-color:#241e18!important}.ink{color:#f3e8d6!important}.muted{color:#baaa94!important}.data-panel{background-color:#30271e!important;border-color:#594730!important}.rule{border-color:#594730!important}.accent{color:#edc888!important}.email-link{color:#edc888!important}}
</style></head>
<body style="margin:0;padding:0;width:100%;background-color:${brand.background};font-family:${brand.font};color:${brand.ink}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(preheader)}&#847; &zwnj; &nbsp;</div>
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${brand.background}" style="background-color:${brand.background}"><tr><td class="outer-pad" align="center" style="padding:40px 24px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;table-layout:fixed">
<tr><td class="brand-row" align="left" style="padding:0 4px 28px"><table role="presentation" border="0" cellspacing="0" cellpadding="0"><tr>
<td width="48" valign="middle"><img src="${safeUrl(logoUrl)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:11px"></td>
<td valign="middle" style="padding-left:12px;color:#f2d6a5;font-family:${brand.display};font-size:35px;line-height:44px;letter-spacing:-1.4px">Saldo</td>
</tr></table></td></tr>
<tr><td class="paper card-pad" bgcolor="${brand.paper}" style="background-color:${brand.paper};padding:40px;border-radius:20px">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout:fixed">
<tr><td><table role="presentation" width="32" border="0" cellspacing="0" cellpadding="0"><tr><td height="3" bgcolor="#cda365" style="height:3px;font-size:0;line-height:0;background-color:#cda365;border-radius:2px">&nbsp;</td></tr></table></td></tr>${gap(16)}
<tr><td class="accent" style="font-size:12px;line-height:20px;letter-spacing:2px;color:#94713c">${escape(category)}</td></tr>${gap(16)}
<tr><td><h1 class="ink email-title" style="margin:0;font-family:${brand.font};font-size:30px;line-height:1.4;font-weight:500;letter-spacing:-.6px;color:${brand.ink};overflow-wrap:anywhere">${escape(title)}</h1></td></tr>${gap(16)}
<tr><td class="muted" style="font-size:15px;line-height:1.9;color:${brand.muted};overflow-wrap:anywhere">${introduction}</td></tr>
${content}${cta ? gap(28)+'<tr><td>'+button(cta, href, actionWeight)+'</td></tr>' : ''}${gap(22)}
<tr><td class="muted" data-email-section="note" style="font-size:12px;line-height:1.85;color:${brand.muted};overflow-wrap:anywhere">${note}</td></tr>
</table></td></tr>${gap(26)}
<tr><td data-email-section="footer" align="center" style="padding:0 16px;color:#b9aa94;font-size:12px;line-height:1.85">${footerTagline ? escape(footerTagline)+'<br>' : ''}${footer}</td></tr>${signature ? gap(10)+'<tr><td align="center" style="font-family:'+brand.display+';font-size:12px;line-height:20px;color:#8e7c62;letter-spacing:1px">'+escape(signature)+'</td></tr>' : ''}
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

const defaultLogo = 'https://saldo.tobmarket.ing/email-logo.png?v=20261120';
const home = 'https://saldo.tobmarket.ing/';
const support = 'service@saldo.tobmarket.ing';
const supportFooter = `需要帮助？<a href="mailto:${support}" style="color:#e3c28b;text-decoration:underline">联系 Saldo</a>`;
const authFooter = supportFooter+'<br>账号验证与安全通知由 Supabase 提供。';
function inlineLink(label, href) {
  const url = href === 'mailto:'+support ? href : safeUrl(href);
  return `<a class="email-link contextual-link" href="${url}" target="_blank" style="color:#8c632a;text-decoration:underline">${escape(label)}</a>`;
}

// One content registry feeds the copy tools, generated Auth templates and previews.
// Event variables below are Supabase's documented, per-template variables.
const definitions = [
  ['M01','confirmation','注册验证','验证你的邮箱','完成验证后，即可登录并使用 Saldo。','我们收到了你的注册请求，请验证邮箱，完成账号注册。','验证邮箱','{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=signup',
    '如果你没有注册 Saldo，请忽略这封邮件。<br>链接失效时，请返回 Saldo 重新申请验证邮件。'],
  ['M02','recovery','密码重置','重置你的密码','通过此链接设置新密码；未申请则无需操作。','我们收到了你的密码重置请求，请为账号设置新密码。','重置密码','{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery',
    '如果你没有申请重置密码，请忽略这封邮件，你的密码不会因此改变。<br>链接失效时，请返回 Saldo 重新申请。'],
  ['M03','password_changed_notification','密码已更新','密码已更新','本人操作无需处理；如有异常，请重置密码并联系 Saldo。','你的 Saldo 账号密码已更新。','打开 Saldo',home,
    '如果这不是你的操作，请立即打开 Saldo，使用「忘记密码」重置密码，并联系 Saldo 核查账号安全。'],
  ['M04','email_change','邮箱变更确认','确认邮箱变更','请核对目标邮箱，再确认本次变更。','我们收到了更换账号邮箱的请求，请核对下方信息并完成确认。','确认邮箱变更','{{ .ConfirmationURL }}',
    '如果这不是你的操作，请勿确认此请求，并联系 Saldo。<br>链接失效时，请重新发起邮箱变更。'],
  ['M05','email_changed_notification','邮箱已更新','邮箱已更新','请核对变更前后的邮箱；本人操作无需处理。','你的 Saldo 账号邮箱已更新。','打开 Saldo',home,
    '如果这不是你的操作，请立即联系 Saldo，协助核查账号邮箱和访问权限。'],
  ['M06','identity_linked_notification','登录方式已关联','登录方式已关联','请核对关联的登录方式；本人操作无需处理。','你的 Saldo 账号已关联下方登录方式。','打开 Saldo',home,
    '如果这不是你的操作，请立即联系 Saldo，核查关联的登录方式，并检查对应第三方账号的安全状态。'],
  ['M07','identity_unlinked_notification','登录方式已解除','登录方式已解除','请核对解除的登录方式；本人操作无需处理。','你的 Saldo 账号已解除下方登录方式。','打开 Saldo',home,
    '如果这不是你的操作，请立即联系 Saldo，协助核查登录方式和账号访问权限。'],
  ['M08','reauthentication','身份验证','你的身份验证码','请在原页面输入验证码，勿向他人透露。','你正在进行需要再次验证身份的操作，请在发起操作的页面输入下方验证码。',null,null,
    '请勿向任何人透露验证码。如果这不是你的操作，请忽略此邮件。<br>验证码失效时，请返回原页面重新验证。'],
  ['M09','invite','账号邀请','你收到了邀请','确认认识邀请方后，再选择是否接受邀请。','你收到了使用 Saldo 的邀请，请确认认识邀请方后再继续。','接受邀请','{{ .ConfirmationURL }}',
    '如果你不认识邀请方，请勿接受邀请，可忽略这封邮件。<br>链接失效时，请联系邀请方重新发送。'],
  ['M10','magic_link','登录验证','你的登录链接','使用此链接继续登录；未申请则无需操作。','我们收到了你的登录请求，请使用下方链接继续登录。','登录 Saldo','{{ .ConfirmationURL }}',
    '如果这不是你的操作，请勿点击链接，可忽略这封邮件。<br>链接失效时，请重新发起登录。'],
  ['M11','phone_changed_notification','手机号已更新','手机号已更新','请核对手机号变更；本人操作无需处理。','你的 Saldo 账号手机号已更新。','打开 Saldo',home,
    '如果这不是你的操作，请立即联系 Saldo，协助核查手机号和账号访问权限。'],
  ['M12','mfa_factor_enrolled_notification','验证方式已添加','验证方式已添加','请核对新增的验证方式；本人操作无需处理。','你的 Saldo 账号已添加下方验证方式。','打开 Saldo',home,
    '如果这不是你的操作，请立即联系 Saldo，核查新增的验证方式及账号安全。'],
  ['M13','mfa_factor_unenrolled_notification','验证方式已移除','验证方式已移除','请核对移除的验证方式；本人操作无需处理。','你的 Saldo 账号已移除下方验证方式。','打开 Saldo',home,
    '如果这不是你的操作，请立即联系 Saldo，核查已移除的验证方式及账号安全。'],
];
const eventFields = {
  M04:[['目标邮箱','NewEmail']], M05:[['变更前邮箱','OldEmail'],['变更后邮箱','Email']],
  M06:[['关联的登录方式','Provider']], M07:[['解除的登录方式','Provider']],
  M11:[['变更前手机号','OldPhone'],['变更后手机号','Phone']],
  M12:[['添加的验证方式','FactorType']], M13:[['移除的验证方式','FactorType']],
};
export const authTemplates = definitions.map(([id,key,label,title,preheader,introduction,cta,href,note]) => ({
  id,key,label,subject:`Saldo · ${title}`,title,preheader,introduction,cta:key.endsWith('_notification')?null:cta,href,note,
  currentJourney:['M01','M02','M03'].includes(id), security:key.endsWith('_notification'),
  fields:eventFields[id] || [['账号邮箱','Email']],
}));

function eventRow(label, value) {
  return `<tr><td class="muted" width="100" valign="top" style="padding:6px 0;font-size:12px;line-height:22px;color:${brand.muted}">${escape(label)}</td><td class="ink" valign="top" align="right" style="padding:6px 0 6px 12px;font-size:13px;line-height:22px;color:${brand.ink};overflow-wrap:anywhere;word-break:break-word">${value}</td></tr>`;
}
export function renderAuthEmail(template, options = {}) {
  if (typeof template === 'string') template = authTemplates.find(item=>item.id===template || item.key===template);
  if (!template) throw new Error('Unknown Auth email template');
  const preview = options.previewData;
  const rows = template.fields.map(([label,key])=>preview
    ? (preview[key] ? eventRow(label,escape(preview[key])) : '')
    : `{{ if .${key} }}${eventRow(label,`{{ .${key} }}`)}{{ end }}`).join('');
  const detailBody = rows ? `${gap(20)}<tr><td class="rule" style="border-top:1px solid ${brand.line};padding-top:10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed">${rows}</table></td></tr>` : '';
  const present = template.fields.length===1 ? '.'+template.fields[0][1] : 'or '+template.fields.map(([,key])=>'.'+key).join(' ');
  const details = preview ? detailBody : `{{ if ${present} }}${detailBody}{{ end }}`;
  const code = template.id==='M08' ? '<tr><td class="ink" style="padding-top:24px;font-size:32px;line-height:48px;letter-spacing:8px;font-weight:600">'+(preview ? escape(preview.Token || '123456') : '{{ .Token }}')+'</td></tr>' : '';
  const hint = template.security ? '如果这是你的操作，无需进一步处理。' : '';
  const content = details+code+(hint ? `${gap(16)}<tr><td class="muted" style="font-size:14px;line-height:24px;color:${brand.muted}">${hint}</td></tr>` : '');
  const href = options.actionUrl || (template.id==='M01' ? options.verificationUrl : null) || template.href;
  const hasContact = template.note.includes('联系 Saldo');
  const appUrl = options.actionUrl || home;
  const note = template.note.replaceAll('联系 Saldo',inlineLink('联系 Saldo','mailto:'+support))
    .replaceAll('返回 Saldo',inlineLink('返回 Saldo',appUrl)).replaceAll('打开 Saldo',inlineLink('打开 Saldo',appUrl));
  const textNote = template.note.replaceAll('<br>','\n').replaceAll('联系 Saldo',`联系 Saldo（${support}）`)
    .replaceAll('返回 Saldo',`返回 Saldo（${appUrl}）`).replaceAll('打开 Saldo',`打开 Saldo（${appUrl}）`);
  const textFields=template.fields.map(([label,key])=>preview ? (preview[key]?`${label}：${preview[key]}`:'') : `{{ if .${key} }}${label}：{{ .${key} }}{{ end }}`).filter(Boolean).join('\n');
  return {subject:template.subject,preheader:template.preheader,
    text:[template.title,template.introduction,textFields,template.id==='M08'?(preview?.Token || '{{ .Token }}'):null,hint,template.cta?template.cta+'：'+href:null,
      textNote,hasContact?null:`需要帮助：${support}`].filter(Boolean).join('\n\n'),
    html:shell({preheader:template.preheader,category:template.security?'账号安全通知':template.id==='M09'?'账号邀请':'账号验证',
      title:template.title,introduction:template.introduction,content,cta:template.cta,href,
      actionWeight:template.security?'secondary':'primary',note,footer:hasContact?'账号验证与安全通知由 Supabase 提供。':authFooter,
      logoUrl:options.logoUrl || defaultLogo,footerTagline:'',signature:'Saldo'}),
  };
}
export function confirmationEmail(options = {}) {
  return renderAuthEmail('M01',options);
}

export function reminderEmail(subscription, offset, { appUrl = 'https://saldo.tobmarket.ing/', logoUrl = defaultLogo,
  preferencesUrl = 'https://saldo.tobmarket.ing/notification-settings.html' } = {}) {
  const when = offset === 0 ? '今天到期' : `${offset} 天后到期`;
  const title = offset === 0 ? '你的订阅今天到期' : '你的订阅即将到期';
  const name = String(subscription.name ?? '订阅');
  const date = String(subscription.expires_on ?? '');
  const introduction = subscription.auto_renew === true
    ? '你已将此订阅标记为自动续约。<br>请留意续费安排，具体以服务商为准。'
    : subscription.auto_renew === false
      ? '如需继续使用，请提前安排续订。'
      : '打开 Saldo，查看你记录的订阅详情。';
  const event = offset === 0 ? `你记录的「${name}」今天到期。` : `你记录的「${name}」将在 ${offset} 天后到期。`;
  const preheader = offset === 0 ? '请核对订阅详情，留意今天的续订安排。' : `请核对订阅详情，留意 ${date} 的续订安排。`;
  const fields = [['到期日期', date]];
  if (subscription.fee_cents != null && Number.isSafeInteger(Number(subscription.fee_cents)) && Number(subscription.fee_cents) >= 0) {
    fields.push(['记录费用', '¥ '+(Number(subscription.fee_cents)/100).toLocaleString('zh-CN', { minimumFractionDigits:2, maximumFractionDigits:2 })]);
  }
  if (typeof subscription.auto_renew === 'boolean') fields.push(['自动续约', subscription.auto_renew ? '是' : '否']);
  const details = fields.map(([label,value])=>`<tr><td class="muted" width="92" valign="top" style="padding:8px 0;font-size:13px;line-height:22px;color:${brand.muted}">${label}</td><td class="ink" align="right" valign="top" style="padding:8px 0 8px 12px;font-size:14px;line-height:22px;color:${brand.ink};overflow-wrap:anywhere;word-break:break-word">${escape(value)}</td></tr>`).join('');
  return {
    subject: `Saldo · ${name} · ${when}`,
    preheader,
    text: `${event}\n${introduction.replaceAll('<br>','\n')}\n${fields.map(([label,value])=>label+'：'+value).join('\n')}\n\n查看订阅：${appUrl}\n此提醒基于你在 Saldo 中记录的信息，不代表实际扣款或续约结果。\n信息有误时，请在 Saldo 中修改订阅记录；不再需要提醒时，可管理通知偏好：${preferencesUrl}\n需要帮助：${support}`,
    html: shell({
      preheader, category: '订阅到期提醒', title,
      introduction:escape(event)+'<br>'+introduction,
      content: `${gap(24)}<tr><td><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse:separate;table-layout:fixed"><tr><td class="data-panel" bgcolor="#f1e8d8" style="padding:22px 20px;background-color:#f1e8d8;border:1px solid ${brand.line};border-radius:12px"><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr><td class="accent" style="font-family:${brand.font};font-size:12px;line-height:22px;color:#8c632a">${escape(when)}</td></tr>${gap(8)}<tr><td class="ink" style="font-size:22px;line-height:1.5;font-weight:500;color:${brand.ink};overflow-wrap:anywhere;word-break:break-word">${escape(name)}</td></tr>${gap(16)}<tr><td class="rule" style="border-top:1px solid ${brand.line};padding-top:10px"><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout:fixed">${details}</table></td></tr></table></td></tr></table></td></tr>`,
      cta: '查看订阅', href: appUrl, logoUrl,
      note: '此提醒基于你在 Saldo 中记录的信息，不代表实际扣款或续约结果。<br>信息有误时，请在 Saldo 中修改订阅记录；不再需要提醒时，可'+inlineLink('管理通知偏好',preferencesUrl)+'。',
      footer: supportFooter,
      footerTagline:'',signature:'Saldo',
    }),
  };
}
