import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{g as n,m as r,t as i}from"./lucide-react-B0kLru3t.js";import{n as a,r as o,t as s}from"./severity-B4EIVOkA.js";function c({severity:e,size:t=`md`,className:i=``}){let o=t===`sm`?12:14,c=t===`sm`?`var(--ha-text-xs)`:`var(--ha-text-sm)`,u=s[e],d=a[e],f=e===`critical`||e===`high`?n:r;return(0,l.jsxs)(`span`,{className:`severity-label ${i}`,style:{display:`inline-flex`,alignItems:`center`,gap:`6px`,fontSize:c,fontWeight:`var(--ha-weight-medium)`},"aria-label":`${e} severity`,children:[(0,l.jsx)(f,{size:o,style:{color:u}}),(0,l.jsx)(`span`,{style:{color:u},children:d})]})}var l,u=e((()=>{i(),o(),l=t(),c.__docgenInfo={description:``,methods:[],displayName:`SeverityLabel`,props:{severity:{required:!0,tsType:{name:`SeverityLevel`},description:``},size:{required:!1,tsType:{name:`union`,raw:`'sm' | 'md'`,elements:[{name:`literal`,value:`'sm'`},{name:`literal`,value:`'md'`}]},description:``,defaultValue:{value:`'md'`,computed:!1}},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`''`,computed:!1}}}}})),d,f,p,m,h,g,_,v;e((()=>{u(),d={title:`HiveArmor/SeverityLabel`,component:c,tags:[`autodocs`],parameters:{layout:`centered`}},f={args:{severity:`critical`}},p={args:{severity:`high`}},m={args:{severity:`medium`}},h={args:{severity:`low`}},g={args:{severity:`info`}},_={args:{severity:`critical`,size:`sm`}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    severity: 'critical'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    severity: 'high'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    severity: 'medium'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    severity: 'low'
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    severity: 'info'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    severity: 'critical',
    size: 'sm'
  }
}`,..._.parameters?.docs?.source}}},v=[`Critical`,`High`,`Medium`,`Low`,`Info`,`SmallSize`]}))();export{f as Critical,p as High,g as Info,h as Low,m as Medium,_ as SmallSize,v as __namedExportsOrder,d as default};