import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

// Registered piece by piece rather than with chart.js/auto: auto pulls in every
// controller, scale and plugin the library has, and this app draws three kinds
// of chart on a phone over mobile data.
ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
);

// Single-series charts get a brand hue — the measure is named by the heading
// above the chart, so colour carries no meaning and should not pretend to.
export const TEAL = '#12889b';
export const FLAME = '#e2551b';
export const WARN = '#b54708';

// The categorical set, for the one chart where colour means identity. Fixed
// order, never cycled: a product keeps its colour when a filter removes the
// one above it. Validated as a set for colour-blind separation and against
// this app's white cards — the three lighter hues sit under 3:1 on white,
// which is why every slice is also labelled in the legend rather than
// identified by colour alone.
export const SERIES = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];
// The "Other" bucket is a remainder, not an identity, so it gets grey and is
// never one of the eight.
const OTHER = '#98a9ad';

const INK = '#06222a';
const MUTED = '#5d7a82';
const GRID = '#edf3f4';

export function money(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

const BASE_FONT = { family: 'Inter, sans-serif', size: 11 };

// Recessive axes: the data is the ink, the scaffolding is not. No vertical
// grid on the time axis — the points already sit on their day.
function scales({ horizontal, currency = true }) {
  const value = {
    beginAtZero: true,
    grid: { color: GRID, drawBorder: false },
    ticks: { color: MUTED, font: BASE_FONT, callback: (v) => (currency ? money(v) : v) },
  };
  const category = {
    grid: { display: false, drawBorder: false },
    ticks: { color: MUTED, font: BASE_FONT, autoSkip: true, maxRotation: 0 },
  };
  return horizontal ? { x: value, y: category } : { x: category, y: value };
}

/**
 * A chart.js canvas. Created once and updated in place — recreating it on
 * every filter change threw away the animation and, on a phone, flashed.
 *
 * `onSelect` receives the index of whatever was clicked, which is how the
 * Reports page drills down: clicking a bar sets that filter.
 */
export default function Chart({ type, data, options = {}, onSelect, height = 220, ariaLabel }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  // Kept in a ref so the click handler always calls the current one without
  // the chart having to be rebuilt when the parent re-renders.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const doughnut = type === 'doughnut';
    chartRef.current = new ChartJS(canvasRef.current, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Touch targets: a finger is not a mouse pointer, so a tap near a bar
        // counts as a tap on it.
        interaction: { mode: doughnut ? 'nearest' : 'index', intersect: false },
        onClick: (event, elements) => {
          if (elements.length && selectRef.current) selectRef.current(elements[0].index);
        },
        plugins: {
          // A legend earns its space only when colour means identity, which is
          // the doughnut alone; elsewhere the heading names the single series.
          legend: doughnut
            ? {
                position: 'bottom',
                labels: { color: INK, font: BASE_FONT, boxWidth: 10, boxHeight: 10, padding: 10 },
              }
            : { display: false },
          tooltip: {
            backgroundColor: '#04222a',
            padding: 10,
            titleFont: BASE_FONT,
            bodyFont: BASE_FONT,
            displayColors: doughnut,
          },
          ...options.plugins,
        },
        ...(doughnut ? {} : { scales: scales(options) }),
        ...options.chart,
      },
    });
    return () => chartRef.current?.destroy();
    // Built once per chart type; the data flows in through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data = data;
    chart.update();
  }, [data]);

  return (
    <div className="chart-box" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}

// Dataset builders. Every chart on Reports and the Dashboard is one of these
// three shapes, and chart.js dataset boilerplate repeated six times is six
// places for a colour to drift.

export function lineData(rows, { label, x = 'date', y = 'amount', color = TEAL }) {
  return {
    labels: rows.map((r) => r[x]),
    datasets: [
      {
        label,
        data: rows.map((r) => r[y]),
        borderColor: color,
        backgroundColor: 'rgba(18, 136, 155, 0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        // Thirty dots on a phone is noise; the point appears under the finger.
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
      },
    ],
  };
}

export function barData(rows, { label, x = 'label', y = 'amount', color = FLAME }) {
  return {
    labels: rows.map((r) => r[x]),
    datasets: [
      {
        label,
        data: rows.map((r) => r[y]),
        backgroundColor: color,
        // Rounded at the data end only, so the bar still reads from a flat
        // baseline.
        borderRadius: 4,
        borderSkipped: 'start',
        maxBarThickness: 34,
      },
    ],
  };
}

export function doughnutData(rows, { label, x = 'label', y = 'amount' }) {
  return {
    labels: rows.map((r) => r[x]),
    datasets: [
      {
        label,
        data: rows.map((r) => r[y]),
        backgroundColor: rows.map((r, i) => (r.id == null ? OTHER : SERIES[i % SERIES.length])),
        // A ring of white between slices; without it two adjacent hues share
        // an edge and read as one shape.
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };
}
