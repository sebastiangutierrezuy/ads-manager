import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import ErrorScreen from '@/components/ErrorScreen';
import PeriodSelector from '@/components/PeriodSelector';
import AdGrid from '@/components/AdGrid';
import {
  isConfigured,
  getAdsList,
  sanitizePreset,
  sanitizeCustomRange,
  pickBestAdImage,
  fmt,
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

const VALID_SORTS = new Set(['clicks', 'spend', 'reach', 'results']);

export default async function AnunciosPage({ searchParams }) {
  const sp = await searchParams;
  const customRange = sanitizeCustomRange(sp?.since, sp?.until);
  const PRESET = customRange ? null : sanitizePreset(sp?.period);
  const sort = VALID_SORTS.has(sp?.sort) ? sp.sort : 'clicks';
  const periodLabel = customRange
    ? `del ${formatShort(customRange.since)} al ${formatShort(customRange.until)}`
    : PERIOD_LABELS[PRESET];

  if (!isConfigured()) {
    return (
      <ErrorScreen
        title="Conectá tu cuenta de Meta"
        message="Para ver tus anuncios necesitamos las credenciales de la Marketing API."
        hint={<>Completá <code>META_ACCESS_TOKEN</code> y <code>META_AD_ACCOUNT_ID</code> en <code>.env.local</code>.</>}
      />
    );
  }

  const periodOpts = customRange ? { timeRange: customRange } : { datePreset: PRESET };

  let ads = [];
  let fetchError = null;
  try {
    ads = await getAdsList(periodOpts);
  } catch (err) {
    fetchError = err.message;
  }

  if (fetchError) {
    return (
      <ErrorScreen
        title="No pudimos traer tus anuncios"
        message="La llamada a la Marketing API falló."
        error={fetchError}
        hint={<>Verificá que tu token tenga permisos <code>ads_read</code>.</>}
      />
    );
  }

  // Sort por la métrica elegida (descendente)
  ads.sort((a, b) => Number(b[`_${sort}`] || 0) - Number(a[`_${sort}`] || 0));

  return (
    <div className="app">
      <Sidebar active="anuncios" />

      <main className="main">
        {/* TOP */}
        <div className="top">
          <div>
            <h1>Anuncios</h1>
            <div className="subline">Todas las creatividades de tu cuenta — datos de {periodLabel}.</div>
          </div>
          <div className="top-actions">
            <PeriodSelector current={PRESET} custom={customRange} />
          </div>
        </div>

        {/* Filtros de orden */}
        <div className="ad-filter-row">
          <span className="ad-filter-label">Ordenar por</span>
          {[
            { id: 'clicks',  label: 'Clics' },
            { id: 'spend',   label: 'Inversión' },
            { id: 'reach',   label: 'Personas alcanzadas' },
            { id: 'results', label: 'Personas interesadas' },
          ].map(opt => {
            const params = new URLSearchParams();
            for (const k of ['period', 'since', 'until']) {
              if (sp?.[k]) params.set(k, sp[k]);
            }
            if (opt.id !== 'clicks') params.set('sort', opt.id);
            const qs = params.toString();
            return (
              <Link
                key={opt.id}
                href={qs ? `/anuncios?${qs}` : '/anuncios'}
                className={`ad-filter-btn ${sort === opt.id ? 'active' : ''}`}
                scroll={false}
                prefetch={false}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        {/* Grid con paginación de a 6 */}
        {ads.length === 0 ? (
          <div className="ad-empty">No hay anuncios en tu cuenta para este período.</div>
        ) : (
          <AdGrid key={`${sort}|${PRESET || 'custom'}|${customRange?.since || ''}|${customRange?.until || ''}`}>
            {ads.map((ad, i) => {
              const status = mapAdStatus(ad.effective_status);
              const kindLabel = creativeKindLabel(ad.creative);
              const thumb = pickBestAdImage(ad.creative);
              const altClass = i % 3 === 1 ? 'alt-1' : i % 3 === 2 ? 'alt-2' : '';

              const adQs = new URLSearchParams();
              for (const k of ['period', 'since', 'until']) {
                if (sp?.[k]) adQs.set(k, sp[k]);
              }
              const adHref = adQs.toString() ? `/anuncios/${ad.id}?${adQs}` : `/anuncios/${ad.id}`;

              return (
                <Link key={ad.id} href={adHref} className="ad-list-card">
                  <div className={`ad-thumb ${altClass}`} style={thumb ? {backgroundImage:`url(${thumb})`, backgroundSize:'cover', backgroundPosition:'center'} : undefined}>
                    {!thumb && <span className="ad-thumb-icon">{kindLabel}</span>}
                    <span className={`ad-list-badge ${status.cls}`}>
                      <span className="dot" />{status.label}
                    </span>
                  </div>
                  <div className="ad-list-body">
                    <div className="ad-list-name">{ad.name || 'Sin nombre'}</div>
                    <div className="ad-list-meta">{kindLabel}</div>
                    <div className="ad-list-stats">
                      <div>
                        <div className="lbl">Inversión</div>
                        <div className="val">{fmt.money(ad._spend)}</div>
                      </div>
                      <div>
                        <div className="lbl">Personas</div>
                        <div className="val">{fmt.compact(ad._reach)}</div>
                      </div>
                      <div>
                        <div className="lbl">Clics</div>
                        <div className="val">{fmt.num(ad._clicks)}</div>
                      </div>
                      <div>
                        <div className="lbl">Interesados</div>
                        <div className="val">{fmt.num(ad._results)}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </AdGrid>
        )}

        <div className="foot-note">
          Datos sincronizados con Meta — caché de 5 minutos
        </div>
      </main>
    </div>
  );
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
