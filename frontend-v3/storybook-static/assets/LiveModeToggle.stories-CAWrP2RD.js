import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";var n=e((()=>{}));function r({mode:e,onChange:t,sseConnected:n}){return(0,i.jsxs)(`div`,{className:`live-mode-toggle`,children:[(0,i.jsxs)(`button`,{type:`button`,className:`live-mode-toggle__segment ${e===`live`?`live-mode-toggle__segment--active`:``}`,onClick:()=>t(`live`),children:[(0,i.jsx)(`div`,{className:`live-mode-toggle__dot ${e===`live`&&n?`live-mode-toggle__dot--pulse`:``}`,style:{backgroundColor:e===`live`?n?`var(--ha-primary)`:`var(--ha-high)`:`transparent`}}),(0,i.jsx)(`span`,{children:`Live`})]}),(0,i.jsx)(`button`,{type:`button`,className:`live-mode-toggle__segment ${e===`historical`?`live-mode-toggle__segment--active`:``}`,onClick:()=>t(`historical`),children:(0,i.jsx)(`span`,{children:`Historical`})})]})}var i,a=e((()=>{n(),i=t(),r.__docgenInfo={description:``,methods:[],displayName:`LiveModeToggle`,props:{mode:{required:!0,tsType:{name:`union`,raw:`'live' | 'historical'`,elements:[{name:`literal`,value:`'live'`},{name:`literal`,value:`'historical'`}]},description:``},onChange:{required:!0,tsType:{name:`signature`,type:`function`,raw:`(mode: 'live' | 'historical') => void`,signature:{arguments:[{type:{name:`union`,raw:`'live' | 'historical'`,elements:[{name:`literal`,value:`'live'`},{name:`literal`,value:`'historical'`}]},name:`mode`}],return:{name:`void`}}},description:``},sseConnected:{required:!0,tsType:{name:`boolean`},description:``}}}})),o,s,c,l,u;e((()=>{a(),o={title:`HiveArmor/LiveModeToggle`,component:r,tags:[`autodocs`],parameters:{layout:`centered`}},s={args:{mode:`live`,sseConnected:!0,onChange:()=>{}}},c={args:{mode:`live`,sseConnected:!1,onChange:()=>{}}},l={args:{mode:`historical`,sseConnected:!0,onChange:()=>{}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'live',
    sseConnected: true,
    onChange: () => {}
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'live',
    sseConnected: false,
    onChange: () => {}
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'historical',
    sseConnected: true,
    onChange: () => {}
  }
}`,...l.parameters?.docs?.source}}},u=[`LiveConnected`,`LiveDisconnected`,`Historical`]}))();export{l as Historical,s as LiveConnected,c as LiveDisconnected,u as __namedExportsOrder,o as default};