'use client';

import { useState } from 'react';

const numFmt = new Intl.NumberFormat('es-AR');
const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

export default function TrendChart({ points }) {
  const [hover, setHover] = useState(null);

  if (!points || points.length === 0) {
    return (
      <div className="chart-wrap" style={{display:'grid', placeItems:'center', color:'var(--gray)', fontSize:13}}>
        Sin datos en el período
      </div>
    );
  }

  const W = 600, H = 240, padX = 50, padTop = 30, padBottom = 40;
  const max = Math.max(...points.map(p => p.reach), 1);
  const stepX = points.length > 1 ? (W - padX*2) / (points.length - 1) : 0;
  const yOf = (v) => padTop + (H - padTop - padBottom) * (1 - v / max);
  const xOf = (i) => padX + i * stepX;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(p.reach)}`).join(' ');
  const area = `${path} L${xOf(points.length-1)},${H-padBottom} L${xOf(0)},${H-padBottom} Z`;

  const ticks = [0, max * 0.33, max * 0.66, max].map(v => Math.round(v));
  const dayLabel = (s) => {
    const [y, m, day] = s.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    return d.toLocaleDateString('es-AR', { weekday: 'short' });
  };
  const fullLabel = (s) => {
    const [y, m, day] = s.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  return (
    <div className="chart-wrap" style={{position:'relative'}}>
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
            return <text key={i} x={padX - 8} y={y + 3} textAnchor="end">{compact.format(v)}</text>;
          })}
        </g>
        <path className="chart-area" d={area} />
        <path className="chart-line" d={path} />

        {/* Marker line cuando hay hover */}
        {hover !== null && (
          <line
            x1={xOf(hover)} y1={padTop} x2={xOf(hover)} y2={H - padBottom}
            stroke="var(--navy)" strokeWidth="1" strokeDasharray="2 3" opacity="0.3"
          />
        )}

        {/* Dots visibles */}
        {points.map((p, i) => (
          <circle
            key={`d${i}`}
            className="chart-dot"
            cx={xOf(i)}
            cy={yOf(p.reach)}
            r={hover === i ? 6 : 4}
            style={{transition:'r 0.15s'}}
          />
        ))}

        {/* Hit areas invisibles para hover */}
        {points.map((p, i) => (
          <circle
            key={`h${i}`}
            cx={xOf(i)}
            cy={yOf(p.reach)}
            r="20"
            fill="transparent"
            style={{cursor:'pointer'}}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        <g className="chart-axis">
          {points.map((p, i) => (
            <text key={i} x={xOf(i)} y={H - 14} textAnchor="middle">{dayLabel(p.date)}</text>
          ))}
        </g>
      </svg>

      {hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(xOf(hover) / W) * 100}%`,
            top: `${(yOf(points[hover].reach) / H) * 100}%`,
          }}
        >
          <div className="t-date">{fullLabel(points[hover].date)}</div>
          <div className="t-value">{numFmt.format(points[hover].reach)} <span>personas</span></div>
        </div>
      )}
    </div>
  );
}
