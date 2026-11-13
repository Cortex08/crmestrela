import { format, parseISO } from 'date-fns';

export const DEPARTAMENTOS: Record<string, string> = {
  comercial: 'Comercial', marketing: 'Marketing', administrativo: 'Administrativo', financeiro: 'Financeiro', documentacao: 'Documentação',
};
export const DEPARTAMENTO_CORES: Record<string, string> = {
  comercial: 'bg-orange-100 text-orange-700 border-orange-300',
  marketing: 'bg-purple-100 text-purple-700 border-purple-300',
  administrativo: 'bg-green-100 text-green-700 border-green-300',
  financeiro: 'bg-blue-100 text-blue-700 border-blue-300',
  documentacao: 'bg-amber-100 text-amber-700 border-amber-300',
};
export const CARGOS: Record<string, string> = {
  prospeccao: 'Prospecção', fechamento: 'Fechamento', documentacao: 'Documentação', atendimento: 'Atendimento',
  administrativo: 'Administrativo', marketing: 'Marketing', analise: 'Análise', financeiro: 'Financeiro',
};

export const STATUS_PONTO: Record<string, [string, string]> = {
  em_andamento: ['Em Andamento', 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'],
  completo: ['Completo', 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'],
  incompleto: ['Incompleto', 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'],
  justificado: ['Justificado', 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'],
};

/** Registro antigo que ficou "em andamento" é, na prática, incompleto */
export const statusPonto = (r: { status?: string | null; data: string; saida?: string | null }) => {
  const hoje = format(new Date(), 'yyyy-MM-dd');
  if (r.status === 'em_andamento' && r.data < hoje && !r.saida) return 'incompleto';
  return r.status || 'em_andamento';
};

export const fmtHora = (iso?: string | null) => {
  if (!iso) return '--:--';
  try { return format(parseISO(iso), 'HH:mm'); } catch { return '--:--'; }
};

/** Converte um interval do Postgres ("08:30:00", "1 day 02:00:00", "-01:00:00") em minutos */
export const intervalToMin = (v?: string | null): number => {
  if (!v) return 0;
  let total = 0;
  const day = v.match(/(-?\d+)\s*days?/);
  if (day) total += parseInt(day[1]) * 1440;
  const hms = v.match(/(-?)(\d+):(\d+)(?::(\d+))?/);
  if (hms) {
    const m = parseInt(hms[2]) * 60 + parseInt(hms[3]);
    total += hms[1] === '-' ? -m : m;
  }
  return total;
};

export const fmtMin = (min: number) => {
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60), m = a % 60;
  if (h === 0 && m === 0) return '0h';
  return `${sign}${h}h${m ? String(m).padStart(2, '0') : ''}`;
};

/** horas decimais → "2h30" */
export const fmtHorasDec = (h: number) => fmtMin((h || 0) * 60);

export const TIPOS_BANCO: Record<string, [string, string]> = {
  credito: ['Crédito (HE)', 'bg-green-100 text-green-800'],
  debito: ['Compensação', 'bg-blue-100 text-blue-800'],
  pagamento: ['Pagamento', 'bg-purple-100 text-purple-800'],
  expiracao: ['Expiração', 'bg-red-100 text-red-800'],
};

export const STATUS_FOLHA: Record<string, [string, string]> = {
  rascunho: ['Rascunho', 'bg-gray-100 text-gray-800'],
  calculado: ['Calculado', 'bg-blue-100 text-blue-800'],
  aprovado: ['Aprovado', 'bg-amber-100 text-amber-800'],
  pago: ['Pago', 'bg-green-100 text-green-800'],
};
