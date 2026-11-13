import { supabase } from '@/integrations/supabase/client';

export type WaStatus = 'desconectado' | 'conectando' | 'conectado';
export interface WaChat { jid: string; name: string; phone: string | null; picture: string | null; last_text: string | null; last_at: number | null; unread: number; group: boolean }
export interface WaMessage { id: string; from_me: boolean; text: string; at: number | null; name: string | null }

/** Chama a função segura do servidor (a chave da Evolution API nunca chega ao navegador) */
export async function wa<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp', { body: { action, ...payload } });
  if (error || (data && data.error && data.configured !== false)) {
    let msg = data?.error;
    try { msg = msg || (await (error as any)?.context?.json())?.error; } catch { /* ignore */ }
    throw new Error(msg || 'Erro ao falar com o WhatsApp');
  }
  return data as T;
}
