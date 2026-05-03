import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import ErrorScreen from '@/components/ErrorScreen';
import PeriodSelector from '@/components/PeriodSelector';
import BigTrendChart from '@/components/BigTrendChart';
import MetricTabs from '@/components/MetricTabs';
import VideoRetentionChart from '@/components/VideoRetentionChart';
import {
  isConfigured,
  getAd,
  getAccountInsights,
  getAdDailyInsights,
  getAdAgeBreakdown,
  getAdPlatformBreakdown,
  getAdDeviceBreakdown,
  getAdVideoRetention,
  buildVideoCheckpoints,
  lastNDaysRange,
  fillDailyGaps,
  previousRangeOf,
  previousOfCustomRange,
  presetToDays,
  daysInRange,
  sanitizePreset,
  sanitizeCustomRange,
  sumResults,
  topByReach,
  costPerResultByKey,
  platformDisplayName,
  pickBestAdImage,
  fmt,
} from '@/lib/meta';
import { sanitizeMetric, METRIC_CONFIG } from '@/lib/metrics';

const formatShort = (s) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

export default async function AdDetailPage({ params, searchParams }) {
  const { id: adId } = await params;
  const sp = await searchParams;
  const customRange = sanitizeCustomRange(sp?.since, sp?.until);
  const PRESET = customRange ? null : sanitizePreset(sp?.period);
  const METRIC = sanitizeMetric(sp?.metric);

  if (!isConfigured()) {
    return (
      <ErrorScreen
        title="Conectá tu cuenta de Meta"
        message="Para ver datos del anuncio necesitamos las credenciales de la Marketing API."
        hint={<>Completá <code>META_ACCESS_TOKEN</code> en <code>.env.local</code>.</>}
      />
    );
  }

  const periodOpts = customRange ? { timeRange: customRange } : { datePreset: PRESET };
  const currRange = customRange || lastNDaysRange(presetToDays(PRESET));
  const prevRange = customRange ? previousOfCustomRange(customRange) : previousRangeOf(PRESET);

  const settled = await Promise.allSettled([
    getAd(adId, periodOpts),
    getAdDailyInsights(adId, { timeRange: currRange }),
    prevRange ? getAdDailyInsights(adId, { timeRange: prevRange }) : Promise.resolve([]),
    getAdAgeBreakdown(adId, periodOpts),
    getAdPlatformBreakdown(adId, periodOpts),
    getAdDeviceBreakdown(adId, periodOpts),
    getAccountInsights(periodOpts),       // baseline para colorear KPIs
    getAdVideoRetention(adId, periodOpts), // retención de video (null si no es video)
  ]);
  const [r0, r1, r2, r3, r4, r5, r6, r7] = settled;

  if (r0.status === 'rejected') {
    return (
      <ErrorScreen
        title="No pudimos traer este anuncio"
        message="La llamada a la Marketing API falló. Puede ser un ID inválido o un permiso faltante."
        error={r0.reason?.message}
        hint={<>Volvé a <Link href="/anuncios">la lista de anuncios</Link>.</>}
      />
    );
  }

  const ad = r0.value;
  const insights = ad.insights || {};
  const dailyRaw = r1.status === 'fulfilled' ? r1.value : [];
  const dailyPrevRaw = r2.status === 'fulfilled' ? r2.value : [];
  const ageRows = r3.status === 'fulfilled' ? r3.value : null;
  const platformRows = r4.status === 'fulfilled' ? r4.value : null;
  const deviceRows = r5.status === 'fulfilled' ? r5.value : null;
  const acctIns = r6.status === 'fulfilled' ? r6.value : null;
  const videoIns = r7.status === 'fulfilled' ? r7.value : null;
  const checkpoints = buildVideoCheckpoints(videoIns);

  const daily = fillDailyGaps(dailyRaw, currRange);
  const dailyPrev = prevRange ? fillDailyGaps(dailyPrevRaw, prevRange) : [];

  const spend = Number(insights.spend || 0);
  const reach = Number(insights.reach || 0);
  const impressions = Number(insights.impressions || 0);
  const clicks = Number(insights.clicks || 0);
  const frequency = Number(insights.frequency || 0);
  const ctr = Number(insights.ctr || 0);
  const cpc = Number(insights.cpc || 0);
  const cpm = Number(insights.cpm || 0);
  const results = sumResults(insights.actions);
  const cpr = results > 0 ? spend / results : 0;

  // Baselines de la cuenta para el mismo período → comparamos el ad contra
  // el promedio de tu cuenta (genérico, no asume vertical/geo).
  const acctReach   = Number(acctIns?.reach   || 0);
  const acctClicks  = Number(acctIns?.clicks  || 0);
  const acctSpend   = Number(acctIns?.spend   || 0);
  const acctResults = sumResults(acctIns?.actions);
  const acctCtr = acctReach > 0 ? (acctClicks / acctReach) * 100 : 0;
  const acctCpr = acctResults > 0 ? acctSpend / acctResults : 0;

  const ctrPct = Number(ctr) || 0;
  const ctrStatus = compareStatus(ctrPct, acctCtr, { higherIsBetter: true });
  const cprStatus = compareStatus(cpr,    acctCpr, { higherIsBetter: false });
  const freqStatus = freqRule(frequency);

  const ctrTooltip = baselineTooltip(ctrPct, acctCtr, '%', 'CTR');
  const cprTooltip = baselineTooltip(cpr, acctCpr, '$', 'Costo por interesado');
  const freqTooltip = freqTooltipText(frequency);

  const status = mapAdStatus(ad.effective_status);
  const kindLabel = creativeKindLabel(ad.creative);
  const thumb = pickBestAdImage(ad.creative);
  const igLink = ad.creative?.instagram_permalink_url;
  const createdDate = ad.created_time
    ? new Date(ad.created_time).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  // Audiencia por edad
  const ageTop = topByReach(ageRows || [], 'age', 6);
  const totalReachAge = ageTop.reduce((s, e) => s + e.value, 0) || 1;

  // Plataforma top
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

  // Device
  const deviceTop = costPerResultByKey(deviceRows || [], 'device_platform');
  const totalDeviceReach = deviceTop.reduce((s, d) => s + d.reach, 0) || 1;
  const mobile = deviceTop.find(d => /mobile/.test(d.key)) || null;
  const desktop = deviceTop.find(d => /desktop/.test(d.key)) || null;
  const mobilePct = mobile ? Math.round((mobile.reach / totalDeviceReach) * 100) : 0;
  const desktopPct = desktop ? Math.round((desktop.reach / totalDeviceReach) * 100) : 0;

  // Backlink al listado preservando period
  const backQs = new URLSearchParams();
  for (const k of ['period', 'since', 'until']) {
    if (sp?.[k]) backQs.set(k, sp[k]);
  }
  const backHref = backQs.toString() ? `/anuncios?${backQs}` : '/anuncios';

  return (
    <div className="app">
      <Sidebar active="anuncios" />

      <main className="main">
        {/* Breadcrumb / back */}
        <div className="ad-back">
          <Link href={backHref} className="ad-back-link">← Volver a anuncios</Link>
        </div>

        {/* TOP */}
        <div className="top">
          <div>
            <h1 className="ad-detail-title">{ad.name || 'Sin nombre'}</h1>
            <div className="subline" style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
              <span className={`badge ${status.cls === 'good' ? 'good' : status.cls === 'warn' ? 'warn' : status.cls === 'bad' ? 'bad' : 'off'}`}>
                <span className="dot" />{status.label}
              </span>
              <span>{kindLabel}</span>
              {createdDate && <span>· Creado el {createdDate}</span>}
              {igLink && <a href={igLink} target="_blank" rel="noreferrer" className="ad-ig-link">Ver en Instagram ↗</a>}
            </div>
          </div>
          <div className="top-actions">
            <PeriodSelector current={PRESET} custom={customRange} />
          </div>
        </div>

        {/* Hero card */}
        <div className="ad-hero">
          <div className={`ad-hero-thumb ${thumb ? '' : 'placeholder'}`} style={thumb ? {backgroundImage:`url(${thumb})`} : undefined}>
            {!thumb && <span className="ad-thumb-icon">{kindLabel}</span>}
          </div>
          <div className="ad-hero-stats">
            <KpiSmall label="Inversión" value={fmt.money(spend)} />
            <KpiSmall label="Personas alcanzadas" value={fmt.compact(reach)} />
            <KpiSmall label="Impresiones" value={fmt.compact(impressions)} />
            <KpiSmall
              label="Frecuencia"
              value={frequency.toFixed(1)}
              hint="Veces que cada persona vio el anuncio"
              status={freqStatus}
              statusHint={freqTooltip}
            />
            <KpiSmall label="Clics" value={fmt.num(clicks)} />
            <KpiSmall
              label="CTR"
              value={ctrPct.toFixed(2) + '%'}
              hint="% de personas que clickearon de las que vieron"
              status={ctrStatus}
              statusHint={ctrTooltip}
            />
            <KpiSmall label="Personas interesadas" value={fmt.num(results)} />
            <KpiSmall
              label="Costo por interesado"
              value={cpr ? fmt.money(cpr) : '—'}
              status={cpr ? cprStatus : null}
              statusHint={cpr ? cprTooltip : null}
            />
          </div>
        </div>

        {/* Trend chart */}
        <section className="section">
          <div className="card">
            <div className="sec-head" style={{marginBottom:0}}>
              <div>
                <h2 className="sec-title">Evolución en el tiempo</h2>
                <div className="sec-sub">{METRIC_CONFIG[METRIC].sub} — comparado con el período anterior.</div>
              </div>
              <MetricTabs current={METRIC} basePath={`/anuncios/${adId}`} searchParams={sp || {}} />
            </div>
            <BigTrendChart
              points={daily}
              prevPoints={dailyPrev}
              compareDays={customRange ? daysInRange(customRange) : presetToDays(PRESET)}
              metric={METRIC}
            />
            <div className="legend">
              <span><span className="legend-line" style={{background:'var(--green)'}} />Período actual</span>
              <span><span className="legend-line" style={{background:'var(--gray-soft)'}} />Período anterior</span>
            </div>
          </div>
        </section>

        {/* Retención de video — solo aparece si es video y tiene datos */}
        {checkpoints && (
          <section className="section">
            <div className="sec-head">
              <div>
                <h2 className="sec-title">Cuánto del video ven</h2>
                <div className="sec-sub">Cuántas personas siguen mirando a medida que el video avanza.</div>
              </div>
            </div>
            <div className="card">
              <VideoRetentionChart checkpoints={checkpoints} />
              <div className="retention-summary">
                <div>
                  <div className="lbl">Empezaron a verlo</div>
                  <div className="val">{fmt.num(checkpoints[0].viewers)}</div>
                </div>
                <div>
                  <div className="lbl">Llegaron a la mitad</div>
                  <div className="val">
                    {fmt.num(checkpoints[2].viewers)}
                    {checkpoints[0].viewers > 0 && (
                      <span> ({Math.round(checkpoints[2].viewers / checkpoints[0].viewers * 100)}%)</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="lbl">Vieron hasta el final</div>
                  <div className="val">
                    {fmt.num(checkpoints[5].viewers)}
                    {checkpoints[0].viewers > 0 && (
                      <span> ({Math.round(checkpoints[5].viewers / checkpoints[0].viewers * 100)}%)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Audiencia + plataforma + dispositivo */}
        <section className="section">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Quién está viendo este anuncio</h2>
              <div className="sec-sub">Distribución de las personas alcanzadas.</div>
            </div>
          </div>
          <div className="grid-3">

            {/* Edad */}
            <div className="card bd-card">
              <div className="bd-title">Por edad</div>
              <div className="bd-sub">Top grupos etarios</div>
              {ageTop.length === 0 ? (
                <div style={{fontSize:12, color:'var(--gray)'}}>No hay datos suficientes (umbral de privacidad de Meta).</div>
              ) : ageTop.map((b, i) => {
                const pct = Math.round((b.value / totalReachAge) * 100);
                const color = ['var(--green)','var(--amber)','var(--navy)','var(--gray)','var(--gray-soft)','var(--gray-soft)'][i] || 'var(--gray)';
                return (
                  <div key={b.key} className="bd-row">
                    <div className="bd-row-top">
                      <span className="bd-row-name">{b.key} años</span>
                      <span className="bd-row-value">{pct}%</span>
                    </div>
                    <div className="bd-row-bar"><div className="bd-row-fill" style={{width:`${Math.max(pct, 2)}%`, background:color}} /></div>
                    <div className="bd-row-meta">{fmt.compact(b.value)} personas</div>
                  </div>
                );
              })}
            </div>

            {/* Plataforma */}
            <div className="card bd-card">
              <div className="bd-title">Por dónde te ven</div>
              <div className="bd-sub">Distribución por red y formato</div>
              {platformsTop.length === 0 ? (
                <div style={{fontSize:12, color:'var(--gray)'}}>No hay datos por plataforma.</div>
              ) : platformsTop.map(p => {
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
                    <div className="bd-row-bar"><div className="bd-row-fill" style={{width:`${Math.max(p.pct, 2)*2}%`, background: p.pct > 30 ? 'var(--green)' : p.pct > 15 ? 'var(--amber)' : 'var(--gray)'}} /></div>
                    <div className="bd-row-meta">{fmt.compact(p.reach)} personas{p.cpr > 0 && <> · <strong>{fmt.money(p.cpr)} por interesado</strong></>}</div>
                  </div>
                );
              })}
            </div>

            {/* Dispositivo */}
            <div className="card bd-card">
              <div className="bd-title">Desde qué dispositivo</div>
              <div className="bd-sub">Distribución por tipo de dispositivo</div>
              {(!mobile && !desktop) ? (
                <div style={{fontSize:12, color:'var(--gray)'}}>No hay datos por dispositivo.</div>
              ) : (
                <>
                  <div className="bd-row">
                    <div className="bd-row-top">
                      <span className="bd-row-name">Móvil</span>
                      <span className="bd-row-value">{mobilePct}%</span>
                    </div>
                    <div className="bd-row-bar"><div className="bd-row-fill" style={{width:`${mobilePct}%`, background:'var(--green)'}} /></div>
                    {mobile && <div className="bd-row-meta">{fmt.compact(mobile.reach)} personas{mobile.cpr > 0 && <> · <strong>{fmt.money(mobile.cpr)} por interesado</strong></>}</div>}
                  </div>
                  {desktop && (
                    <div className="bd-row">
                      <div className="bd-row-top">
                        <span className="bd-row-name">Computadora</span>
                        <span className="bd-row-value">{desktopPct}%</span>
                      </div>
                      <div className="bd-row-bar"><div className="bd-row-fill" style={{width:`${desktopPct}%`, background:'var(--amber)'}} /></div>
                      <div className="bd-row-meta">{fmt.compact(desktop.reach)} personas{desktop.cpr > 0 && <> · <strong>{fmt.money(desktop.cpr)} por interesado</strong></>}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <div className="foot-note">
          Datos sincronizados con Meta — caché de 5 minutos
        </div>
      </main>
    </div>
  );
}

function KpiSmall({ label, value, hint, status, statusHint }) {
  const tip = [hint, statusHint].filter(Boolean).join('\n\n');
  return (
    <div className={`ad-kpi ${status ? `ad-kpi-${status}` : ''}`}>
      <div className="ad-kpi-label">
        {label}
        {tip && (
          <span className="help" data-tooltip={tip} tabIndex={0} role="button" aria-label={tip}>?</span>
        )}
      </div>
      <div className="ad-kpi-value">
        {value}
        {status && <span className={`ad-kpi-dot ${status}`} aria-hidden="true" />}
      </div>
    </div>
  );
}

/**
 * Compara un valor contra un baseline.
 *  higherIsBetter=true:  >= 1.3× → good, <= 0.8× → bad, en medio → warn
 *  higherIsBetter=false: <= 0.8× → good, >= 1.3× → bad, en medio → warn
 * Si no hay baseline o el valor es 0 → null (sin color).
 */
function compareStatus(value, baseline, { higherIsBetter = true } = {}) {
  if (!baseline || !value) return null;
  const ratio = value / baseline;
  if (higherIsBetter) {
    if (ratio >= 1.3) return 'good';
    if (ratio <= 0.8) return 'bad';
  } else {
    if (ratio <= 0.8) return 'good';
    if (ratio >= 1.3) return 'bad';
  }
  return 'warn';
}

/**
 * Reglas estáticas para frecuencia (esta sí es razonablemente universal).
 * <3 saludable, 3-5 a vigilar, >5 fatiga creativa.
 */
function freqRule(freq) {
  if (!freq) return null;
  if (freq < 3) return 'good';
  if (freq < 5) return 'warn';
  return 'bad';
}

/** Texto del tooltip que explica de dónde sale el color. */
function baselineTooltip(value, baseline, prefix, label) {
  if (!baseline) return `Sin baseline de cuenta para comparar.`;
  const v = formatVal(value, prefix);
  const b = formatVal(baseline, prefix);
  const diff = ((value - baseline) / baseline) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${label}: ${v} · Promedio de la cuenta: ${b} (${sign}${diff.toFixed(0)}%)`;
}

function freqTooltipText(freq) {
  if (!freq) return null;
  if (freq < 3) return `Frecuencia ${freq.toFixed(1)} — saludable (cada persona vio el ad menos de 3 veces).`;
  if (freq < 5) return `Frecuencia ${freq.toFixed(1)} — a vigilar (cerca del umbral de fatiga creativa).`;
  return `Frecuencia ${freq.toFixed(1)} — alta (fatiga creativa probable, conviene rotar el creativo).`;
}

function formatVal(v, prefix) {
  if (prefix === '%') return `${v.toFixed(2)}%`;
  if (prefix === '$') return `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(v))}`;
  return String(v);
}

function mapAdStatus(s) {
  switch (s) {
    case 'ACTIVE':         return { cls: 'good', label: 'Activo' };
    case 'LEARNING':       return { cls: 'warn', label: 'Aprendiendo' };
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':   return { cls: 'paused', label: 'Pausado' };
    case 'ARCHIVED':       return { cls: 'paused', label: 'Archivado' };
    case 'PENDING_REVIEW': return { cls: 'warn', label: 'En revisión' };
    case 'DISAPPROVED':
    case 'WITH_ISSUES':    return { cls: 'bad',  label: 'Atención' };
    default:               return { cls: 'paused', label: s || '—' };
  }
}

function creativeKindLabel(creative) {
  const t = creative?.object_type || '';
  if (/VIDEO/i.test(t)) return 'Video';
  if (/CAROUSEL/i.test(t)) return 'Carrusel';
  if (/PHOTO|IMAGE|SHARE/i.test(t)) return 'Foto';
  return 'Anuncio';
}
