export const STATUS_PROSPECT: Record<string, string> = {
  novo: 'Novo', em_contato: 'Em Contato', nao_interessado: 'Não Interessado', interessado: 'Interessado',
  em_negociacao: 'Em Negociação', captado: 'Captado', perdido: 'Perdido',
};
export const STATUS_PROSPECT_COLOR: Record<string, string> = {
  novo: 'bg-blue-500', em_contato: 'bg-yellow-500', nao_interessado: 'bg-gray-500', interessado: 'bg-green-500',
  em_negociacao: 'bg-purple-500', captado: 'bg-emerald-600', perdido: 'bg-red-500',
};
export const TIPO_IMOVEL_PROSPECT: Record<string, string> = {
  casa: 'Casa', apartamento: 'Apartamento', comercial: 'Comercial', terreno: 'Terreno', outro: 'Outro',
};
export const TIPO_CAPTACAO: Record<string, string> = { aluguel: 'Aluguel', venda: 'Venda', ambos: 'Ambos' };
export const PROXIMA_ACAO: Record<string, string> = {
  ligar_novamente: 'Ligar Novamente', enviar_whatsapp: 'Enviar WhatsApp', agendar_visita: 'Agendar Visita', arquivar: 'Arquivar',
};
export const RESULTADO_CONTATO: Record<string, string> = {
  nao_atendeu: 'Não Atendeu', caixa_postal: 'Caixa Postal', retornar_depois: 'Retornar Depois',
  nao_tem_interesse: 'Não Tem Interesse', interessado: 'Interessado', marcada_visita: 'Marcada Visita',
};
export const RESULTADO_COLOR: Record<string, string> = {
  nao_atendeu: 'bg-gray-500', caixa_postal: 'bg-gray-500', retornar_depois: 'bg-yellow-500',
  nao_tem_interesse: 'bg-red-500', interessado: 'bg-green-500', marcada_visita: 'bg-emerald-600',
};
export const FINAL_STATUS = ['captado', 'perdido', 'nao_interessado'];

/** Dias desde o último contato (ou desde o cadastro) */
export const diasSemContato = (p: any) => {
  const ref = p.ultimo_contato || p.created_at;
  if (!ref) return 0;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 864e5);
};
export const precisaAtencao = (p: any) => !FINAL_STATUS.includes(p.status) && diasSemContato(p) > 3;

export const fmtDate = (v?: string | null, time = false) => {
  if (!v) return '-';
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  if (isNaN(d.getTime())) return '-';
  return time ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('pt-BR');
};
