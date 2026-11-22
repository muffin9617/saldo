// Curated, same-origin assets. Record names and accounting data are never rewritten.
export const brandLibrary = [
 ['icloud','icloud.png',['iCloud','iCloud+','Apple iCloud','Apple iCloud+','苹果 iCloud','苹果 iCloud+']],
 ['qqmusic','qqmusic.jpg',['QQ音乐','QQ Music']],
 ['netease','netease.jpg',['网易云音乐','网易云','NetEase Cloud Music']],
 ['baidupan','baidupan.jpg',['百度网盘','Baidu Netdisk']],
 ['iqiyi','iqiyi-site.ico',['爱奇艺','iQIYI']],
 ['tencentvideo','tencent-site.ico',['腾讯视频','Tencent Video']],
 ['youku','youku.jpg',['优酷','优酷视频','Youku']],
 ['bilibili','bilibili-site.ico',['哔哩哔哩','bilibili','B站','B站大会员','哔哩哔哩大会员']],
 ['88vip','88vip-large.jpg',['88VIP','淘宝88VIP','天猫88VIP']],
 ['jdplus','jdplus.jpg',['京东PLUS','京东PLUS会员','JD PLUS','JD PLUS会员']],
 ['mango','mango-site.ico',['芒果TV','芒果视频','Mango TV']],
 ['starbucks','starbucks.svg',['星巴克','Starbucks']],
 ['mstand','mstand-large.jpg',['M Stand','MStand']],
 ['hema','hema.jpg',['盒马','盒马鲜生','盒马会员','Freshippo']],
 ['aldi','aldi.png',['奥乐齐','ALDI','奥乐齐ALDI']],
 ['sams','sams.jpg',['山姆','山姆会员商店',"Sam's Club",'Sams Club']],
 ['costco','costco-app.jpg',['Costco','开市客','好市多','Costco开市客']],
 ['disney-shanghai','disney-app.jpg',['上海迪士尼','上海迪士尼度假区','Shanghai Disney','Shanghai Disney Resort']],
 ['universal-beijing','universal-beijing.svg',['北京环球影城','北京环球度假区','Universal Beijing','Universal Beijing Resort']],
].map(([id,file,aliases])=>Object.freeze({id,file,aliases:Object.freeze(aliases)}));
const normalize=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
const key=value=>normalize(value).replace(/[\s._·'\-]/g,'');
const exact=new Map(brandLibrary.flatMap(b=>b.aliases.map(alias=>[key(alias),b])));
// Only explicit branch delimiters or membership/capacity suffixes are accepted.
const qualifiers=/^(?:(?:超级|年度|连续|自动)?(?:会员|大会员|会籍|vip|svip|plus)|包月|包季|包年|月卡|季卡|年卡|月费|季费|年费|订阅|\d+(?:\.\d+)?(?:gb|tb|个月|年|月))*$/;
export function matchBrand(name){
 const normalized=normalize(name);if(!normalized||normalized.length>300)return null;
 const direct=exact.get(key(normalized));if(direct)return direct;
 const base=normalized.replace(/\s*\([^()]{1,80}\)\s*$/,'').replace(/\s+[—–\-|·]\s+.+$/,'').trim();
 const candidate=key(base);if(exact.has(candidate))return exact.get(candidate);
 for(const [alias,brand] of [...exact.entries()].sort((a,b)=>b[0].length-a[0].length)){
  if(candidate.startsWith(alias)&&qualifiers.test(candidate.slice(alias.length)))return brand;
 }
 return null;
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function brandLogoMarkup(name){
 const value=String(name??'').trim(),brand=matchBrand(value),first=segmenter?segmenter.segment(value)[Symbol.iterator]().next().value?.segment:Array.from(value)[0];
 return `<span class="logo brand-logo${brand?' brand-logo--'+brand.id:''}" aria-hidden="true"${brand?' data-brand="'+brand.id+'"':''}><span class="brand-letter">${escape(first||'+')}</span>${brand?'<img data-brand-image src="/brand-assets/'+brand.file+'" alt="" decoding="async">':''}</span>`;
}
const installed=new WeakSet();
export function installBrandLogos(root=document){
 const settle=image=>{if(!image.matches?.('[data-brand-image]'))return;const good=image.complete&&image.naturalWidth>0;image.parentElement?.classList.toggle('brand-logo--loaded',good);image.hidden=!good&&image.complete;};
 if(!installed.has(root)){root.addEventListener('load',event=>settle(event.target),true);root.addEventListener('error',event=>settle(event.target),true);installed.add(root);}
 root.querySelectorAll('[data-brand-image]').forEach(image=>{if(image.complete)settle(image);});
}
