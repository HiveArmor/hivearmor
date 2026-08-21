import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{c as n,t as r}from"./esm-Cl52RCse.js";function i({isOpen:e,onClose:t,title:r,children:i,width:o,className:s=``}){return(0,a.jsx)(n,{isOpen:e,onClose:t,title:r,className:s,style:{"--pf-v5-c-modal-box--BackgroundColor":`var(--ha-surface-raised)`,"--pf-v5-c-modal-box--BoxShadow":`0 4px 16px rgba(0,0,0,0.45)`,"--pf-v5-c-modal-box--BorderColor":`var(--ha-border)`,"--pf-v5-c-modal-box--BorderRadius":`var(--ha-radius-lg)`,"--pf-v5-c-modal-box__title--Color":`var(--ha-text-primary)`,"--pf-v5-c-modal-box__body--Color":`var(--ha-text-primary)`,...o?{"--pf-v5-c-modal-box--Width":`${o}px`}:{}},children:i})}var a,o=e((()=>{r(),a=t(),i.__docgenInfo={description:``,methods:[],displayName:`HaModal`,props:{isOpen:{required:!0,tsType:{name:`boolean`},description:``},onClose:{required:!0,tsType:{name:`signature`,type:`function`,raw:`() => void`,signature:{arguments:[],return:{name:`void`}}},description:``},title:{required:!0,tsType:{name:`string`},description:``},children:{required:!0,tsType:{name:`ReactReactNode`,raw:`React.ReactNode`},description:``},width:{required:!1,tsType:{name:`union`,raw:`string | number`,elements:[{name:`string`},{name:`number`}]},description:``},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`''`,computed:!1}}}}})),s,c,l,u,d,f;e((()=>{o(),s=t(),c={title:`HiveArmor/HaModal`,component:i,tags:[`autodocs`],parameters:{layout:`centered`}},l={args:{isOpen:!0,onClose:()=>{},title:`Confirm Action`,children:(0,s.jsx)(`div`,{style:{padding:`16px`,color:`var(--ha-text-primary)`},children:`Are you sure you want to perform this action? This cannot be undone.`})}},u={args:{isOpen:!0,onClose:()=>{},title:`Alert Details`,width:800,children:(0,s.jsx)(`div`,{style:{padding:`16px`,color:`var(--ha-text-primary)`},children:`Wide modal content with more detailed information.`})}},d={args:{isOpen:!1,onClose:()=>{},title:`Hidden Modal`,children:(0,s.jsx)(`div`,{children:`Not visible`})}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Confirm Action',
    children: <div style={{
      padding: '16px',
      color: 'var(--ha-text-primary)'
    }}>
        Are you sure you want to perform this action? This cannot be undone.
      </div>
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: () => {},
    title: 'Alert Details',
    width: 800,
    children: <div style={{
      padding: '16px',
      color: 'var(--ha-text-primary)'
    }}>
        Wide modal content with more detailed information.
      </div>
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: false,
    onClose: () => {},
    title: 'Hidden Modal',
    children: <div>Not visible</div>
  }
}`,...d.parameters?.docs?.source}}},f=[`Default`,`Wide`,`Closed`]}))();export{d as Closed,l as Default,u as Wide,f as __namedExportsOrder,c as default};