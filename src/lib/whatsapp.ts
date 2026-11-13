export const openWhatsapp = (numero: string, mensagem?: string) => {
  const numeroLimpo = (numero || '').replace(/\D/g, '');
  if (numeroLimpo.length < 10) return;
  const numeroCompleto = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`;
  const url = mensagem
    ? `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/${numeroCompleto}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const formatWhatsappNumber = (numero: string): string => {
  const limpo = (numero || '').replace(/\D/g, '');
  if (limpo.length === 11) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`;
  if (limpo.length === 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  return numero;
};

export const hasValidWhatsapp = (numero?: string | null) => (numero || '').replace(/\D/g, '').length >= 10;
