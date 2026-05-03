/**
 * Configuración de las 4 métricas que se pueden visualizar en el big chart
 * y en los tabs. Cada una sabe cómo extraerse de un row de insights y cómo
 * formatearse para mostrar al usuario.
 *
 * Este archivo no importa nada del API client (lib/meta.js) — así puede
 * usarse desde client components sin arrastrar dependencias del server.
 */

const VALID_METRICS = new Set(['reach', 'spend', 'clicks', 'results']);

export function sanitizeMetric(value) {
  return VALID_METRICS.has(value) ? value : 'reach';
}

const numFmt   = new Intl.NumberFormat('es-AR');
const compact  = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const moneyAR  = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const moneyCmp = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });

const RESULT_ACTION_TYPES = new Set([
  'lead',
  'purchase',
  'complete_registration',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.lead_grouped',
]);

function sumResults(actions = []) {
  let total = 0;
  for (const a of actions || []) {
    if (RESULT_ACTION_TYPES.has(a.action_type)) total += Number(a.value || 0);
  }
  if (total === 0) {
    const lc = (actions || []).find(a => a.action_type === 'link_click');
    if (lc) total = Number(lc.value || 0);
  }
  return total;
}

export const METRIC_CONFIG = {
  reach: {
    label: 'Personas alcanzadas',
    unit:  'personas',
    sub:   'Personas alcanzadas por día',
    extract: (row) => Number(row.reach || 0),
    format:        (v) => numFmt.format(Math.round(v)),
    formatCompact: (v) => compact.format(v),
  },
  spend: {
    label: 'Inversión',
    unit:  '',
    sub:   'Inversión por día',
    extract: (row) => Number(row.spend || 0),
    format:        (v) => '$' + moneyAR.format(Math.round(v)),
    formatCompact: (v) => '$' + moneyCmp.format(v),
  },
  clicks: {
    label: 'Clics',
    unit:  'clics',
    sub:   'Clics en tus anuncios por día',
    extract: (row) => Number(row.clicks || 0),
    format:        (v) => numFmt.format(Math.round(v)),
    formatCompact: (v) => compact.format(v),
  },
  results: {
    label: 'Personas interesadas',
    unit:  'interesados',
    sub:   'Personas interesadas por día',
    extract: (row) => sumResults(row.actions),
    format:        (v) => numFmt.format(Math.round(v)),
    formatCompact: (v) => compact.format(v),
  },
};
