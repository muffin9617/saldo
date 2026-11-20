// Hierarchy wins: a child page handles left-swipe as Back; root tabs handle
// left/right as next/previous. Vertical scrolling and native edge gestures stay free.
export function installSwipeNavigation({onLeft,onRight,canStart=()=>true,root=document}) {
  let start=null,swipedAt=-Infinity;
  const blocked='input,select,textarea,[contenteditable],.field-pencil,.field-actions,.detail-editbar,.nav,[data-no-swipe]';
  root.addEventListener('pointerdown',event=>{
    start=null;
    if(!event.isPrimary || event.pointerType!=='touch' || !canStart() || event.target.closest(blocked))return;
    if(event.clientX<18 || event.clientX>innerWidth-18)return;
    start={id:event.pointerId,x:event.clientX,y:event.clientY,at:performance.now()};
  },{passive:true});
  root.addEventListener('pointercancel',()=>{start=null;},{passive:true});
  root.addEventListener('pointerup',event=>{
    const initial=start;start=null;
    if(!initial || event.pointerId!==initial.id || !canStart())return;
    const dx=event.clientX-initial.x,dy=event.clientY-initial.y;
    if(Math.abs(dx)<62 || Math.abs(dx)<Math.abs(dy)*1.6 || performance.now()-initial.at>700)return;
    const handled=dx<0?onLeft?.():onRight?.();
    if(handled!==false && handled!==undefined)swipedAt=performance.now();
  },{passive:true});
  root.addEventListener('click',event=>{
    if(performance.now()-swipedAt>350 || !(event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents))return;
    swipedAt=-Infinity;event.preventDefault();event.stopImmediatePropagation();
  },true);
}

export function confirmDiscardChanges(onDiscard,{onStay=()=>{}}={}) {
  if(document.querySelector('[data-discard-dialog]'))return;
  const sheet=document.createElement('dialog');
  sheet.className='bottom-sheet discard-sheet';sheet.dataset.discardDialog='';
  sheet.setAttribute('aria-labelledby','discard-title');
  sheet.innerHTML='<h2 id="discard-title">修改尚未保存</h2><p class="muted">继续编辑并保存，或放弃本次修改后离开。</p><button class="primary" type="button" data-stay>继续编辑</button><button class="secondary" type="button" data-discard>放弃修改</button>';
  const previous=document.activeElement;
  const close=(stay=true)=>{sheet.close();sheet.remove();if(previous?.isConnected)previous.focus({preventScroll:true});if(stay)onStay();};
  sheet.querySelector('[data-stay]').onclick=()=>close();
  sheet.querySelector('[data-discard]').onclick=()=>{close(false);onDiscard();};
  sheet.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.body.append(sheet);sheet.showModal();sheet.querySelector('[data-stay]').focus();
}
