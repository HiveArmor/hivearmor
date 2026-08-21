import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";var n=e((()=>{}));function r({chips:e,onClearAll:t}){return e.length===0?null:(0,i.jsxs)(`div`,{className:`filter-chips-row`,children:[e.map(e=>(0,i.jsxs)(`div`,{className:`filter-chip`,children:[(0,i.jsx)(`span`,{className:`filter-chip__label`,children:e.label}),(0,i.jsx)(`button`,{type:`button`,className:`filter-chip__remove`,onClick:e.onRemove,"aria-label":`Remove filter: ${e.label}`,children:`×`})]},e.key)),(0,i.jsx)(`button`,{type:`button`,className:`filter-chips-row__clear-all`,onClick:t,children:`Clear all`})]})}var i,a=e((()=>{n(),i=t(),r.__docgenInfo={description:``,methods:[],displayName:`FilterChipsRow`,props:{chips:{required:!0,tsType:{name:`Array`,elements:[{name:`FilterChip`}],raw:`FilterChip[]`},description:``},onClearAll:{required:!0,tsType:{name:`signature`,type:`function`,raw:`() => void`,signature:{arguments:[],return:{name:`void`}}},description:``}}}})),o,s,c,l,u;e((()=>{a(),o={title:`HiveArmor/FilterChipsRow`,component:r,tags:[`autodocs`],parameters:{layout:`padded`}},s={args:{chips:[{key:`severity`,label:`Severity: Critical`,onRemove:()=>{}}],onClearAll:()=>{}}},c={args:{chips:[{key:`severity`,label:`Severity: Critical`,onRemove:()=>{}},{key:`status`,label:`Status: Open`,onRemove:()=>{}},{key:`source`,label:`Source: Windows`,onRemove:()=>{}}],onClearAll:()=>{}}},l={args:{chips:[],onClearAll:()=>{}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    chips: [{
      key: 'severity',
      label: 'Severity: Critical',
      onRemove: () => {}
    }],
    onClearAll: () => {}
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    chips: [{
      key: 'severity',
      label: 'Severity: Critical',
      onRemove: () => {}
    }, {
      key: 'status',
      label: 'Status: Open',
      onRemove: () => {}
    }, {
      key: 'source',
      label: 'Source: Windows',
      onRemove: () => {}
    }],
    onClearAll: () => {}
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    chips: [],
    onClearAll: () => {}
  }
}`,...l.parameters?.docs?.source}}},u=[`SingleChip`,`MultipleChips`,`Empty`]}))();export{l as Empty,c as MultipleChips,s as SingleChip,u as __namedExportsOrder,o as default};