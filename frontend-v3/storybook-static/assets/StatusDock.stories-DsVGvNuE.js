import{a as e,n as t}from"./rolldown-runtime-DaJ6WEGw.js";import{t as n}from"./iframe-BX_zXiLZ.js";import{t as r}from"./jsx-runtime-CP3Fd1s6.js";var i=t((()=>{}));function a({sseConnected:e,eps:t,mode:n,lastUpdated:r,className:i=``}){let a=(0,o.useMemo)(()=>e?{label:`Connected`,color:`var(--ha-positive)`}:{label:`Disconnected`,color:`var(--ha-critical)`},[e]),c=(0,o.useMemo)(()=>{if(!r)return null;let e=new Date().getTime()-r.getTime(),t=Math.floor(e/6e4);return t>15?`Last updated ${t}m ago`:null},[r]);return(0,s.jsxs)(`div`,{className:`status-dock ${i}`,children:[(0,s.jsxs)(`div`,{className:`status-dock__left`,children:[(0,s.jsx)(`div`,{className:`status-dock__indicator`,style:{backgroundColor:a.color}}),(0,s.jsx)(`span`,{className:`status-dock__connection-text`,children:a.label}),n===`live`&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(`span`,{className:`status-dock__separator`,children:`•`}),(0,s.jsx)(`div`,{className:`status-dock__live-indicator`}),(0,s.jsx)(`span`,{className:`status-dock__mode-text status-dock__mode-text--live`,children:`Live`})]}),n===`historical`&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(`span`,{className:`status-dock__separator`,children:`•`}),(0,s.jsx)(`span`,{className:`status-dock__mode-text`,children:`■ Historical`})]})]}),(0,s.jsxs)(`div`,{className:`status-dock__right`,children:[(0,s.jsxs)(`span`,{className:`status-dock__eps`,children:[t,` eps`]}),c&&(0,s.jsx)(`span`,{className:`status-dock__stale-warning`,children:c})]})]})}var o,s,c=t((()=>{o=e(n(),1),i(),s=r(),a.__docgenInfo={description:``,methods:[],displayName:`StatusDock`,props:{sseConnected:{required:!0,tsType:{name:`boolean`},description:``},eps:{required:!0,tsType:{name:`number`},description:``},mode:{required:!1,tsType:{name:`union`,raw:`'live' | 'historical'`,elements:[{name:`literal`,value:`'live'`},{name:`literal`,value:`'historical'`}]},description:``},lastUpdated:{required:!1,tsType:{name:`Date`},description:``},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`''`,computed:!1}}}}})),l,u,d,f,p,m;t((()=>{c(),l={title:`HiveArmor/StatusDock`,component:a,tags:[`autodocs`],parameters:{layout:`fullscreen`}},u={args:{sseConnected:!0,eps:1243,mode:`live`}},d={args:{sseConnected:!0,eps:0,mode:`historical`}},f={args:{sseConnected:!1,eps:0,mode:`live`}},p={args:{sseConnected:!0,eps:42,lastUpdated:new Date(Date.now()-1200*1e3)}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    sseConnected: true,
    eps: 1243,
    mode: 'live'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    sseConnected: true,
    eps: 0,
    mode: 'historical'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    sseConnected: false,
    eps: 0,
    mode: 'live'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    sseConnected: true,
    eps: 42,
    lastUpdated: new Date(Date.now() - 20 * 60 * 1000)
  }
}`,...p.parameters?.docs?.source}}},m=[`ConnectedLive`,`ConnectedHistorical`,`Disconnected`,`StaleData`]}))();export{d as ConnectedHistorical,u as ConnectedLive,f as Disconnected,p as StaleData,m as __namedExportsOrder,l as default};