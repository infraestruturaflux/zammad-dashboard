// ── Dados fictícios para testar o frontend sem backend ────────────────────────
// Ativado quando USE_MOCK = true em client.js

const NOW = new Date().toISOString()
const TODAY = new Date().toISOString().slice(0, 10)

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function minutesAgo(n) {
  return new Date(Date.now() - n * 60_000).toISOString()
}

// ── Analistas fictícios ───────────────────────────────────────────────────────

export const MOCK_ANALYSTS = [
  'joao.bortolaci@flux.net.br',
  'thiago.venter.ext@flux.net.br',
  'lucas.oliveira@flux.net.br',
  'amanda.silva@flux.net.br',
  'carlos.pereira@flux.net.br',
  'fernanda.santos@flux.net.br',
  'rafael.costa@flux.net.br',
]

// ── /noc/queue ────────────────────────────────────────────────────────────────

export const MOCK_QUEUE = {
  chamados_abertos: 8,
  em_atendimento: 14,
  aguardando_cliente: 22,
  aguardando_terceiros: 11,
  resolvidos_hoje: 7,
  fechados_hoje: 3,
  synced_at: minutesAgo(2),
  trend_chamados_abertos: -12.5,
  trend_em_atendimento: 7.1,
  trend_aguardando_cliente: -4.3,
  trend_aguardando_terceiros: 18.2,
  trend_resolvidos_hoje: 40.0,
  trend_fechados_hoje: -25.0,
}

// ── /noc/sla-alerts ───────────────────────────────────────────────────────────

export const MOCK_SLA_ALERTS = {
  count: 3,
  alerts: [
    {
      ticket_id: 1001,
      number: '20458',
      title: 'Falha intermitente na VPN corporativa - filial Sul',
      priority: '5 Muito Alto',
      customer: 'Transportadora Meridional',
      group: 'NOC - Infra',
      sla_deadline: minutesAgo(-8),
      minutes_remaining: 8.2,
      breach_type: 'response',
    },
    {
      ticket_id: 1002,
      number: '20441',
      title: 'Lentidão no acesso ao ERP após atualização',
      priority: '4 Alto',
      customer: 'Industrias Renner SA',
      group: 'NOC - Sistemas',
      sla_deadline: minutesAgo(-23),
      minutes_remaining: 23.5,
      breach_type: 'solution',
    },
    {
      ticket_id: 1003,
      number: '20389',
      title: 'Link redundante inativo há 2 dias',
      priority: '4 Alto',
      customer: 'Porto Alegre Distribuidora',
      group: 'NOC - Redes',
      sla_deadline: minutesAgo(-47),
      minutes_remaining: 47.0,
      breach_type: 'response',
    },
  ],
}

// ── /noc/team-now ─────────────────────────────────────────────────────────────

export const MOCK_TEAM_NOW = {
  total_tickets: 14,
  members: [
    { owner: 'thiago.venter.ext@flux.net.br', active_count: 4 },
    { owner: 'joao.bortolaci@flux.net.br',    active_count: 3 },
    { owner: 'lucas.oliveira@flux.net.br',    active_count: 3 },
    { owner: 'amanda.silva@flux.net.br',      active_count: 2 },
    { owner: 'fernanda.santos@flux.net.br',   active_count: 2 },
  ],
}

// ── /noc/activity ─────────────────────────────────────────────────────────────

export const MOCK_ACTIVITY = {
  count: 10,
  events: [
    { ticket_id: 2001, number: '20461', title: 'Sem acesso ao sistema de ponto eletrônico', event_type: 'created', actor: 'joao.bortolaci@flux.net.br',  state: 'Em atendimento', happened_at: minutesAgo(3)  },
    { ticket_id: 2002, number: '20460', title: 'Impressora da recepção não responde na rede', event_type: 'updated', actor: 'amanda.silva@flux.net.br',    state: 'Aguardando Cliente', happened_at: minutesAgo(7)  },
    { ticket_id: 2003, number: '20458', title: 'Falha intermitente na VPN corporativa', event_type: 'updated', actor: 'thiago.venter.ext@flux.net.br', state: 'Em atendimento', happened_at: minutesAgo(12) },
    { ticket_id: 2004, number: '20455', title: 'E-mails não chegando para domínio externo', event_type: 'closed',  actor: 'lucas.oliveira@flux.net.br',  state: 'Resolvido', happened_at: minutesAgo(18) },
    { ticket_id: 2005, number: '20452', title: 'Câmeras do estacionamento offline', event_type: 'created', actor: null, state: 'Aberto', happened_at: minutesAgo(25) },
    { ticket_id: 2006, number: '20449', title: 'Erro ao acessar pasta compartilhada', event_type: 'updated', actor: 'fernanda.santos@flux.net.br',  state: 'Aguardando Terceiros', happened_at: minutesAgo(31) },
    { ticket_id: 2007, number: '20445', title: 'Queda de link principal - matriz', event_type: 'updated', actor: 'thiago.venter.ext@flux.net.br', state: 'Escalonado INFRA', happened_at: minutesAgo(40) },
    { ticket_id: 2008, number: '20441', title: 'Lentidão no acesso ao ERP após atualização', event_type: 'closed',  actor: 'joao.bortolaci@flux.net.br',  state: 'Fechado', happened_at: minutesAgo(55) },
    { ticket_id: 2009, number: '20438', title: 'Certificado SSL expirado no portal do cliente', event_type: 'created', actor: 'carlos.pereira@flux.net.br',  state: 'Em atendimento', happened_at: minutesAgo(68) },
    { ticket_id: 2010, number: '20431', title: 'Wifi do andar 3 instável após manutenção', event_type: 'updated', actor: 'rafael.costa@flux.net.br',    state: 'Aguardando Cliente', happened_at: minutesAgo(90) },
  ],
}

// ── /noc/today-analyst-load ───────────────────────────────────────────────────

export const MOCK_TODAY_ANALYST_LOAD = {
  date: TODAY,
  total: 19,
  items: [
    { owner: 'thiago.venter.ext@flux.net.br', ticket_count: 5 },
    { owner: 'joao.bortolaci@flux.net.br',    ticket_count: 4 },
    { owner: 'lucas.oliveira@flux.net.br',    ticket_count: 4 },
    { owner: 'amanda.silva@flux.net.br',      ticket_count: 3 },
    { owner: 'fernanda.santos@flux.net.br',   ticket_count: 2 },
    { owner: 'carlos.pereira@flux.net.br',    ticket_count: 1 },
  ],
}

// ── /noc/today-feed ───────────────────────────────────────────────────────────

export const MOCK_TODAY_FEED = {
  date: TODAY,
  count: 12,
  tickets: [
    { ticket_id: 3001, number: '20461', title: 'Sem acesso ao sistema de ponto eletrônico', state: 'Em atendimento', owner: 'joao.bortolaci@flux.net.br',  group: 'NOC - Sistemas', created_at: minutesAgo(3)   },
    { ticket_id: 3002, number: '20460', title: 'Impressora da recepção não responde na rede', state: 'Aguardando Cliente', owner: 'amanda.silva@flux.net.br',    group: 'NOC - Infra',    created_at: minutesAgo(15)  },
    { ticket_id: 3003, number: '20459', title: 'Usuário bloqueado no Active Directory', state: 'Resolvido', owner: 'rafael.costa@flux.net.br',    group: 'NOC - Sistemas', created_at: minutesAgo(42)  },
    { ticket_id: 3004, number: '20458', title: 'Falha intermitente na VPN corporativa', state: 'Em atendimento', owner: 'thiago.venter.ext@flux.net.br', group: 'NOC - Redes',    created_at: minutesAgo(68)  },
    { ticket_id: 3005, number: '20457', title: 'Atualização do antivírus falhando em 12 máquinas', state: 'Aguardando Terceiros', owner: 'fernanda.santos@flux.net.br',   group: 'NOC - Infra',    created_at: minutesAgo(95)  },
    { ticket_id: 3006, number: '20456', title: 'Sem acesso ao drive Z: após migração', state: 'Em atendimento', owner: 'lucas.oliveira@flux.net.br',  group: 'NOC - Sistemas', created_at: minutesAgo(130) },
    { ticket_id: 3007, number: '20455', title: 'E-mails não chegando para domínio externo', state: 'Aberto', owner: null, group: 'NOC - Redes', created_at: minutesAgo(160) },
    { ticket_id: 3008, number: '20454', title: 'Câmeras do estacionamento offline', state: 'Aberto', owner: null, group: 'NOC - Infra', created_at: minutesAgo(200) },
    { ticket_id: 3009, number: '20453', title: 'Lentidão no carregamento do Totvs', state: 'Fechado', owner: 'carlos.pereira@flux.net.br',  group: 'NOC - Sistemas', created_at: minutesAgo(240) },
    { ticket_id: 3010, number: '20452', title: 'Switch do rack 2 com porta travada', state: 'Em atendimento', owner: 'thiago.venter.ext@flux.net.br', group: 'NOC - Redes',    created_at: minutesAgo(290) },
    { ticket_id: 3011, number: '20451', title: 'Firewall bloqueando acesso ao portal bancário', state: 'Aguardando Cliente', owner: 'amanda.silva@flux.net.br',    group: 'NOC - Redes',    created_at: minutesAgo(340) },
    { ticket_id: 3012, number: '20450', title: 'Notebook da gerência sem conectividade Wi-Fi', state: 'Resolvido', owner: 'joao.bortolaci@flux.net.br',  group: 'NOC - Infra',    created_at: minutesAgo(400) },
  ],
}

// ── /metrics/team-status ──────────────────────────────────────────────────────

export const MOCK_TEAM_STATUS = {
  total: 44,
  analysts: [
    { owner: 'thiago.venter.ext@flux.net.br', em_atend: 4, escal_dev: 1, ag_cliente: 3, ag_terceiros: 2, total: 10 },
    { owner: 'joao.bortolaci@flux.net.br',    em_atend: 3, escal_dev: 0, ag_cliente: 2, ag_terceiros: 3, total: 8 },
    { owner: 'lucas.oliveira@flux.net.br',    em_atend: 3, escal_dev: 2, ag_cliente: 2, ag_terceiros: 1, total: 8 },
    { owner: 'amanda.silva@flux.net.br',      em_atend: 2, escal_dev: 3, ag_cliente: 0, ag_terceiros: 2, total: 7 },
    { owner: 'fernanda.santos@flux.net.br',   em_atend: 3, escal_dev: 0, ag_cliente: 2, ag_terceiros: 0, total: 5 },
    { owner: 'carlos.pereira@flux.net.br',    em_atend: 2, escal_dev: 0, ag_cliente: 2, ag_terceiros: 1, total: 5 },
    { owner: 'rafael.costa@flux.net.br',      em_atend: 1, escal_dev: 0, ag_cliente: 0, ag_terceiros: 0, total: 1 },
  ],
}

const MOCK_STATE_LABELS = ['Em atendimento', 'Escalonado Dev', 'Aguardando Cliente', 'Aguardando Terceiros']

export function mockAnalystTickets(owner) {
  const row = MOCK_TEAM_STATUS.analysts.find(a => a.owner === owner)
  const total = row?.total ?? 6
  const tickets = []
  let num = 22890 + Math.floor(seed(owner || '') * 400)
  const spread = [
    ...Array(row?.em_atend ?? 2).fill('Em atendimento'),
    ...Array(row?.escal_dev ?? 0).fill('Escalonado Dev'),
    ...Array(row?.ag_cliente ?? 2).fill('Aguardando Cliente'),
    ...Array(row?.ag_terceiros ?? 1).fill('Aguardando Terceiros'),
  ]
  const src = spread.length ? spread : Array(total).fill(MOCK_STATE_LABELS[0])
  src.forEach((state, i) => {
    tickets.push({
      number: String(num++),
      title:  MOCK_TICKET_TITLES[(Math.floor(seed(owner + i) * 100)) % MOCK_TICKET_TITLES.length],
      state,
    })
  })
  return { owner, tickets, total: tickets.length }
}

// ── /metrics/day-tickets ──────────────────────────────────────────────────────

export function mockDayTickets(date) {
  const n = 6 + Math.floor(seed(date || '') * 10)
  const GROUPS = ['Entrantes', 'SBC', 'ROTAS', 'PABX', 'Omnichannel', 'Suporte N2']
  const STATES = ['Em atendimento', 'Aguardando Cliente', 'Aguardando Terceiros', 'Resolvido']
  const tickets = []
  let num = 2280000 + Math.floor(seed(date) * 6000)
  for (let i = 0; i < n; i++) {
    tickets.push({
      number: String(num++),
      title: MOCK_TICKET_TITLES[Math.floor(seed(date + i) * 100) % MOCK_TICKET_TITLES.length],
      state: STATES[i % STATES.length],
      group: GROUPS[Math.floor(seed(date + 'g' + i) * 100) % GROUPS.length],
      owner: MOCK_ANALYSTS[i % MOCK_ANALYSTS.length],
      customer: 'cliente@exemplo.com.br',
    })
  }
  const gc = {}
  tickets.forEach(t => { gc[t.group] = (gc[t.group] || 0) + 1 })
  const groups = Object.entries(gc).map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count)
  return { date, total: tickets.length, groups, tickets }
}

// ── /metrics/state-tickets ────────────────────────────────────────────────────

export function mockStateTickets(bucket) {
  const stateLabel = { em_atend: 'Em atendimento', ag_cliente: 'Aguardando Cliente', ag_terceiros: 'Aguardando Terceiros', abertos: 'Aberto', resolvidos: 'Resolvido' }[bucket] || 'Em atendimento'
  const n = 5 + Math.floor(seed(bucket) * 12)
  const tickets = []
  let num = 22930 + Math.floor(seed(bucket) * 500)
  for (let i = 0; i < n; i++) {
    tickets.push({
      number: String(num++),
      title: MOCK_TICKET_TITLES[Math.floor(seed(bucket + i) * 100) % MOCK_TICKET_TITLES.length],
      state: stateLabel,
      owner: MOCK_ANALYSTS[i % MOCK_ANALYSTS.length],
    })
  }
  return { bucket, tickets, total: tickets.length }
}

// ── /metrics/top-offenders ────────────────────────────────────────────────────

export function mockTopOffenders(by) {
  if (by === 'group') {
    return {
      by: 'group',
      items: [
        { name: 'NOC - Redes',    ticket_count: 38, priority_breakdown: { '3 Normal': 18, '4 Alto': 14, '5 Muito Alto': 6 } },
        { name: 'NOC - Infra',    ticket_count: 31, priority_breakdown: { '3 Normal': 20, '4 Alto': 9,  '5 Muito Alto': 2 } },
        { name: 'NOC - Sistemas', ticket_count: 27, priority_breakdown: { '2 Baixo': 5, '3 Normal': 16, '4 Alto': 6 } },
        { name: 'NOC - Segurança',ticket_count: 14, priority_breakdown: { '3 Normal': 8, '4 Alto': 4, '5 Muito Alto': 2 } },
        { name: 'NOC - Field',    ticket_count: 9,  priority_breakdown: { '3 Normal': 7, '4 Alto': 2 } },
      ],
    }
  }
  return {
    by: 'customer',
    items: [
      { name: 'Transportadora Meridional', ticket_count: 17, priority_breakdown: { '3 Normal': 8, '4 Alto': 7, '5 Muito Alto': 2 } },
      { name: 'Industrias Renner SA',      ticket_count: 14, priority_breakdown: { '3 Normal': 9, '4 Alto': 5 } },
      { name: 'Porto Alegre Distribuidora',ticket_count: 11, priority_breakdown: { '2 Baixo': 2, '3 Normal': 7, '4 Alto': 2 } },
      { name: 'Grupo Gaúcho Comercial',    ticket_count: 9,  priority_breakdown: { '3 Normal': 6, '4 Alto': 3 } },
      { name: 'Farmacias Boa Saúde',       ticket_count: 7,  priority_breakdown: { '3 Normal': 5, '4 Alto': 2 } },
    ],
  }
}

// ── /metrics/top-offender-detail ─────────────────────────────────────────────

export function mockTopOffenderDetail(by, name) {
  return {
    by,
    name,
    tickets: [
      { number: '20458', title: 'Falha intermitente na VPN corporativa',        priority: '5 Muito Alto', owner: 'thiago.venter.ext@flux.net.br', state: 'Em atendimento'   },
      { number: '20441', title: 'Lentidão no acesso ao ERP após atualização',   priority: '4 Alto',       owner: 'joao.bortolaci@flux.net.br',    state: 'Em atendimento'   },
      { number: '20389', title: 'Link redundante inativo há 2 dias',            priority: '4 Alto',       owner: 'lucas.oliveira@flux.net.br',    state: 'Aguardando Terceiros' },
      { number: '20371', title: 'Erro de certificado no portal interno',        priority: '3 Normal',     owner: 'amanda.silva@flux.net.br',      state: 'Aguardando Cliente'  },
      { number: '20360', title: 'Queda de link backup - unidade Canoas',        priority: '4 Alto',       owner: 'fernanda.santos@flux.net.br',   state: 'Em atendimento'   },
    ],
  }
}

// ── /metrics/analyst-load ─────────────────────────────────────────────────────

export const MOCK_ANALYST_LOAD = {
  items: [
    { owner: 'thiago.venter.ext@flux.net.br', ticket_count: 52 },
    { owner: 'joao.bortolaci@flux.net.br',    ticket_count: 47 },
    { owner: 'lucas.oliveira@flux.net.br',    ticket_count: 41 },
    { owner: 'amanda.silva@flux.net.br',      ticket_count: 38 },
    { owner: 'fernanda.santos@flux.net.br',   ticket_count: 29 },
    { owner: 'carlos.pereira@flux.net.br',    ticket_count: 23 },
    { owner: 'rafael.costa@flux.net.br',      ticket_count: 18 },
  ],
}

// ── /metrics/analyst-day-detail ──────────────────────────────────────────────

export function mockAnalystDayDetail(date) {
  return {
    date,
    total: 19,
    analysts: [
      {
        owner: 'thiago.venter.ext@flux.net.br',
        ticket_count: 5,
        tickets: [
          { number: '20458', title: 'Falha intermitente na VPN corporativa',  state: 'Em atendimento'      },
          { number: '20445', title: 'Queda de link principal - matriz',        state: 'Escalonado INFRA'    },
          { number: '20410', title: 'Roteador sem resposta após reinício',     state: 'Aguardando Terceiros'},
          { number: '20399', title: 'VLAN de produção inacessível',            state: 'Em atendimento'      },
          { number: '20452', title: 'Switch do rack 2 com porta travada',      state: 'Em atendimento'      },
        ],
      },
      {
        owner: 'joao.bortolaci@flux.net.br',
        ticket_count: 4,
        tickets: [
          { number: '20461', title: 'Sem acesso ao sistema de ponto eletrônico', state: 'Em atendimento'   },
          { number: '20441', title: 'Lentidão no acesso ao ERP',                 state: 'Em atendimento'   },
          { number: '20412', title: 'Usuário sem permissão no Sharepoint',        state: 'Aguardando Cliente'},
          { number: '20450', title: 'Notebook da gerência sem Wi-Fi',             state: 'Resolvido'        },
        ],
      },
      {
        owner: 'lucas.oliveira@flux.net.br',
        ticket_count: 4,
        tickets: [
          { number: '20456', title: 'Sem acesso ao drive Z: após migração',   state: 'Em atendimento'      },
          { number: '20389', title: 'Link redundante inativo há 2 dias',       state: 'Aguardando Terceiros'},
          { number: '20422', title: 'Backup não concluído — disco cheio',      state: 'Em atendimento'      },
          { number: '20401', title: 'Servidor de arquivos lento',              state: 'Aguardando Cliente'  },
        ],
      },
      {
        owner: 'amanda.silva@flux.net.br',
        ticket_count: 3,
        tickets: [
          { number: '20460', title: 'Impressora da recepção não responde',     state: 'Aguardando Cliente'  },
          { number: '20371', title: 'Erro de certificado no portal interno',   state: 'Aguardando Cliente'  },
          { number: '20451', title: 'Firewall bloqueando portal bancário',     state: 'Aguardando Cliente'  },
        ],
      },
      {
        owner: 'fernanda.santos@flux.net.br',
        ticket_count: 2,
        tickets: [
          { number: '20457', title: 'Antivírus falhando em 12 máquinas',       state: 'Aguardando Terceiros'},
          { number: '20449', title: 'Erro ao acessar pasta compartilhada',      state: 'Aguardando Terceiros'},
        ],
      },
      {
        owner: 'carlos.pereira@flux.net.br',
        ticket_count: 1,
        tickets: [
          { number: '20438', title: 'Certificado SSL expirado no portal',       state: 'Em atendimento'     },
        ],
      },
    ],
  }
}

// ── /metrics/daily-volume (global) ───────────────────────────────────────────

function generateDailyVolume(month) {
  const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const today = new Date()
  const points = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m - 1, d)
    if (dt > today) break
    const dow = dt.getDay()
    const isWeekend = dow === 0 || dow === 6
    const base = isWeekend ? 4 : 16
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

    const criados        = rand(base, base + 8)
    const em_atendimento = rand(5, 18)
    const ag_cliente     = rand(8, 25)
    const ag_terceiros   = rand(4, 14)
    const resolvidos     = rand(Math.floor(criados * 0.4), Math.floor(criados * 0.8))
    const fechados       = rand(1, 5)

    points.push({
      date: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
      dia:  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      criados,
      resolvidos,
      fechados,
      em_atendimento,
      ag_cliente,
      ag_terceiros,
    })
  }
  return { mode: 'global', points }
}

function generateAnalystVolume(month, owner) {
  const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const today = new Date()
  const points = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m - 1, d)
    if (dt > today) break
    const dow = dt.getDay()
    const isWeekend = dow === 0 || dow === 6
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

    const trabalhados = isWeekend ? rand(0, 2) : rand(3, 10)
    const resolvidos  = isWeekend ? rand(0, 1) : rand(1, 4)

    points.push({
      date:       `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
      dia:        `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      trabalhados,
      resolvidos,
    })
  }
  return { mode: 'analyst', owner, points }
}

export function mockDailyVolume(month, owner) {
  if (owner) return generateAnalystVolume(month, owner)
  return generateDailyVolume(month)
}

// ── Performance (MTTR / MTTA / Volume / Analistas) ────────────────────────────

export const MOCK_MTTR_STATS = {
  count: 412,
  start_date: '2026-05-01',
  end_date:   '2026-05-31',
  wall_mean_h: 31.4,  wall_mean_fmt: '31h 24min',
  wall_p50_h:  18.2,  wall_p50_fmt:  '18h 12min',
  wall_p90_h:  72.5,  wall_p90_fmt:  '72h 30min',
  wall_p95_h:  96.0,  wall_p95_fmt:  '96h 0min',
  biz_mean_h:  9.7,   biz_mean_fmt:  '9h 42min',
  biz_p50_h:   5.1,   biz_p50_fmt:   '5h 6min',
  biz_p90_h:   22.3,  biz_p90_fmt:   '22h 18min',
  biz_p95_h:   31.0,  biz_p95_fmt:   '31h 0min',
  // Período anterior — para cálculo de tendência no frontend
  prev_biz_mean_h: 11.3,
  prev_biz_p50_h:  6.2,
  prev_biz_p90_h:  26.1,
  prev_count: 388,
}

export const MOCK_MTTA_STATS = {
  count: 389,
  start_date: '2026-05-01',
  end_date:   '2026-05-31',
  wall_mean_h: 1.2,  wall_mean_fmt: '1h 12min',
  wall_p50_h:  0.4,  wall_p50_fmt:  '24min',
  wall_p90_h:  3.1,  wall_p90_fmt:  '3h 6min',
  wall_p95_h:  5.8,  wall_p95_fmt:  '5h 48min',
  biz_mean_h:  0.7,  biz_mean_fmt:  '42min',
  biz_p50_h:   0.2,  biz_p50_fmt:   '12min',
  biz_p90_h:   1.8,  biz_p90_fmt:   '1h 48min',
  biz_p95_h:   3.2,  biz_p95_fmt:   '3h 12min',
  note: null,
  prev_biz_mean_h: 0.95,
  prev_count: 371,
}

export const MOCK_SLA_STATS = {
  count:        412,
  met:          379,
  sla_pct:      92.0,
  start_date:   '2026-05-01',
  end_date:     '2026-05-31',
  prev_sla_pct: 88.5,
}

export const MOCK_VOLUME_BY_STATUS = {
  start_date: '2026-05-01',
  end_date:   '2026-05-31',
  entrantes: {
    total: 487,
    by_state: {
      em_atendimento: 43,
      ag_cliente:     112,
      ag_terceiros:   38,
      escalonado:     15,
      resolvido:      198,
      fechado:        74,
      novo:           7,
    },
  },
  saintes: {
    total: 272,
    by_state: {
      fechado:  218,
      resolvido: 54,
    },
  },
}

const MOCK_TICKET_TITLES = [
  'Cliente não recebe ligações de entrada',
  'Liberação de IP para cliente',
  'Linha não discando para celular',
  'Intermitência no PABX Virtual',
  'Portabilidade não concluída',
  'Ramal sem tom de discagem',
  'Integração CRM com falha',
  'Bloqueio de número indevido',
  'DDR não encaminhando chamadas',
  'Fatura com cobrança incorreta',
  'Acesso ao portal sem resposta',
  'Não recebe SMS',
  'Número apresentando ocupado',
  'VPN instável',
  'Solicitação de novo ramal',
]

export const MOCK_VOLUME_BY_GROUP = {
  start_date: '2026-05-01',
  end_date:   '2026-05-31',
  groups: [
    {
      name: 'Suporte N1',
      total: 198,
      by_state: { em_atendimento: 28, ag_cliente: 54, ag_terceiros: 12, resolvido: 81, fechado: 23 },
    },
    {
      name: 'Telecom',
      total: 124,
      by_state: { em_atendimento: 15, ag_cliente: 31, ag_terceiros: 22, resolvido: 44, fechado: 12 },
    },
    {
      name: 'Infraestrutura',
      total: 87,
      by_state: { em_atendimento: 8, ag_cliente: 19, ag_terceiros: 31, escalonado: 5, resolvido: 19, fechado: 5 },
    },
    {
      name: 'Desenvolvimento',
      total: 52,
      by_state: { em_atendimento: 11, ag_cliente: 8, escalonado: 14, resolvido: 15, fechado: 4 },
    },
    {
      name: 'Suporte N2',
      total: 41,
      by_state: { em_atendimento: 7, ag_cliente: 6, ag_terceiros: 9, resolvido: 16, fechado: 3 },
    },
  ],
}

export function mockVolumeStatusDetail(group, status) {
  const n = Math.floor(Math.random() * 8) + 3
  const states = {
    em_atendimento: 'Em atendimento',
    ag_cliente:     'Aguardando Cliente',
    ag_terceiros:   'Aguardando Terceiros',
    escalonado:     'Escalonado Dev',
    resolvido:      'Resolvido',
    fechado:        'closed',
    novo:           'new',
  }
  const stateLabel = states[status] || status
  const MOCK_CUSTOMERS = [
    'backoffice@flue.net.br', 'ti@empresa.com.br', 'suporte@cliente.com',
    'contato@telecom.net', 'admin@datacorp.io', 'noc@provedor.net.br',
    'gestao@fibra.com.br', 'helpdesk@corp.com',
  ]
  return {
    group,
    status,
    tickets: Array.from({ length: n }, () => ({
      number:   String(2260000 + Math.floor(Math.random() * 9999)),
      title:    MOCK_TICKET_TITLES[Math.floor(Math.random() * MOCK_TICKET_TITLES.length)],
      state:    stateLabel,
      owner:    MOCK_ANALYSTS[Math.floor(Math.random() * MOCK_ANALYSTS.length)],
      customer: MOCK_CUSTOMERS[Math.floor(Math.random() * MOCK_CUSTOMERS.length)],
      priority: 'Baixa',
    })),
    total: n,
  }
}

export const MOCK_ANALYST_PERFORMANCE = {
  start_date: '2026-05-01',
  end_date:   '2026-05-31',
  analysts: [
    { owner: 'joao.bortolaci@flux.net.br',    tickets_count: 72,
      active_biz_h: 48.2, waiting_biz_h: 31.5, active_fmt: '48h 12min', waiting_fmt: '31h 30min',
      active_wall_h: 142.5, waiting_wall_h: 89.3, active_wall_fmt: '142h 30min', waiting_wall_fmt: '89h 18min',
      fcr_pct: 78 },
    { owner: 'thiago.venter.ext@flux.net.br',  tickets_count: 65,
      active_biz_h: 41.0, waiting_biz_h: 28.3, active_fmt: '41h 0min',  waiting_fmt: '28h 18min',
      active_wall_h: 118.4, waiting_wall_h: 72.1, active_wall_fmt: '118h 24min', waiting_wall_fmt: '72h 6min',
      fcr_pct: 82 },
    { owner: 'lucas.oliveira@flux.net.br',     tickets_count: 58,
      active_biz_h: 35.8, waiting_biz_h: 44.1, active_fmt: '35h 48min', waiting_fmt: '44h 6min',
      active_wall_h: 97.2, waiting_wall_h: 131.5, active_wall_fmt: '97h 12min', waiting_wall_fmt: '131h 30min',
      fcr_pct: 61 },
    { owner: 'amanda.silva@flux.net.br',       tickets_count: 51,
      active_biz_h: 29.4, waiting_biz_h: 18.7, active_fmt: '29h 24min', waiting_fmt: '18h 42min',
      active_wall_h: 81.3, waiting_wall_h: 48.2, active_wall_fmt: '81h 18min', waiting_wall_fmt: '48h 12min',
      fcr_pct: 91 },
    { owner: 'carlos.pereira@flux.net.br',     tickets_count: 44,
      active_biz_h: 22.1, waiting_biz_h: 37.9, active_fmt: '22h 6min',  waiting_fmt: '37h 54min',
      active_wall_h: 58.7, waiting_wall_h: 103.4, active_wall_fmt: '58h 42min', waiting_wall_fmt: '103h 24min',
      fcr_pct: 54 },
    { owner: 'fernanda.santos@flux.net.br',    tickets_count: 39,
      active_biz_h: 18.6, waiting_biz_h: 12.3, active_fmt: '18h 36min', waiting_fmt: '12h 18min',
      active_wall_h: 49.2, waiting_wall_h: 31.8, active_wall_fmt: '49h 12min', waiting_wall_fmt: '31h 48min',
      fcr_pct: 87 },
    { owner: 'rafael.costa@flux.net.br',       tickets_count: 31,
      active_biz_h: 14.2, waiting_biz_h: 22.8, active_fmt: '14h 12min', waiting_fmt: '22h 48min',
      active_wall_h: 37.5, waiting_wall_h: 64.1, active_wall_fmt: '37h 30min', waiting_wall_fmt: '64h 6min',
      fcr_pct: 68 },
  ],
}

export const MOCK_MTTR_HISTORY = {
  months_count: 6,
  months: [
    { month: '2026-01', label: 'Jan/26', count: 857, biz_mean_h: 11.3, wall_mean_h: 35.2, biz_p90_h: 28.1 },
    { month: '2026-02', label: 'Fev/26', count: 721, biz_mean_h: 10.8, wall_mean_h: 33.5, biz_p90_h: 26.4 },
    { month: '2026-03', label: 'Mar/26', count: 634, biz_mean_h: 12.1, wall_mean_h: 38.7, biz_p90_h: 30.2 },
    { month: '2026-04', label: 'Abr/26', count: 578, biz_mean_h: 10.2, wall_mean_h: 31.8, biz_p90_h: 24.8 },
    { month: '2026-05', label: 'Mai/26', count: 412, biz_mean_h:  9.7, wall_mean_h: 31.4, biz_p90_h: 22.3 },
    { month: '2026-06', label: 'Jun/26', count: 108, biz_mean_h:  8.9, wall_mean_h: 29.1, biz_p90_h: 20.5 },
  ],
}

export const MOCK_SLA_HISTORY = {
  months_count: 6,
  months: [
    { month: '2026-01', label: 'Jan/26', count: 857, sla_pct: 87.2 },
    { month: '2026-02', label: 'Fev/26', count: 721, sla_pct: 89.5 },
    { month: '2026-03', label: 'Mar/26', count: 634, sla_pct: 85.8 },
    { month: '2026-04', label: 'Abr/26', count: 578, sla_pct: 91.2 },
    { month: '2026-05', label: 'Mai/26', count: 412, sla_pct: 92.0 },
    { month: '2026-06', label: 'Jun/26', count: 108, sla_pct: 94.4 },
  ],
}

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS SENSÍVEIS À DATA — para testar fluxos com períodos passados
// Os números variam de forma determinística conforme o período selecionado.
// ══════════════════════════════════════════════════════════════════════════════

/** Hash determinístico de uma string → número [0,1) estável */
function seed(str) {
  let h = 2166136261
  for (let i = 0; i < (str || '').length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

/** Fator multiplicador determinístico [min, max] a partir de um período */
function periodFactor(key, min = 0.7, max = 1.3) {
  return min + seed(key) * (max - min)
}

function fmtHours(h) {
  if (h == null) return '—'
  const totalMin = Math.round(h * 60)
  const hrs = Math.floor(totalMin / 60), mins = totalMin % 60
  return hrs > 0 ? (mins ? `${hrs}h ${mins}min` : `${hrs}h`) : `${mins}min`
}

/** Chave do período: usa month OU start-end */
function periodKey(month, start, end) {
  return month || `${start || ''}_${end || ''}` || 'default'
}

export function mockMTTRStats(month, start, end) {
  const k = periodKey(month, start, end)
  const f = periodFactor('mttr' + k)
  const biz = +(9.7 * f).toFixed(1)
  const wall = +(31.4 * f).toFixed(1)
  const prevF = periodFactor('mttr' + k + 'prev')
  return {
    count: Math.round(412 * f),
    start_date: start || `${month}-01`, end_date: end || `${month}-28`,
    biz_mean_h: biz,            biz_mean_fmt: fmtHours(biz),
    biz_p50_h: +(biz * 0.55).toFixed(1), biz_p50_fmt: fmtHours(biz * 0.55),
    biz_p90_h: +(biz * 2.3).toFixed(1),  biz_p90_fmt: fmtHours(biz * 2.3),
    biz_p95_h: +(biz * 3.2).toFixed(1),  biz_p95_fmt: fmtHours(biz * 3.2),
    wall_mean_h: wall,          wall_mean_fmt: fmtHours(wall),
    wall_p50_h: +(wall * 0.58).toFixed(1), wall_p50_fmt: fmtHours(wall * 0.58),
    wall_p90_h: +(wall * 2.3).toFixed(1),  wall_p90_fmt: fmtHours(wall * 2.3),
    prev_biz_mean_h: +(9.7 * prevF).toFixed(1),
    prev_biz_p50_h:  +(9.7 * 0.55 * prevF).toFixed(1),
    prev_biz_p90_h:  +(9.7 * 2.3 * prevF).toFixed(1),
    prev_count: Math.round(412 * prevF),
  }
}

export function mockMTTAStats(month, start, end) {
  const k = periodKey(month, start, end)
  const f = periodFactor('mtta' + k)
  const biz = +(0.7 * f).toFixed(2)
  const wall = +(1.2 * f).toFixed(2)
  return {
    count: Math.round(389 * f),
    start_date: start || `${month}-01`, end_date: end || `${month}-28`,
    biz_mean_h: biz,   biz_mean_fmt: fmtHours(biz),
    biz_p50_h: +(biz * 0.4).toFixed(2),  biz_p50_fmt: fmtHours(biz * 0.4),
    biz_p90_h: +(biz * 2.5).toFixed(2),  biz_p90_fmt: fmtHours(biz * 2.5),
    wall_mean_h: wall, wall_mean_fmt: fmtHours(wall),
    wall_p50_h: +(wall * 0.4).toFixed(2), wall_p50_fmt: fmtHours(wall * 0.4),
    wall_p90_h: +(wall * 2.6).toFixed(2), wall_p90_fmt: fmtHours(wall * 2.6),
    note: null,
    prev_biz_mean_h: +(0.7 * periodFactor('mtta' + k + 'prev')).toFixed(2),
  }
}

export function mockSLAStats(month, start, end) {
  const k = periodKey(month, start, end)
  const f = periodFactor('sla' + k, 0.92, 1.06)
  const pct = Math.min(99.5, +(89 * f).toFixed(1))
  const count = Math.round(412 * periodFactor('slacount' + k))
  return {
    count, met: Math.round(count * pct / 100), sla_pct: pct,
    start_date: start || `${month}-01`, end_date: end || `${month}-28`,
    prev_sla_pct: Math.min(99.5, +(89 * periodFactor('sla' + k + 'prev', 0.92, 1.06)).toFixed(1)),
  }
}

export function mockVolumeByGroup(month, start, end) {
  const k = periodKey(month, start, end)
  const base = MOCK_VOLUME_BY_GROUP.groups
  const groups = base.map((g, i) => {
    const f = periodFactor('vg' + k + g.name, 0.5, 1.5)
    const by_state = Object.fromEntries(
      Object.entries(g.by_state).map(([s, n]) => [s, Math.max(1, Math.round(n * f))])
    )
    return { name: g.name, by_state, total: Object.values(by_state).reduce((a, b) => a + b, 0) }
  }).sort((a, b) => b.total - a.total)
  return { start_date: start || `${month}-01`, end_date: end || `${month}-28`, groups }
}

export function mockAnalystPerformance(month, start, end) {
  const k = periodKey(month, start, end)
  const analysts = MOCK_ANALYST_PERFORMANCE.analysts.map(a => {
    const f = periodFactor('ap' + k + a.owner, 0.6, 1.4)
    const ab = +(a.active_biz_h * f).toFixed(1)
    const aw = +(a.active_wall_h * f).toFixed(1)
    // Divide a espera entre cliente (~60%) e terceiros (~40%), com variação por analista
    const cliShare = periodFactor('cli' + k + a.owner, 0.45, 0.75)
    const cb = +(a.waiting_biz_h * f * cliShare).toFixed(1)
    const tb = +(a.waiting_biz_h * f * (1 - cliShare)).toFixed(1)
    const cw = +(a.waiting_wall_h * f * cliShare).toFixed(1)
    const tw = +(a.waiting_wall_h * f * (1 - cliShare)).toFixed(1)
    return {
      owner: a.owner,
      tickets_count: Math.max(1, Math.round(a.tickets_count * f)),
      // úteis
      active_biz_h: ab, active_fmt: fmtHours(ab),
      ag_cliente_biz_h: cb,   ag_cliente_fmt: fmtHours(cb),
      ag_terceiros_biz_h: tb, ag_terceiros_fmt: fmtHours(tb),
      waiting_biz_h: +(cb + tb).toFixed(1), waiting_fmt: fmtHours(cb + tb),
      // corridas
      active_wall_h: aw, active_wall_fmt: fmtHours(aw),
      ag_cliente_wall_h: cw,   ag_cliente_wall_fmt: fmtHours(cw),
      ag_terceiros_wall_h: tw, ag_terceiros_wall_fmt: fmtHours(tw),
      waiting_wall_h: +(cw + tw).toFixed(1), waiting_wall_fmt: fmtHours(cw + tw),
      fcr_pct: Math.min(99, Math.max(35, Math.round(a.fcr_pct * periodFactor('fcr' + k + a.owner, 0.85, 1.12)))),
    }
  }).sort((a, b) => b.tickets_count - a.tickets_count)
  return { start_date: start || `${month}-01`, end_date: end || `${month}-28`, analysts }
}

/** Gera buckets de datas com granularidade automática (igual ao backend) */
function dateBuckets(start, end) {
  const d0 = new Date(start + 'T00:00:00')
  const d1 = new Date(end + 'T00:00:00')
  const span = Math.round((d1 - d0) / 86400000) + 1
  const buckets = []
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  if (span <= 31) {
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      buckets.push({
        start: d.toISOString().slice(0, 10), end: d.toISOString().slice(0, 10),
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      })
    }
  } else if (span <= 120) {
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 7)) {
      buckets.push({
        start: d.toISOString().slice(0, 10), end: d.toISOString().slice(0, 10),
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      })
    }
  } else {
    let y = d0.getFullYear(), m = d0.getMonth()
    while (y < d1.getFullYear() || (y === d1.getFullYear() && m <= d1.getMonth())) {
      buckets.push({
        start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        end:   `${y}-${String(m + 1).padStart(2, '0')}-28`,
        label: `${names[m]}/${String(y).slice(2)}`,
      })
      m++; if (m > 11) { m = 0; y++ }
    }
  }
  return { buckets, granularity: span <= 31 ? 'diário' : span <= 120 ? 'semanal' : 'mensal' }
}

export function mockHistoryRange(metric, start, end) {
  const { buckets, granularity } = dateBuckets(start, end)
  const points = buckets.map(b => {
    const k = b.start
    const pt = { start: b.start, end: b.end, label: b.label }
    if (metric === 'mttr' || metric === 'mtta') {
      const baseM = metric === 'mttr' ? 9.7 : 0.7
      const f = periodFactor(metric + k, 0.6, 1.5)
      pt.biz_mean_h  = +(baseM * f).toFixed(metric === 'mttr' ? 1 : 2)
      pt.wall_mean_h = +(baseM * f * 3.2).toFixed(1)
      pt.biz_p90_h   = +(baseM * f * 2.3).toFixed(1)
      pt.count       = Math.round((metric === 'mttr' ? 18 : 16) * periodFactor('c' + k, 0.5, 1.6))
    } else if (metric === 'sla') {
      pt.sla_pct = Math.min(99.5, +(89 * periodFactor('sla' + k, 0.9, 1.07)).toFixed(1))
      pt.count   = Math.round(18 * periodFactor('c' + k, 0.5, 1.6))
    } else if (metric === 'volume') {
      pt.criados  = Math.round(20 * periodFactor('vc' + k, 0.4, 1.7))
      pt.fechados = Math.round(16 * periodFactor('vf' + k, 0.4, 1.7))
      pt.count    = pt.criados
    }
    return pt
  })
  return { metric, start_date: start, end_date: end, granularity, points }
}
