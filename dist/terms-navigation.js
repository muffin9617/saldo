import { installSwipeNavigation } from './gestures.js';
import { settingsHeader } from './settings-ui.js';
if (new URL(location.href).searchParams.get('from') === 'me') {
  document.body.classList.add('settings-document','terms-document');
  document.querySelector('header').outerHTML = settingsHeader('使用条款与隐私说明',{backHref:'/?view=me&section=about',backLabel:'返回关于 Saldo'});
}

installSwipeNavigation({onLeft:()=>{document.querySelector('.settings-back,.auth-back')?.click();return true;}});

const fromApp=sessionStorage.getItem('saldo.termsFromApp')==='true';sessionStorage.removeItem('saldo.termsFromApp');
if(fromApp)document.querySelector('.settings-back')?.addEventListener('click',event=>{if(history.length>1){event.preventDefault();history.back();}});
