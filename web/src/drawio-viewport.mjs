export function viewport(stage,svg,onChange=()=>{}, initialWidth=800){
  let zoom=1,base=1;
  function measure(){const css=getComputedStyle(stage);return Math.max(1,stage.clientWidth-(parseFloat(css.paddingLeft)||0)-(parseFloat(css.paddingRight)||0))}
  function apply(value,center=true){
   const oldWidth=parseFloat(svg.style.width)||base*zoom,oldCenter=stage.scrollLeft+stage.clientWidth/2;
   base=measure();zoom=Math.max(.35,Math.min(4,value));
   svg.style.minWidth='0';svg.style.maxWidth='none';svg.style.width=`${base*zoom}px`;svg.style.height='auto';svg.style.flexShrink='0';stage.style.justifyContent=zoom<1?'center':'flex-start';
   stage.scrollLeft=center?Math.max(0,oldCenter*(base*zoom/oldWidth)-stage.clientWidth/2):0;
   if(!center)stage.scrollTop=0;
   onChange(Math.round(zoom*100));
  }
  base=measure();apply(Math.max(1,initialWidth/base),false);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(stage.clientWidth>1&&Math.abs(measure()-base)>1)apply(zoom,false)}):null;
  observer?.observe(stage);
  return {increase:()=>apply(zoom*1.25),decrease:()=>apply(zoom/1.25),fit:()=>{
    const box=svg.viewBox.baseVal,css=getComputedStyle(stage);
    const limit=parseFloat(css.maxHeight);
    const height=(Number.isFinite(limit)?limit:stage.clientHeight)-(parseFloat(css.paddingTop)||0)-(parseFloat(css.paddingBottom)||0)-(parseFloat(css.borderTopWidth)||0)-(parseFloat(css.borderBottomWidth)||0);
    const width=Math.min(measure(),Math.max(1,height)*box.width/box.height);
    apply(width/measure(),false);
   },destroy:()=>observer?.disconnect(),get scale(){return zoom}};
 }
