import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImovelFormData } from '@/components/forms/ImovelFormFields';

/**
 * Rascunho automático do cadastro/edição de imóvel, guardado no navegador (localStorage).
 * Se a janela fechar por qualquer motivo (clique fora, página recarregada, navegador fechado),
 * ao abrir de novo o que estava preenchido volta — inclusive as fotos já enviadas.
 * É apagado quando o imóvel é salvo com sucesso ou quando a pessoa escolhe descartar.
 */

export interface Rascunho { formData: ImovelFormData; photos: string[]; salvoEm: number }

const PREFIXO = 'crm:rascunho-imovel:';
const VALIDADE = 30 * 24 * 60 * 60 * 1000; // 30 dias

export const lerRascunho = (chave: string): Rascunho | null => {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Rascunho;
    if (!r?.formData || Date.now() - (r.salvoEm || 0) > VALIDADE) { localStorage.removeItem(PREFIXO + chave); return null; }
    return r;
  } catch {
    return null;
  }
};

export const apagarRascunho = (chave: string) => {
  try { localStorage.removeItem(PREFIXO + chave); } catch { /* navegador sem armazenamento: ignora */ }
  window.dispatchEvent(new Event('crm-rascunho-imovel'));
};

/** Diz se existe rascunho (e atualiza quando um rascunho é salvo ou apagado) */
export const useTemRascunho = (chave: string) => {
  const [tem, setTem] = useState(() => !!lerRascunho(chave));
  useEffect(() => {
    const ver = () => setTem(!!lerRascunho(chave));
    window.addEventListener('crm-rascunho-imovel', ver);
    window.addEventListener('storage', ver);
    return () => { window.removeEventListener('crm-rascunho-imovel', ver); window.removeEventListener('storage', ver); };
  }, [chave]);
  return tem;
};

/**
 * Salva o rascunho (com um pequeno atraso) enquanto a janela está aberta e algo foi alterado.
 * `alterado` deve ser true só quando o formulário difere do estado inicial/salvo.
 */
export const useSalvarRascunho = (chave: string | null, ativo: boolean, alterado: boolean, formData: ImovelFormData, photos: string[]) => {
  const timer = useRef<number>();
  useEffect(() => {
    if (!chave || !ativo || !alterado) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(PREFIXO + chave, JSON.stringify({ formData, photos, salvoEm: Date.now() } satisfies Rascunho));
        window.dispatchEvent(new Event('crm-rascunho-imovel'));
      } catch { /* armazenamento cheio ou bloqueado: segue sem rascunho */ }
    }, 500);
    return () => window.clearTimeout(timer.current);
  }, [chave, ativo, alterado, formData, photos]);

  // ao sair da aba ou fechar a página, grava na hora (sem esperar o atraso)
  const gravarAgora = useCallback(() => {
    if (!chave || !ativo || !alterado) return;
    try { localStorage.setItem(PREFIXO + chave, JSON.stringify({ formData, photos, salvoEm: Date.now() } satisfies Rascunho)); } catch { /* ignora */ }
  }, [chave, ativo, alterado, formData, photos]);
  useEffect(() => {
    const aoSair = () => { if (document.visibilityState === 'hidden') gravarAgora(); };
    document.addEventListener('visibilitychange', aoSair);
    window.addEventListener('pagehide', gravarAgora);
    return () => { document.removeEventListener('visibilitychange', aoSair); window.removeEventListener('pagehide', gravarAgora); };
  }, [gravarAgora]);
  return gravarAgora;
};
