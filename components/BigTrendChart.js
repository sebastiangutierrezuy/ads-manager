'use client';

import { useState } from 'react';
import { METRIC_CONFIG } from '@/lib/metrics';

export default function BigTrendChart({ points, prevPoints, compareDays = 30, metric = 'reach' }) {
  const [hover, setHover] = useState(null);
  const cfg = METRIC_CONFIG[metric] || METRIC_CONFIG.reach;

  if (!points?.length) {
    return (
      <div className="chart-wrap tall" style={{display:'grid', placeItems:'center', color:'var(--gray)'}}>
        Sin datos en el período
      </div>
    );
  }

  const W = 800, H = 320, padX = 50, padTop = 30, padBottom = 40;
  const valueOf = (p) => cfg.extract(p || {});
  const allMax = Math.max(
    ...points.map(valueOf),
    ...(prevPoints?.map(valueOf) || [0]),
    1
  );
  const stepX = points.length > 1 ? (W - padX*2) / (points.length - 1) : 0;
  const yOf = (v) => padTop + (H - padTop - padBottom) * (1 - v / allMax);
  const xOf = (i) => padX + i * stepX;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(valueOf(p))}`).join(' ');
  const area = `${path} L${xOf(points.length-1)},${H-padBottom} L${xOf(0)},${H-padBottom} Z`;

  const prevAligned = (prevPoints || []).slice(-points.length);
  const prevPath = prevAligned.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(valueOf(p))}`).join(' ');

  const ticks = [0, allMax * 0.33, allMax * 0.66, allMax];

  const fmtFull = (s) => {
    if (!s) return '';
    const [y, m, day] = s.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };
  const xLabels = pickXLabels(points, fmtFull);

  return (
    <div className="chart-wrap tall" style={{position:'relative'}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <g stroke="#E6E2D8" strokeWidth="1">
          {ticks.map((_, i) => {
            const y = padTop + (H - padTop - padBottom) * (1 - i / 3);
            return <line key={i} x1={padX} y1={y} x2={W - 10} y2={y} />;
          })}
        </g>
        <g className="chart-axis">
          {ticks.map((v, i) => {
            const y = padTop + (H - padTop - padBottom) * (1 - i / 3);
            return <text key={i} x={padX - 8} y={y + 3} textAnchor="end">{cfg.formatCompact(v)}</text>;
          })}
        </g>
        {prevPath && <path className="chart-line-prev" d={prevPath} />}
        <path className="chart-area" d={area} />
        <path className="chart-line" d={path} />

        {hover !== null && (
          <line
            x1={xOf(hover)} y1={padTop} x2={xOf(hover)} y2={H - padBottom}
            stroke="var(--navy)" strokeWidth="1" strokeDasharray="2 3" opacity="0.3"
          />
        )}

        {points.map((p, i) => {
          const visible = hover === i || (i === 0 || i === points.length-1 || i % Math.ceil(points.length / 6) === 0);
          if (!visible) return null;
          return (
            <circle
              key={`d${i}`}
              className="chart-dot"
              cx={xOf(i)}
              cy={yOf(valueOf(p))}
              r={hover === i ? 5 : 3.5}
              style={{transition:'r 0.15s'}}
            />
          );
        })}

        {points.map((p, i) => (
          <rect
            key={`h${i}`}
            x={xOf(i) - stepX/2}
            y={padTop}
            width={stepX || 20}
            height={H - padTop - padBottom}
            fill="transparent"
            style={{cursor:'pointer'}}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        <g className="chart-axis">
          {xLabels.map(({ idx, label }) => (
            <text key={idx} x={xOf(idx)} y={H - 14} textAnchor="middle">{label}</text>
          ))}
        </g>
      </svg>

      {hover !== null && (() => {
        const curr = valueOf(points[hover]);
        const prev = valueOf(prevAligned[hover]);
        const delta = prev > 0 ? ((curr - prev) / prev) * 100 : null;
        return (
          <div
            className="chart-tooltip"
            style={{
              left: `${(xOf(hover) / W) * 100}%`,
              top: `${(yOf(curr) / H) * 100}%`,
            }}
          >
            <div className="t-date">{fmtFull(points[hover].date_start)}</div>
            <div className="t-value">{cfg.format(curr)} {cfg.unit && <span>{cfg.unit}</span>}</div>
            {prev > 0 && (
              <div className="t-prev">
                hace {compareDays} días: {cfg.format(prev)}
                {delta !== null && (
                  <span className={delta >= 0 ? 't-up' : 't-down'}> · {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%</span>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function pickXLabels(points, fmt) {
  if (!points.length) return [];
  if (points.length <= 7) return points.map((p, i) => ({ idx: i, label: fmt(p.date_start) }));
  const step = Math.ceil(points.length / 6);
  const labels = [];
  for (let i = 0; i < points.length; i += step) labels.push({ idx: i, label: fmt(points[i].date_start) });
  if (labels[labels.length - 1].idx !== points.length - 1) {
    labels.push({ idx: points.length - 1, label: fmt(points[points.length - 1].date_start) });
  }
  return labels;
}
