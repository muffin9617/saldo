import {today,shiftDate} from './model.mjs';
export function createFixtures(){
  const day=today(),date=n=>shiftDate(day,n),month=day.slice(0,7)+'-01';
  const e=(id,name,kind,remaining,unit='元')=>({id,name,kind,remaining,unit});
  const card=(id,name,entitlements,expires,note='')=>({id,name,kind:'stored',entitlements,expires,note,revision:1,archived:false,createdOn:date(-30)});
  const sub=(id,name,fee,cycle,expires,autoRenew,note='')=>({id,name,kind:'subscription',fee,cycle,expires,autoRenew,note,revision:1,archived:false,createdOn:date(-30)});
  const records=[
    card('coffee','巷口咖啡',[e('coffee-money','咖啡余额','money',20000)],date(18),'充值 200 元，使用余额消费；也可直接更新现在还剩多少。'),
    card('spa','木间 SPA',[e('spa-body','身体护理','quantity',1000,'次')],date(25),'支付 2,000 元获得 10 次护理；不再生成 2,000 元可用余额。'),
    card('combo','悦己生活馆',[e('combo-money','门店余额','money',50000),e('combo-spa','身体护理','quantity',500,'次')],date(10),'组合套餐：支付 2,000 元，获得 500 元余额与 5 次护理。'),
    card('legacy','旧记录 · 理发卡',[e('legacy-money','余额','money',38000)],'','已有记录示例：保留余额 380 元、备注和原始快照；购买费用未知，不按零计算。'),
    card('lessons','晨光课程包',[e('lesson-units','绘画课','quantity',1200,'节')],date(45),'原有课时余额，历史费用未补录。'),
    card('unknown-balance','旧记录 · 余额待核对',[e('unknown-money','卡片余额','money',null)],'','原余额未知，保持未知；核对并校准后才能记录金额增减。'),
    sub('video','流光视频 VIP',3000,{unit:'month',value:1},date(6),true,'示例订阅，按月续费。'),
    sub('cloud','云间网盘',120000,{unit:'year',value:1},date(12),true,'年费 1,200 元，折合每月 100 元，不生成每月付款。'),
    sub('gym','山岚健身年卡',200000,{unit:'year',value:1},date(24),false,'期限内不限次数；到期后由用户确认是否续费。'),
    sub('unclear','旧记录 · 两年及以上',48000,null,date(8),null,'原周期文本：两年及以上。未推定为两年，暂不纳入折合统计。'),
    sub('unknown-fee','未补费用的会员',null,{unit:'month',value:1},date(20),null,'费用未知，不按零计算。'),
  ];
  const purchase=(id,paid,date,note='')=>({id:'opening-'+id,recordId:id,type:'purchase',date,paid,note,undoable:false,undone:false,summary:id==='coffee'?'充值 ¥200.00，到账余额 ¥200.00':id==='spa'?'购买 10 次身体护理，花费 ¥2,000.00':id==='combo'?'购买 ¥500.00 门店余额与 5 次护理，花费 ¥2,000.00':'演示初始记录'});
  const events=[purchase('coffee',20000,month),purchase('spa',200000,day),purchase('combo',200000,day),purchase('video',3000,month),purchase('cloud',120000,date(-350)),purchase('gym',200000,month),
    {id:'legacy-snapshot',recordId:'legacy',type:'legacy',date:'2025-10-03',paid:null,note:'原备注：商家确认余额',summary:'原始余额快照 ¥380.00；不是消费流水',undoable:false}];
  return {schema:1,revision:0,records,events};
}
