// components/JupiterOrderChart.tsx
'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Bar, Pie, Scatter } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ChartProps {
  data: {
    status: string;
    count: number;
    pair: string;
    price: number;
    range: string;
  }[];
  type: 'status' | 'tokens' | 'prices' | 'volume';
  title: string;
}

export default function JupiterOrderChart({ data, type, title }: ChartProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartOptions: ChartOptions<any> = {
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
    scales: type !== 'status' && type !== 'tokens' ? {
      x: {
        title: {
          display: true,
          color: '#ffffff'
        },
        ticks: { color: '#ffffff' },
        grid: { color: '#404040' }
      },
      y: {
        title: {
          display: true,
          color: '#ffffff'
        },
        ticks: { color: '#ffffff' },
        grid: { color: '#404040' }
      }
    } : undefined
  };

  if (type === 'status') {
    const chartData = {
      labels: data.map((item: { status: string; count: number }) => item.status),
      datasets: [{
        data: data.map((item: { count: number }) => item.count),
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',   // Active - Green
          'rgba(239, 68, 68, 0.8)',   // Expired - Red
          'rgba(59, 130, 246, 0.8)',  // Filled - Blue
          'rgba(234, 179, 8, 0.8)',   // Partial - Yellow
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(239, 68, 68, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(234, 179, 8, 1)',
        ],
        borderWidth: 1
      }]
    };

    return (
      <div className="h-64 bg-gray-900 p-4 rounded-lg">
        <Pie data={chartData} options={chartOptions} />
      </div>
    );
  }

  if (type === 'tokens') {
    const chartData = {
      labels: data.slice(0, 10).map((item: { pair: string; count: number }) => item.pair),
      datasets: [{
        label: 'Orders',
        data: data.slice(0, 10).map((item: { count: number }) => item.count),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    };

    return (
      <div className="h-64 bg-gray-900 p-4 rounded-lg">
        <Bar data={chartData} options={chartOptions} />
      </div>
    );
  }

  if (type === 'prices') {
    const chartData = {
      datasets: [{
        label: 'Price Distribution',
        data: data.map((item: { price: number; count: number }) => ({
          x: item.price,
          y: item.count
        })),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgba(16, 185, 129, 1)',
        pointRadius: 6,
      }]
    };

    const scatterOptions = {
      ...chartOptions,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Price',
            color: '#ffffff'
          },
          ticks: { color: '#ffffff' },
          grid: { color: '#404040' }
        },
        y: {
          title: {
            display: true,
            text: 'Number of Orders',
            color: '#ffffff'
          },
          ticks: { color: '#ffffff' },
          grid: { color: '#404040' }
        }
      }
    };

    return (
      <div className="h-64 bg-gray-900 p-4 rounded-lg">
        <Scatter data={chartData} options={scatterOptions} />
      </div>
    );
  }

  if (type === 'volume') {
    const chartData = {
      labels: data.map((item: { range: string; count: number }) => item.range),
      datasets: [{
        label: 'Orders by Volume',
        data: data.map((item: { count: number }) => item.count),
        backgroundColor: 'rgba(168, 85, 247, 0.8)',
        borderColor: 'rgba(168, 85, 247, 1)',
        borderWidth: 1
      }]
    };

    return (
      <div className="h-64 bg-gray-900 p-4 rounded-lg">
        <Bar data={chartData} options={chartOptions} />
      </div>
    );
  }

  return null;
}

