import { Fragment } from 'react';
import Sidebar from '@/components/Sidebar';
import ErrorScreen from '@/components/ErrorScreen';
import BigTrendChart from '@/components/BigTrendChart';
import PeriodSelector from '@/components/PeriodSelector';
import MetricTabs from '@/components/MetricTabs';
import {
  isConfigured,
  getAccountInsights,
  getCampaigns,
  getDailyInsights,
  getPlatformBreakdown,
  getDeviceBreakdown,
  getRegionBreakdown,
  getHourlyBreakdown,
  previousRangeOf,
  previousOfCustomRange,
  lastNDaysRange,
  fillDailyGaps,
  sanitizePreset,
  sanitizeCustomRange,
  presetToDays,
  daysInRange,
  sumResults,
  buildFunnel,
  costPerResultByKey,
  platformDisplayName,
  parseDateString,
  fmt,
} from '@/lib/meta';
import { sanitizeMetric, METRIC_CONFIG } from '@/lib/metrics';

export default async function RendimientoPage({ searchParams }) {
  const sp = await searchParams;
  const customRange = sanitizeCustomRange(sp?.since, sp?.until);
  const PRESET = customRange ? null : sanitizePreset(sp?.period);
  const METRIC = sanitizeMetric(sp?.metric);
  if (!isConfigured()) {
    return (
      <ErrorScreen
        title="Conectá tu cuenta de Meta"
        message="Para ver tus datos de publicidad necesitamos las credenciales de la Marketing API."
        hint={<>Completá <code>META_ACCESS_TOKEN</code> y <code>META_AD_ACCOUNT_ID</code> en <code>.env.local</code> y reiniciá <code>npm run dev</code>. Las instrucciones completas están en <code>README.md</code>.</>}
      />
    );
  }

  // Para los gráficos diarios necesitamos un timeRange explícito (preset o custom).
  // Para el resto de fetches alcanza con datePreset O timeRange.
  const currRange = customRange || lastNDaysRange(presetToDays(PRESET));
  const prevRange = customRange ? previousOfCustomRange(customRange) : previousRangeOf(PRESET);
  const periodOpts = customRange ? { timeRange: customRange } : { datePreset: PRESET };

  const settled = await Promise.allSettled([
    getAccountInsights(periodOpts),
    prevRange ? getAccountInsights({ timeRange: prevRange }) : Promise.resolve(null),
    getCampaigns(periodOpts),
    getDailyInsights({ timeRange: currRange }),
    prevRange ? getDailyInsights({ timeRange: prevRange }) : Promise.resolve([]),
    getPlatformBreakdown(periodOpts),
    getDeviceBreakdown(periodOpts),
    getRegionBreakdown(periodOpts),
    getHourlyBreakdown(periodOpts),
  ]);
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = settled;

  if (r0.status === 'rejected') {
    return (
      <ErrorScreen
        title="No pudimos conectar con Meta"
        message="La llamada a la Marketing API falló. La página no se puede cargar sin datos."
        error={r0.reason?.message}
        hint={<>Verificá que <code>META_ACCESS_TOKEN</code> y <code>META_AD_ACCOUNT_ID</code> estén bien en <code>.env.local</code>, que el token no haya expirado, y que tu cuenta tenga los permisos <code>ads_read</code> y <code>ads_management</code>.</>}
      />
    );
  }

  const insights = r0.value;
  const prevInsights = r1.status === 'fulfilled' ? r1.value : null;
  const campaigns = r2.status === 'fulfilled' ? (r2.value || []) : [];
  const dailyRaw = r3.status === 'fulfilled' ? r3.value : [];
  const dailyPrevRaw = r4.status === 'fulfilled' ? r4.value : [];
  const platformRows = r5.status === 'fulfilled' ? r5.value : null;
  const deviceRows = r6.status === 'fulfilled' ? r6.value : null;
  const regionRows = r7.status === 'fulfilled' ? r7.value : null;
  const hourlyRows = r8.status === 'fulfilled' ? r8.value : null;

  // Rellenamos días faltantes para que el gráfico siempre muestre todos los días
  const daily = fillDailyGaps(dailyRaw, currRange);
  const dailyPrev = prevRange ? fillDailyGaps(dailyPrevRaw, prevRange) : [];

  const spend = Number(insights.spend || 0);
  const reach = Number(insights.reach || 0);
  const results = sumResults(insights.actions);
  const cpr = results ? spend / results : 0;
  const spendPrev = Number(prevInsights?.spend || 0);
  const reachPrev = Number(prevInsights?.reach || 0);
  const resultsPrev = sumResults(prevInsights?.actions);
  const cprPrev = resultsPrev ? spendPrev / resultsPrev : 0;
  const dlt = (a, b) => b > 0 ? (a - b) / b : 0;

  const funnel = buildFunnel(insights);

  // Plataforma: top 5 por reach con CPR
  const platforms = (platformRows || []).map(r => ({
    name: platformDisplayName(r),
    reach: Number(r.reach || 0),
    spend: Number(r.spend || 0),
    results: sumResults(r.actions),
    publisher: r.publisher_platform,
  }));
  const totalPlatformReach = platforms.reduce((s, p) => s + p.reach, 0) || 1;
  const platformsTop = [...platforms]
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 5)
    .map(p => ({
      ...p,
      pct: Math.round((p.reach / totalPlatformReach) * 100),
      cpr: p.results ? p.spend / p.results : 0,
    }));

  // Device: dos categorías (mobile vs desktop)
  const deviceTop = costPerResultByKey(deviceRows || [], 'device_platform');
  const totalDeviceReach = deviceTop.reduce((s, d) => s + d.reach, 0) || 1;
  const mobile = deviceTop.find(d => /mobile/.test(d.key)) || deviceTop[0];
  const desktop = deviceTop.find(d => /desktop/.test(d.key)) || deviceTop[1];
  const mobilePct = mobile ? Math.round((mobile.reach / totalDeviceReach) * 100) : 0;
  const desktopPct = desktop ? Math.round((desktop.reach / totalDeviceReach) * 100) : 0;
  const mobileLen = (mobilePct / 100) * 276;
  const desktopLen = 276 - mobileLen;

  // Regiones: top 5
  const regions = (regionRows || []).map(r => ({
    name: r.region,
    reach: Number(r.reach || 0),
    results: sumResults(r.actions),
  }));
  const totalRegionReach = regions.reduce((s, r) => s + r.reach, 0) || 1;
  const regionsTop = [...regions]
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 5)
    .map(r => ({
      ...r,
      pct: Math.round((r.reach / totalRegionReach) * 100),
    }));

  // Hora del día: 24 buckets agregados desde Meta
  const hourly = parseHourlyBreakdown(hourlyRows || []);
  const hourlyChart = buildIntensityRow(hourly.map(h => h.reach));
  const bestHourInfo = pickBestWorst(hourly, 'hour');

  // Día de la semana: agregado desde la serie diaria. Lunes-primero.
  const byDow = aggregateByDayOfWeek(daily);
  const dowChart = buildIntensityRow(byDow.map(d => d.reach));
  const bestDowInfo = pickBestWorst(byDow, 'dow');

  // Sparklines reales del strip comparativo: una serie por métrica
  const sparkSpend   = daily.map(d => Number(d.spend || 0));
  const sparkReach   = daily.map(d => Number(d.reach || 0));
  const sparkResults = daily.map(d => sumResults(d.actions));
  const sparkCpr     = daily.map(d => {
    const s = Number(d.spend || 0);
    const r = sumResults(d.actions);
    return r > 0 ? s / r : 0;
  });

  return (
    <div className="app">
      <Sidebar active="rendimiento" />

      <main className="main">
        <div className="top">
          <div>
            <h1>Rendimiento</h1>
            <div className="subline">Cómo funcionó tu publicidad y dónde podés mejorar.</div>
          </div>
          <div className="top-actions">
            <PeriodSelector current={PRESET} custom={customRange} />
          </div>
        </div>

        {/* COMPARISON STRIP */}
        <div className="compare-strip">
          <CompareCell
            label="Inversión"
            now={fmt.money(spend)}
            prev={fmt.money(spendPrev)}
            delta={dlt(spend, spendPrev)}
            spark={sparkSpend}
          />
          <CompareCell
            label="Personas alcanzadas"
            now={fmt.compact(reach)}
            prev={fmt.compact(reachPrev)}
            delta={dlt(reach, reachPrev)}
            spark={sparkReach}
          />
          <CompareCell
            label="Personas interesadas"
            now={fmt.num(results)}
            prev={fmt.num(resultsPrev)}
            delta={dlt(results, resultsPrev)}
            spark={sparkResults}
          />
          <CompareCell
            label="Costo por interesado"
            now={fmt.money(cpr)}
            prev={fmt.money(cprPrev)}
            delta={dlt(cpr, cprPrev)}
            spark={sparkCpr}
            invertColor={true}
          />
        </div>

        {/* MAIN CHART */}
        <section className="section">
          <div className="card">
            <div className="sec-head" style={{marginBottom:0}}>
              <div>
                <h2 className="sec-title">Evolución en el tiempo</h2>
                <div className="sec-sub">{METRIC_CONFIG[METRIC].sub} — comparado con el período anterior.</div>
              </div>
              <MetricTabs current={METRIC} basePath="/rendimiento" searchParams={sp || {}} />
            </div>
            <BigTrendChart
              points={daily || []}
              prevPoints={dailyPrev || []}
              compareDays={customRange ? daysInRange(customRange) : presetToDays(PRESET)}
              metric={METRIC}
            />
            <div className="legend">
              <span><span className="legend-line" style={{background:'var(--green)'}} />Período actual</span>
              <span><span className="legend-line" style={{background:'var(--gray-soft)'}} />Período anterior</span>
            </div>
          </div>
        </section>

        {/* FUNNEL */}
        <section className="section">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">El recorrido de la gente</h2>
              <div className="sec-sub">Qué pasó desde que vieron tu anuncio hasta que se convirtieron en personas interesadas.</div>
            </div>
          </div>
          <div className="funnel-wrap">
            <div className="funnel-intro">
              De cada 100 personas que vieron tu anuncio, sólo unas pocas terminan dando un paso más. Acá ves dónde estás perdiendo gente y dónde estás ganando.
            </div>
            <div className="funnel-steps">
              {(funnel || []).map((s, i, arr) => {
                const next = arr[i+1];
                const conversion = next && s.count > 0 ? (next.count / s.count) : null;
                return (
                  <Fragment key={s.key}>
                    <div className="fstep" data-step={i+1}>
                      <div className="fstep-bar">
                        <div className="fstep-name">{s.name}</div>
                        <div className="fstep-count">{fmt.num(s.count)}</div>
                      </div>
                      <div className="fstep-meta">
                        {i === 0 ? '100% del total' : `${Math.round((s.count / (arr[0].count || 1)) * 100)}% del total`}
                        {i === arr.length - 1 && results > 0 && (<><br/><strong style={{color:'var(--navy)'}}>{fmt.money(cpr)} cada uno</strong></>)}
                      </div>
                    </div>
                    {conversion !== null && (
                      <div className="fstep-arrow">
                        de esas, {fmt.num(next.count)} ({Math.round(conversion * 100)}%) {dropLabel(s.key, next.key)}
                      </div>
                    )}
                  </Fragment>
                );
              })}
              {(!funnel || funnel.every(s => s.count === 0)) && (
                <div style={{padding:'40px', textAlign:'center', color:'var(--gray)', fontSize:13}}>
                  No hay datos del embudo en este período.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* CUÁNDO RINDE MÁS */}
        <section className="section">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Cuándo te ven más</h2>
              <div className="sec-sub">Distribución del alcance por hora del día y por día de la semana.</div>
            </div>
          </div>
          <div className="card">

            {/* Mejor hora del día (24 buckets) */}
            <div className="hm-block">
              <div className="hm-block-title">Por hora del día</div>
              {hourlyChart.length === 0 ? (
                <div className="hm-empty">No hay datos por hora para este período.</div>
              ) : (
                <>
                  <div className="hm-strip hm-strip-24">
                    {hourlyChart.map((cell, i) => (
                      <div
                        key={i}
                        className="hm-cell"
                        style={{'--intensity': cell.intensity}}
                        title={`${i}h–${i+1}h: ${fmt.num(cell.value)} personas`}
                      />
                    ))}
                  </div>
                  <div className="hm-strip-axis hm-strip-axis-24">
                    {[0, 6, 12, 18, 23].map(h => <span key={h} style={{gridColumn: h+1}}>{h}h</span>)}
                  </div>
                </>
              )}
            </div>

            {/* Mejor día de la semana (7 buckets) */}
            <div className="hm-block">
              <div className="hm-block-title">Por día de la semana</div>
              {dowChart.length === 0 ? (
                <div className="hm-empty">No hay datos por día para este período.</div>
              ) : (
                <>
                  <div className="hm-strip hm-strip-7">
                    {dowChart.map((cell, i) => (
                      <div
                        key={i}
                        className="hm-cell"
                        style={{'--intensity': cell.intensity}}
                        title={`${DOW_LABELS[i]}: ${fmt.num(cell.value)} personas`}
                      />
                    ))}
                  </div>
                  <div className="hm-strip-axis hm-strip-axis-7">
                    {DOW_LABELS.map(d => <span key={d}>{d}</span>)}
                  </div>
                </>
              )}
            </div>

            {(bestHourInfo || bestDowInfo) && (
              <div className="hm-callout">
                {bestHourInfo && <>Tu mejor hora es alrededor de las <strong>{bestHourInfo.bestKey}h</strong>. </>}
                {bestDowInfo && <>El mejor día es <strong>{DOW_LABELS[bestDowInfo.bestKey]}</strong>{bestDowInfo.worstKey !== bestDowInfo.bestKey && <> y el más flojo, <strong>{DOW_LABELS[bestDowInfo.worstKey]}</strong></>}.</>}
              </div>
            )}
          </div>
        </section>

        {/* BREAKDOWNS */}
        <section className="section">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Dónde y desde qué</h2>
              <div className="sec-sub">En qué redes, dispositivos y lugares se ven tus anuncios.</div>
            </div>
          </div>
          <div className="grid-3">

            <div className="card bd-card">
              <div className="bd-title">Por dónde te ven</div>
              <div className="bd-sub">Distribución del alcance por red y formato</div>
              {platformsTop.length === 0 && (
                <div style={{fontSize:12, color:'var(--gray)'}}>No hay datos de plataforma en este período.</div>
              )}
              {platformsTop.map(p => {
                const isIG = /instagram/i.test(p.publisher);
                return (
                  <div key={p.name} className="bd-row">
                    <div className="bd-row-top">
                      <span className="bd-row-name">
                        <span className="ico" style={{
                          background: isIG ? 'linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)' : '#1877F2',
                          color:'#fff',
                        }}>{isIG ? 'IG' : 'FB'}</span>
                        {p.name}
                      </span>
                      <span className="bd-row-value">{p.pct}%</span>
                    </div>
                    <div className="bd-row-bar">
                      <div className="bd-row-fill" style={{width:`${p.pct*2}%`, background: p.pct > 30 ? 'var(--green)' : p.pct > 15 ? 'var(--amber)' : 'var(--red)'}} />
                    </div>
                    <div className="bd-row-meta">{fmt.compact(p.reach)} personas {p.cpr > 0 && <>· <strong>{fmt.money(p.cpr)} por interesado</strong></>}</div>
                  </div>
                );
              })}
            </div>

            <div className="card bd-card">
              <div className="bd-title">Desde qué dispositivo</div>
              <div className="bd-sub">Distribución por tipo de dispositivo</div>
              {(!mobile && !desktop) ? (
                <div style={{fontSize:12, color:'var(--gray)'}}>No hay datos de dispositivo en este período.</div>
              ) : (
                <>
                  <div className="device-donut">
                    <div className="donut-mini">
                      <svg width="110" height="110" viewBox="0 0 110 110">
                        <circle cx="55" cy="55" r="44" fill="none" stroke="#F5F3EF" strokeWidth="16" />
                        {mobile && <circle cx="55" cy="55" r="44" fill="none" stroke="#5B8A6E" strokeWidth="16" strokeDasharray={`${mobileLen} 276`} strokeDashoffset="0" />}
                        {desktop && <circle cx="55" cy="55" r="44" fill="none" stroke="#C49B48" strokeWidth="16" strokeDasharray={`${desktopLen} 276`} strokeDashoffset={`-${mobileLen}`} />}
                      </svg>
                      <div className="donut-center">
                        <div>
                          <div className="big">{mobilePct}%</div>
                          <div className="lbl">Móvil</div>
                        </div>
                      </div>
                    </div>
                    <div className="device-stats">
                      {mobile && <div className="device-stat"><span style={{color:'var(--green)', fontWeight:600}}>● Móvil</span><span>{mobilePct}%</span></div>}
                      {desktop && <div className="device-stat"><span style={{color:'var(--amber)', fontWeight:600}}>● Computadora</span><span>{desktopPct}%</span></div>}
                      <div style={{borderTop:'1px dashed var(--gray-soft)', paddingTop:10, fontSize:11, color:'var(--gray)', lineHeight:1.4}}>
                        {mobile && <>Móvil: <strong style={{color:'var(--navy)'}}>{mobile.cpr ? fmt.money(mobile.cpr) : '—'}</strong> por interesado<br/></>}
                        {desktop && <>Compu: <strong style={{color:'var(--navy)'}}>{desktop.cpr ? fmt.money(desktop.cpr) : '—'}</strong> por interesado</>}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="card bd-card">
              <div className="bd-title">Desde dónde te ven</div>
              <div className="bd-sub">Top 5 regiones por personas alcanzadas</div>
              {regionsTop.length === 0 && (
                <div style={{fontSize:12, color:'var(--gray)'}}>No hay datos de ubicación en este período.</div>
              )}
              {regionsTop.map(r => (
                <div key={r.name} className="bd-row">
                  <div className="bd-row-top">
                    <span className="bd-row-name">{r.name}</span>
                    <span className="bd-row-value">{r.pct}%</span>
                  </div>
                  <div className="bd-row-bar">
                    <div className="bd-row-fill" style={{width:`${r.pct*2}%`, background: r.pct > 30 ? 'var(--green)' : r.pct > 10 ? 'var(--amber)' : 'var(--gray)'}} />
                  </div>
                  <div className="bd-row-meta">{fmt.compact(r.reach)} personas · {fmt.num(r.results)} interesados</div>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* CAMPAIGN TABLE */}
        <section className="section">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Campañas en detalle</h2>
              <div className="sec-sub">Vista completa con todos los números.</div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <span className="pill">Todas las campañas ▾</span>
              <span className="pill">Exportar</span>
            </div>
          </div>
          <div className="card tbl-card">
            <table className="perf">
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Estado</th>
                  <th className="right">Gasto</th>
                  <th className="right">Personas</th>
                  <th className="right">Clics</th>
                  <th className="right">Interesados</th>
                  <th className="right">Costo x interesado</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const ins = c.insights?.data?.[0] || {};
                  const cSpend = Number(ins.spend || 0);
                  const cReach = Number(ins.reach || 0);
                  const cClicks = Number(ins.clicks || 0);
                  const cResults = sumResults(ins.actions);
                  const cCpr = cResults ? cSpend / cResults : 0;
                  const status = mapStatus(c.effective_status);
                  return (
                    <tr key={c.id || c.name}>
                      <td>
                        <div className="tbl-name">
                          <div>
                            <div className="nm">{c.name}</div>
                            <div className="meta">{c.objective?.replace(/^OUTCOME_/, '').toLowerCase() || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge ${status.cls}`}><span className="dot" />{status.label}</span></td>
                      <td className="right"><span className="num">{fmt.money(cSpend)}</span></td>
                      <td className="right"><span className="num">{fmt.compact(cReach)}</span></td>
                      <td className="right"><span className="num">{fmt.num(cClicks)}</span></td>
                      <td className="right"><span className="num">{fmt.num(cResults)}</span></td>
                      <td className="right"><span className="num">{cCpr ? fmt.money(cCpr) : '—'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="foot-note">
          Datos sincronizados con Meta — caché de 5 minutos
        </div>
      </main>
    </div>
  );
}

/* ───────── components ───────── */

function CompareCell({ label, now, prev, delta, invertColor, spark }) {
  const positive = invertColor ? delta < 0 : delta > 0;
  const cls = positive ? 'up' : delta === 0 ? '' : 'down';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  const sign = delta > 0 ? '+' : '';
  const note = invertColor && delta > 0 ? ' (te cuesta más)' : '';
  const sparkPath = buildSparkPath(spark);
  return (
    <div className="compare-cell">
      <div className="compare-label">{label}</div>
      <div className="compare-row">
        <div className="compare-now">{now}</div>
        <div className="compare-prev">vs período anterior<br/><strong>{prev}</strong></div>
      </div>
      <span className={`compare-delta ${cls}`}>{arrow} {sign}{(delta*100).toFixed(1)}%{note}</span>
      <div className="spark">
        {sparkPath ? (
          <svg viewBox="0 0 100 30" preserveAspectRatio="none">
            <path fill="none" stroke={positive ? '#5B8A6E' : '#C4484A'} strokeWidth="1.5" d={sparkPath} />
          </svg>
        ) : (
          <div style={{height:30, display:'grid', placeItems:'center', fontSize:10, color:'var(--gray)'}}>—</div>
        )}
      </div>
    </div>
  );
}

function buildSparkPath(values) {
  if (!values?.length) return '';
  const w = 100, h = 30;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) {
    // Línea plana al medio
    return `M0,${h/2} L${w},${h/2}`;
  }
  const range = max - min;
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => {
    const x = i * stepX;
    // Reservamos 10% arriba y 10% abajo para que la curva no toque los bordes
    const y = h * 0.9 - ((v - min) / range) * h * 0.8;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/* ───────── helpers ───────── */

function dropLabel(fromKey, toKey) {
  // Solo describe el hecho — sin juicio de valor.
  const map = {
    'reach->clicks':   'hicieron clic',
    'clicks->visits':  'abrieron tu sitio',
    'visits->results': 'dejaron sus datos o te escribieron',
  };
  return map[`${fromKey}->${toKey}`] || '';
}

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Agrupa la serie diaria por día de la semana (lunes a domingo).
 * Usa parseo local de fechas para no tener problemas de timezone con UTC.
 */
function aggregateByDayOfWeek(daily) {
  const buckets = Array.from({ length: 7 }, (_, i) => ({ dow: i, reach: 0, spend: 0, results: 0 }));
  for (const row of daily || []) {
    const d = parseDateString(row.date_start);
    if (!d) continue;
    const jsDow = d.getDay();              // 0=Dom, 1=Lun, ...
    const idx = (jsDow + 6) % 7;           // mapeamos a Lun-primero (0=Lun, 6=Dom)
    buckets[idx].reach += Number(row.reach || 0);
    buckets[idx].spend += Number(row.spend || 0);
    buckets[idx].results += sumResults(row.actions);
  }
  return buckets;
}

/**
 * Toma un array de valores y devuelve un array de cells con intensidad 0-1
 * para colorear cada celda. Si todos los valores son 0, devuelve [].
 */
function buildIntensityRow(values) {
  const max = Math.max(...(values || []), 0);
  if (max === 0) return [];
  return values.map(v => ({ value: v, intensity: 0.05 + (v / max) * 0.9 }));
}

/**
 * Devuelve { bestKey, worstKey } del mejor y peor índice según `reach`.
 * `keyField` puede ser 'hour' o 'dow' — el índice se devuelve tal cual.
 */
function pickBestWorst(items, keyField) {
  const filled = (items || []).filter(it => Number(it.reach || 0) > 0);
  if (!filled.length) return null;
  const sorted = [...items].map((it, i) => ({ ...it, _idx: i })).sort((a, b) => Number(b.reach || 0) - Number(a.reach || 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return { bestKey: best[keyField] ?? best._idx, worstKey: worst[keyField] ?? worst._idx };
}

function mapStatus(effective) {
  switch (effective) {
    case 'LEARNING':         return { cls: 'warn', label: 'Aprendiendo' };
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ARCHIVED':         return { cls: 'off',  label: 'Pausada' };
    case 'ACTIVE':           return { cls: 'good', label: 'Bien' };
    case 'PENDING_REVIEW':   return { cls: 'warn', label: 'En revisión' };
    case 'DISAPPROVED':
    case 'WITH_ISSUES':      return { cls: 'bad',  label: 'Atención' };
    default:                 return { cls: 'off',  label: effective || '—' };
  }
}

function parseHourlyBreakdown(rows) {
  // rows: [{ hourly_stats_aggregated_by_advertiser_time_zone: '13:00:00 - 13:59:59', reach, ... }]
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, reach: 0, spend: 0, results: 0 }));
  for (const r of rows) {
    const range = r.hourly_stats_aggregated_by_advertiser_time_zone || r.hour;
    if (!range) continue;
    const h = parseInt(String(range).slice(0, 2), 10);
    if (Number.isNaN(h)) continue;
    buckets[h].reach += Number(r.reach || 0);
    buckets[h].spend += Number(r.spend || 0);
    buckets[h].results += sumResults(r.actions);
  }
  return buckets;
}

