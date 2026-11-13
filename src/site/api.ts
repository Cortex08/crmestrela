import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SiteImovel {
  codigo: string;
  titulo: string;
  tipo: 'venda' | 'locacao';
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_util: number | null;
  area_total: number | null;
  valor_venda: number | null;
  valor_aluguel: number | null;
  valor_condominio: number | null;
  valor_iptu?: number | null;
  aceita_pets: boolean | null;
  mobiliado: boolean | null;
  descricao?: string | null;
  fotos: string[] | null;
  created_at: string;
}

export interface SiteConfig {
  nome: string; slogan: string; telefone: string; whatsapp: string; email: string;
  endereco: string; creci: string; instagram: string; facebook: string; sobre: string;
}

export interface BuscaParams {
  finalidade?: string; cidade?: string; bairro?: string; quartos?: number; min?: number; max?: number;
  q?: string; ordem?: string; limite?: number; offset?: number;
}

export const configPadrao: SiteConfig = {
  nome: 'Grupo Estrela de Davi', slogan: '', telefone: '', whatsapp: '', email: '', endereco: '',
  creci: '', instagram: '', facebook: '', sobre: '',
};

export function useSiteConfig() {
  return useQuery({
    queryKey: ['site-config'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SiteConfig> => {
      const { data } = await supabase.from('site_settings' as any).select('*').eq('id', 1).maybeSingle();
      return { ...configPadrao, ...((data as any) || {}) };
    },
  });
}

export async function buscarImoveis(p: BuscaParams): Promise<{ total: number; itens: SiteImovel[] }> {
  const { data, error } = await supabase.rpc('site_imoveis' as any, {
    _finalidade: p.finalidade || null, _cidade: p.cidade || null, _bairro: p.bairro || null,
    _quartos_min: p.quartos || null, _preco_min: p.min || null, _preco_max: p.max || null,
    _busca: p.q || null, _ordem: p.ordem || 'recentes', _limite: p.limite ?? 12, _offset: p.offset ?? 0,
  });
  if (error) throw error;
  return data as any;
}

export async function buscarImovel(codigo: string): Promise<SiteImovel | null> {
  const { data, error } = await supabase.rpc('site_imovel' as any, { _codigo: codigo });
  if (error) throw error;
  return (data as any) || null;
}

export function useSiteFiltros() {
  return useQuery({
    queryKey: ['site-filtros'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.rpc('site_filtros' as any);
      const d: any = data || {};
      return { cidades: (d.cidades || []) as string[], bairros: (d.bairros || []) as { bairro: string; cidade: string }[] };
    },
  });
}

export async function enviarContato(v: { nome: string; whatsapp: string; email: string; mensagem: string; codigo?: string; origem: 'contato' | 'anunciar' }) {
  const { error } = await supabase.rpc('site_enviar_contato' as any, {
    _nome: v.nome, _whatsapp: v.whatsapp, _email: v.email, _mensagem: v.mensagem, _codigo: v.codigo || null, _origem: v.origem,
  });
  if (error) throw new Error(error.message || 'Não foi possível enviar. Tente novamente.');
}
