import{a as e,n as t}from"./rolldown-runtime-DaJ6WEGw.js";import{t as n}from"./iframe-BX_zXiLZ.js";import{t as r}from"./jsx-runtime-CP3Fd1s6.js";import{K as i,nt as a,o,t as s}from"./lucide-react-B0kLru3t.js";function c(e){let t=new Date(e).getTime()-Date.now();return t<0?`breached`:t<3600*1e3?`at_risk`:`on_track`}function l(e){let t=Math.abs(e),n=Math.floor(t/(3600*1e3)),r=Math.floor(t%(3600*1e3)/(60*1e3));return n>0?`${n}h ${r}m`:`${r}m`}function u({dueAt:e,size:t=`md`,showLabel:n=!0}){let[,r]=(0,d.useState)(0);if((0,d.useEffect)(()=>{if(!e)return;let t=setInterval(()=>{r(e=>e+1)},6e4);return()=>clearInterval(t)},[e]),!e)return null;let s=c(e),u=new Date(e).getTime()-Date.now(),p=s===`on_track`?`var(--ha-positive)`:s===`at_risk`?`var(--ha-high)`:`var(--ha-critical)`,m=s===`on_track`?a:s===`at_risk`?i:o,h=t===`sm`?12:14,g=u>=0?`${l(u)} left`:`Breached ${l(u)} ago`;return(0,f.jsxs)(`span`,{className:`sla-indicator`,style:{display:`inline-flex`,alignItems:`center`,gap:`6px`,fontFamily:`var(--ha-font-mono)`,fontSize:`var(--ha-text-xs)`,color:p},"aria-live":`polite`,children:[(0,f.jsx)(m,{size:h,style:{color:p}}),n&&(0,f.jsx)(`span`,{children:g})]})}var d,f,p=t((()=>{d=e(n(),1),s(),f=r(),u.__docgenInfo={description:``,methods:[],displayName:`SlaIndicator`,props:{dueAt:{required:!0,tsType:{name:`union`,raw:`string | null`,elements:[{name:`string`},{name:`null`}]},description:``},size:{required:!1,tsType:{name:`union`,raw:`'sm' | 'md'`,elements:[{name:`literal`,value:`'sm'`},{name:`literal`,value:`'md'`}]},description:``,defaultValue:{value:`'md'`,computed:!1}},showLabel:{required:!1,tsType:{name:`boolean`},description:``,defaultValue:{value:`true`,computed:!1}}}}})),m,h,g,_,v,y,b;t((()=>{p(),m={title:`HiveArmor/SlaIndicator`,component:u,tags:[`autodocs`],parameters:{layout:`centered`}},h={args:{dueAt:new Date(Date.now()+14400*1e3).toISOString()}},g={args:{dueAt:new Date(Date.now()+1800*1e3).toISOString()}},_={args:{dueAt:new Date(Date.now()-7200*1e3).toISOString()}},v={args:{dueAt:null}},y={args:{dueAt:new Date(Date.now()+7200*1e3).toISOString(),size:`sm`}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    dueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    dueAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    dueAt: null
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    size: 'sm'
  }
}`,...y.parameters?.docs?.source}}},b=[`OnTrack`,`AtRisk`,`Breached`,`NoSla`,`SmallSize`]}))();export{g as AtRisk,_ as Breached,v as NoSla,h as OnTrack,y as SmallSize,b as __namedExportsOrder,m as default};