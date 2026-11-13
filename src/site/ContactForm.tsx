import { useState } from 'react';
import { enviarContato } from './api';
import { mascaraZap, soDigitos } from './format';

interface Props {
  origem: 'contato' | 'anunciar';
  codigo?: string;
  mensagemInicial?: string;
  rotulo?: string;
  sucesso?: string;
}

export function ContactForm({ origem, codigo, mensagemInicial = '', rotulo = 'Enviar mensagem', sucesso = 'Mensagem enviada. Um corretor vai falar com você em breve pelo WhatsApp.' }: Props) {
  const [nome, setNome] = useState('');
  const [zap, setZap] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(mensagemInicial);
  const [armadilha, setArmadilha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (armadilha) { setOk(true); return; }
    if (nome.trim().length < 2) return setErro('Informe seu nome.');
    if (soDigitos(zap).length < 10) return setErro('Informe seu WhatsApp com DDD.');
    setEnviando(true);
    try {
      await enviarContato({ nome, whatsapp: zap, email, mensagem: msg, codigo, origem });
      setOk(true);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  if (ok) return <div className="s-ok" role="status">{sucesso}</div>;

  return (
    <form className="s-form" onSubmit={enviar} noValidate>
      <label className="s-campo">Nome
        <input className="s-input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={100} required />
      </label>
      <label className="s-campo">WhatsApp
        <input className="s-input" value={zap} onChange={(e) => setZap(mascaraZap(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" required />
      </label>
      <label className="s-campo">E-mail (opcional)
        <input className="s-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={150} />
      </label>
      <label className="s-campo">Mensagem
        <textarea className="s-area" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} />
      </label>
      <div className="s-hp" aria-hidden="true">
        <label>Não preencha<input tabIndex={-1} autoComplete="off" value={armadilha} onChange={(e) => setArmadilha(e.target.value)} /></label>
      </div>
      {erro && <p className="s-erro" role="alert">{erro}</p>}
      <button className="s-btn s-btn-escuro" type="submit" disabled={enviando}>{enviando ? 'Enviando…' : rotulo}</button>
      <p className="s-pequeno">Ao enviar, você autoriza nosso contato pelo WhatsApp sobre este assunto. Não compartilhamos seus dados.</p>
    </form>
  );
}
