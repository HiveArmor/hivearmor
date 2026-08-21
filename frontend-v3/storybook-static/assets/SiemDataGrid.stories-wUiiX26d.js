import{n as e}from"./rolldown-runtime-DaJ6WEGw.js";import{n as t,t as n}from"./SiemDataGrid-BcPHQLH5.js";var r,i,a,o,s,c,l,u;e((()=>{t(),r=[{field:`id`,headerName:`ID`,width:100},{field:`name`,headerName:`Alert Name`,flex:2},{field:`severity`,headerName:`Severity`,width:120},{field:`status`,headerName:`Status`,width:120},{field:`source`,headerName:`Source`,flex:1},{field:`timestamp`,headerName:`Time`,width:160}],i=[{id:`HA-001`,name:`Suspicious PowerShell Execution`,severity:`Critical`,status:`Open`,source:`Windows`,timestamp:`2024-07-26 10:23:15`},{id:`HA-002`,name:`Brute Force Login Attempt`,severity:`High`,status:`In Progress`,source:`Auth`,timestamp:`2024-07-26 10:15:02`},{id:`HA-003`,name:`Outbound DNS Anomaly`,severity:`Medium`,status:`Open`,source:`Network`,timestamp:`2024-07-26 09:58:47`},{id:`HA-004`,name:`Port Scan Detected`,severity:`Medium`,status:`Resolved`,source:`Firewall`,timestamp:`2024-07-26 09:32:11`},{id:`HA-005`,name:`Scheduled Task Created`,severity:`Low`,status:`Open`,source:`Windows`,timestamp:`2024-07-26 09:01:55`}],a={title:`HiveArmor/SiemDataGrid`,component:n,tags:[`autodocs`],parameters:{layout:`fullscreen`}},o={args:{columnDefs:r,rowData:i,height:400,rowHeight:32}},s={args:{columnDefs:r,rowData:[],height:400,loading:!0}},c={args:{columnDefs:r,rowData:[],height:400}},l={args:{columnDefs:r,rowData:i,height:400,rowHeight:32,rowSelection:`multiple`}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData,
    height: 400,
    rowHeight: 32
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData: [],
    height: 400,
    loading: true
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData: [],
    height: 400
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    columnDefs: columnDefs as ColDef[],
    rowData,
    height: 400,
    rowHeight: 32,
    rowSelection: 'multiple'
  }
}`,...l.parameters?.docs?.source}}},u=[`Default`,`Loading`,`Empty`,`WithRowSelection`]}))();export{o as Default,c as Empty,s as Loading,l as WithRowSelection,u as __namedExportsOrder,a as default};