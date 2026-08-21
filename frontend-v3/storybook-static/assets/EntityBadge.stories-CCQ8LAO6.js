import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{R as n,W as r,i,t as a,u as o,v as s}from"./lucide-react-B0kLru3t.js";import{r as c,t as l}from"./severity-B4EIVOkA.js";function u(e){return/^(\d{1,3}\.){3}\d{1,3}$/.test(e)||/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(e)}function d(e){return e>=80?l.critical:e>=60?l.high:e>=40?l.medium:l.low}function f({type:e,label:t,riskScore:n,onClick:r,size:i=`sm`}){let a=m[e],o=i===`sm`?12:14,s=u(t);return(0,p.jsxs)(`span`,{className:`entity-badge`,onClick:r,style:{display:`inline-flex`,alignItems:`center`,gap:`6px`,background:`var(--ha-surface-raised)`,border:`1px solid var(--ha-border)`,borderRadius:`var(--ha-radius-md)`,padding:`3px 8px`,fontSize:`var(--ha-text-xs)`,color:`var(--ha-text-primary)`,cursor:r?`pointer`:`default`,fontFamily:s?`var(--ha-font-mono)`:`inherit`},role:r?`button`:void 0,tabIndex:r?0:void 0,children:[n!==void 0&&(0,p.jsx)(`span`,{style:{width:`6px`,height:`6px`,borderRadius:`50%`,background:d(n)},"aria-label":`Risk score: ${n}`}),(0,p.jsx)(a,{size:o,style:{color:`var(--ha-text-secondary)`}}),(0,p.jsx)(`span`,{children:t})]})}var p,m,h=e((()=>{a(),c(),p=t(),m={host:s,user:i,ip:n,domain:n,process:o,file:r},f.__docgenInfo={description:``,methods:[],displayName:`EntityBadge`,props:{type:{required:!0,tsType:{name:`union`,raw:`'host' | 'user' | 'ip' | 'domain' | 'process' | 'file'`,elements:[{name:`literal`,value:`'host'`},{name:`literal`,value:`'user'`},{name:`literal`,value:`'ip'`},{name:`literal`,value:`'domain'`},{name:`literal`,value:`'process'`},{name:`literal`,value:`'file'`}]},description:``},label:{required:!0,tsType:{name:`string`},description:``},riskScore:{required:!1,tsType:{name:`number`},description:``},onClick:{required:!1,tsType:{name:`signature`,type:`function`,raw:`() => void`,signature:{arguments:[],return:{name:`void`}}},description:``},size:{required:!1,tsType:{name:`union`,raw:`'sm' | 'md'`,elements:[{name:`literal`,value:`'sm'`},{name:`literal`,value:`'md'`}]},description:``,defaultValue:{value:`'sm'`,computed:!1}}}}})),g,_,v,y,b,x,S,C,w;e((()=>{h(),g={title:`HiveArmor/EntityBadge`,component:f,tags:[`autodocs`],parameters:{layout:`centered`}},_={args:{type:`host`,label:`WIN-SERVER-01`}},v={args:{type:`user`,label:`john.doe`}},y={args:{type:`ip`,label:`192.168.1.100`}},b={args:{type:`domain`,label:`malicious-site.example`}},x={args:{type:`process`,label:`powershell.exe`}},S={args:{type:`host`,label:`COMPROMISED-HOST`,riskScore:92}},C={args:{type:`user`,label:`admin`,riskScore:75,onClick:()=>alert(`Entity clicked`)}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'host',
    label: 'WIN-SERVER-01'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'user',
    label: 'john.doe'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'ip',
    label: '192.168.1.100'
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'domain',
    label: 'malicious-site.example'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'process',
    label: 'powershell.exe'
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'host',
    label: 'COMPROMISED-HOST',
    riskScore: 92
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'user',
    label: 'admin',
    riskScore: 75,
    onClick: () => alert('Entity clicked')
  }
}`,...C.parameters?.docs?.source}}},w=[`Host`,`User`,`IpAddress`,`Domain`,`Process`,`WithHighRisk`,`Clickable`]}))();export{C as Clickable,b as Domain,_ as Host,y as IpAddress,x as Process,v as User,S as WithHighRisk,w as __namedExportsOrder,g as default};