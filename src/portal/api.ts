import { supabase } from '@/integrations/supabase/client';

const URL_PORTAL = 'https://xwcuaicofmufcdzhtkqr.supabase.co/functions/v1/portal-cliente';
const CHAVE = 'portal_token';

export const getToken = (): string | null => {
  try { return sessionStorage.getItem(CHAVE); } catch { return null; }
};
export const setToken = (t: string | null) => {
  try { if (t) sessionStorage.setItem(CHAVE, t); else sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
};

export class PortalErro extends Error {
  sessaoExpirada = false;
  trocarSenha = false;
  motivo?: string;
  espera?: number;
}

/** Chama o servidor do portal. O token da sessão vai no cabeçalho; nunca o id do cliente. */
export async function chamar<T = any>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(URL_PORTAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-portal-token': getToken() || '' },
      body: JSON.stringify({ action, ...extra }),
    });
  } catch {
    throw new PortalErro('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }
  let j: any = null;
  try { j = await r.json(); } catch { /* resposta vazia */ }
  if (!r.ok || !j || j.ok === false) {
    const e = new PortalErro(j?.erro || 'Não foi possível concluir. Tente novamente.');
    if (j?.sessao === false) { e.sessaoExpirada = true; setToken(null); }
    if (j?.trocar_senha) e.trocarSenha = true;
    e.motivo = j?.motivo;
    e.espera = j?.espera;
    throw e;
  }
  return j as T;
}

/** Envia um arquivo pelo link temporário gerado pelo servidor. */
export async function enviarArquivo(file: File, tipo: 'foto' | 'documento') {
  const r = await chamar<{ bucket: string; path: string; token: string; url_publica: string | null }>('upload_url', { tipo, nome: file.name, tamanho: file.size });
  const { error } = await supabase.storage.from(r.bucket).uploadToSignedUrl(r.path, r.token, file, { contentType: file.type || undefined });
  if (error) throw new PortalErro('Não foi possível enviar o arquivo. Tente novamente.');
  return { path: r.path, url: r.url_publica };
}

export async function abrirArquivo(kind: 'contrato' | 'documento', id: string) {
  const win = window.open('', '_blank');
  try {
    const r = await chamar<{ url: string }>('baixar', { kind, id });
    if (win) { win.opener = null; win.location.href = r.url; } else window.open(r.url, '_blank', 'noopener');
  } catch (e) {
    win?.close();
    throw e;
  }
}
