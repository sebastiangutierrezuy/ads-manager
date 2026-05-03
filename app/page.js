import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import ErrorScreen from '@/components/ErrorScreen';
import TrendChart from '@/components/TrendChart';
import PeriodSelector from '@/components/PeriodSelector';
import {
  isConfigured,
  getAccountInsights,
  getCampaigns,
  getDailyInsights,
  getAgeBreakdown,
  getGenderBreakdown,
  getRegionBreakdown,
  getTopAds,
  lastNDaysRange,
  fillDailyGaps,
  sanitizePreset,
  sanitizeCustomRange,
  previousRangeOf,
  previousOfCustomRange,
  sumResults,
  topByReach,
  pickBestAdImage,
  fmt,
  humanLabel,
} from '@/lib/meta';

const PERIOD_LABELS = {
  last_7d:  'los últimos 7 días',
  last_14d: 'los últimos 14 días',
  last_30d: 'los últimos 30 días',
  last_90d: 'los últimos 90 días',
};

const formatShort = (s) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

export default async function HomePage({ searchParams }) {
  const sp = await searchParams;
  const customRange = sanitizeCustomRange(sp?.since, sp?.until);
  const PRESET = customRange ? null : sanitizePreset(sp?.period);
  const periodLabel = customRange
    ? `del ${formatShort(customRange.since)} al ${formatShort(customRange.until)}`
    : PERIOD_LABELS[PRESET];

  // Opciones para fetches: cualquiera de los dos modos
  const periodOpts = customRange ? { timeRange: customRange } : { datePreset: PRESET };
  const prevRange = customRange ? previousOfCustomRange(customRange) : previousRangeOf(PRESET);
  // Gate 1: sin credenciales, no entra
  if (!isConfigured()) {
    return (
      <ErrorScreen
        title="Conectá tu cuenta de Meta"
        message="Para ver tus datos de publicidad necesitamos las credenciales de la Marketing API."
        hint={<>Completá <code>META_ACCESS_TOKEN</code> y <code>META_AD_ACCOUNT_ID</code> en <code>.env.local</code> y reiniciá <code>npm run dev</code>. Las instrucciones completas están en <code>README.md</code>.</>}
      />
    );
  }

  // Rango explícito de los últimos 7 días para el gráfico de tendencia
  const week = lastNDaysRange(7);

  // Disparamos todas las llamadas en paralelo
  const settled = await Promise.allSettled([
    getAccountInsights(periodOpts),
    prevRange ? getAccountInsights({ timeRange: prevRange }) : Promise.resolve(null),
    getCampaigns(periodOpts),
    getDailyInsights({ timeRange: week }),
    getAgeBreakdown(periodOpts),
    getGenderBreakdown(periodOpts),
    getRegionBreakdown(periodOpts),
    getTopAds({ ...periodOpts, limit: 3 }),
  ]);
  const [r0, r1, r2, r3, r4, r5, r6, r7] = settled;

  // Gate 2: si falla el fetch principal (account insights), bloqueamos
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

  // Datos: el principal SI o SI tiene que estar; el resto puede ser null y la sección muestra "sin datos"
  const insights = r0.value;
  const prevInsights = r1.status === 'fulfilled' ? r1.value : null;
  const campaigns = r2.status === 'fulfilled' ? (r2.value || []) : [];
  const daily = r3.status === 'fulfilled' ? r3.value : null;
  const ageRows = r4.status === 'fulfilled' ? r4.value : null;
  const genderRows = r5.status === 'fulfilled' ? r5.value : null;
  const regionRows = r6.status === 'fulfilled' ? r6.value : null;
  const topAds = r7.status === 'fulfilled' ? r7.value : null;

  // Métricas current
  const spend = Number(insights.spend || 0);
  const reach = Number(insights.reach || 0);
  const clicks = Number(insights.clicks || 0);
  const results = sumResults(insights.actions);
  const ctrPct = reach ? (clicks / reach) * 100 : 0;

  // Métricas previas + deltas
  const spendPrev = Number(prevInsights?.spend || 0);
  const reachPrev = Number(prevInsights?.reach || 0);
  const clicksPrev = Number(prevInsights?.clicks || 0);
  const resultsPrev = sumResults(prevInsights?.actions);
  const dlt = (a, b) => b > 0 ? (a - b) / b : 0;
  const dSpend = dlt(spend, spendPrev);
  const dReach = dlt(reach, reachPrev);
  const dClicks = dlt(clicks, clicksPrev);
  const dResults = dlt(results, resultsPrev);

  // Audiencia: top 4 grupos de edad por reach
  const ageTop = topByReach(ageRows || [], 'age', 4);
  const ageColors = ['var(--green)', 'var(--amber)', 'var(--navy)', 'var(--gray)'];

  // Audiencia donut → datos para arcos
  const totalReachAge = ageTop.reduce((s, e) => s + e.value, 0) || 1;
  const arcs = ageTop.reduce((acc, entry, i) => {
    const len = (entry.value / totalReachAge) * 327;
    const offset = i === 0 ? 0 : -acc.cumLen;
    acc.arcs.push({ len, offset, color: ageColors[i] || 'var(--gray)' });
    acc.cumLen += len;
    return acc;
  }, { arcs: [], cumLen: 0 }).arcs;

  // Audiencia: género dominante + top regiones
  const genders = topByReach(genderRows || [], 'gender', 3);
  const topGender = genders[0];
  const totalReachGender = genders.reduce((s, e) => s + e.value, 0) || 1;
  const topGenderPct = topGender ? Math.round((topGender.value / totalReachGender) * 100) : 0;

  const regions = topByReach(regionRows || [], 'region', 2);
  const audienceCaption = buildAudienceCaption(ageTop, topGender, topGenderPct, regions);

  // Trend chart points: rellenamos los días sin datos con ceros para que
  // siempre se vean los 7 días, no solo los que tuvieron actividad.
  const trendPoints = fillDailyGaps(daily, week).map(d => ({
    date: d.date_start,
    reach: d.reach,
  }));

  return (
    <div className="app">
      <Sidebar active="home" />

      <main className="main">
        {/* TOP */}
        <div className="top">
          <div>
            <h1>{greeting()}.</h1>
            <div className="greeting">
              Hoy es <strong>{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.
            </div>
          </div>
          <div className="top-actions">
            <PeriodSelector current={PRESET} custom={customRange} />
          </div>
        </div>

        {/* STATS */}
        <div className="stats">
          <KpiCard
            label="Cuánto gastaste"
            help={`Total invertido en ${periodLabel}, sin IVA`}
            value={fmt.money(spend)}
            delta={dSpend}
            invertColor={false}
            explain={spendExplain(spend, dSpend)}
          />
          <KpiCard
            label="Personas alcanzadas"
            help="Personas únicas que vieron al menos una vez tu publicidad"
            value={fmt.compact(reach)}
            delta={dReach}
            explain={`${fmt.num(reach)} personas distintas vieron alguno de tus anuncios en ${periodLabel}.`}
          />
          <KpiCard
            label="Clics en tus anuncios"
            help="Personas que tocaron tu anuncio para saber más"
            value={fmt.num(clicks)}
            delta={dClicks}
            explain={`De cada 100 personas que vieron, ${ctrPct.toFixed(1)} quisieron saber más.`}
          />
          <KpiCard
            label="Personas interesadas"
            help="Mensajes, formularios completos o llamados que generó tu publicidad"
            value={fmt.num(results)}
            delta={dResults}
            explain={`${fmt.num(results)} personas dieron un paso más (te escribieron, dejaron datos o llamaron).`}
          />
        </div>

        {/* CHART + AUDIENCE */}
        <div className="grid-2">

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Cómo viene la semana</div>
                <div className="card-sub">Personas alcanzadas por día — últimos 7 días</div>
              </div>
            </div>
            <TrendChart points={trendPoints} />
            <div className="legend">
              <span><span className="legend-dot" style={{background:'var(--green)'}} />Personas alcanzadas por día</span>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Quién está viendo tus anuncios</div>
                <div className="card-sub">Distribución por edad — {periodLabel}</div>
              </div>
            </div>
            <div className="audience-row" style={{marginTop:14}}>
              <div className="donut-wrap">
                <svg width="130" height="130" viewBox="0 0 130 130">
                  <circle cx="65" cy="65" r="52" fill="none" stroke="#F5F3EF" strokeWidth="18" />
                  {arcs.map((a, i) => (
                    <circle key={i} cx="65" cy="65" r="52" fill="none" stroke={a.color} strokeWidth="18"
                      strokeDasharray={`${a.len} 327`} strokeDashoffset={a.offset} />
                  ))}
                </svg>
                <div className="donut-label">
                  <div>
                    <div className="big">{fmt.compact(reach)}</div>
                    <div className="small">Personas</div>
                  </div>
                </div>
              </div>
              <div className="breakdown-list">
                {ageTop.length === 0 && (
                  <div style={{fontSize:12, color:'var(--gray)'}}>No hay datos de audiencia para este período.</div>
                )}
                {ageTop.map((b, i) => {
                  const pct = Math.round((b.value / totalReachAge) * 100);
                  return (
                    <div key={b.key} className="breakdown-row">
                      <div className="breakdown-top"><span>{ageLabel(b.key)}</span><span>{pct}%</span></div>
                      <div className="breakdown-bar"><div className="breakdown-fill" style={{width:`${pct}%`, background:ageColors[i]}} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
            {audienceCaption && (
              <div style={{borderTop:'1px dashed var(--gray-soft)', paddingTop:14, fontSize:12, color:'var(--gray)', lineHeight:1.5}}>
                {audienceCaption}
              </div>
            )}
          </div>

        </div>

        {/* CAMPAIGNS */}
        <section className="section">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Tus campañas activas</h2>
              <div className="sec-sub">Cada una es una "estrategia" de publicidad que estás corriendo en este momento.</div>
            </div>
            <a className="sec-link">Ver todas →</a>
          </div>

          <div className="campaigns">
            {sortByStatus(campaigns).slice(0, 4).map(c => {
              const ins = c.insights?.data?.[0] || {};
              const cSpend = Number(ins.spend || 0);
              const cReach = Number(ins.reach || 0);
              const cResults = sumResults(ins.actions);
              const health = c._health || computeHealth(c, cSpend, cResults);
              const platform = c._platform || objectiveToPlatform(c.objective);
              const budgetTotal = c._budget_total || Number(c.daily_budget || 0) * 30;
              const budgetUsed = c._budget_used ?? (budgetTotal ? cSpend / budgetTotal : 0);
              const msg = c._msg || defaultCampaignMsg(c, cResults, cSpend);

              return (
                <div key={c.id || c.name} className="camp">
                  <div className="camp-top">
                    <div>
                      <div className="camp-title">{c.name}</div>
                      <div className="camp-platform">{platform}</div>
                    </div>
                    <span className={`health ${health}`}>
                      <span className="health-dot" />
                      {healthLabel(health)}
                    </span>
                  </div>

                  <div className="camp-mini-stats">
                    <div className="mini-stat"><div className="lbl">Gastado</div><div className="val">{fmt.money(cSpend)}</div></div>
                    <div className="mini-stat"><div className="lbl">Personas</div><div className="val">{fmt.compact(cReach)}</div></div>
                    <div className="mini-stat"><div className="lbl">Interesados</div><div className="val">{fmt.num(cResults)}</div></div>
                  </div>

                  {budgetTotal > 0 && (
                    <div className="camp-progress">
                      <div className="progress-row">
                        <span>Presupuesto del mes</span>
                        <span>{fmt.money(cSpend)} de {fmt.money(budgetTotal)}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{
                          width:`${Math.min(100, budgetUsed*100)}%`,
                          background: health === 'bad' ? 'var(--red)' : health === 'warn' ? 'var(--amber)' : 'var(--green)',
                        }} />
                      </div>
                    </div>
                  )}

                  <div className={`camp-msg ${health === 'good' ? '' : health}`}>
                    <span dangerouslySetInnerHTML={{ __html: msg }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* TOP ADS — ahora con datos reales */}
        <section className="section">
          <div className="sec-head">
            <div>
              <h2 className="sec-title">Tus mejores anuncios</h2>
              <div className="sec-sub">Las creatividades con más clics en {periodLabel}.</div>
            </div>
            <Link className="sec-link" href={anunciosListHref(sp)}>Ver todos →</Link>
          </div>
          <div className="ads-grid">
            {(topAds || []).slice(0, 3).map((ad, i) => {
              const ins = ad.insights?.data?.[0] || {};
              const cost = Number(ins.spend || 0);
              const kindLabel = creativeKindLabel(ad.creative);
              const altClass = i === 1 ? 'alt-1' : i === 2 ? 'alt-2' : '';
              const thumb = pickBestAdImage(ad.creative);
              const adHref = adDetailHref(ad.id, sp);
              return (
                <Link key={ad.id || i} href={adHref} className="ad-card">
                  <div className={`ad-thumb ${altClass}`} style={thumb ? {backgroundImage:`url(${thumb})`, backgroundSize:'cover', backgroundPosition:'center'} : undefined}>
                    <span className={`ad-rank ${i === 0 ? 'gold' : ''}`}>{i === 0 ? '#1 Top' : `#${i+1}`}</span>
                    {!thumb && <span className="ad-thumb-icon">{kindLabel}</span>}
                  </div>
                  <div className="ad-body">
                    <div className="ad-name">{ad.name || 'Sin nombre'}</div>
                    <div className="ad-mini">
                      <span>Clics <strong>{fmt.num(ad._clicks)}</strong></span>
                      <span>Costo <strong>{fmt.money(cost)}</strong></span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {(!topAds || topAds.length === 0) && (
              <div style={{gridColumn:'1 / -1', padding:'40px', textAlign:'center', background:'var(--white)', borderRadius:12, color:'var(--gray)', fontSize:13}}>
                No hay datos de anuncios para este período.
              </div>
            )}
          </div>
        </section>

        <div className="foot-note">
          Datos sincronizados con Meta — caché de 5 minutos
        </div>
      </main>
    </div>
  );
}

/* ───────── helpers ───────── */

function KpiCard({ label, help, value, delta, explain, invertColor }) {
  const positive = invertColor ? delta < 0 : delta > 0;
  const cls = positive ? 'up' : delta === 0 ? '' : 'down';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
  return (
    <div className="stat">
      <div className="stat-head">
        <span className="stat-label">{label} <span className="help" title={help}>?</span></span>
      </div>
      <div className="stat-value">{value}</div>
      <div className={`stat-trend ${cls}`}>{arrow} {Math.abs(delta * 100).toFixed(1)}% vs período anterior</div>
      <div className="stat-explain">{explain}</div>
    </div>
  );
}

function preservedQs(sp) {
  const params = new URLSearchParams();
  for (const k of ['period', 'since', 'until']) {
    if (sp?.[k]) params.set(k, sp[k]);
  }
  return params.toString();
}

function anunciosListHref(sp) {
  const qs = preservedQs(sp);
  return qs ? `/anuncios?${qs}` : '/anuncios';
}

function adDetailHref(id, sp) {
  const qs = preservedQs(sp);
  return qs ? `/anuncios/${id}?${qs}` : `/anuncios/${id}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6 || h >= 20) return 'Buenas noches';
  if (h >= 12) return 'Buenas tardes';
  return 'Buen día';
}

function spendExplain(spend, delta) {
  if (spend === 0) return 'No hubo gasto en este período.';
  if (delta > 0.15) return 'Estás gastando bastante más que el período anterior.';
  if (delta > 0.05) return 'Estás invirtiendo un poco más que el período anterior.';
  if (delta > -0.05) return 'Estás gastando lo mismo que el período anterior.';
  return 'Estás gastando menos que el período anterior.';
}

function buildAudienceCaption(ageTop, topGender, topGenderPct, regions) {
  if (!ageTop?.length && !topGender && !regions?.length) return null;
  const parts = [];
  if (ageTop?.length >= 2) {
    parts.push(`La mayoría de tu público tiene entre <strong style="color:var(--navy)">${ageRangeLabel([ageTop[0].key, ageTop[1].key])}</strong>`);
  } else if (ageTop?.length === 1) {
    parts.push(`Tu público está casi todo en <strong style="color:var(--navy)">${ageLabel(ageTop[0].key)}</strong>`);
  }
  if (topGender && topGenderPct >= 55) {
    parts.push(`principalmente ${humanLabel(topGender.key).toLowerCase()} (${topGenderPct}%)`);
  }
  if (regions?.length) {
    parts.push(`en ${regions.map(r => r.key).join(' y ')}`);
  }
  return <span dangerouslySetInnerHTML={{ __html: parts.join(', ') + '.' }} />;
}

function ageLabel(age) {
  return age === '65+' ? '65 años o más' : `${age} años`;
}

function ageRangeLabel(ages) {
  const sorted = [...ages].sort();
  const first = sorted[0].split('-')[0];
  const last = sorted[sorted.length - 1].split('-')[1] || sorted[sorted.length - 1];
  return `${first} y ${last} años`;
}

function creativeKindLabel(creative) {
  const t = creative?.object_type || '';
  if (/VIDEO/i.test(t)) return 'Video';
  if (/CAROUSEL/i.test(t)) return 'Carrusel';
  if (/PHOTO|IMAGE/i.test(t)) return 'Foto';
  return 'Anuncio';
}

function sortByStatus(campaigns) {
  // Activas primero, después en revisión / aprendizaje, después pausadas, después archivadas.
  // Sort estable, así dentro de cada grupo se preserva el orden que devuelve Meta.
  const priority = (s) => {
    if (s === 'ACTIVE') return 0;
    if (s === 'LEARNING') return 1;
    if (s === 'PENDING_REVIEW' || s === 'IN_PROCESS') return 2;
    if (s === 'PAUSED' || s === 'CAMPAIGN_PAUSED') return 3;
    if (s === 'ARCHIVED') return 4;
    return 2;
  };
  return [...campaigns].sort((a, b) => priority(a.effective_status) - priority(b.effective_status));
}

function computeHealth(c, spend, results) {
  const s = c.effective_status;
  if (s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ARCHIVED') return 'paused';
  if (s === 'IN_PROCESS' || s === 'WITH_ISSUES' || s === 'DISAPPROVED') return 'bad';
  if (s === 'PENDING_REVIEW' || s === 'PENDING_BILLING_INFO') return 'warn';
  if (s === 'LEARNING') return 'warn';
  if (spend === 0) return 'idle';
  return 'good';
}

function healthLabel(h) {
  switch (h) {
    case 'bad':    return 'Necesita atención';
    case 'warn':   return 'Aprendiendo';
    case 'paused': return 'Pausada';
    case 'idle':   return 'Sin actividad';
    default:       return 'Funcionando bien';
  }
}

function objectiveToPlatform(objective) {
  // TODO: usar el breakdown de plataforma a nivel campaña en vez de inferir
  return 'Instagram + Facebook';
}

function defaultCampaignMsg(c, results, spend) {
  const s = c.effective_status;
  if (s === 'PAUSED' || s === 'CAMPAIGN_PAUSED') {
    return '<strong>Esta campaña está pausada.</strong> No está gastando ni mostrándose. Activala desde Ads Manager si querés que vuelva a correr.';
  }
  if (s === 'ARCHIVED') {
    return '<strong>Campaña archivada.</strong> Ya no aparece en Ads Manager. Solo se muestra acá como histórico.';
  }
  if (s === 'PENDING_REVIEW') {
    return '<strong>Meta está revisando tu campaña.</strong> Suele tardar entre 24 y 48 horas.';
  }
  if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') {
    return '<strong>Meta rechazó esta campaña.</strong> Probablemente por las políticas de contenido. Revisala en Ads Manager.';
  }
  if (s === 'LEARNING') {
    return '<strong>Está en fase de aprendizaje.</strong> Meta todavía está descubriendo a qué personas mostrarle tus anuncios. Dejala correr 2-3 días más antes de tocarla.';
  }
  if (spend === 0) {
    return '<strong>No hay gasto en este período.</strong> Verificá que la campaña esté activa y con presupuesto.';
  }
  if (results > 0 && spend / results < 1000) {
    return `<strong>Va muy bien.</strong> Cada persona interesada te está costando ${fmt.money(spend/results)}. Si querés, podés aumentar el presupuesto.`;
  }
  if (results === 0) {
    return '<strong>Hay gasto pero todavía no hay personas interesadas.</strong> Si lleva varios días así, conviene revisar la creatividad o la audiencia.';
  }
  return '<strong>Cumpliendo su objetivo.</strong>';
}
