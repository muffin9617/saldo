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

function button(label, href) {
  const url = safeUrl(href);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td align="center" bgcolor="${brand.gold}" style="background-color:${brand.gold};border-radius:12px;mso-padding-alt:17px 24px"><a href="${url}" target="_blank" style="display:block;padding:17px 24px;border:1px solid ${brand.gold};border-radius:12px;font-family:${brand.font};font-size:15px;line-height:22px;font-weight:600;text-decoration:none;color:#332719">${escape(label)}&nbsp; →</a></td></tr></table>`;
}

function shell({ preheader, category, title, introduction, content = '', cta, href, note, footer, logoUrl,
  footerTagline = '轻松管理你的储值卡和各类订阅', signature = 'SALDO · YOUR PRIVATE WALLET' }) {
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
${content}${gap(28)}<tr><td>${button(cta, href)}</td></tr>${gap(22)}
<tr><td class="muted" style="font-size:12px;line-height:1.85;color:${brand.muted};overflow-wrap:anywhere">${note}</td></tr>
</table></td></tr>${gap(26)}
<tr><td align="center" style="padding:0 16px;color:#b9aa94;font-size:12px;line-height:1.85">${escape(footerTagline)}<br>${footer}</td></tr>${gap(10)}
<tr><td align="center" style="font-family:${brand.display};font-size:12px;line-height:20px;color:#8e7c62;letter-spacing:1px">${escape(signature)}</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

const defaultLogo = 'https://saldo.tobmarket.ing/email-logo.png';
export function confirmationEmail({ verificationUrl = '{{ .ConfirmationURL }}', logoUrl = defaultLogo } = {}) {
  return {
    subject: '验证你的邮箱，开始使用 Saldo',
    text: '欢迎使用 Saldo\n轻松管理你的储值卡和各类订阅。\n请打开以下链接验证邮箱：\n'+verificationUrl+'\n\n如果你没有注册 Saldo，请忽略这封邮件。',
    html: shell({
      preheader: '只差一步，开始记录你的账本。', category: '账号验证', title: '欢迎使用 Saldo',
      introduction: '轻松管理你的储值卡和各类订阅。',
      cta: '验证邮箱', href: verificationUrl, logoUrl,
      note: '如果你没有注册 Saldo，请忽略这封邮件。<br>验证链接失效时，可返回 Saldo 重新申请。',
      footer: '<span style="color:#8e7c62">账号验证服务由 Supabase 提供。</span>',
      footerTagline: '', signature: 'Saldo',
    }),
  };
}

export function reminderEmail(subscription, offset, { appUrl = 'https://saldo.tobmarket.ing/', logoUrl = defaultLogo } = {}) {
  const when = offset === 0 ? '今天到期' : `${offset} 天后到期`;
  const title = offset === 0 ? '你的订阅今天到期' : '你的订阅即将到期';
  const name = String(subscription.name ?? '订阅');
  const date = String(subscription.expires_on ?? '');
  const fields = [['到期日期', date]];
  if (subscription.fee_cents != null && Number.isSafeInteger(Number(subscription.fee_cents)) && Number(subscription.fee_cents) >= 0) {
    fields.push(['记录费用', '¥ '+(Number(subscription.fee_cents)/100).toLocaleString('zh-CN', { minimumFractionDigits:2, maximumFractionDigits:2 })]);
  }
  if (typeof subscription.auto_renew === 'boolean') fields.push(['自动续约', subscription.auto_renew ? '是' : '否']);
  const details = fields.map(([label,value])=>`<tr><td class="muted" width="92" valign="top" style="padding:8px 0;font-size:13px;line-height:22px;color:${brand.muted}">${label}</td><td class="ink" align="right" valign="top" style="padding:8px 0 8px 12px;font-size:14px;line-height:22px;color:${brand.ink};overflow-wrap:anywhere;word-break:break-word">${escape(value)}</td></tr>`).join('');
  return {
    subject: `Saldo · ${name}${when}`,
    text: `${name} 将于 ${date} 到期（${when}）。\n${fields.map(([label,value])=>label+'：'+value).join('\n')}\n\n打开 Saldo 查看：${appUrl}\n此提醒基于你在 Saldo 中记录的信息，不代表实际扣款或续约结果。\n可在「我的 → 管理通知」关闭邮件提醒。`,
    html: shell({
      preheader: `${name} · ${date} 到期，提前安排更从容。`, category: '订阅到期提醒', title,
      introduction: '这是你在 Saldo 中设置的到期提醒。<br>你可以查看订阅，按自己的需要安排续订。',
      content: `${gap(24)}<tr><td class="data-panel" bgcolor="#f1e8d8" style="padding:22px 20px;background-color:#f1e8d8;border:1px solid ${brand.line};border-radius:12px"><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr><td class="accent" style="font-family:${brand.font};font-size:12px;line-height:22px;color:#8c632a">${escape(when)}</td></tr>${gap(8)}<tr><td class="ink" style="font-size:22px;line-height:1.5;font-weight:500;color:${brand.ink};overflow-wrap:anywhere;word-break:break-word">${escape(name)}</td></tr>${gap(16)}<tr><td class="rule" style="border-top:1px solid ${brand.line};padding-top:10px"><table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout:fixed">${details}</table></td></tr></table></td></tr>`,
      cta: '打开 Saldo', href: appUrl, logoUrl,
      note: '此提醒基于你在 Saldo 中记录的信息，不代表实际扣款或续约结果。',
      footer: '你已在 Saldo 开启邮件提醒。<br><a class="email-link" href="'+safeUrl(appUrl)+'" target="_blank" style="color:#e3c28b;text-decoration:underline">在「我的 → 管理通知」调整或关闭提醒</a>',
    }),
  };
}
