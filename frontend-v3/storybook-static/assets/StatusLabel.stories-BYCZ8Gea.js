import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{J as n,K as r,Q as i,X as a,nt as o,t as s}from"./lucide-react-B0kLru3t.js";var c,l,u=e((()=>{c={open:`var(--ha-status-open)`,in_progress:`var(--ha-status-in-progress)`,resolved:`var(--ha-status-resolved)`,closed:`var(--ha-status-closed)`,false_positive:`var(--ha-status-false-positive)`},l={open:`Open`,in_progress:`In Progress`,resolved:`Resolved`,closed:`Closed`,false_positive:`False Positive`}}));function d({status:e,size:t=`md`,className:n=``}){let r=t===`sm`?12:14,i=t===`sm`?`var(--ha-text-xs)`:`var(--ha-text-sm)`,a=c[e],o=l[e],s=p[e];return(0,f.jsxs)(`span`,{className:`status-label ${n}`,style:{display:`inline-flex`,alignItems:`center`,gap:`6px`,fontSize:i,fontWeight:`var(--ha-weight-medium)`},"aria-label":`Status: ${o}`,children:[(0,f.jsx)(s,{size:r,color:a}),(0,f.jsx)(`span`,{style:{color:a},children:o})]})}var f,p,m=e((()=>{s(),u(),f=t(),p={open:n,in_progress:r,resolved:o,closed:a,false_positive:i},d.__docgenInfo={description:``,methods:[],displayName:`StatusLabel`,props:{status:{required:!0,tsType:{name:`AlertStatus`},description:``},size:{required:!1,tsType:{name:`union`,raw:`'sm' | 'md'`,elements:[{name:`literal`,value:`'sm'`},{name:`literal`,value:`'md'`}]},description:``,defaultValue:{value:`'md'`,computed:!1}},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`''`,computed:!1}}}}})),h,g,_,v,y,b,x,S;e((()=>{m(),h={title:`HiveArmor/StatusLabel`,component:d,tags:[`autodocs`],parameters:{layout:`centered`}},g={args:{status:`open`}},_={args:{status:`in_progress`}},v={args:{status:`resolved`}},y={args:{status:`closed`}},b={args:{status:`false_positive`}},x={args:{status:`open`,size:`sm`}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'open'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'in_progress'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'resolved'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'closed'
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'false_positive'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'open',
    size: 'sm'
  }
}`,...x.parameters?.docs?.source}}},S=[`Open`,`InProgress`,`Resolved`,`Closed`,`FalsePositive`,`SmallSize`]}))();export{y as Closed,b as FalsePositive,_ as InProgress,g as Open,v as Resolved,x as SmallSize,S as __namedExportsOrder,h as default};