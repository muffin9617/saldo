// Keep only route identifiers in history; drafts remain in memory.
export function createHistoryNavigation({apply,needsGuard,confirmLeave,signal}) {
  let current=null,restoring=null,approved=null,queuedReplace=false;
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  const make=(route,index)=>({saldoNavigation:true,key:crypto.randomUUID(),index,route});
  const write=(state,replace)=>history[replace?'replaceState':'pushState'](state,'',urlFor(state.route));
  function urlFor(route){
    const url=new URL(location.href);for(const key of ['view','section','record','kind','new'])url.searchParams.delete(key);
    const names={'总览':'home','储值卡':'cards','订阅':'subscriptions','我的':'me'};
    if(route.page!=='总览')url.searchParams.set('view',names[route.page]||'home');
    if(route.myView)url.searchParams.set('section',route.myView);
    if(route.creating){url.searchParams.set('new','1');url.searchParams.set('kind',route.type);}
    else if(route.selected){url.searchParams.set('record',route.selected);url.searchParams.set('kind',route.type);}
    return url;
  }
  function accept(target){const old=current;current=target;apply(target.route,old?.route);}
  window.addEventListener('popstate',async event=>{
    const target=event.state;
    if(!current || !target?.saldoNavigation)return;
    if(restoring){
      if(target.key!==current.key){history.go(current.index-target.index);return;}
      const pending=restoring;restoring=null;
      if(queuedReplace){write(current,true);queuedReplace=false;}
      if(await confirmLeave(current.route,pending.target.route)){
        approved=pending.target.key;history.go(pending.delta);
      }
      return;
    }
    if(approved===target.key){approved=null;accept(target);return;}
    if(needsGuard(current.route,target.route)){
      const delta=target.index-current.index;
      if(!delta)return;
      restoring={target,delta};history.go(-delta);return;
    }
    accept(target);
  },{signal});
  return {
    initialize(route,base){
      const old=history.state;
      if(old?.saldoNavigation){current=make(route,old.index);write(current,true);return;}
      current=make(base||route,0);write(current,true);
      if(base && JSON.stringify(route)!==JSON.stringify(base)){current=make(route,1);write(current,false);}
    },
    push(route){if(!current)return;current=make(route,current.index+1);write(current,false);},
    replace(route){if(!current)return;current={...current,route};if(restoring)queuedReplace=true;else write(current,true);},
    back(fallback){if(current?.index>0){history.back();return true;}fallback?.();return false;},
    get route(){return current?.route;},
  };
}
