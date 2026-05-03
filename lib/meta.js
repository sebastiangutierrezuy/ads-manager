/**
 * Cliente liviano para la Meta Marketing API (Graph API).
 * Usa fetch() de Node con cache de 5 min vía Next.js revalidate.
 *
 * Server-side only. NUNCA importar desde un componente "use client".
 */

const API_VERSION = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT_ID_RAW = process.env.META_AD_ACCOUNT_ID;

const ACCOUNT_ID = ACCOUNT_ID_RAW
  ? (ACCOUNT_ID_RAW.startsWith('act_') ? ACCOUNT_ID_RAW : `act_${ACCOUNT_ID_RAW}`)
  : null;

export function isConfigured() {
  return Boolean(TOKEN && ACCOUNT_ID);
}

async function metaFetch(path, params = {}, { silent = false } = {}) {
  if (!isConfigured()) {
    throw new Error('Meta API no configurada — completar .env.local');
  }
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', TOKEN);

  const res = await fetch(url.toString(), {
    next: { revalidate: 300 },          // cache 5 min para no pegarle a Meta en cada page load
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || res.statusText;
    if (!silent) {
      const safe = url.pathname + url.search.replace(/access_token=[^&]+/, 'access_token=***');
      console.error('[meta]', res.status, msg, safe);
    }
    throw new Error(`Meta API ${res.status}: ${msg}`);
  }
  return res.json();
}

const INSIGHT_FIELDS = 'spend,reach,impressions,clicks,frequency,actions,ctr,cpc,cpm';

/**
 * Construye los params de período. Acepta un date_preset o un time_range explícito.
 */
function periodParams({ datePreset, timeRange }) {
  if (timeRange) return { time_range: JSON.stringify(timeRange) };
  return { date_preset: datePreset || 'last_30d' };
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PRESET_DAYS = { last_7d: 7, last_14d: 14, last_28d: 28, last_30d: 30, last_90d: 90 };
const VALID_PRESETS = new Set(Object.keys(PRESET_DAYS));

/**
 * Mapea un date_preset (last_7d, last_30d, etc) a su cantidad de días.
 */
export function presetToDays(preset) {
  return PRESET_DAYS[preset] ?? 30;
}

/**
 * Sanea un valor de período (ej. de la URL) — devuelve last_30d si viene
 * algo inválido. Evita inyectar valores arbitrarios en la API de Meta.
 */
export function sanitizePreset(value) {
  return VALID_PRESETS.has(value) ? value : 'last_30d';
}

/**
 * Parsea una string YYYY-MM-DD validando que sea una fecha real.
 * Devuelve un Date local o null si no es válida.
 */
export function parseDateString(s) {
  if (!s || typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Saneo de un rango custom desde la URL. Si una de las dos fechas es
 * inválida → null. Si están al revés, las swappea.
 */
export function sanitizeCustomRange(since, until) {
  const a = parseDateString(since);
  const b = parseDateString(until);
  if (!a || !b) return null;
  if (a > b) return { since: until, until: since };
  return { since, until };
}

/**
 * Cantidad de días en un rango (inclusivo).
 */
export function daysInRange({ since, until }) {
  const a = parseDateString(since);
  const b = parseDateString(until);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * Devuelve el rango previo de la misma duración antes de un rango custom.
 */
export function previousOfCustomRange({ since, until }) {
  const a = parseDateString(since);
  if (!a) return null;
  const days = daysInRange({ since, until });
  if (days <= 0) return null;
  const newUntil = new Date(a); newUntil.setDate(a.getDate() - 1);
  const newSince = new Date(newUntil); newSince.setDate(newUntil.getDate() - days + 1);
  return { since: ymd(newSince), until: ymd(newUntil) };
}

/**
 * Devuelve el time_range de los últimos N días terminando ayer
 * (no incluye hoy, porque la data del día en curso es incompleta).
 */
export function lastNDaysRange(days) {
  const today = new Date();
  const until = new Date(today); until.setDate(today.getDate() - 1);
  const since = new Date(until); since.setDate(until.getDate() - (days - 1));
  return { since: ymd(since), until: ymd(until) };
}

/**
 * Devuelve el time_range del período inmediatamente anterior a un preset
 * (ej. last_30d → los 30 días previos a esos 30).
 */
export function previousRangeOf(datePreset) {
  const days = PRESET_DAYS[datePreset];
  if (!days) return null;
  const today = new Date();
  const until = new Date(today); until.setDate(today.getDate() - days);
  const since = new Date(until); since.setDate(until.getDate() - days + 1);
  return { since: ymd(since), until: ymd(until) };
}

/**
 * Meta omite filas de días sin actividad. Esta helper rellena los días
 * faltantes dentro de un rango con ceros, así el gráfico siempre muestra
 * todos los días del período.
 */
export function fillDailyGaps(rows, range) {
  const byDate = Object.fromEntries((rows || []).map(r => [r.date_start, r]));
  const out = [];
  const start = new Date(range.since);
  const end = new Date(range.until);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = ymd(d);
    const row = byDate[key];
    out.push({
      date_start: key,
      date_stop: key,
      reach:       Number(row?.reach || 0),
      spend:       Number(row?.spend || 0),
      clicks:      Number(row?.clicks || 0),
      impressions: Number(row?.impressions || 0),
      actions:     row?.actions || [],
    });
  }
  return out;
}

/**
 * Insights agregados de la cuenta. Acepta datePreset o timeRange explícito.
 */
export async function getAccountInsights(opts = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: INSIGHT_FIELDS,
    ...periodParams(opts),
  });
  return data.data?.[0] || null;
}

/**
 * Insights del período inmediatamente anterior — para calcular deltas.
 */
export async function getPreviousAccountInsights({ datePreset = 'last_30d' } = {}) {
  const range = previousRangeOf(datePreset);
  if (!range) return null;
  return getAccountInsights({ timeRange: range });
}

/**
 * Lista campañas con sus insights del período. Soporta datePreset O timeRange.
 *
 * Internamente hace 2 llamadas en paralelo (metadata + insights con level=campaign)
 * porque el field expansion `insights.time_range(...)` no acepta time_range custom.
 */
export async function getCampaigns(opts = {}) {
  const [meta, ins] = await Promise.all([
    metaFetch(`${ACCOUNT_ID}/campaigns`, {
      fields: 'name,status,effective_status,objective,daily_budget,lifetime_budget,created_time',
      limit: 50,
    }),
    metaFetch(`${ACCOUNT_ID}/insights`, {
      fields: 'campaign_id,spend,reach,clicks,actions,frequency,ctr',
      level: 'campaign',
      limit: 200,
      ...periodParams(opts),
    }),
  ]);
  const map = Object.fromEntries((ins.data || []).map(i => [i.campaign_id, i]));
  return (meta.data || []).map(c => ({
    ...c,
    insights: { data: map[c.id] ? [map[c.id]] : [] },
  }));
}

/**
 * Serie temporal: una fila por día con las métricas pedidas.
 */
export async function getDailyInsights({ datePreset = 'last_30d', timeRange } = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: 'spend,reach,impressions,clicks,actions',
    time_increment: '1',
    ...periodParams({ datePreset, timeRange }),
  });
  return data.data || [];
}

/**
 * Breakdown por edad — devuelve filas con { age, reach, spend, ... }.
 */
export async function getAgeBreakdown({ datePreset = 'last_30d' } = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'age',
    ...periodParams({ datePreset }),
  });
  return data.data || [];
}

/**
 * Breakdown por género — devuelve filas con { gender, reach, ... }.
 */
export async function getGenderBreakdown({ datePreset = 'last_30d' } = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'gender',
    ...periodParams({ datePreset }),
  });
  return data.data || [];
}

/**
 * Breakdown por publisher_platform + platform_position
 * (Instagram Reels, IG Stories, FB Feed, etc.)
 */
export async function getPlatformBreakdown({ datePreset = 'last_30d' } = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'publisher_platform,platform_position',
    ...periodParams({ datePreset }),
  });
  return data.data || [];
}

/**
 * Breakdown por dispositivo (mobile_app, mobile_web, desktop, etc.)
 */
export async function getDeviceBreakdown({ datePreset = 'last_30d' } = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'device_platform',
    ...periodParams({ datePreset }),
  });
  return data.data || [];
}

/**
 * Breakdown por región (provincia/estado).
 */
export async function getRegionBreakdown({ datePreset = 'last_30d' } = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'region',
    limit: 50,
    ...periodParams({ datePreset }),
  });
  return data.data || [];
}

/**
 * Breakdown por hora del día — 24 filas, agregado en todo el período.
 * Útil para "mejor hora para mostrar anuncios".
 */
export async function getHourlyBreakdown({ datePreset = 'last_30d' } = {}) {
  const data = await metaFetch(`${ACCOUNT_ID}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    ...periodParams({ datePreset }),
  });
  return data.data || [];
}

/**
 * Devuelve la mejor imagen de previsualización disponible para un anuncio.
 * Cada formato guarda la imagen en un campo distinto del schema de Meta:
 *
 * - Foto individual  → creative.image_url (full-res)
 * - Carrusel         → primer slide en link_data.child_attachments[0].picture
 * - Link / page post → link_data.picture
 * - Foto subida      → photo_data.url
 * - Fallback         → creative.thumbnail_url (escalado a 1080x1080 vía
 *                      el modificador thumbnail_width/height del field expansion)
 */
export function pickBestAdImage(creative) {
  if (!creative) return null;
  if (creative.image_url) return creative.image_url;
  const oss = creative.object_story_spec || {};
  const child = oss.link_data?.child_attachments?.[0];
  if (child?.picture) return child.picture;
  if (oss.link_data?.picture) return oss.link_data.picture;
  if (oss.photo_data?.url)    return oss.photo_data.url;
  return creative.thumbnail_url || null;
}

/**
 * Trae las thumbnails de un video y devuelve la URI de mayor resolución.
 * El endpoint /{video_id}/thumbnails devuelve varias resoluciones, una de
 * ellas marcada como is_preferred. Caemos a la más ancha si no hay preferida.
 */
async function getBestVideoThumbnail(videoId) {
  try {
    const data = await metaFetch(`${videoId}/thumbnails`, {}, { silent: true });
    const thumbs = data.data || [];
    if (!thumbs.length) return null;
    const preferred = thumbs.find(t => t.is_preferred);
    if (preferred?.uri) return preferred.uri;
    const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0));
    return sorted[0]?.uri || null;
  } catch {
    return null; // permiso faltante o video inaccesible — fallback silencioso
  }
}

/**
 * Para cada ad de video sin image_url, reemplaza thumbnail_url con la
 * mejor resolución disponible. Mutación in-place de los ads.
 */
async function resolveVideoThumbnails(ads) {
  const targets = (ads || []).filter(a =>
    a.creative?.video_id && !a.creative?.image_url
  );
  if (!targets.length) return;
  const results = await Promise.all(
    targets.map(a => getBestVideoThumbnail(a.creative.video_id))
  );
  targets.forEach((ad, i) => {
    if (results[i]) ad.creative.thumbnail_url = results[i];
  });
}

/**
 * Lista completa de anuncios con sus insights del período. Sin slicing.
 */
export async function getAdsList(opts = {}) {
  const [meta, ins] = await Promise.all([
    metaFetch(`${ACCOUNT_ID}/ads`, {
      fields: 'name,effective_status,created_time,creative.thumbnail_width(1080).thumbnail_height(1080){thumbnail_url,image_url,video_id,object_type,instagram_permalink_url,object_story_spec{link_data{picture,child_attachments{picture}},photo_data{url}}}',
      limit: 500,
    }),
    metaFetch(`${ACCOUNT_ID}/insights`, {
      fields: 'ad_id,spend,reach,clicks,actions,frequency,ctr',
      level: 'ad',
      limit: 500,
      ...periodParams(opts),
    }),
  ]);
  const map = Object.fromEntries((ins.data || []).map(i => [i.ad_id, i]));
  const ads = (meta.data || []).map(ad => {
    const i = map[ad.id];
    return {
      ...ad,
      insights: i ? { data: [i] } : { data: [] },
      _spend:   Number(i?.spend  || 0),
      _reach:   Number(i?.reach  || 0),
      _clicks:  Number(i?.clicks || 0),
      _results: sumResults(i?.actions),
    };
  });
  await resolveVideoThumbnails(ads);
  return ads;
}

/**
 * Metadata + insights agregados de un solo anuncio.
 */
export async function getAd(adId, opts = {}) {
  const [meta, ins] = await Promise.all([
    metaFetch(adId, {
      fields: 'name,effective_status,created_time,creative.thumbnail_width(1080).thumbnail_height(1080){thumbnail_url,image_url,video_id,object_type,instagram_permalink_url,effective_object_story_id,title,body,name,object_story_spec{link_data{picture,child_attachments{picture}},photo_data{url}}}',
    }),
    metaFetch(`${adId}/insights`, {
      fields: INSIGHT_FIELDS,
      ...periodParams(opts),
    }),
  ]);
  const ad = { ...meta, insights: ins.data?.[0] || null };
  await resolveVideoThumbnails([ad]);
  return ad;
}

/**
 * Serie diaria de insights de un anuncio.
 */
export async function getAdDailyInsights(adId, opts = {}) {
  const data = await metaFetch(`${adId}/insights`, {
    fields: 'spend,reach,impressions,clicks,actions',
    time_increment: '1',
    ...periodParams(opts),
  });
  return data.data || [];
}

/**
 * Breakdown por edad para un anuncio.
 */
export async function getAdAgeBreakdown(adId, opts = {}) {
  const data = await metaFetch(`${adId}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'age',
    ...periodParams(opts),
  });
  return data.data || [];
}

/**
 * Breakdown por plataforma + posición para un anuncio.
 */
export async function getAdPlatformBreakdown(adId, opts = {}) {
  const data = await metaFetch(`${adId}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'publisher_platform,platform_position',
    ...periodParams(opts),
  });
  return data.data || [];
}

/**
 * Métricas de retención de video para un anuncio.
 * Devuelve plays + cuántas personas llegaron al 25/50/75/95/100% del video.
 */
export async function getAdVideoRetention(adId, opts = {}) {
  const data = await metaFetch(`${adId}/insights`, {
    fields: [
      'video_play_actions',
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p95_watched_actions',
      'video_p100_watched_actions',
      'video_avg_time_watched_actions',
      'video_thruplay_watched_actions',
    ].join(','),
    ...periodParams(opts),
  });
  return data.data?.[0] || null;
}

/**
 * Construye los 6 checkpoints de retención (0/25/50/75/95/100) desde insights.
 * Devuelve null si el ad no tiene plays de video (no es video o sin actividad).
 */
export function buildVideoCheckpoints(insights) {
  if (!insights) return null;
  const sumActionValue = (arr) => (arr || []).reduce((s, a) => s + Number(a.value || 0), 0);
  const plays = sumActionValue(insights.video_play_actions);
  if (plays === 0) return null;
  return [
    { pct: 0,   label: 'Inicio', viewers: plays },
    { pct: 25,  label: '25%',    viewers: sumActionValue(insights.video_p25_watched_actions) },
    { pct: 50,  label: '50%',    viewers: sumActionValue(insights.video_p50_watched_actions) },
    { pct: 75,  label: '75%',    viewers: sumActionValue(insights.video_p75_watched_actions) },
    { pct: 95,  label: '95%',    viewers: sumActionValue(insights.video_p95_watched_actions) },
    { pct: 100, label: 'Fin',    viewers: sumActionValue(insights.video_p100_watched_actions) },
  ];
}

/**
 * Breakdown por dispositivo para un anuncio.
 */
export async function getAdDeviceBreakdown(adId, opts = {}) {
  const data = await metaFetch(`${adId}/insights`, {
    fields: 'reach,impressions,actions,spend',
    breakdowns: 'device_platform',
    ...periodParams(opts),
  });
  return data.data || [];
}

/**
 * Top anuncios por clics en el período. Soporta datePreset O timeRange.
 */
export async function getTopAds({ datePreset, timeRange, limit = 10 } = {}) {
  const [meta, ins] = await Promise.all([
    metaFetch(`${ACCOUNT_ID}/ads`, {
      fields: 'name,effective_status,creative.thumbnail_width(1080).thumbnail_height(1080){thumbnail_url,image_url,video_id,object_type,instagram_permalink_url,object_story_spec{link_data{picture,child_attachments{picture}},photo_data{url}}}',
      limit: 200,
    }),
    metaFetch(`${ACCOUNT_ID}/insights`, {
      fields: 'ad_id,spend,reach,clicks,actions,frequency',
      level: 'ad',
      limit: 200,
      ...periodParams({ datePreset, timeRange }),
    }),
  ]);
  const map = Object.fromEntries((ins.data || []).map(i => [i.ad_id, i]));
  const ads = (meta.data || []).map(ad => {
    const i = map[ad.id];
    return {
      ...ad,
      insights: i ? { data: [i] } : { data: [] },
      _clicks: Number(i?.clicks || 0),
      _spend:  Number(i?.spend  || 0),
      _reach:  Number(i?.reach  || 0),
    };
  });
  ads.sort((a, b) => b._clicks - a._clicks);
  const top = ads.slice(0, limit);
  await resolveVideoThumbnails(top);
  return top;
}

/**
 * Suma todos los "results" relevantes desde el array `actions`.
 * Meta devuelve actions como [{action_type: 'link_click', value: '123'}, ...].
 *
 * Para una versión seria, deberías filtrar por el action_type que coincide con
 * el objective de cada campaña. Para el MVP sumamos los más típicos.
 */
export function sumResults(actions = []) {
  const RESULT_TYPES = new Set([
    'lead',
    'purchase',
    'complete_registration',
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.lead_grouped',
  ]);
  let total = 0;
  for (const a of actions) {
    if (RESULT_TYPES.has(a.action_type)) total += Number(a.value || 0);
  }
  // Si no hay nada de eso, devolvemos los link_clicks como proxy "interesados"
  if (total === 0) {
    const lc = actions.find(a => a.action_type === 'link_click');
    if (lc) total = Number(lc.value || 0);
  }
  return total;
}

/**
 * Helpers de formato — locale es-AR.
 */
export const fmt = {
  money: (n) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0),
  num:   (n) => new Intl.NumberFormat('es-AR').format(Math.round(n || 0)),
  compact: (n) => new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0),
  pct:   (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%',
};

/**
 * Construye los pasos del embudo desde un objeto de insights.
 * Retorna: [{ name, count }] para los 4 pasos clásicos.
 */
export function buildFunnel(insights) {
  if (!insights) return null;
  const actions = insights.actions || [];
  const find = (type) => Number(actions.find(a => a.action_type === type)?.value || 0);

  const reach = Number(insights.reach || insights.impressions || 0);
  const linkClicks = find('link_click') || Number(insights.clicks || 0);
  const lpv = find('landing_page_view');
  const results = sumResults(actions);

  return [
    { key: 'reach',   name: 'Vieron tu anuncio',         count: reach },
    { key: 'clicks',  name: 'Hicieron clic en el anuncio', count: linkClicks },
    { key: 'visits',  name: 'Llegaron a tu sitio',       count: lpv || linkClicks },
    { key: 'results', name: 'Personas interesadas',      count: results },
  ];
}

/**
 * Agrupa filas con breakdown por una key, sumando reach.
 * Devuelve [{ key, value, pct }] ordenado de mayor a menor, top N.
 */
export function topByReach(rows, key, n = 5) {
  if (!rows?.length) return [];
  const totals = {};
  for (const row of rows) {
    const k = row[key];
    totals[k] = (totals[k] || 0) + Number(row.reach || 0);
  }
  const total = Object.values(totals).reduce((s, v) => s + v, 0);
  const entries = Object.entries(totals)
    .map(([k, v]) => ({ key: k, value: v, pct: total ? v / total : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
  return entries;
}

/**
 * Calcula costo por interesado por categoría (ej. por plataforma).
 * Devuelve [{ key, spend, results, cpr }].
 */
export function costPerResultByKey(rows, key) {
  if (!rows?.length) return [];
  const agg = {};
  for (const row of rows) {
    const k = row[key];
    const spend = Number(row.spend || 0);
    const results = sumResults(row.actions);
    if (!agg[k]) agg[k] = { spend: 0, results: 0, reach: 0 };
    agg[k].spend += spend;
    agg[k].results += results;
    agg[k].reach += Number(row.reach || 0);
  }
  return Object.entries(agg).map(([k, v]) => ({
    key: k,
    spend: v.spend,
    results: v.results,
    reach: v.reach,
    cpr: v.results ? v.spend / v.results : 0,
  })).sort((a, b) => b.reach - a.reach);
}

/**
 * Mapea labels técnicos de Meta a labels humanos.
 */
export const HUMAN_LABELS = {
  // gender
  male: 'Hombres',
  female: 'Mujeres',
  unknown: 'No especificado',
  // device_platform
  mobile_app: 'App móvil',
  mobile_web: 'Web en celular',
  desktop: 'Computadora',
  // publisher_platform
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
};

export function humanLabel(value) {
  return HUMAN_LABELS[value] || value;
}

/**
 * Combina publisher_platform + platform_position en un nombre legible.
 */
export function platformDisplayName(row) {
  const p = humanLabel(row.publisher_platform);
  const pos = (row.platform_position || '').replace(/^(facebook_|instagram_)/, '');
  const posMap = { feed: 'Feed', reels: 'Reels', story: 'Stories', stories: 'Stories', explore: 'Explorar', search: 'Búsqueda' };
  const posName = posMap[pos] || pos;
  return posName ? `${p} ${posName}` : p;
}
