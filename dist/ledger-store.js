import * as M from './ledger-model.js';
const readAll=async(client,table,user,sort='created_at')=>{const all=[];for(let offset=0;;offset+=500){const {data,error}=await client.from(table).select('*').eq('user_id',user).order(sort).order('id').range(offset,offset+499);if(error)throw error;all.push(...data);if(data.length<500)return all;}};
export function decodeLedger(cards,subs,snapshots,events){
 const records=[...cards.map(r=>({id:r.id,kind:'stored',name:r.name,note:r.note,expires:r.expires_on||'',archived:r.archived_at!==null,revision:Number(r.version),createdOn:r.created_at.slice(0,10),entitlements:r.entitlements||[{id:r.id,kind:'money',name:'余额',unit:'元',remaining:r.balance_cents===null?null:Number(r.balance_cents)}]})),...subs.map(r=>({id:r.id,kind:'subscription',name:r.name,note:r.note,expires:r.expires_on||'',archived:r.archived_at!==null,revision:Number(r.version),createdOn:r.created_at.slice(0,10),fee:r.fee_cents===null?null:Number(r.fee_cents),autoRenew:r.auto_renew??null,reminderDays:r.reminder_days,cycleAnchor:r.cycle_anchor,cycle:r.cycle_exact?(r.cycle_exact.unit?r.cycle_exact:null):(r.cycle_months&&r.cycle_months<24?{unit:'month',value:r.cycle_months}:null),legacyCycle:r.cycle_months>=24?'两年及以上':''}))];
 const localDay=v=>{const d=new Date(v);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const ledgerEvents=events.map(r=>({...r.payload,recordedAt:r.created_at}));
 for(const snap of snapshots.filter(s=>!events.some(e=>e.card_id===s.card_id&&e.created_at<=s.recorded_at)))ledgerEvents.push({id:snap.id,recordId:snap.card_id,type:'legacy',date:localDay(snap.recorded_at),recordedAt:snap.recorded_at,paid:null,summary:'余额快照 '+M.money(Number(snap.balance_cents)),note:'',undoable:false});
 ledgerEvents.sort((a,b)=>(a.recordedAt||a.date).localeCompare(b.recordedAt||b.date)||a.id.localeCompare(b.id));
 return {schema:1,revision:0,records,events:ledgerEvents};
}
export async function loadLedger(client,user){const [c,s,h,e]=await Promise.all([readAll(client,'saldo_cards',user),readAll(client,'saldo_subscriptions',user),readAll(client,'saldo_balance_snapshots',user,'recorded_at'),readAll(client,'saldo_ledger_events',user)]);return decodeLedger(c,s,h,e);}
export function ledgerCommand(before,next){
 const previousById=new Map(before.records.map(r=>[r.id,r]));
 const changed=next.records.filter(r=>JSON.stringify(r)!==JSON.stringify(previousById.get(r.id)));
 const deleted=before.records.filter(r=>!next.records.some(n=>n.id===r.id));
 if(changed.length+deleted.length!==1)throw Error('一次只能保存一条记录。');
 const r=changed[0]||deleted[0],old=previousById.get(r.id);let action,payload={};
 const ev=next.events.find(e=>!before.events.some(p=>p.id===e.id));
 const undone=next.events.find(e=>e.undone&&!before.events.find(p=>p.id===e.id)?.undone);
 if(deleted.length)action='delete';
 else if(!old){action='create';payload={record:r,paid:ev.paid,date:ev.date,eventId:ev.id,summary:ev.summary,note:ev.note};}
 else if(r.archived!==old.archived)action=r.archived?'archive':'restore';
 else if(undone){action='undo';payload={eventId:undone.id};}
 else if(ev){action=ev.type;payload={eventId:ev.id,date:ev.date,paid:ev.paid,note:ev.note,summary:ev.summary,cycleAnchor:r.cycleAnchor,nextDate:r.expires,updateFee:r.fee!==old.fee};if(r.kind==='stored'){payload.values={};for(const e of r.entitlements){const p=old.entitlements.find(x=>x.id===e.id);if(p.remaining!==e.remaining)payload.values[e.id]=action==='adjust'?e.remaining:action==='use'?p.remaining-e.remaining:e.remaining-p.remaining;}}}
 else {action='edit';payload={record:r};}
 return {p_action:action,p_kind:r.kind,p_id:r.id,p_version:old?.revision??null,p_payload:payload};
}
export async function saveLedger(client,user,before,next){
 const command=ledgerCommand(before,next);const {error}=await client.rpc('saldo_ledger_write',command);
 if(error){if(command.p_payload.eventId){try{const fresh=await loadLedger(client,user);if(fresh.events.some(e=>e.id===command.p_payload.eventId))return fresh;}catch{}}if(/STALE_RECORD|CANNOT_UNDO/.test(error.message))throw Error('记录已在其他设备更新，请刷新核对后重试。');throw error;}
 try{return await loadLedger(client,user);}catch{return next;}
}
