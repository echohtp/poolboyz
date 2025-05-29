'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Bar, Scatter, Line } from 'react-chartjs-2';
import { LiquidityData } from '../../lib/solana';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface LiquidityChartProps {
  data: LiquidityData[];
  type: 'histogram' | 'heatmap' | 'cumulative';
  title: string;
}

export default function LiquidityChart({ data, type, title }: LiquidityChartProps) {
  const getLiquidityColor = (intensity: number) => {
    if (intensity > 0.8) return 'rgba(34, 197, 94, 0.8)';
    if (intensity > 0.6) return 'rgba(132, 204, 22, 0.8)';
    if (intensity > 0.4) return 'rgba(234, 179, 8, 0.8)';
    if (intensity > 0.2) return 'rgba(249, 115, 22, 0.8)';
    return 'rgba(239, 68, 68, 0.8)';
  };

  const liquidityNumbers = data.map(d => Number(d.totalLiquidity));
  const maxLiquidity = Math.max(...liquidityNumbers);
  const normalizedData = liquidityNumbers.map(l => l / maxLiquidity);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commonOptions: ChartOptions<any> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#ffffff' }
      },
      title: {
        display: true,
        text: title,
        color: '#ffffff',
        font: { size: 16 }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Price ($)',
          color: '#ffffff'
        },
        ticks: { color: '#ffffff' },
        grid: { color: '#404040' }
      },
      y: {
        title: {
          display: true,
          text: 'Liquidity',
          color: '#ffffff'
        },
        ticks: {
          color: '#ffffff',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: function(value: any) {
            return Number(value).toExponential(2);
          }
        },
        grid: { color: '#404040' }
      }
    }
  };

  if (type === 'histogram') {
    const chartData = {
      labels: data.map(d => `$${d.price.toFixed(6)}`),
      datasets: [{
        label: 'Liquidity',
        data: liquidityNumbers,
        backgroundColor: normalizedData.map(n => getLiquidityColor(n)),
        borderColor: normalizedData.map(n => getLiquidityColor(n).replace('0.8', '1')),
        borderWidth: 1
      }]
    };

    return (
      <div className="h-96 bg-gray-900 p-4 rounded-lg">
        <Bar data={chartData} options={commonOptions} />
      </div>
    );
  }

  if (type === 'heatmap') {
    const chartData = {
      datasets: [{
        label: 'Liquidity Zones',
        data: data.map((d, i) => ({
          x: d.price,
          y: normalizedData[i] * 100
        })),
        backgroundColor: normalizedData.map(n => getLiquidityColor(n)),
        pointRadius: normalizedData.map(n => Math.max(3, n * 15)),
      }]
    };

    const heatmapOptions = {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: {
          ...commonOptions.scales?.y,
          title: {
            display: true,
            text: 'Liquidity Intensity (%)',
            color: '#ffffff'
          }
        }
      }
    };

    return (
      <div className="h-96 bg-gray-900 p-4 rounded-lg">
        <Scatter data={chartData} options={heatmapOptions} />
      </div>
    );
  }

  if (type === 'cumulative') {
    const sortedData = [...data].sort((a, b) => a.price - b.price);
    const sortedLiquidity = sortedData.map(d => Number(d.totalLiquidity));
    
    let cumulative = 0;
    const cumulativeData = sortedLiquidity.map(l => {
      cumulative += l;
      return cumulative;
    });

    const chartData = {
      labels: sortedData.map(d => `$${d.price.toFixed(6)}`),
      datasets: [
        {
          label: 'Individual Liquidity',
          data: sortedLiquidity,
          backgroundColor: 'rgba(59, 130, 246, 0.3)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 2,
          type: 'bar' as const,
          yAxisID: 'y'
        },
        {
          label: 'Cumulative Liquidity',
          data: cumulativeData,
          backgroundColor: 'rgba(16, 185, 129, 0.3)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 3,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    };

    const cumulativeOptions = {
      ...commonOptions,
      scales: {
        x: commonOptions.scales?.x,
        y: {
          ...commonOptions.scales?.y,
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          title: {
            display: true,
            text: 'Individual Liquidity',
            color: '#ffffff'
          }
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          title: {
            display: true,
            text: 'Cumulative Liquidity',
            color: '#ffffff'
          },
          ticks: { color: '#ffffff' },
          grid: { drawOnChartArea: false }
        }
      }
    };

    return (
      <div className="h-96 bg-gray-900 p-4 rounded-lg">
        {/* @ts-expect-error - Chart.js types are not compatible with the data structure */}
        <Line data={chartData} options={cumulativeOptions} />
      </div>
    );
  }

  return null;
}
