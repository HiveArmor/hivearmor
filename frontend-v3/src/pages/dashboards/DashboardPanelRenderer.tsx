import type { EChartsOption } from 'echarts';
import { AlertTriangle } from 'lucide-react';

import type { DashboardPanel } from './dashboardOperations.types';

import { HaChart } from '@/components/ha-chart';

export function DashboardPanelRenderer({ panel }: { panel: DashboardPanel }): JSX.Element {
  if (panel.state === 'contract_unavailable' || !panel.data) return <div className="dsh-contract-panel"><AlertTriangle size={18}/><strong>Execution contract unavailable</strong><span>Panel metadata is visible; production data is not inferred.</span></div>;
  const data = panel.data;
  if (data.kind === 'metric') return <div className="dsh-metric"><strong>{data.value}</strong><span>{data.context}{data.delta && <em>{data.delta}</em>}</span></div>;
  if (data.kind === 'table') return <table className="dsh-table"><thead><tr>{data.columns.map((column)=><th key={column}>{column}</th>)}</tr></thead><tbody>{data.rows.map((row,index)=><tr key={index}>{data.columns.map((column)=><td key={column}>{row[column]}</td>)}</tr>)}</tbody></table>;
  if (data.kind === 'feed') return <div className="dsh-feed">{data.rows.map((row,index)=><div key={`${row.time}-${index}`}><time>{row.time}</time><strong>{row.severity}</strong><span>{row.summary}</span></div>)}</div>;
  if (data.kind === 'text') return <p>{data.body}</p>;
  const option: EChartsOption = data.kind === 'series' ? {
    tooltip:{trigger:'axis'},grid:{left:32,right:12,top:14,bottom:26},xAxis:{type:'category',data:data.labels,boundaryGap:false},yAxis:{type:'value'},series:data.series.map((series)=>({name:series.name,type:panel.kind==='bar'?'bar':'line',data:series.values,smooth:true,showSymbol:false}))
  } : {tooltip:{trigger:'item'},legend:{bottom:0},series:[{type:'pie',radius:['48%','72%'],center:['50%','43%'],data:data.labels.map((name,index)=>({name,value:data.values[index]})),label:{show:false}}]};
  return <HaChart option={option} height="100%" ariaLabel={panel.title} ariaDescription={panel.description}/>;
}
