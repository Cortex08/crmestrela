import { createClient } from '@supabase/supabase-js';
import { registerPlugin } from '@capacitor/core';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

interface Local { latitude: number; longitude: number; accuracy: number; time: number | null }
interface BG {
  addWatcher(o: Record<string, unknown>, cb: (l?: Local, e?: { code?: string; message?: string }) => void): Promise<string>;
  removeWatcher(o: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}
const BackgroundGeolocation = registerPlugin<BG>('BackgroundGeolocation');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage } });
const app = document.getElementById('app')!;
const K_FILA = 'loc_fila', K_CFG = 'loc_cfg', K_NOME = 'loc_nome';

interface Cfg { ativo: boolean; dias: number[]; inicio: string; fim: string; intervalo_s: number }
interface Pt { t: string; lat: number; lng: number; prec: number | null; bat: number | null }

const ler = <T,>(k: string, pad: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return pad; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio */ } };

let cfg: Cfg | null = ler<Cfg | null>(K_CFG, null);
let fila: Pt[] = ler<Pt[]>(K_FILA, []);
let watcher: string | null = null;
let ultimoEnvio = 0, ultimaPos = 0, ultimoPonto = 0;
let aviso = '', erroEnvio = '', bateria: number | null = null;

// Hora e dia da semana em Brasília (mesma regra do servidor)
function brasilia(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)!.value;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(g('weekday')) + 1;
  return { dow, hm: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}` };
}
function naJanela(): boolean {
  if (!cfg || !cfg.ativo) return false;
  const { dow, hm } = brasilia();
  return cfg.dias.includes(dow) && hm >= cfg.inicio && hm <= cfg.fim;
}

async function carregarBateria() {
  try { const b = await (navigator as any).getBattery?.(); if (b) { bateria = Math.round(b.level * 100); b.onlevelchange = () => { bateria = Math.round(b.level * 100); }; } } catch { /* sem suporte */ }
}

async function atualizarConfig() {
  const { data, error } = await supabase.rpc('loc_config_ler');
  if (error) { aviso = 'Sem conexão com o servidor: usando o último horário salvo.'; return; }
  const c = data as any;
  cfg = { ativo: c.ativo, dias: c.dias, inicio: c.inicio, fim: c.fim, intervalo_s: c.intervalo_s };
  gravar(K_CFG, cfg); aviso = '';
}

function receber(l?: Local) {
  if (!l || !naJanela()) return; // fora do horário nada é guardado
  const agora = Date.now();
  const minimo = Math.max(15, cfg?.intervalo_s ?? 60) * 1000 * 0.8;
  if (agora - ultimoPonto < minimo) return;
  ultimoPonto = agora; ultimaPos = agora;
  fila.push({ t: new Date(l.time ?? agora).toISOString(), lat: l.latitude, lng: l.longitude, prec: Math.round(l.accuracy), bat: bateria });
  if (fila.length > 2000) fila = fila.slice(-2000);
  gravar(K_FILA, fila);
}

async function iniciarRastreio() {
  if (watcher) return;
  try {
    watcher = await BackgroundGeolocation.addWatcher({
      backgroundTitle: 'Celular da empresa',
      backgroundMessage: 'Localização enviada somente no horário de trabalho.',
      requestPermissions: true, stale: false, distanceFilter: 10,
    }, (l, e) => {
      if (e) { aviso = e.code === 'NOT_AUTHORIZED' ? 'Permissão de localização negada. Permita "O tempo todo" nas configurações.' : (e.message || 'Erro de GPS'); desenhar(); return; }
      receber(l);
    });
  } catch (e: any) { aviso = 'Não foi possível iniciar o GPS: ' + (e?.message || e); }
}

async function enviar() {
  if (!fila.length || !(await supabase.auth.getSession()).data.session) return;
  const lote = fila.slice(0, 100);
  const { error } = await supabase.rpc('loc_registrar', { _dispositivo: localStorage.getItem(K_NOME) || 'Celular', _pontos: lote });
  if (error) { erroEnvio = error.message; return; }
  erroEnvio = ''; ultimoEnvio = Date.now();
  fila = fila.slice(lote.length); gravar(K_FILA, fila);
  if (fila.length) void enviar();
}

function desenhar() {
  const { hm } = brasilia();
  const dentro = naJanela();
  app.innerHTML = `
    <h1>Celular Estrela</h1><p>Rastreio do celular da empresa, somente no horário de trabalho.</p>
    <div class="card">
      <div class="row"><span>Horário de trabalho</span><b>${cfg ? `${cfg.inicio}–${cfg.fim}` : '—'}</b></div>
      <div class="row"><span>Agora (Brasília)</span><b>${hm}</b></div>
      <div class="row"><span>Situação</span><b class="${dentro ? 'ok' : 'warn'}">${dentro ? 'Enviando localização' : 'Fora do horário (nada é enviado)'}</b></div>
      <div class="row"><span>Pendentes de envio</span><b>${fila.length}</b></div>
      <div class="row"><span>Último envio</span><b>${ultimoEnvio ? new Date(ultimoEnvio).toLocaleTimeString('pt-BR') : '—'}</b></div>
      <div class="row"><span>Último GPS</span><b>${ultimaPos ? new Date(ultimaPos).toLocaleTimeString('pt-BR') : '—'}</b></div>
    </div>
    ${aviso ? `<p class="warn">${aviso}</p>` : ''}${erroEnvio ? `<p class="err">${erroEnvio}</p>` : ''}
    <p>Para funcionar com a tela apagada, em Configurações do Android deixe a localização em <b>"O tempo todo"</b> e a bateria deste app em <b>"Sem restrições"</b>.</p>
    <button id="cfg" class="sec">Abrir configurações do Android</button>
    <button id="sair" class="sec">Sair</button>`;
  document.getElementById('cfg')!.onclick = () => void BackgroundGeolocation.openSettings();
  document.getElementById('sair')!.onclick = async () => {
    if (watcher) { await BackgroundGeolocation.removeWatcher({ id: watcher }); watcher = null; }
    await supabase.auth.signOut(); location.reload();
  };
}

function telaLogin(msg = '') {
  app.innerHTML = `
    <h1>Celular Estrela</h1><p>Entre com o login deste celular (criado pelo administrador no CRM).</p>
    <input id="email" type="email" placeholder="E-mail" autocomplete="username" />
    <input id="senha" type="password" placeholder="Senha" autocomplete="current-password" />
    <input id="nome" placeholder="Nome do celular (ex.: Prospecção 1)" value="${localStorage.getItem(K_NOME) || ''}" />
    <p class="warn">Ao entrar, você concorda que a localização deste celular da empresa seja registrada apenas no horário de trabalho e consultada pela administração.</p>
    <button id="entrar">Entrar e concordar</button><p class="err">${msg}</p>`;
  document.getElementById('entrar')!.onclick = async () => {
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const senha = (document.getElementById('senha') as HTMLInputElement).value;
    const nome = (document.getElementById('nome') as HTMLInputElement).value.trim();
    if (!email || !senha || !nome) return telaLogin('Preencha e-mail, senha e nome do celular.');
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) return telaLogin('E-mail ou senha incorretos.');
    localStorage.setItem(K_NOME, nome); void iniciar();
  };
}

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return telaLogin();
  void carregarBateria();
  await atualizarConfig();
  await iniciarRastreio();
  desenhar();
  setInterval(() => { void (async () => { await enviar(); desenhar(); })(); }, Math.max(15, cfg?.intervalo_s ?? 60) * 1000);
  setInterval(() => { void atualizarConfig().then(desenhar); }, 5 * 60 * 1000);
  setInterval(desenhar, 30_000);
  document.addEventListener('visibilitychange', () => { void enviar(); void atualizarConfig(); desenhar(); });
  window.addEventListener('online', () => void enviar());
}
void iniciar();
