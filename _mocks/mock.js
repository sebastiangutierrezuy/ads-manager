/**
 * Datos mock — se usan cuando META_ACCESS_TOKEN no está configurado.
 * Estructura idéntica a lo que devuelve meta.js para que las páginas no
 * necesiten saber si están viendo datos reales o de prueba.
 */

export const mockAccountInsights = {
  spend: '58300',
  reach: '28400',
  impressions: '124300',
  clicks: '612',
  frequency: '4.37',
  ctr: '0.49',
  actions: [
    { action_type: 'link_click', value: '612' },
    { action_type: 'lead', value: '87' },
  ],
};

export const mockAccountInsightsPrev = {
  spend: '52100',
  reach: '24100',
  impressions: '98000',
  clicks: '561',
  actions: [
    { action_type: 'link_click', value: '561' },
    { action_type: 'lead', value: '90' },
  ],
};

export const mockCampaigns = [
  {
    id: '1',
    name: 'Promo otoño — Catálogo nuevo',
    status: 'ACTIVE',
    effective_status: 'ACTIVE',
    objective: 'OUTCOME_LEADS',
    daily_budget: '50000',
    insights: { data: [{
      spend: '24100', reach: '12400', clicks: '298', frequency: '2.1',
      actions: [{ action_type: 'lead', value: '52' }],
    }] },
    _platform: 'Instagram + Facebook',
    _health: 'good',
    _budget_used: 0.48,
    _budget_total: 50000,
    _msg: 'Va muy bien. Cada persona interesada te está costando $463, por debajo del promedio. Si querés, podés aumentar el presupuesto para tener más resultados.',
  },
  {
    id: '2',
    name: 'Más seguidores — Reels',
    status: 'ACTIVE',
    effective_status: 'LEARNING',
    objective: 'OUTCOME_AWARENESS',
    daily_budget: '35000',
    insights: { data: [{
      spend: '18200', reach: '9800', clicks: '184', frequency: '1.9',
      actions: [{ action_type: 'lead', value: '28' }],
    }] },
    _platform: 'Instagram',
    _health: 'warn',
    _budget_used: 0.52,
    _budget_total: 35000,
    _msg: 'Está en fase de aprendizaje. Meta todavía está descubriendo a qué personas mostrarle tus anuncios. Dejala correr 2-3 días más antes de tocarla.',
  },
  {
    id: '3',
    name: 'Recordatorio — Carritos abandonados',
    status: 'ACTIVE',
    effective_status: 'ACTIVE',
    objective: 'OUTCOME_SALES',
    daily_budget: '20000',
    insights: { data: [{
      spend: '11500', reach: '3100', clicks: '78', frequency: '5.4',
      actions: [{ action_type: 'lead', value: '4' }],
    }] },
    _platform: 'Facebook',
    _health: 'bad',
    _budget_used: 0.57,
    _budget_total: 20000,
    _msg: 'Está costando caro. Cada persona interesada cuesta $2.875, muy por encima de tus otras campañas. Te sugerimos cambiar la imagen del anuncio o pausarla.',
  },
  {
    id: '4',
    name: 'Conocé la marca',
    status: 'ACTIVE',
    effective_status: 'ACTIVE',
    objective: 'OUTCOME_AWARENESS',
    daily_budget: '10000',
    insights: { data: [{
      spend: '4500', reach: '3100', clicks: '52', frequency: '1.5',
      actions: [{ action_type: 'lead', value: '3' }],
    }] },
    _platform: 'Instagram + Facebook',
    _health: 'good',
    _budget_used: 0.45,
    _budget_total: 10000,
    _msg: 'Cumpliendo su objetivo. Esta campaña no busca ventas, busca que más gente conozca tu marca. Estás llegando a 3.100 personas nuevas por semana.',
  },
];
