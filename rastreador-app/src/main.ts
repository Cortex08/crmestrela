import { registerPlugin } from '@capacitor/core';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

interface Status {
  ativo: boolean; rodando: boolean; naJanela: boolean; pendentes: number; ultimoEnvio: number; ultimoGps: number;
  erro: string; inicio: string; fim: string; nome: string;
  permLocal: boolean; permSegundoPlano: boolean; semRestricaoBateria: boolean;
}
interface Rast {
  configurar(o: { url: string; key: string; access: string; refresh: string; nome: string }): Promise<void>;
  parar(): Promise<void>;
  garantirServico(): Promise<void>;
  status(): Promise<Status>;
  pedirLocalizacao(): Promise<void>;
  pedirSegundoPlano(): Promise<void>;
  pedirSemRestricaoBateria(): Promise<void>;
  abrirConfiguracoes(): Promise<void>;
}
const Rastreador = registerPlugin<Rast>('Rastreador');
const app = document.getElementById('app')!;
const hora = (t: number) => (t ? new Date(t).toLocaleTimeString('pt-BR') : '—');

async function entrar(email: string, senha: string, nome: string): Promise<string | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }),
    });
    if (!r.ok) return 'E-mail ou senha incorretos.';
    const j = await r.json();
    await Rastreador.configurar({ url: SUPABASE_URL, key: SUPABASE_KEY, access: j.access_token, refresh: j.refresh_token, nome });
    localStorage.setItem('nome', nome);
    return null;
  } catch { return 'Sem conexão. Conecte à internet para entrar.'; }
}

function telaLogin(msg = '') {
  app.innerHTML = `
    <h1>Celular Estrela</h1><p>Entre com o login deste celular (criado pelo administrador no CRM).</p>
    <input id="email" type="email" placeholder="E-mail" autocomplete="username" />
    <input id="senha" type="password" placeholder="Senha" autocomplete="current-password" />
    <input id="nome" placeholder="Nome do celular (ex.: Prospecção 1)" value="${localStorage.getItem('nome') || ''}" />
    <p class="warn">Ao entrar, você concorda que a localização deste celular da empresa seja registrada apenas no horário de trabalho e consultada pela administração.</p>
    <button id="entrar">Entrar e concordar</button><p class="err">${msg}</p>`;
  document.getElementById('entrar')!.onclick = async () => {
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const senha = (document.getElementById('senha') as HTMLInputElement).value;
    const nome = (document.getElementById('nome') as HTMLInputElement).value.trim();
    if (!email || !senha || !nome) return telaLogin('Preencha e-mail, senha e nome do celular.');
    const erro = await entrar(email, senha, nome);
    if (erro) return telaLogin(erro);
    void painel();
  };
}

async function painel() {
  let s = await Rastreador.status();
  if (!s.ativo) return telaLogin();
  // pede o que falta, uma coisa por vez
  if (!s.permLocal) { await Rastreador.pedirLocalizacao(); s = await Rastreador.status(); }
  if (s.permLocal && !s.permSegundoPlano) { await Rastreador.pedirSegundoPlano(); s = await Rastreador.status(); }
  if (!s.semRestricaoBateria) { await Rastreador.pedirSemRestricaoBateria(); }
  await Rastreador.garantirServico();
  desenhar();
  setInterval(desenhar, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { void Rastreador.garantirServico(); void desenhar(); } });
}

async function desenhar() {
  const s = await Rastreador.status();
  if (!s.ativo) return telaLogin();
  const avisos: string[] = [];
  if (!s.permLocal) avisos.push('Permissão de localização negada.');
  else if (!s.permSegundoPlano) avisos.push('Falta permitir a localização "O tempo todo" (toque em Abrir configurações > Permissões > Localização).');
  if (!s.semRestricaoBateria) avisos.push('A bateria está restringindo o app: toque em Abrir configurações > Bateria > Sem restrições.');
  if (s.erro) avisos.push(s.erro);
  app.innerHTML = `
    <h1>Celular Estrela</h1><p>${s.nome || ''} · rastreio somente no horário de trabalho.</p>
    <div class="card">
      <div class="row"><span>Serviço</span><b class="${s.rodando ? 'ok' : 'err'}">${s.rodando ? 'Ligado' : 'Desligado'}</b></div>
      <div class="row"><span>Horário de trabalho</span><b>${s.inicio ? `${s.inicio}–${s.fim}` : '—'}</b></div>
      <div class="row"><span>Situação</span><b class="${s.naJanela ? 'ok' : 'warn'}">${s.naJanela ? 'Enviando localização' : 'Fora do horário (nada é enviado)'}</b></div>
      <div class="row"><span>Pendentes de envio</span><b>${s.pendentes}</b></div>
      <div class="row"><span>Último envio</span><b>${hora(s.ultimoEnvio)}</b></div>
      <div class="row"><span>Último GPS</span><b>${hora(s.ultimoGps)}</b></div>
    </div>
    ${avisos.map((a) => `<p class="warn">${a}</p>`).join('')}
    <p>O app continua funcionando sozinho com a tela apagada e volta a ligar quando o celular reinicia.</p>
    <button id="cfg" class="sec">Abrir configurações do Android</button>
    <button id="sair" class="sec">Sair (para o rastreio)</button>`;
  document.getElementById('cfg')!.onclick = () => void Rastreador.abrirConfiguracoes();
  document.getElementById('sair')!.onclick = async () => { await Rastreador.parar(); telaLogin(); };
}

void painel();
