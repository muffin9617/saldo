import { settingsHeader } from './settings-ui.js';
if (new URL(location.href).searchParams.get('from') === 'me') {
  document.body.classList.add('settings-document','terms-document');
  document.querySelector('header').outerHTML = settingsHeader('使用条款与隐私说明',{backHref:'/?view=me&section=about',backLabel:'返回关于 Saldo'});
}
