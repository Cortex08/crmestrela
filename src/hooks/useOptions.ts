import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Option { id: string; nome?: string; codigo?: string; endereco?: string; titulo?: string; tipo?: string; bairro?: string }

const fetchList = async (key: 'profiles' | 'clients' | 'properties'): Promise<Option[]> => {
  let q;
  if (key === 'profiles') q = supabase.from('profiles').select('id, nome').eq('status', 'ativo').order('nome');
  else if (key === 'clients') q = supabase.from('clients').select('id, nome, tipo').order('nome').limit(2000);
  else q = supabase.from('properties').select('id, codigo, endereco, titulo, bairro').order('codigo').limit(2000);
  const { data, error } = await q;
  // Sem permissão o banco simplesmente devolve lista vazia
  if (error) return [];
  return (data as Option[]) || [];
};

/** Listas usadas nos campos de seleção dos formulários (ficam em cache por 5 min) */
export const useOptions = (
  enabled: boolean,
  want: { profiles?: boolean; clients?: boolean; properties?: boolean },
) => {
  const opts = { staleTime: 5 * 60 * 1000 };
  const profiles = useQuery({ queryKey: ['opt', 'profiles'], queryFn: () => fetchList('profiles'), enabled: enabled && !!want.profiles, ...opts });
  const clients = useQuery({ queryKey: ['opt', 'clients'], queryFn: () => fetchList('clients'), enabled: enabled && !!want.clients, ...opts });
  const properties = useQuery({ queryKey: ['opt', 'properties'], queryFn: () => fetchList('properties'), enabled: enabled && !!want.properties, ...opts });
  return {
    profiles: profiles.data || [],
    clients: clients.data || [],
    properties: properties.data || [],
  };
};
