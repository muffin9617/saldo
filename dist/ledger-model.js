// Pure accounting rules; persistence and authorization live in ledger-store / Postgres.
export const LIMIT = 9000000000000;
export const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const clone = value => structuredClone(value);
export const uid = () => crypto.randomUUID();
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;}
export function daysUntil(date,from=today()){return Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);}
export function shiftDate(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function addCycle(date,cycle,anchor=Number(date.slice(8))){
  if(!validDate(date)||!cycle||!['day','week','month','year'].includes(cycle.unit)||!Number.isInteger(cycle.value)||cycle.value<1||cycle.value>120)throw new Error('请填写明确的周期（1–120）。');
  if(cycle.unit==='day'||cycle.unit==='week')return shiftDate(date,cycle.value*(cycle.unit==='week'?7:1));
  const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+cycle.value*(cycle.unit==='year'?12:1));
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(anchor,last));return d.toISOString().slice(0,10);
}
export function decimal(raw,label='数值'){
  const s=String(raw).trim();if(s.length>40||!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(s))throw new Error(`${label}请填写非负数字，最多两位小数。`);
  const [a,b='']=s.split('.');const n=Number(BigInt(a||'0')*100n+BigInt(b.padEnd(2,'0')));
  if(!Number.isSafeInteger(n)||n>LIMIT)throw new Error(`${label}超出可记录范围。`);return n;
}
export function money(cents){if(cents===null||cents===undefined)return '未记录';const n=BigInt(cents);return '¥'+(n/100n).toLocaleString('en-US')+'.'+String(n%100n).padStart(2,'0');}
export const inputNumber=n=>n===null||n===undefined?'':String(n/100);
export function quantity(n){if(n===null||n===undefined)return '未记录';const v=BigInt(n);const fraction=String(v%100n).padStart(2,'0').replace(/0+$/,'');return (v/100n).toLocaleString('en-US')+(fraction?'.'+fraction:'');}
export const cycleLabel=c=>c?`每 ${c.value} ${ {day:'天',week:'周',month:'个月',year:'年'}[c.unit] }`:'周期未明确';
function checkName(value,label,max=80){if(!String(value).trim()||Array.from(String(value).trim()).length>max)throw new Error(`${label}需填写 1–${max} 个字符。`);return String(value).trim();}
function checkAmount(n,label){if(!Number.isSafeInteger(n)||n<0||n>LIMIT)throw new Error(`${label}无效。`);}
function checkDate(value,label,optional=false){if(optional&&!value)return;if(!validDate(value))throw new Error(`请填写有效的${label}。`);}
function checkPaid(date){checkDate(date,'记录日期');if(date>today())throw new Error('实际操作日期不能晚于今天。');}
function checkNote(note){if(Array.from(String(note||'')).length>200)throw new Error('备注最多 200 个字符。');}
function checkEntitlements(items){
  if(!items.length||items.length>8)throw new Error('请添加 1–8 项权益。');
  const ids=new Set();for(const e of items){if(ids.has(e.id))throw new Error('权益项目不能重复。');ids.add(e.id);if(!['money','quantity'].includes(e.kind))throw new Error('请选择权益类型。');checkName(e.name,'权益名称',40);if(e.remaining!==null)checkAmount(e.remaining,'权益数量');if(e.acquired!==undefined)checkAmount(e.acquired,'获得的余额／数量');if(e.kind==='quantity')checkName(e.unit,'单位',8);}
}
export function validateRecord(record){
  checkName(record.name,'名称');checkNote(record.note);checkDate(record.expires,'到期日',true);
  if(record.kind==='stored'){checkEntitlements(record.entitlements);}
  else if(record.kind==='subscription'){
    if(record.fee!==null)checkAmount(record.fee,'周期费用');
    if(record.cycle)addCycle(today(),record.cycle);
  }else throw new Error('未知记录类型。');
}
export function createRecord(state,record,{paid=null,date=today(),existing=false}={}){
  validateRecord(record);checkPaid(date);
  if(paid===null&&!existing)throw new Error('新购买请记录实际支付费用；旧记录未知时可选择费用未知。');
  if(paid!==null)checkAmount(paid,'实际支付费用');
  if(!existing&&record.kind==='stored'&&(record.entitlements.some(e=>e.remaining===null)||!record.entitlements.some(e=>(e.acquired??e.remaining)>0)))throw new Error('新购买请填写实际获得的余额或权益数量。');
  if(state.records.some(r=>r.id===record.id))throw new Error('记录已存在。');
  const result=clone(state),r={...clone(record),revision:1,createdOn:date,archived:false};result.records.push(r);
  const describe=e=>{const display=n=>n===null?'未记录':e.kind==='money'?money(n):quantity(n)+' '+e.unit;const acquired=e.acquired??e.remaining;return existing?`${e.name}：当前剩余 ${display(e.remaining)}`:`${e.kind==='money'?'充值到账':'购买'} ${e.name} ${display(acquired)}`+(acquired!==e.remaining?`；当前剩余 ${display(e.remaining)}（用户填写，不反推历史使用）`:'');};
  result.events.push({id:uid(),recordId:r.id,type:existing?'opening':'purchase',date,paid,note:existing?'从当前记录开始，不补推历史':'',summary:r.kind==='stored'?r.entitlements.map(describe).join('；'):'购买订阅',undoable:false});return result;
}
export function editRecord(state,id,changes,revision){
  const result=clone(state),r=result.records.find(r=>r.id===id);if(!r||r.revision!==revision)throw new Error('记录已变更，请返回后重新打开。');
  const allowed=r.kind==='stored'?['name','note','expires']:['name','note','expires','fee','cycle','autoRenew','reminderDays'];
  if(r.kind==='subscription'&&changes.expires!==undefined&&changes.expires!==r.expires)r.cycleAnchor=changes.expires?Number(changes.expires.slice(8)):null;
  for(const key of Object.keys(changes)){if(!allowed.includes(key))throw new Error('余额与权益请通过使用或校准操作维护。');r[key]=clone(changes[key]);}
  validateRecord(r);r.revision++;return result;
}
export function applyOperation(state,id,operation,revision){
  const result=clone(state),r=result.records.find(r=>r.id===id);
  if(!r||r.archived||r.revision!==revision)throw new Error('记录已变更，请重新打开后操作。');
  checkPaid(operation.date);checkNote(operation.note);
  const event={id:uid(),recordId:id,type:operation.type,date:operation.date,paid:null,note:operation.note||'',undoable:true,undone:false,before:{},summary:''};
  if(r.kind==='stored'){
    if(!['topup','use','adjust'].includes(operation.type))throw new Error('操作不适用于储值。');
    const values=operation.values||{};if(Object.keys(values).some(key=>!r.entitlements.some(e=>e.id===key)))throw new Error('权益项目不存在。');
    if(operation.type==='topup'){if(operation.paid===null||operation.paid===undefined)throw new Error('请记录实际支付费用。');checkAmount(operation.paid,'实际支付费用');event.paid=operation.paid;}
    event.before.entitlements=clone(r.entitlements);const descriptions=[];
    for(const e of r.entitlements){
      if(values[e.id]===undefined)continue;const value=values[e.id];checkAmount(value,'数量');const before=e.remaining;
      if(before===null&&operation.type!=='adjust')throw new Error(`${e.name}当前数值未知，请先核对并校准。`);
      if(operation.type==='use'&&value>e.remaining)throw new Error(`${e.name}剩余不足，请核对后记录。`);
      e.remaining=operation.type==='topup'?e.remaining+value:operation.type==='use'?e.remaining-value:value;
      checkAmount(e.remaining,'操作后余额');if(before!==e.remaining){descriptions.push(e.name+' '+(e.kind==='money'?money(before)+' → '+money(e.remaining):quantity(before)+' → '+quantity(e.remaining)+' '+e.unit));(event.changes??=[]).push({entitlementId:e.id,kind:e.kind,unit:e.unit,before,after:e.remaining});}
    }
    if(!descriptions.length)throw new Error('请至少填写一项权益变化。');event.summary=descriptions.join('；');
  }else{
    if(operation.type!=='renew')throw new Error('操作不适用于订阅。');checkAmount(operation.paid,'本次续费费用');checkDate(operation.nextDate,'下一到期日');
    if(operation.nextDate<=operation.date)throw new Error('下一到期日应晚于本次续费日期。');
    event.before={expires:r.expires,fee:r.fee,cycleAnchor:r.cycleAnchor??null};event.paid=operation.paid;event.summary=`到期日 ${r.expires||'未填写'} → ${operation.nextDate}`;
    const anchor=r.cycleAnchor||Number((r.expires||operation.date).slice(8));let suggested='';
    if(r.cycle)suggested=addCycle(r.expires&&r.expires>operation.date?r.expires:operation.date,r.cycle,anchor);
    r.cycleAnchor=suggested===operation.nextDate?anchor:Number(operation.nextDate.slice(8));r.expires=operation.nextDate;
    if(operation.updateFee)r.fee=operation.paid;
  }
  r.revision++;event.afterRevision=r.revision;result.events.push(event);return result;
}
export function undoOperation(state,eventId){
  const result=clone(state),event=result.events.find(e=>e.id===eventId);if(!event||!event.undoable||event.undone)throw new Error('这条记录无法撤销。');
  const r=result.records.find(r=>r.id===event.recordId);if(!r||r.archived||r.revision!==event.afterRevision)throw new Error('此操作之后已有更新，不能直接撤销。');
  for(const [key,value]of Object.entries(event.before))r[key]=clone(value);r.revision++;event.undone=true;event.undoOn=today();
  // Earlier operation is now the latest effective action if nothing intervened.
  const previous=result.events.filter(e=>e.recordId===r.id&&e.undoable&&!e.undone).at(-1);if(previous&&previous.afterRevision===event.afterRevision-1)previous.afterRevision=r.revision;
  return result;
}
export function archiveRecord(state,id,archived){const result=clone(state),r=result.records.find(r=>r.id===id);if(!r)throw new Error('记录不存在。');r.archived=archived;r.revision++;return result;}
export function deleteArchived(state,id){const r=state.records.find(r=>r.id===id);if(!r?.archived)throw new Error('请先移除记录。');const result=clone(state);result.records=result.records.filter(r=>r.id!==id);result.events=result.events.filter(e=>e.recordId!==id);return result;}
const rounded=(n,d)=>(n+d/2n)/d;
export function equivalent(fee,cycle,period='month'){
  if(fee===null||fee===undefined||!cycle)return null;
  const c=BigInt(cycle.value);let n=BigInt(fee),d=c;
  if(cycle.unit==='year')d*=12n;else if(cycle.unit==='day'){n*=365n;d*=12n;}else if(cycle.unit==='week'){n*=365n;d*=84n;}
  else if(cycle.unit!=='month')return null;
  if(period==='year')n*=12n;return rounded(n,d);
}
export function summary(state,{period='month',date=today()}={}){
  const records=state.records.filter(r=>!r.archived),stored=records.filter(r=>r.kind==='stored'),subs=records.filter(r=>r.kind==='subscription');
  const moneyItems=stored.flatMap(r=>r.entitlements.filter(e=>e.kind==='money'));
  const known=moneyItems.filter(e=>e.remaining!==null);const quantityCards=stored.filter(r=>r.entitlements.some(e=>e.kind==='quantity'));
  const rates=subs.map(r=>equivalent(r.fee,r.cycle,period));
  const prefix=period==='year'?date.slice(0,4):date.slice(0,7);
  const existingIds=new Set(state.records.map(r=>r.id));const payments=state.events.filter(e=>existingIds.has(e.recordId)&&!e.undone&&e.paid!==null&&e.paid!==undefined&&e.date.startsWith(prefix));
  return {storedCount:stored.length,quantityCards:quantityCards.length,balance:known.length?known.reduce((n,e)=>n+BigInt(e.remaining),0n):null,unknownBalances:moneyItems.length-known.length,
    subscriptionCount:subs.length,equivalent:rates.some(r=>r!==null)?rates.reduce((n,r)=>n+(r??0n),0n):null,excluded:rates.filter(r=>r===null).length,
    forecast:subs.filter(r=>r.autoRenew===true&&r.fee!==null&&r.expires&&daysUntil(r.expires,date)>=0&&daysUntil(r.expires,date)<=30).reduce((n,r)=>n+BigInt(r.fee),0n),
    payments:payments.reduce((n,e)=>n+BigInt(e.paid),0n),storedPaid:payments.filter(e=>state.records.find(r=>r.id===e.recordId)?.kind==='stored').reduce((n,e)=>n+BigInt(e.paid),0n),subscriptionPaid:payments.filter(e=>state.records.find(r=>r.id===e.recordId)?.kind==='subscription').reduce((n,e)=>n+BigInt(e.paid),0n)};
}
export function upcoming(state,date=today()){
  return state.records.filter(r=>!r.archived&&r.expires&&daysUntil(r.expires,date)>=0&&daysUntil(r.expires,date)<=30).sort((a,b)=>a.expires.localeCompare(b.expires)||a.name.localeCompare(b.name));
}
export function recordPaid(state,id){const values=state.events.filter(e=>e.recordId===id&&!e.undone&&e.paid!==null&&e.paid!==undefined);return values.length?values.reduce((n,e)=>n+BigInt(e.paid),0n):null;}
export function usedAmount(state,id,entitlementId){return state.events.filter(e=>e.recordId===id&&!e.undone&&e.type==='use').flatMap(e=>e.changes||[]).filter(c=>c.entitlementId===entitlementId).reduce((n,c)=>n+BigInt(c.before-c.after),0n);}
