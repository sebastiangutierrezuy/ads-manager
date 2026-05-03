'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useRef, useState, useEffect, useTransition } from 'react';

const OPTIONS = [
  { id: 'last_7d',  label: 'Últimos 7 días' },
  { id: 'last_14d', label: 'Últimos 14 días' },
  { id: 'last_30d', label: 'Últimos 30 días' },
  { id: 'last_90d', label: 'Últimos 90 días' },
];

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const formatShort = (s) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

export default function PeriodSelector({ current = 'last_30d', custom = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef(null);

  // Inputs del rango custom — inicializados con lo que ya está en URL o defaults
  const today = new Date();
  const todayStr = ymd(today);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const [sinceInput, setSinceInput] = useState(custom?.since || ymd(weekAgo));
  const [untilInput, setUntilInput] = useState(custom?.until || todayStr);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false); setShowCustom(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') { setOpen(false); setShowCustom(false); }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const selectPreset = (id) => {
    const params = new URLSearchParams(searchParams);
    params.delete('since');
    params.delete('until');
    if (id === 'last_30d') params.delete('period');
    else params.set('period', id);
    const qs = params.toString();
    setOpen(false); setShowCustom(false);
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  const applyCustom = () => {
    if (!sinceInput || !untilInput || sinceInput > untilInput) return;
    const params = new URLSearchParams(searchParams);
    params.delete('period');
    params.set('since', sinceInput);
    params.set('until', untilInput);
    setOpen(false); setShowCustom(false);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  let triggerLabel;
  if (custom) {
    triggerLabel = `${formatShort(custom.since)} – ${formatShort(custom.until)}`;
  } else {
    triggerLabel = OPTIONS.find(o => o.id === current)?.label || 'Últimos 30 días';
  }

  const customValid = sinceInput && untilInput && sinceInput <= untilInput;

  return (
    <div className="period-dropdown" ref={ref}>
      <button
        className={`pill period-trigger ${pending ? 'pending' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {triggerLabel} <span className="pill-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="period-menu" role="listbox">
          {OPTIONS.map(opt => {
            const active = !custom && opt.id === current;
            return (
              <button
                key={opt.id}
                className={`period-opt ${active ? 'active' : ''}`}
                onClick={() => selectPreset(opt.id)}
                role="option"
                aria-selected={active}
              >
                {opt.label}
                {active && <span className="period-check">✓</span>}
              </button>
            );
          })}

          {!showCustom ? (
            <button
              className={`period-opt ${custom ? 'active' : ''}`}
              onClick={() => setShowCustom(true)}
              role="option"
              aria-selected={!!custom}
            >
              <span>Personalizada</span>
              {custom ? <span className="period-check">✓</span> : <span className="period-arrow">▸</span>}
            </button>
          ) : (
            <div className="period-custom">
              <div className="period-custom-row">
                <label>Desde</label>
                <input
                  type="date"
                  value={sinceInput}
                  max={untilInput || todayStr}
                  onChange={(e) => setSinceInput(e.target.value)}
                />
              </div>
              <div className="period-custom-row">
                <label>Hasta</label>
                <input
                  type="date"
                  value={untilInput}
                  min={sinceInput}
                  max={todayStr}
                  onChange={(e) => setUntilInput(e.target.value)}
                />
              </div>
              <div className="period-custom-actions">
                <button
                  className="period-custom-cancel"
                  onClick={() => setShowCustom(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="period-custom-apply"
                  onClick={applyCustom}
                  disabled={!customValid}
                  type="button"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
