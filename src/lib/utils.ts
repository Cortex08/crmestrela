import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number | null | undefined) =>
  value || value === 0
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    : '—';

/** Converte data 'yyyy-MM-dd' para dd/MM/yyyy sem erro de fuso horário */
export const formatDateBR = (value: string | null | undefined) => {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
};

/** Número de texto do formulário → número ou null (aceita vírgula) */
export const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const toInt = (value: string | number | null | undefined): number | null => {
  const n = toNumber(value);
  return n === null ? null : Math.trunc(n);
};

export const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

/** Mensagem amigável para erros do banco */
export const friendlyError = (error: any, fallback = 'Ocorreu um erro') => {
  const msg: string = error?.message || '';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'Você não tem permissão para esta ação';
  }
  // mensagens escritas de propósito nas funções do banco (raise exception) já são claras para o usuário
  if (error?.code === 'P0001' && msg) return msg;
  if (error?.code === '23505') return 'Já existe um registro com esses dados (código duplicado)';
  if (error?.code === '23514') return 'Algum valor está fora do permitido. Confira os campos.';
  if (error?.code === '23503') return 'Este registro está vinculado a outros dados';
  return fallback;
};
