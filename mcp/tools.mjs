/**
 * Definiciones de tools del MCP server. Compartidas entre el transport
 * stdio (mcp/server.mjs) y el transport HTTP (app/api/mcp/route.js).
 *
 * Este módulo NO carga env vars ni inicia ningún transport — solo exporta
 * las definiciones puras, así puede importarse desde Next.js routes sin
 * ningún side effect.
 */

import {
  isConfigured as _isConfigured,
  getAccountInsights,
  getPreviousAccountInsights,
  getCampaigns,
  getTopAds,
  getAd,
  getAdVideoRetention,
  getDailyInsights,
  getHourlyBreakdown,
  getDeviceBreakdown,
  getAgeBreakdown,
  getGenderBreakdown,
  getRegionBreakdown,
  getPlatformBreakdown,
  getAdAgeBreakdown,
  getAdPlatformBreakdown,
  getAdDeviceBreakdown,
  buildVideoCheckpoints,
  sumResults,
  topByReach,
  costPerResultByKey,
  platformDisplayName,
  previousRangeOf,
} from '../lib/meta.js';

export const isConfigured = _isConfigured;

const PERIODS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum'];

const periodProp = () => ({
  type: 'string',
  enum: PERIODS,
  default: 'last_30d',
  description: 'Preset de período de Meta. Ignorado si se especifican `since`/`until`.',
});
const sinceProp = () => ({
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Fecha de inicio en formato YYYY-MM-DD. Si se especifica, se ignora `period`. Requiere `until`.',
});
const untilProp = () => ({
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Fecha de fin en formato YYYY-MM-DD. Requiere `since`.',
});

function buildPeriodOpts({ period, since, until }) {
  if (since && until) return { timeRange: { since, until } };
  return { datePreset: period || 'last_30d' };
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fmtMoney(n) {
  return '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function pctDelta(curr, prev) {
  if (!prev || prev === 0) return null;
  return Number((((curr - prev) / prev) * 100).toFixed(1));
}

function parseHourly(rows) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, reach: 0, spend: 0, results: 0 }));
  for (const r of rows || []) {
    const range = r.hourly_stats_aggregated_by_advertiser_time_zone;
    if (!range) continue;
    const h = parseInt(String(range).slice(0, 2), 10);
    if (Number.isNaN(h) || h < 0 || h > 23) continue;
    buckets[h].reach += Number(r.reach || 0);
    buckets[h].spend += Number(r.spend || 0);
    buckets[h].results += sumResults(r.actions);
  }
  return buckets;
}

export const TOOLS = [
  {
    name: 'account_summary',
    description: 'Resumen de la cuenta publicitaria en un período: gasto, alcance, clics, personas interesadas y métricas derivadas (CPR, CTR).',
    inputSchema: { type: 'object', properties: { period: periodProp(), since: sinceProp(), until: untilProp() } },
    handler: async ({ period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const ins = await getAccountInsights(opts);
      if (!ins) return ok({ message: 'Sin datos de actividad en este período.' });
      const spend = Number(ins.spend || 0);
      const reach = Number(ins.reach || 0);
      const clicks = Number(ins.clicks || 0);
      const results = sumResults(ins.actions);
      return ok({
        spend, spend_formatted: fmtMoney(spend),
        reach, clicks, results,
        impressions: Number(ins.impressions || 0),
        frequency: Number(ins.frequency || 0),
        ctr_pct: reach > 0 ? Number(((clicks / reach) * 100).toFixed(2)) : 0,
        cost_per_result: results > 0 ? spend / results : null,
        cost_per_result_formatted: results > 0 ? fmtMoney(spend / results) : null,
      });
    },
  },
  {
    name: 'account_comparison',
    description: 'Compara las métricas del período actual contra el período inmediatamente anterior (mismo largo). Devuelve actual, previo y delta porcentual de cada métrica. Útil para responder "¿cómo viene este mes/semana vs el anterior?".',
    inputSchema: { type: 'object', properties: { period: periodProp() } },
    handler: async ({ period = 'last_30d' }) => {
      const [curr, prev] = await Promise.all([
        getAccountInsights({ datePreset: period }),
        getPreviousAccountInsights({ datePreset: period }),
      ]);
      const c = { spend: Number(curr?.spend || 0), reach: Number(curr?.reach || 0), clicks: Number(curr?.clicks || 0), results: sumResults(curr?.actions) };
      const p = { spend: Number(prev?.spend || 0), reach: Number(prev?.reach || 0), clicks: Number(prev?.clicks || 0), results: sumResults(prev?.actions) };
      c.cpr = c.results > 0 ? c.spend / c.results : null;
      p.cpr = p.results > 0 ? p.spend / p.results : null;
      return ok({
        period,
        current: c,
        previous: p,
        previous_range: previousRangeOf(period),
        deltas_pct: {
          spend: pctDelta(c.spend, p.spend),
          reach: pctDelta(c.reach, p.reach),
          clicks: pctDelta(c.clicks, p.clicks),
          results: pctDelta(c.results, p.results),
          cpr: c.cpr && p.cpr ? pctDelta(c.cpr, p.cpr) : null,
        },
      });
    },
  },
  {
    name: 'daily_trend',
    description: 'Serie diaria de métricas (gasto, alcance, clics, interesados) dentro de un período. Una fila por día. Útil para detectar picos, caídas o estacionalidad.',
    inputSchema: { type: 'object', properties: { period: periodProp(), since: sinceProp(), until: untilProp() } },
    handler: async ({ period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const daily = await getDailyInsights(opts);
      const days = daily.map(d => ({
        date: d.date_start,
        spend: Number(d.spend || 0),
        reach: Number(d.reach || 0),
        clicks: Number(d.clicks || 0),
        impressions: Number(d.impressions || 0),
        results: sumResults(d.actions),
      }));
      return ok({ count: days.length, days });
    },
  },
  {
    name: 'hourly_pattern',
    description: 'Distribución agregada por hora del día (0 a 23) en un período. Permite identificar las mejores ventanas para mostrar anuncios. Devuelve 24 buckets, uno por hora.',
    inputSchema: { type: 'object', properties: { period: periodProp(), since: sinceProp(), until: untilProp() } },
    handler: async ({ period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const rows = await getHourlyBreakdown(opts);
      const buckets = parseHourly(rows);
      const sorted = [...buckets].sort((a, b) => b.reach - a.reach);
      return ok({
        hours: buckets,
        best_hour: sorted[0]?.reach > 0 ? sorted[0].hour : null,
        worst_hour: sorted[sorted.length - 1]?.reach > 0 ? sorted[sorted.length - 1].hour : null,
      });
    },
  },
  {
    name: 'device_breakdown',
    description: 'Distribución por tipo de dispositivo (mobile_app, mobile_web, desktop) — alcance, gasto, resultados y costo por resultado de cada uno.',
    inputSchema: { type: 'object', properties: { period: periodProp(), since: sinceProp(), until: untilProp() } },
    handler: async ({ period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const rows = await getDeviceBreakdown(opts);
      return ok({ devices: costPerResultByKey(rows, 'device_platform') });
    },
  },
  {
    name: 'list_campaigns',
    description: 'Lista de campañas en la cuenta con sus métricas del período. Cada campaña incluye id, nombre, estado, objetivo y métricas básicas.',
    inputSchema: { type: 'object', properties: { period: periodProp() } },
    handler: async ({ period = 'last_30d' }) => {
      const camps = await getCampaigns({ datePreset: period });
      const summary = camps.map(c => {
        const ins = c.insights?.data?.[0] || {};
        return {
          id: c.id, name: c.name,
          status: c.effective_status, objective: c.objective,
          spend: Number(ins.spend || 0),
          reach: Number(ins.reach || 0),
          clicks: Number(ins.clicks || 0),
          results: sumResults(ins.actions),
        };
      });
      return ok({ period, count: summary.length, campaigns: summary });
    },
  },
  {
    name: 'list_top_ads',
    description: 'Anuncios con más clics en el período, ordenados de mayor a menor. Útil para identificar los creativos que mejor están funcionando.',
    inputSchema: {
      type: 'object',
      properties: { period: periodProp(), limit: { type: 'number', default: 10 } },
    },
    handler: async ({ period = 'last_30d', limit = 10 }) => {
      const ads = await getTopAds({ datePreset: period, limit });
      const summary = ads.map(a => {
        const ins = a.insights?.data?.[0] || {};
        return {
          id: a.id, name: a.name, status: a.effective_status,
          object_type: a.creative?.object_type,
          spend: Number(ins.spend || 0),
          clicks: Number(ins.clicks || 0),
          reach: Number(ins.reach || 0),
          results: sumResults(ins.actions),
        };
      });
      return ok({ period, ads: summary });
    },
  },
  {
    name: 'ad_detail',
    description: 'Información detallada de un anuncio puntual: metadata, métricas agregadas y URL del creative si existe.',
    inputSchema: {
      type: 'object',
      properties: { ad_id: { type: 'string' }, period: periodProp(), since: sinceProp(), until: untilProp() },
      required: ['ad_id'],
    },
    handler: async ({ ad_id, period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const ad = await getAd(ad_id, opts);
      const ins = ad.insights || {};
      const spend = Number(ins.spend || 0);
      const results = sumResults(ins.actions);
      return ok({
        id: ad.id, name: ad.name,
        status: ad.effective_status,
        object_type: ad.creative?.object_type,
        instagram_url: ad.creative?.instagram_permalink_url || null,
        thumbnail_url: ad.creative?.thumbnail_url || null,
        created_at: ad.created_time,
        metrics: {
          spend, spend_formatted: fmtMoney(spend),
          reach: Number(ins.reach || 0),
          impressions: Number(ins.impressions || 0),
          clicks: Number(ins.clicks || 0),
          ctr_pct: Number(ins.ctr || 0),
          cpc: Number(ins.cpc || 0),
          cpm: Number(ins.cpm || 0),
          frequency: Number(ins.frequency || 0),
          results,
          cost_per_result: results > 0 ? spend / results : null,
        },
      });
    },
  },
  {
    name: 'video_retention',
    description: 'Curva de retención de un anuncio de video: cuántas personas siguen mirando en cada checkpoint (inicio, 25%, 50%, 75%, 95%, fin). Solo aplica a videos.',
    inputSchema: {
      type: 'object',
      properties: { ad_id: { type: 'string' }, period: periodProp(), since: sinceProp(), until: untilProp() },
      required: ['ad_id'],
    },
    handler: async ({ ad_id, period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const ins = await getAdVideoRetention(ad_id, opts);
      const checkpoints = buildVideoCheckpoints(ins);
      if (!checkpoints) return ok({ ad_id, message: 'No es un video o no tiene plays en este período.' });
      const baseline = checkpoints[0].viewers || 1;
      return ok({
        ad_id,
        checkpoints: checkpoints.map(c => ({
          ...c, retention_pct: Number(((c.viewers / baseline) * 100).toFixed(1)),
        })),
        completion_rate_pct: Number(((checkpoints[5].viewers / baseline) * 100).toFixed(1)),
      });
    },
  },
  {
    name: 'audience_breakdown',
    description: 'Distribución de la audiencia alcanzada de TODA la cuenta por edad y/o género en el período.',
    inputSchema: {
      type: 'object',
      properties: {
        period: periodProp(), since: sinceProp(), until: untilProp(),
        dimension: { type: 'string', enum: ['age', 'gender', 'both'], default: 'both' },
      },
    },
    handler: async ({ period, since, until, dimension = 'both' }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const out = {};
      if (dimension === 'age' || dimension === 'both') {
        const rows = await getAgeBreakdown(opts);
        out.by_age = topByReach(rows, 'age', 10);
      }
      if (dimension === 'gender' || dimension === 'both') {
        const rows = await getGenderBreakdown(opts);
        out.by_gender = topByReach(rows, 'gender', 5);
      }
      return ok(out);
    },
  },
  {
    name: 'region_breakdown',
    description: 'Top regiones (provincias/estados) por cantidad de personas alcanzadas a nivel cuenta en el período.',
    inputSchema: {
      type: 'object',
      properties: { period: periodProp(), since: sinceProp(), until: untilProp(), limit: { type: 'number', default: 10 } },
    },
    handler: async ({ period, since, until, limit = 10 }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const rows = await getRegionBreakdown(opts);
      return ok({ regions: topByReach(rows, 'region', limit) });
    },
  },
  {
    name: 'platform_breakdown',
    description: 'Distribución por plataforma y posición a nivel cuenta (Instagram Reels, IG Stories, FB Feed, etc.) en el período.',
    inputSchema: { type: 'object', properties: { period: periodProp(), since: sinceProp(), until: untilProp() } },
    handler: async ({ period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const rows = await getPlatformBreakdown(opts);
      const grouped = rows.map(r => ({
        publisher: r.publisher_platform,
        position: r.platform_position,
        display_name: platformDisplayName(r),
        reach: Number(r.reach || 0),
        spend: Number(r.spend || 0),
        results: sumResults(r.actions),
      })).sort((a, b) => b.reach - a.reach);
      return ok({ platforms: grouped });
    },
  },
  {
    name: 'ad_audience_breakdown',
    description: 'Distribución por edad de UN anuncio específico. Útil para entender a quién está llegando ese creativo en particular.',
    inputSchema: {
      type: 'object',
      properties: { ad_id: { type: 'string' }, period: periodProp(), since: sinceProp(), until: untilProp() },
      required: ['ad_id'],
    },
    handler: async ({ ad_id, period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const rows = await getAdAgeBreakdown(ad_id, opts);
      return ok({ ad_id, by_age: topByReach(rows, 'age', 10) });
    },
  },
  {
    name: 'ad_platform_breakdown',
    description: 'Distribución por plataforma y posición de UN anuncio específico (qué porcentaje viene de IG Reels vs Stories vs FB Feed).',
    inputSchema: {
      type: 'object',
      properties: { ad_id: { type: 'string' }, period: periodProp(), since: sinceProp(), until: untilProp() },
      required: ['ad_id'],
    },
    handler: async ({ ad_id, period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const rows = await getAdPlatformBreakdown(ad_id, opts);
      const grouped = rows.map(r => ({
        publisher: r.publisher_platform,
        position: r.platform_position,
        display_name: platformDisplayName(r),
        reach: Number(r.reach || 0),
        spend: Number(r.spend || 0),
        results: sumResults(r.actions),
      })).sort((a, b) => b.reach - a.reach);
      return ok({ ad_id, platforms: grouped });
    },
  },
  {
    name: 'ad_device_breakdown',
    description: 'Distribución por dispositivo (móvil/desktop) de UN anuncio específico.',
    inputSchema: {
      type: 'object',
      properties: { ad_id: { type: 'string' }, period: periodProp(), since: sinceProp(), until: untilProp() },
      required: ['ad_id'],
    },
    handler: async ({ ad_id, period, since, until }) => {
      const opts = buildPeriodOpts({ period, since, until });
      const rows = await getAdDeviceBreakdown(ad_id, opts);
      return ok({ ad_id, devices: costPerResultByKey(rows, 'device_platform') });
    },
  },
];
