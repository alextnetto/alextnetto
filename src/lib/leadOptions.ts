/**
 * Choices of the contact form. Ids are stored in Trama (select fields cargo and faturamento)
 * and in the sheet as the Portuguese label; never rename an id that already has leads.
 */

export const ROLES = [
  { id: 'socio_fundador', pt: 'Sócio(a) ou fundador(a)', en: 'Founder or partner' },
  { id: 'ceo', pt: 'CEO ou presidente', en: 'CEO or president' },
  { id: 'c_level', pt: 'Diretor(a) ou C-level (CFO, COO, CTO, CMO)', en: 'Director or C-level (CFO, COO, CTO, CMO)' },
  { id: 'head_gerente', pt: 'Head ou gerente', en: 'Head or manager' },
  { id: 'coordenador', pt: 'Coordenador(a) ou supervisor(a)', en: 'Coordinator or supervisor' },
  { id: 'analista', pt: 'Analista ou especialista', en: 'Analyst or specialist' },
  { id: 'eventos', pt: 'Organizador(a) de eventos', en: 'Event organizer' },
  { id: 'academico', pt: 'Professor(a) ou gestor(a) acadêmico(a)', en: 'Professor or academic leader' },
  { id: 'consultor', pt: 'Consultor(a) ou agência', en: 'Consultant or agency' },
  { id: 'investidor', pt: 'Investidor(a)', en: 'Investor' },
  { id: 'outro', pt: 'Outro', en: 'Other' },
] as const;

export const REVENUE_BANDS = [
  { id: 'ate_1m', pt: 'Até R$ 1 milhão', en: 'Up to BRL 1 million' },
  { id: '1m_5m', pt: 'R$ 1 a 5 milhões', en: 'BRL 1 to 5 million' },
  { id: '5m_10m', pt: 'R$ 5 a 10 milhões', en: 'BRL 5 to 10 million' },
  { id: '10m_50m', pt: 'R$ 10 a 50 milhões', en: 'BRL 10 to 50 million' },
  { id: '50m_100m', pt: 'R$ 50 a 100 milhões', en: 'BRL 50 to 100 million' },
  { id: '100m_500m', pt: 'R$ 100 a 500 milhões', en: 'BRL 100 to 500 million' },
  { id: '500m_mais', pt: 'Acima de R$ 500 milhões', en: 'Above BRL 500 million' },
  { id: 'nao_informar', pt: 'Prefiro não informar', en: 'Prefer not to say' },
  { id: 'nao_se_aplica', pt: 'Não se aplica (evento, universidade)', en: 'Not applicable (event, university)' },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];
export type RevenueId = (typeof REVENUE_BANDS)[number]['id'];

export const roleLabel = (id?: string) => ROLES.find((role) => role.id === id)?.pt;
export const revenueLabel = (id?: string) => REVENUE_BANDS.find((band) => band.id === id)?.pt;
