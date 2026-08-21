import type { Meta, StoryObj } from '@storybook/react';
import type { EChartsOption } from 'echarts';

import { HaChart } from './HaChart';

const barOption: EChartsOption = {
  backgroundColor: 'transparent',
  grid: { top: 20, right: 20, bottom: 40, left: 50 },
  xAxis: {
    type: 'category',
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    axisLine: { lineStyle: { color: 'var(--ha-border)' } },
    axisLabel: { color: 'var(--ha-text-secondary)' },
  },
  yAxis: {
    type: 'value',
    axisLine: { lineStyle: { color: 'var(--ha-border)' } },
    axisLabel: { color: 'var(--ha-text-secondary)' },
    splitLine: { lineStyle: { color: 'var(--ha-border)', type: 'dashed' } },
  },
  series: [
    {
      type: 'bar',
      data: [120, 200, 150, 80, 250, 180, 95],
      itemStyle: { color: 'var(--ha-primary)' },
    },
  ],
};

const lineOption: EChartsOption = {
  backgroundColor: 'transparent',
  grid: { top: 20, right: 20, bottom: 40, left: 50 },
  xAxis: {
    type: 'category',
    data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    axisLine: { lineStyle: { color: 'var(--ha-border)' } },
    axisLabel: { color: 'var(--ha-text-secondary)', fontSize: 10 },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: 'var(--ha-text-secondary)', fontSize: 10 },
    splitLine: { lineStyle: { color: 'var(--ha-border)', type: 'dashed' } },
  },
  series: [
    {
      type: 'line',
      data: [820, 932, 901, 934, 1290, 1330, 1320],
      smooth: true,
      itemStyle: { color: 'var(--ha-primary)' },
      areaStyle: { color: 'color-mix(in srgb, var(--ha-primary) 15%, transparent)' },
    },
  ],
};

const pieOption: EChartsOption = {
  backgroundColor: 'transparent',
  series: [
    {
      type: 'pie',
      radius: ['40%', '70%'],
      data: [
        { value: 45, name: 'Critical', itemStyle: { color: '#FF5D6C' } },
        { value: 30, name: 'High', itemStyle: { color: '#FFAA45' } },
        { value: 20, name: 'Medium', itemStyle: { color: '#5AA7FF' } },
        { value: 5, name: 'Low', itemStyle: { color: '#40D69A' } },
      ],
      label: { color: 'var(--ha-text-secondary)', fontSize: 11 },
    },
  ],
};

const meta = {
  title: 'HiveArmor/HaChart',
  component: HaChart,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof HaChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BarChart: Story = {
  args: {
    option: barOption,
    height: 300,
    ariaLabel: 'Weekly alert count bar chart',
  },
};

export const LineChart: Story = {
  args: {
    option: lineOption,
    height: 250,
    ariaLabel: 'Alert timeline line chart',
  },
};

export const PieChart: Story = {
  args: {
    option: pieOption,
    height: 300,
    ariaLabel: 'Alert severity distribution pie chart',
  },
};

export const Loading: Story = {
  args: {
    option: barOption,
    height: 300,
    loading: true,
    ariaLabel: 'Loading chart',
  },
};
