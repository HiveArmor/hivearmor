import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{t}from"./jsx-runtime-CP3Fd1s6.js";import{o as n,t as r}from"./lucide-react-B0kLru3t.js";function i({title:e=`Something went wrong`,message:t=`An error occurred. Please try again.`,onRetry:r,error:i,className:o=``}){return(0,a.jsxs)(`div`,{role:`alert`,className:`error-state ${o}`,style:{display:`flex`,flexDirection:`column`,alignItems:`center`,justifyContent:`center`,minHeight:`300px`,padding:`var(--ha-space-6)`},children:[(0,a.jsx)(`div`,{className:`error-state-icon`,style:{color:`var(--ha-critical)`,marginBottom:`var(--ha-space-4)`},children:(0,a.jsx)(n,{size:48})}),(0,a.jsx)(`h3`,{style:{fontSize:`var(--ha-text-xl)`,fontWeight:`var(--ha-weight-semibold)`,color:`var(--ha-text-primary)`,marginBottom:`var(--ha-space-2)`,textAlign:`center`},children:e}),(0,a.jsx)(`p`,{style:{fontSize:`var(--ha-text-sm)`,color:`var(--ha-text-secondary)`,maxWidth:`400px`,textAlign:`center`,marginBottom:r?`var(--ha-space-6)`:0,lineHeight:1.5},children:t}),r&&(0,a.jsx)(`button`,{type:`button`,onClick:r,style:{padding:`8px 16px`,fontSize:`var(--ha-text-sm)`,fontWeight:`var(--ha-weight-medium)`,borderRadius:`var(--ha-radius-base)`,border:`1px solid var(--ha-border)`,background:`var(--ha-surface-raised)`,color:`var(--ha-text-primary)`,cursor:`pointer`,transition:`background 0.2s`},onMouseEnter:e=>{e.currentTarget.style.background=`var(--ha-surface-primary)`},onMouseLeave:e=>{e.currentTarget.style.background=`var(--ha-surface-raised)`},children:`Try again`}),!1]})}var a,o=e((()=>{r(),a=t(),i.__docgenInfo={description:``,methods:[],displayName:`ErrorState`,props:{title:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`'Something went wrong'`,computed:!1}},message:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`'An error occurred. Please try again.'`,computed:!1}},onRetry:{required:!1,tsType:{name:`signature`,type:`function`,raw:`() => void`,signature:{arguments:[],return:{name:`void`}}},description:``},error:{required:!1,tsType:{name:`Error`},description:``},className:{required:!1,tsType:{name:`string`},description:``,defaultValue:{value:`''`,computed:!1}}}}})),s,c,l,u,d,f;e((()=>{o(),s={title:`HiveArmor/ErrorState`,component:i,tags:[`autodocs`],parameters:{layout:`padded`}},c={args:{}},l={args:{title:`Failed to load alerts`,message:`The server returned an error. Please try again.`,onRetry:()=>alert(`Retry clicked`)}},u={args:{title:`Connection error`,message:`Unable to reach the server. Check your network connection.`,onRetry:()=>alert(`Retry clicked`)}},d={args:{title:`Unexpected error`,message:`An unexpected error occurred.`,error:Error(`TypeError: Cannot read properties of undefined
    at AlertsPage.tsx:42:12`),onRetry:()=>alert(`Retry clicked`)}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {}
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Failed to load alerts',
    message: 'The server returned an error. Please try again.',
    onRetry: () => alert('Retry clicked')
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Connection error',
    message: 'Unable to reach the server. Check your network connection.',
    onRetry: () => alert('Retry clicked')
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Unexpected error',
    message: 'An unexpected error occurred.',
    error: new Error('TypeError: Cannot read properties of undefined\\n    at AlertsPage.tsx:42:12'),
    onRetry: () => alert('Retry clicked')
  }
}`,...d.parameters?.docs?.source}}},f=[`Default`,`WithRetry`,`NetworkError`,`WithErrorObject`]}))();export{c as Default,u as NetworkError,d as WithErrorObject,l as WithRetry,f as __namedExportsOrder,s as default};