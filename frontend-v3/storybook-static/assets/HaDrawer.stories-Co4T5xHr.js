import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{n,t as r}from"./HaButton-CEZ2Atqd.js";import{n as i,t as a}from"./HaDrawer-DyyWTR-5.js";var o,s,c,l,u,d,f;e((()=>{i(),n(),o=t(),s={title:`HiveArmor/HaDrawer`,component:a,tags:[`autodocs`],parameters:{layout:`fullscreen`}},c={args:{isOpen:!0,onClose:()=>{},title:`Alert Detail`,subtitle:`HA-2024-00142`,children:(0,o.jsxs)(`div`,{style:{color:`var(--ha-text-primary)`},children:[(0,o.jsx)(`p`,{children:`Alert details content goes here.`}),(0,o.jsx)(`p`,{style:{color:`var(--ha-text-secondary)`,fontSize:`var(--ha-text-sm)`},children:`Source: Windows Security Event Log`})]})}},l={args:{isOpen:!0,onClose:()=>{},title:`Incident #INC-001`,subtitle:`Lateral Movement Detected`,footer:(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(r,{variant:`primary`,children:`Escalate`}),(0,o.jsx)(r,{children:`Close`})]}),children:(0,o.jsx)(`div`,{style:{color:`var(--ha-text-primary)`},children:(0,o.jsx)(`p`,{children:`Incident summary and investigation details.`})})}},u={args:{isOpen:!0,onClose:()=>{},title:`Investigation Session`,width:720,children:(0,o.jsx)(`div`,{style:{color:`var(--ha-text-primary)`},children:`Wide drawer for complex investigations.`})}},d={args:{isOpen:!1,onClose:()=>{},title:`Hidden Drawer`,children:(0,o.jsx)(`div`,{children:`Not visible`})}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Alert Detail',
    subtitle: 'HA-2024-00142',
    children: <div style={{
      color: 'var(--ha-text-primary)'
    }}>
        <p>Alert details content goes here.</p>
        <p style={{
        color: 'var(--ha-text-secondary)',
        fontSize: 'var(--ha-text-sm)'
      }}>
          Source: Windows Security Event Log
        </p>
      </div>
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Incident #INC-001',
    subtitle: 'Lateral Movement Detected',
    footer: <>
        <HaButton variant="primary">Escalate</HaButton>
        <HaButton>Close</HaButton>
      </>,
    children: <div style={{
      color: 'var(--ha-text-primary)'
    }}>
        <p>Incident summary and investigation details.</p>
      </div>
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Investigation Session',
    width: 720,
    children: <div style={{
      color: 'var(--ha-text-primary)'
    }}>
        Wide drawer for complex investigations.
      </div>
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: false,
    onClose: () => {},
    title: 'Hidden Drawer',
    children: <div>Not visible</div>
  }
}`,...d.parameters?.docs?.source}}},f=[`Default`,`WithFooter`,`WideDrawer`,`Closed`]}))();export{d as Closed,c as Default,u as WideDrawer,l as WithFooter,f as __namedExportsOrder,s as default};