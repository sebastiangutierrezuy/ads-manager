'use client';

import { useState } from 'react';

const numFmt = new Intl.NumberFormat('es-AR');

export default function VideoRetentionChart({ checkpoints }) {
  const [hover, setHover] = useState(null);

  if (!checkpoints?.length) {
    return (
      <div className="chart-wrap" style={{display:'grid', placeItems:'center', color:'var(--gray)', fontSize:13}}>
        Sin datos de retención de video
      </div>
    );
  }

  const W = 600, H = 240, padX = 50, padTop = 30, padBottom = 50;
  const baseline = checkpoints[0]?.viewers || 1;
  const xOf = (i) => padX + (i / (checkpoints.length - 1)) * (W - padX*2);
  const yOf = (v) => padTop + (1 - v / baseline) * (H - padTop - padBottom);

  const path = checkpoints.map((c, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(c.viewers)}`).join(' ');
  const area = `${path} L${xOf(checkpoints.length-1)},${H-padBottom} L${xOf(0)},${H-padBottom} Z`;

  return (
    <div className="chart-wrap" style={{position:'relative'}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <g stroke="#E6E2D8" strokeWidth="1">
          {[0, 1, 2, 3, 4].map(i => {
            const y = padTop + (1 - i / 4) * (H - padTop - padBottom);
            return <line key={i} x1={padX} y1={y} x2={W - 10} y2={y} />;
          })}
        </g>
        <g className="chart-axis">
          {[0, 25, 50, 75, 100].map((p, i) => {
            const y = padTop + (1 - i / 4) * (H - padTop - padBottom);
            return <text key={p} x={padX - 8} y={y + 3} textAnchor="end">{p}%</text>;
          })}
        </g>

        {hover !== null && (
          <line
            x1={xOf(hover)} y1={padTop} x2={xOf(hover)} y2={H - padBottom}
            stroke="var(--navy)" strokeWidth="1" strokeDasharray="2 3" opacity="0.3"
          />
        )}

        <path className="chart-area" d={area} />
        <path className="chart-line" d={path} />

        {checkpoints.map((c, i) => (
          <circle
            key={`d${i}`}
            className="chart-dot"
            cx={xOf(i)}
            cy={yOf(c.viewers)}
            r={hover === i ? 6 : 4}
            style={{transition:'r 0.15s'}}
          />
        ))}

        {checkpoints.map((c, i) => (
          <circle
            key={`h${i}`}
            cx={xOf(i)}
            cy={yOf(c.viewers)}
            r="22"
            fill="transparent"
            style={{cursor:'pointer'}}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        <g className="chart-axis">
          {checkpoints.map((c, i) => (
            <text key={i} x={xOf(i)} y={H - 14} textAnchor="middle">{c.label}</text>
          ))}
        </g>
      </svg>

      {hover !== null && (() => {
        const c = checkpoints[hover];
        const pct = baseline > 0 ? (c.viewers / baseline) * 100 : 0;
        const dropFromPrev = hover > 0
          ? checkpoints[hover - 1].viewers - c.viewers
          : 0;
        const dropPctFromPrev = hover > 0 && checkpoints[hover - 1].viewers > 0
          ? (dropFromPrev / checkpoints[hover - 1].viewers) * 100
          : 0;
        return (
          <div
            className="chart-tooltip"
            style={{
              left: `${(xOf(hover) / W) * 100}%`,
              top: `${(yOf(c.viewers) / H) * 100}%`,
            }}
          >
            <div className="t-date">
              {hover === 0 ? 'Empezaron a ver' : `Llegaron al ${c.label} del video`}
            </div>
            <div className="t-value">{numFmt.format(c.viewers)} <span>personas</span></div>
            {hover > 0 && (
              <div className="t-prev">
                {pct.toFixed(0)}% siguen mirando
                {dropFromPrev > 0 && (
                  <span> · cayeron {numFmt.format(dropFromPrev)} ({dropPctFromPrev.toFixed(0)}%)</span>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
