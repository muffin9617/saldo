import assert from 'node:assert/strict';
import {brandLibrary,matchBrand,brandLogoMarkup} from '../dist/brand-logos.js';
for(const brand of brandLibrary)for(const alias of brand.aliases)assert.equal(matchBrand(alias)?.id,brand.id,alias);
for(const [name,id]of [[' ｉＣｌｏｕｄ＋ 200GB ','icloud'],['QQ 音乐 年费会员','qqmusic'],['腾讯视频年卡','tencentvideo'],['B站年度大会员','bilibili'],['Starbucks (公司楼下)','starbucks'],['M Stand - 静安店','mstand'],['山姆会员年卡','sams'],["Sam’s Club",'sams'],['北京环球年卡','universal-beijing']]){
 // Only curated full brand names qualify, including the full resort name.
 if(name==='北京环球年卡')assert.equal(matchBrand(name),null);else assert.equal(matchBrand(name)?.id,id,name);
}
for(const name of ['',null,'苹果','Apple','腾讯','QQ','网易','京东','迪士尼','香港迪士尼','环球影城','日本环球影城','Drunk Baker','星巴克风格咖啡店','小星巴克','QQ音乐盒子','山姆的咖啡馆','M Standby','<img src=x onerror=alert(1)>'])assert.equal(matchBrand(name),null,String(name));
assert.match(brandLogoMarkup('陌生门店'),/brand-letter">陌/);assert.match(brandLogoMarkup('☕️咖啡'),/☕️/);assert.ok(!brandLogoMarkup('<script>').includes('<script>'));assert.match(brandLogoMarkup('星巴克'),/data-brand="starbucks"/);assert.ok(!brandLogoMarkup('Drunk Baker').includes('<img'));
console.log('PASS curated brand aliases, member/capacity qualifiers, explicit branches, ambiguous-name rejection, region separation, safe grapheme fallback and escaped markup.');
