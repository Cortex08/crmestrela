import type { SiteImovel } from './api';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const moeda = (v: number | null | undefined) => (v || v === 0 ? brl.format(v) : '');

export const precoDe = (i: Pick<SiteImovel, 'tipo' | 'valor_venda' | 'valor_aluguel'>) =>
  i.tipo === 'venda' ? i.valor_venda : i.valor_aluguel;

export const precoTexto = (i: Pick<SiteImovel, 'tipo' | 'valor_venda' | 'valor_aluguel'>) => {
  const v = precoDe(i);
  return v ? moeda(v) : 'Consulte o valor';
};

export const finalidadeTexto = (t: string) => (t === 'venda' ? 'Venda' : 'Aluguel');

export const local = (i: Pick<SiteImovel, 'bairro' | 'cidade' | 'estado'>) =>
  [i.bairro, [i.cidade, i.estado].filter(Boolean).join(' - ')].filter(Boolean).join(', ');

export const soDigitos = (s: string) => s.replace(/\D/g, '');

export const mascaraZap = (s: string) => {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const linkWhatsApp = (numero: string, texto?: string) => {
  let d = soDigitos(numero);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
};

export const num = (v: string | null) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
