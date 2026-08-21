import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{m as n,t as r}from"./lucide-react-B0kLru3t.js";import{n as i,t as a}from"./HaButton-CEZ2Atqd.js";function o({icon:e,title:t,description:n,action:r,className:i=``}){return(0,s.jsxs)(`div`,{className:`empty-state ${i}`,style:{display:`flex`,flexDirection:`column`,alignItems:`center`,justifyContent:`center`,minHeight:`300px`,padding:`var(--ha-space-6)`},children:[e&&(0,s.jsx)(`div`,{className:`empty-state-icon`,style:{color:`var(--ha-text-secondary)`,opacity:.4,marginBottom:`var(--ha-space-4)`},children:e}),(0,s.jsx)(`h3`,{style:{fontSize:`var(--ha-text-xl)`,fontWeight:`var(--ha-weight-semibold)`,color:`var(--ha-text-primary)`,marginBottom:`var(--ha-space-2)`,textAlign:`center`},children:t}),n&&(0,s.jsx)(`p`,{style:{fontSize:`var(--ha-text-sm)`,color:`var(--ha-text-secondary)`,maxWidth:`400px`,textAlign:`center`,marginBottom:r?`var(--ha-space-6)`:0,lineHeight:1.5},children:n}),r&&(0,s.jsx)(`div`,{className:`empty-state-action`,children:r})]})}var s,c=e((()=>{s=t(),o.__docgenInfo={description:``,methods:[],displayName:`EmptyState`,props:{icon:{required:!1,tsType:{name:`ReactReactNode`,raw:`React.ReactNode`},description:``},title:{required:!0,tsType:{name:`string`},description:``},description:{required:!1,tsType:{name:`string`},description:``},action:{required:!1,tsType:{name:`ReactReactNode`,raw:`React.ReactNode`},description:``},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`''`,computed:!1}}}}})),l,u,d,f,p,m;e((()=>{r(),c(),i(),l=t(),u={title:`HiveArmor/EmptyState`,component:o,tags:[`autodocs`],parameters:{layout:`padded`}},d={args:{title:`No alerts found`,description:`No alerts match your current filters. Try adjusting your search criteria.`}},f={args:{icon:(0,l.jsx)(n,{size:48}),title:`No active threats`,description:`Your environment is clean. No threats detected in the selected time range.`}},p={args:{icon:(0,l.jsx)(n,{size:48}),title:`No incidents yet`,description:`Create your first incident to start tracking security events.`,action:(0,l.jsx)(a,{variant:`primary`,children:`Create Incident`})}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'No alerts found',
    description: 'No alerts match your current filters. Try adjusting your search criteria.'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    icon: <Shield size={48} />,
    title: 'No active threats',
    description: 'Your environment is clean. No threats detected in the selected time range.'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    icon: <Shield size={48} />,
    title: 'No incidents yet',
    description: 'Create your first incident to start tracking security events.',
    action: <HaButton variant="primary">Create Incident</HaButton>
  }
}`,...p.parameters?.docs?.source}}},m=[`Default`,`WithIcon`,`WithAction`]}))();export{d as Default,p as WithAction,f as WithIcon,m as __namedExportsOrder,u as default};