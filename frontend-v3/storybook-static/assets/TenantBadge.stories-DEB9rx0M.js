import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{it as n,t as r}from"./lucide-react-B0kLru3t.js";function i({tenantName:e}){let t=e.length>20?`${e.slice(0,20)}...`:e;return(0,a.jsxs)(`span`,{className:`tenant-badge`,style:{display:`inline-flex`,alignItems:`center`,gap:`6px`,background:`var(--ha-surface-raised)`,border:`1px solid var(--ha-border)`,borderRadius:`var(--ha-radius-full, 9999px)`,padding:`3px 8px`,fontSize:`var(--ha-text-xs)`,color:`var(--ha-text-secondary)`},children:[(0,a.jsx)(n,{size:10,style:{color:`var(--ha-text-secondary)`}}),(0,a.jsx)(`span`,{children:t})]})}var a,o=e((()=>{r(),a=t(),i.__docgenInfo={description:``,methods:[],displayName:`TenantBadge`,props:{tenantId:{required:!0,tsType:{name:`number`},description:``},tenantName:{required:!0,tsType:{name:`string`},description:``},size:{required:!1,tsType:{name:`union`,raw:`'sm' | 'md'`,elements:[{name:`literal`,value:`'sm'`},{name:`literal`,value:`'md'`}]},description:``}}}})),s,c,l,u,d;e((()=>{o(),s={title:`HiveArmor/TenantBadge`,component:i,tags:[`autodocs`],parameters:{layout:`centered`}},c={args:{tenantId:1,tenantName:`Acme Corp`}},l={args:{tenantId:2,tenantName:`Very Long Tenant Organization Name Inc.`}},u={args:{tenantId:3,tenantName:`Globex`}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    tenantId: 1,
    tenantName: 'Acme Corp'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    tenantId: 2,
    tenantName: 'Very Long Tenant Organization Name Inc.'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    tenantId: 3,
    tenantName: 'Globex'
  }
}`,...u.parameters?.docs?.source}}},d=[`Default`,`LongName`,`ShortName`]}))();export{c as Default,l as LongName,u as ShortName,d as __namedExportsOrder,s as default};