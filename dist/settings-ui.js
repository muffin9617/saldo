export const appVersion = '2026.11.24.2';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  install:'<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 6v9m-3-3 3 3 3-3M10 19h4"/>',
  archive:'<path d="M4 8h16v12H4zM3 3h18v5H3zM9 12h6"/>',
  export:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  document:'<path d="M6 2h8l4 4v16H6zM14 2v5h4M9 11h6m-6 4h6"/>',
  back:'<path d="m14 6-6 6 6 6"/>',
  next:'<path d="m9 6 6 6-6 6"/>',
};
export const settingsIcon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+(paths[name] || paths.info)+'</svg>';
export function settingsHeader(title,{backAction,backHref='/?view=me',backLabel='返回我的'}={}) {
  const tag=backAction?'button':'a';
  return '<header class="settings-header"><'+tag+' class="settings-back" aria-label="'+escape(backLabel)+'" '+(backAction?'type="button" data-action="'+escape(backAction)+'"':'href="'+escape(backHref)+'"')+'>'+settingsIcon('back')+'</'+tag+'><h1>'+escape(title)+'</h1><span aria-hidden="true"></span></header>';
}
export function settingsRow({label,description='',icon='info',action,href,navigate=true,value='',descriptionId=''}) {
  const tag=href?'a':action?'button':'div';
  return '<'+tag+' class="settings-row" '+(href?'href="'+escape(href)+'"':action?'type="button" data-action="'+escape(action)+'"':'')+'><span class="settings-row-icon">'+settingsIcon(icon)+'</span><span class="settings-row-copy"><span class="settings-row-label">'+escape(label)+'</span>'+(description?'<span class="settings-row-description"'+(descriptionId?' id="'+escape(descriptionId)+'"':'')+'>'+escape(description)+'</span>':'')+'</span>'+(value?'<span class="settings-row-value">'+escape(value)+'</span>':'')+((href||action)&&navigate?'<span class="settings-chevron">'+settingsIcon('next')+'</span>':'')+'</'+tag+'>';
}
