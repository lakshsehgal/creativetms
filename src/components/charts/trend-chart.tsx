"use client";

import { useMemo, useState } from "react";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  points: { x: string; y: number }[];
}

/**
 * Multi-series line chart with a crosshair readout.
 *
 * One y-axis on purpose — a second scale for a different measure would make
 * the two lines look comparable when they aren't. Measures of different units
 * get their own chart.
 */
export function TrendChart({
  series,
  height = 190,
  formatValue = (value) => String(value),
  yLabel,
}: {
  series: TrendSeries[];
  height?: number;
  formatValue?: (value: number) => string;
  yLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const labels = series[0]?.points.map((point) => point.x) ?? [];
  const width = 640;
  const pad = { top: 12, right: 12, bottom: 22, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = useMemo(() => {
    const values = series.flatMap((line) => line.points.map((point) => point.y));
    const peak = Math.max(1, ...values);
    // Round the ceiling up so the axis reads in friendly steps.
    const magnitude = 10 ** Math.floor(Math.log10(peak));
    return Math.ceil(peak / magnitude) * magnitude;
  }, [series]);

  const xAt = (index: number) =>
    pad.left + (labels.length <= 1 ? plotW / 2 : (index / (labels.length - 1)) * plotW);
  const yAt = (value: number) => pad.top + plotH - (value / max) * plotH;

  if (labels.length === 0) {
    return <p className="py-8 text-center text-[12px] text-[var(--color-ink-3)]">No data yet</p>;
  }

  const ticks = [0, 0.5, 1].map((fraction) => max * fraction);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Trend chart: ${series.map((line) => line.label).join(", ")}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = ((event.clientX - box.left) / box.width) * width;
          const index = Math.round(((ratio - pad.left) / plotW) * (labels.length - 1));
          setHover(Math.max(0, Math.min(labels.length - 1, index)));
        }}
      >
        {/* Recessive gridlines — present, never competing with the data. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="var(--color-grid)"
              strokeWidth={1}
            />
            <text
              x={pad.left - 7}
              y={yAt(tick) + 3.5}
              textAnchor="end"
              fontSize={9.5}
              fill="var(--color-ink-3)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatValue(Math.round(tick))}
            </text>
          </g>
        ))}

        {hover != null && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={pad.top}
            y2={pad.top + plotH}
            stroke="var(--color-line-strong)"
            strokeWidth={1}
          />
        )}

        {series.map((line) => {
          const path = line.points
            .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index)},${yAt(point.y)}`)
            .join(" ");
          return (
            <g key={line.key}>
              <path
                d={path}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {hover != null && line.points[hover] && (
                <circle
                  cx={xAt(hover)}
                  cy={yAt(line.points[hover].y)}
                  r={4}
                  fill={line.color}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        {labels.map((label, index) =>
          index % Math.ceil(labels.length / 7) === 0 || index === labels.length - 1 ? (
            <text
              key={label}
              x={xAt(index)}
              y={height - 6}
              textAnchor="middle"
              fontSize={9.5}
              fill="var(--color-ink-3)"
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((line) => (
          <span key={line.key} className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-2)]">
            <span className="h-0.5 w-3 rounded-full" style={{ background: line.color }} />
            {line.label}
            {hover != null && line.points[hover] && (
              <span className="tabular font-medium text-[var(--color-ink)]">
                {formatValue(line.points[hover].y)}
              </span>
            )}
          </span>
        ))}
        {hover != null && (
          <span className="ml-auto text-[11.5px] text-[var(--color-ink-3)]">{labels[hover]}</span>
        )}
        {yLabel && hover == null && (
          <span className="ml-auto text-[11.5px] text-[var(--color-ink-3)]">{yLabel}</span>
        )}
      </figcaption>
    </figure>
  );
}
