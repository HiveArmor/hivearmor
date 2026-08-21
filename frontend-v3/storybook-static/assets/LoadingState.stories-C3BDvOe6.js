import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";function n({message:e,rows:t=5,showHeader:n=!0,className:i=``}){let a=[`100%`,`80%`,`90%`,`70%`,`85%`];return(0,r.jsxs)(`div`,{className:`loading-state ${i}`,"aria-busy":`true`,style:{padding:`var(--ha-space-4)`,width:`100%`},children:[e&&(0,r.jsx)(`div`,{style:{fontSize:`var(--ha-text-sm)`,color:`var(--ha-text-secondary)`,marginBottom:`var(--ha-space-4)`,textAlign:`center`},children:e}),n&&(0,r.jsx)(`div`,{className:`ha-skeleton`,style:{height:`20px`,borderRadius:`var(--ha-radius-base)`,width:`60%`,marginBottom:`var(--ha-space-3)`,background:`var(--ha-surface-raised)`,animation:`ha-skeleton-pulse 1.5s ease-in-out infinite`}}),Array.from({length:t}).map((e,t)=>(0,r.jsx)(`div`,{className:`ha-skeleton`,style:{height:`20px`,borderRadius:`var(--ha-radius-base)`,width:a[t%a.length],marginBottom:`var(--ha-space-3)`,background:`var(--ha-surface-raised)`,animation:`ha-skeleton-pulse 1.5s ease-in-out infinite`}},t))]})}var r,i=e((()=>{r=t(),n.__docgenInfo={description:``,methods:[],displayName:`LoadingState`,props:{message:{required:!1,tsType:{name:`string`},description:``},rows:{required:!1,tsType:{name:`number`},description:``,defaultValue:{value:`5`,computed:!1}},showHeader:{required:!1,tsType:{name:`boolean`},description:``,defaultValue:{value:`true`,computed:!1}},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`''`,computed:!1}}}}})),a,o,s,c,l,u;e((()=>{i(),a={title:`HiveArmor/LoadingState`,component:n,tags:[`autodocs`],parameters:{layout:`padded`}},o={args:{}},s={args:{message:`Loading alerts…`,rows:5}},c={args:{rows:3,showHeader:!1}},l={args:{rows:10,message:`Fetching data…`}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {}
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    message: 'Loading alerts…',
    rows: 5
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    rows: 3,
    showHeader: false
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    rows: 10,
    message: 'Fetching data…'
  }
}`,...l.parameters?.docs?.source}}},u=[`Default`,`WithMessage`,`FewRows`,`ManyRows`]}))();export{o as Default,c as FewRows,l as ManyRows,s as WithMessage,u as __namedExportsOrder,a as default};