import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";function n({score:e,showLabel:t=!0,size:n=`md`}){let i=n===`sm`?80:120,a=Math.max(0,Math.min(100,e));return(0,r.jsxs)(`div`,{className:`confidence-indicator`,style:{display:`inline-flex`,alignItems:`center`,gap:`8px`},children:[(0,r.jsx)(`div`,{style:{width:`${i}px`,height:`4px`,background:`var(--ha-border)`,borderRadius:`2px`,overflow:`hidden`,position:`relative`},children:(0,r.jsx)(`div`,{style:{width:`${a}%`,height:`100%`,background:(e=>e<33?`var(--ha-medium)`:e<67?`var(--ha-high)`:`var(--ha-critical)`)(a),transition:`width 0.3s ease`}})}),t&&(0,r.jsxs)(`span`,{style:{fontSize:`var(--ha-text-xs)`,fontFamily:`var(--ha-font-mono)`,color:`var(--ha-text-secondary)`},children:[a,`%`]})]})}var r,i=e((()=>{r=t(),n.__docgenInfo={description:``,methods:[],displayName:`ConfidenceIndicator`,props:{score:{required:!0,tsType:{name:`number`},description:``},showLabel:{required:!1,tsType:{name:`boolean`},description:``,defaultValue:{value:`true`,computed:!1}},size:{required:!1,tsType:{name:`union`,raw:`'sm' | 'md'`,elements:[{name:`literal`,value:`'sm'`},{name:`literal`,value:`'md'`}]},description:``,defaultValue:{value:`'md'`,computed:!1}}}}})),a,o,s,c,l,u,d;e((()=>{i(),a={title:`HiveArmor/ConfidenceIndicator`,component:n,tags:[`autodocs`],parameters:{layout:`centered`}},o={args:{score:20}},s={args:{score:50}},c={args:{score:85}},l={args:{score:100}},u={args:{score:75,size:`sm`,showLabel:!1}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    score: 20
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    score: 50
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    score: 85
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    score: 100
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    score: 75,
    size: 'sm',
    showLabel: false
  }
}`,...u.parameters?.docs?.source}}},d=[`Low`,`Medium`,`High`,`Full`,`SmallNoLabel`]}))();export{l as Full,c as High,o as Low,s as Medium,u as SmallNoLabel,d as __namedExportsOrder,a as default};