import { reminderEmail } from '/templates.js';
import {authTemplates,renderAuthEmail} from '/auth-templates.mjs';
const frame = document.getElementById('email-frame');
let email = 'confirmation', width = 'desktop', theme = 'light';
function render() {
  document.getElementById('copy-subject').disabled = email === 'reminder';
  document.getElementById('copy-html').disabled = email === 'reminder';
  document.getElementById('copy-status').textContent = email === 'reminder' ? '到期提醒由后台代码渲染，不粘贴到 Supabase Auth。' : '';
  document.getElementById('copy-fallback').hidden = true;
  const stress = document.getElementById('stress').checked;
  const today = document.getElementById('today').checked;
  const renewal = document.getElementById('renewal').checked;
  const options = { verificationUrl: 'https://saldo.tobmarket.ing/#preview-only', appUrl: 'https://saldo.tobmarket.ing/#preview-only', logoUrl: location.origin+'/brand.png', preferencesUrl:'https://saldo.tobmarket.ing/#preview-only' };
  // Fictional event values are preview-only; copy tools use unexpanded Auth variables.
  const previewData={Email:stress?'preview-'.repeat(25)+'@example.test':'preview@example.test',NewEmail:'new@example.test',OldEmail:'old@example.test',Provider:'Google',Phone:'+00 000 000 0000',OldPhone:'+00 000 000 0001',FactorType:'TOTP',Token:'123456'};
  const message = email !== 'reminder' ? renderAuthEmail(email === 'confirmation' ? 'M01' : email,{...options,actionUrl:options.appUrl,previewData}) : reminderEmail({
    name: stress ? '用于预览极端长度的订阅名称'.repeat(6) : '云端空间 · 年度订阅',
    expires_on: '2026-12-01', fee_cents: today ? null : stress ? 9000000000000 : 19800,
    auto_renew: today ? null : renewal,
  }, today ? 0 : 3, options);
  let html = message.html;
  // Force either supported email palette without relying on the host's theme.
  if (theme === 'dark') html = html.replace('@media(prefers-color-scheme:dark)', '@media screen');
  else html = html.replace('@media(prefers-color-scheme:dark)', '@media not all');
  if (document.getElementById('images').checked) html = html.replace(/<img\b[^>]*>/g, '<span style="display:block;width:44px;height:44px"></span>');
  // No live email action in the design preview.
  html = html.replaceAll('https://saldo.tobmarket.ing/#preview-only', '#preview-only');
  frame.title = (email === 'reminder' ? 'M14 到期提醒' : authTemplates.find(t=>t.id===(email==='confirmation'?'M01':email))?.label)+'邮件预览';
  frame.classList.toggle('mobile', width === 'mobile');
  frame.srcdoc = html;
  document.getElementById('subject').textContent = message.subject;
  document.getElementById('preheader').textContent = message.preheader;
}
function resize() { if(frame.contentDocument?.body) frame.style.height = Math.ceil(frame.contentDocument.body.getBoundingClientRect().height)+'px'; }
frame.addEventListener('load', () => { resize(); new ResizeObserver(resize).observe(frame.contentDocument.body); });
new ResizeObserver(resize).observe(frame);
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !button.matches('[data-email],[data-width],[data-theme]')) return;
  if (button.dataset.email) { email = button.dataset.email; document.getElementById('other-templates').value=''; }
  if (button.dataset.width) width = button.dataset.width;
  if (button.dataset.theme) theme = button.dataset.theme;
  button.parentElement.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  render();
});
document.querySelectorAll('input').forEach(input=>input.addEventListener('change',render));
const more=document.getElementById('other-templates');
for(const template of authTemplates.filter(item=>!['M01','M02','M03'].includes(item.id))){
  more.add(new Option(template.id+' '+template.label,template.id));
}
more.addEventListener('change',()=>{if(more.value){email=more.value;document.querySelectorAll('[data-email]').forEach(b=>b.setAttribute('aria-pressed','false'));render();}});
async function copyTemplate(part) {
  if(email==='reminder')return;
  // Copy production template variables, never the preview-only action URL.
  const message=renderAuthEmail(email==='confirmation'?'M01':email);
  const value=message[part];
  try {
    await navigator.clipboard.writeText(value);
    document.getElementById('copy-status').textContent = part==='html'?'完整 HTML 已复制，可粘贴到 Supabase 模板正文。':'主题已复制。';
  } catch {
    const field=document.getElementById('copy-fallback');
    field.value=value;field.hidden=false;field.focus();field.select();
    document.getElementById('copy-status').textContent='浏览器未允许复制，请复制下方已选中的全文。';
  }
}
document.getElementById('copy-subject').onclick=()=>void copyTemplate('subject');
document.getElementById('copy-html').onclick=()=>void copyTemplate('html');
render();
