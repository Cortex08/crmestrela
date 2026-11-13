import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, LIMITE_RECONHECIMENTO, MARGEM_MINIMA } from './config';
import { carregarFaceApi, lerRosto, AMOSTRAS } from './face';
import { getCache, setCache, getFila, setFila, getRejeitados, setRejeitados, getUltimaSync, setUltimaSync, diaSP, horaSP, type Rosto, type Item } from './store';

// Toda chamada à internet tem tempo limite: sem isso, uma conexão ruim deixava a sincronização "pendurada" para sempre.
const fetchComLimite: typeof fetch = (input, init) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  return fetch(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
};
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }, global: { fetch: fetchComLimite } });
const app = document.getElementById('app')!;
const CAMPOS = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'] as const;
const TEXTO: Record<string, string> = {
  entrada: 'Entrada registrada', saida_almoco: 'Saída para o almoço registrada',
  retorno_almoco: 'Retorno do almoço registrado', saida: 'Saída registrada',
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

let view: 'login' | 'principal' | 'config' = getCache() ? 'principal' : 'login';
let sessaoExpirada = false;
let sincronizando = false;
let inicioSync = 0;
let ultimoErroSync = '';
let resultadoTimer: number | undefined;

/** Hora atual corrigida pela diferença conhecida entre o relógio do aparelho e o do servidor. */
const agora = () => Date.now() + (getCache()?.offset ?? 0);

// ---------- regras de marcação (iguais às do servidor) ----------
function marcasDeHoje(r: Rosto, t: number): number[] {
  const dia = diaSP(t);
  const c = getCache();
  const m: number[] = [];
  if (c && c.diaCache === dia) for (const k of CAMPOS) { const v = r.hoje[k]; if (v) m.push(Date.parse(v)); }
  for (const i of getFila()) if (i.employee_id === r.employee_id && diaSP(Date.parse(i.momento)) === dia) m.push(Date.parse(i.momento));
  return m.sort((a, b) => a - b);
}
const euclid = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };

function reconhecer(desc: number[]): { rosto: Rosto; dist: number } {
  const c = getCache();
  if (!c || !c.rostos.length) throw new Error('Nenhum rosto cadastrado neste aparelho. Conecte à internet para atualizar.');
  const ds = c.rostos.map((r) => ({ r, d: euclid(r.descriptor, desc) })).sort((a, b) => a.d - b.d);
  if (ds[0].d >= LIMITE_RECONHECIMENTO) throw new Error('Rosto não reconhecido. Chegue mais perto e olhe de frente, ou peça ao RH para cadastrar seu rosto.');
  if (ds[1] && ds[1].d - ds[0].d < MARGEM_MINIMA) throw new Error('Não consegui ter certeza de quem é. Tente de novo, de frente para a câmera.');
  return { rosto: ds[0].r, dist: ds[0].d };
}

function registrarLocal(desc: number[]) {
  const { rosto, dist } = reconhecer(desc);
  const t = agora();
  const marcas = marcasDeHoje(rosto, t);
  if (marcas.length && t - marcas[marcas.length - 1] < 60_000) throw new Error('Seu ponto acabou de ser registrado. Aguarde 1 minuto para marcar de novo.');
  if (marcas.length >= 4) throw new Error(`A jornada de hoje de ${rosto.nome} já foi registrada por completo.`);
  const campo = CAMPOS[marcas.length];
  const item: Item = {
    id: crypto.randomUUID(), employee_id: rosto.employee_id, nome: rosto.nome, campo,
    momento: new Date(t).toISOString(), relogio_dispositivo: new Date().toISOString(), distancia: Math.round(dist * 1000) / 1000,
  };
  setFila([...getFila(), item]);
  return item;
}

// ---------- sincronização ----------
async function sincronizar(forcar = false): Promise<boolean> {
  if (sincronizando && Date.now() - inicioSync < 60_000) return false;   // uma sincronização travada por mais de 1 min é descartada
  sincronizando = true; inicioSync = Date.now(); atualizarStatus();
  try {
    let { data: s, error: se } = await supabase.auth.getSession();
    if (!s.session) { const r = await supabase.auth.refreshSession(); s = r.data as any; se = r.error; }
    if (!s.session) {
      if (se && /fetch|network|timeout|abort|load failed/i.test(se.message || '')) throw new Error('Sem conexão com o servidor.');
      sessaoExpirada = true; throw new Error('Entre novamente para sincronizar (precisa de internet).');
    }
    sessaoExpirada = false;

    // 1) envia as marcações guardadas
    let fila = getFila();
    while (fila.length) {
      const lote = fila.slice(0, 100);
      const { data, error } = await supabase.rpc('registrar_ponto_quiosque_lote', { _itens: lote });
      if (error) throw new Error(error.message);
      const resp = (data || []) as { id: string; ok: boolean; campo?: string; erro?: string }[];
      const rej = getRejeitados();
      const cache = getCache();
      for (const r of resp) {
        const it = lote.find((x) => x.id === r.id);
        if (!it) continue;
        if (r.ok) {
          const ro = cache?.rostos.find((x) => x.employee_id === it.employee_id);
          if (ro && r.campo && cache && cache.diaCache === diaSP(Date.parse(it.momento))) (ro.hoje as any)[r.campo] = it.momento;
        } else rej.push({ nome: it.nome, campo: it.campo, momento: it.momento, erro: r.erro || 'Recusado pelo servidor' });
      }
      if (cache) setCache(cache);
      setRejeitados(rej);
      const enviados = new Set(resp.map((r) => r.id));
      const antes = getFila().length;
      fila = getFila().filter((x) => !enviados.has(x.id));
      setFila(fila);
      if (fila.length === antes) break; // nada saiu da fila: evita repetir sem fim
    }

    // 2) atualiza rostos, marcações do dia e o relógio
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('ponto_quiosque_rostos');
    const t1 = Date.now();
    if (error) throw new Error(error.message);
    const d = data as { servidor_agora: string; rostos: Rosto[] };
    const srv = Date.parse(d.servidor_agora);
    setCache({ rostos: d.rostos, atualizado: new Date(srv).toISOString(), offset: srv - (t0 + t1) / 2, diaCache: diaSP(srv) });
    setUltimaSync(new Date().toISOString());
    ultimoErroSync = '';
    carregarFaceApi().catch(() => {});
    return true;
  } catch (e: any) {
    ultimoErroSync = e?.message || 'Falha ao sincronizar';
    return false;
  } finally {
    sincronizando = false; atualizarStatus();
  }
}

// ---------- interface ----------
function statusHtml() {
  const pend = getFila().length;
  const off = !navigator.onLine;
  const txt = sessaoExpirada ? 'Entrar de novo' : off ? 'Sem internet' : sincronizando ? 'Sincronizando…' : 'Online';
  return `<span class="pilula ${off || sessaoExpirada ? 'off' : ''}"><i></i>${txt}${pend ? ` · ${pend} a enviar` : ''}</span>`;
}
function atualizarStatus() {
  const el = $('status'); if (el) el.innerHTML = statusHtml();
  const rod = $('rodape');
  if (rod) {
    const u = getUltimaSync();
    rod.textContent = (u ? `Última sincronização: ${horaSP(Date.parse(u))}` : 'Ainda não sincronizado') + (ultimoErroSync && getFila().length ? ` · ${ultimoErroSync}` : '');
  }
}

function cabecalho() {
  return `<header><div class="marca" id="marca"><img src="./logo.svg" alt="" /><span>Ponto · Estrela de Davi</span></div><div id="status">${statusHtml()}</div></header>`;
}

function renderLogin(erro = '') {
  view = 'login';
  app.innerHTML = `${cabecalho()}<main><div class="painel">
    <h1 style="margin:0;font-size:26px">Configurar este aparelho</h1>
    <p class="dica" style="max-width:none">Entre uma vez com o usuário de ponto (precisa de internet). Depois disso o app funciona mesmo sem internet.</p>
    <label>E-mail<input id="email" type="email" autocomplete="username" inputmode="email" /></label>
    <label>Senha<input id="senha" type="password" autocomplete="current-password" /></label>
    <div class="msg-erro" id="erro">${esc(erro)}</div>
    <button class="botao" id="entrar" style="min-height:64px;font-size:20px">Entrar</button>
    ${getCache() ? '<button class="botao sec" id="voltar">Voltar</button>' : ''}
  </div></main>`;
  $('entrar')!.onclick = async () => {
    const email = ($('email') as HTMLInputElement).value.trim(), senha = ($('senha') as HTMLInputElement).value;
    const er = $('erro')!, bt = $('entrar') as HTMLButtonElement;
    if (!email || !senha) { er.textContent = 'Informe e-mail e senha.'; return; }
    bt.disabled = true; er.textContent = 'Entrando…';
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) { er.textContent = navigator.onLine ? 'E-mail ou senha incorretos.' : 'Sem internet. Conecte e tente de novo.'; bt.disabled = false; return; }
    er.textContent = 'Baixando os rostos cadastrados…';
    sessaoExpirada = false;
    const ok = await sincronizar(true);
    if (!ok) { er.textContent = ultimoErroSync || 'Não foi possível baixar os rostos.'; bt.disabled = false; return; }
    await carregarFaceApi().catch(() => {});
    renderPrincipal();
  };
  const v = $('voltar'); if (v) v.onclick = () => renderPrincipal();
}

function renderPrincipal() {
  view = 'principal';
  app.innerHTML = `${cabecalho()}<main>
    <div><div class="relogio" id="relogio"></div><div class="data" id="data"></div></div>
    <div id="area"></div>
    <p class="dica">Toque no botão e olhe de frente para a câmera. O sistema reconhece você e registra a próxima marcação: entrada, almoço, retorno ou saída.</p>
  </main><footer id="rodape"></footer>`;
  mostrarBotao(); tickRelogio(); atualizarStatus();
  // segurar o título por 2 segundos abre as configurações (evita toques acidentais)
  let timer: number | undefined;
  const m = $('marca')!;
  const ini = () => { timer = window.setTimeout(renderConfig, 2000); }, fim = () => clearTimeout(timer);
  m.addEventListener('touchstart', ini, { passive: true }); m.addEventListener('touchend', fim); m.addEventListener('touchcancel', fim);
  m.addEventListener('mousedown', ini); m.addEventListener('mouseup', fim); m.addEventListener('mouseleave', fim);
}

function mostrarBotao() {
  const a = $('area'); if (!a) return;
  a.innerHTML = `<button class="botao" id="bater"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>Bater ponto</button>`;
  $('bater')!.onclick = abrirCamera;
}
function mostrarResultado(html: string, erro = false) {
  const a = $('area'); if (!a) return;
  a.innerHTML = `<div class="cartao ${erro ? 'erro' : ''}" role="status" aria-live="polite">${html}</div>`;
  clearTimeout(resultadoTimer);
  resultadoTimer = window.setTimeout(mostrarBotao, erro ? 5000 : 6000);
}

function tickRelogio() {
  const r = $('relogio');
  if (!r) return;
  const t = agora();
  const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(t).split(':');
  r.innerHTML = `${hm[0]}:${hm[1]}<small>:${hm[2]}</small>`;
  $('data')!.textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' }).format(t);
}

function renderConfig() {
  view = 'config';
  const c = getCache(), fila = getFila(), rej = getRejeitados();
  app.innerHTML = `${cabecalho()}<main><div class="painel">
    <h1 style="margin:0;font-size:24px">Configurações</h1>
    <p class="dica" style="max-width:none">Rostos neste aparelho: <b>${c?.rostos.length ?? 0}</b><br>Marcações aguardando envio: <b>${fila.length}</b><br>Última sincronização: <b>${getUltimaSync() ? horaSP(Date.parse(getUltimaSync()!)) + ' de ' + diaSP(Date.parse(getUltimaSync()!)) : 'nunca'}</b>${ultimoErroSync ? `<br>Último erro: ${esc(ultimoErroSync)}` : ''}</p>
    ${rej.length ? `<div><b>Marcações recusadas pelo sistema (avise o RH):</b><div class="lista">${rej.slice().reverse().map((r) => `<div>${esc(r.nome)} · ${esc(TEXTO[r.campo] || r.campo)} · ${esc(new Date(r.momento).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}<br><small>${esc(r.erro)}</small></div>`).join('')}</div></div>` : ''}
    <button class="botao sec" id="sync">Sincronizar agora</button>
    <button class="botao sec" id="relogin">Entrar de novo</button>
    <button class="botao perigo" id="sair">Sair deste aparelho</button>
    <button class="botao sec" id="voltar">Voltar ao ponto</button>
  </div></main>`;
  $('voltar')!.onclick = renderPrincipal;
  $('sync')!.onclick = async () => { const b = $('sync')!; b.textContent = 'Sincronizando…'; await sincronizar(true); renderConfig(); };
  $('relogin')!.onclick = () => renderLogin();
  $('sair')!.onclick = async () => {
    const n = getFila().length;
    if (n && !confirm(`Há ${n} marcação(ões) que ainda NÃO foram enviadas e serão perdidas. Sair mesmo assim?`)) return;
    if (!n && !confirm('Sair deste aparelho? Será preciso entrar de novo com internet.')) return;
    await supabase.auth.signOut().catch(() => {});
    ['ponto.cache', 'ponto.fila', 'ponto.rejeitados', 'ponto.ultimaSync'].forEach((k) => localStorage.removeItem(k));
    renderLogin();
  };
}

// ---------- câmera ----------
// Câmera "quente": abrir a câmera no Android leva 1-2 s. Mantemos o fluxo aberto por alguns minutos depois de usar
// (e abrimos já ao primeiro toque na tela), então a próxima pessoa vê a câmera na hora.
let streamQuente: MediaStream | null = null;
let timerCamera: number | undefined;
async function obterStream(): Promise<MediaStream> {
  if (streamQuente && streamQuente.getVideoTracks().some((t) => t.readyState === 'live')) return streamQuente;
  streamQuente = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  return streamQuente;
}
function dormirCamera(ms = 180_000) {
  clearTimeout(timerCamera);
  timerCamera = window.setTimeout(() => { streamQuente?.getTracks().forEach((t) => t.stop()); streamQuente = null; }, ms);
}
function aquecerCamera() { obterStream().then(() => dormirCamera()).catch(() => {}); }
document.addEventListener('pointerdown', () => { if (view === 'principal') aquecerCamera(); }, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(timerCamera); streamQuente?.getTracks().forEach((t) => t.stop()); streamQuente = null; } else if (view === 'principal') aquecerCamera(); });

/** Leitura confiável o bastante para parar na 1ª amostra: bem perto de um rosto e longe do segundo colocado. */
function leituraConfiavel(desc: number[]): boolean {
  const c = getCache(); if (!c || !c.rostos.length) return false;
  const ds = c.rostos.map((r) => euclid(r.descriptor, desc)).sort((a, b) => a - b);
  return ds[0] < Math.min(0.45, LIMITE_RECONHECIMENTO) && (ds.length < 2 || ds[1] - ds[0] >= Math.max(0.08, MARGEM_MINIMA));
}

async function abrirCamera() {
  if (!getCache()?.rostos.length) { mostrarResultado('<h2>Sem rostos</h2><p>Conecte à internet para baixar os rostos cadastrados.</p>', true); return; }
  const tela = document.createElement('div');
  tela.id = 'camera';
  tela.innerHTML = `<video playsinline muted autoplay></video>
    <svg viewBox="0 0 300 400" preserveAspectRatio="none"><defs><mask id="furo"><rect width="300" height="400" fill="white"/><ellipse cx="150" cy="180" rx="95" ry="125" fill="black"/></mask></defs>
    <rect width="300" height="400" fill="rgba(0,0,0,.55)" mask="url(#furo)"/><ellipse id="oval" cx="150" cy="180" rx="95" ry="125" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="4" stroke-dasharray="10 8"/></svg>
    <button class="fechar" id="fechar" aria-label="Cancelar">✕</button>
    <div class="faixa"><div class="dicabox" id="dica">Abrindo a câmera…</div><div class="pontos" id="pontos"></div></div>`;
  document.body.appendChild(tela);
  const video = tela.querySelector('video')!;
  let parar = false, stream: MediaStream | null = null;
  const fechar = () => { parar = true; tela.remove(); dormirCamera(); };   // não desliga a câmera: fica quente para a próxima pessoa
  $('fechar')!.onclick = fechar;
  try {
    stream = await obterStream();
    video.srcObject = stream; await video.play().catch(() => {});
    $('dica')!.textContent = 'Carregando o reconhecimento…';
    const desc = await lerRosto(video, (e: any) => {
      if (parar) return;
      const d = $('dica'), o = $('oval'), p = $('pontos');
      if (d) { d.textContent = e.dica; d.className = 'dicabox' + (e.ok ? ' ok' : ''); }
      if (o) { o.setAttribute('stroke', e.ok ? '#4ade80' : 'rgba(255,255,255,.9)'); o.setAttribute('stroke-dasharray', e.ok ? '' : '10 8'); }
      if (p) p.innerHTML = e.fase === 'lendo' ? Array.from({ length: AMOSTRAS }, (_, i) => `<span class="${i < e.leituras ? 'on' : ''}"></span>`).join('') : '';
    }, () => parar, 15000, leituraConfiavel);
    if (parar) return;
    fechar();
    let item;
    try { item = registrarLocal(desc); }
    catch (e: any) {
      // rosto desconhecido? pode ser alguém cadastrado agora há pouco: baixa a lista nova e tenta de novo, sem a pessoa refazer a leitura
      if (!/não reconhecido|certeza/i.test(e?.message || '')) throw e;
      mostrarResultado('<h2>Atualizando rostos…</h2><p>Conferindo se seu cadastro é novo.</p>');
      const ok = await sincronizar(true);
      if (!ok) throw e;
      item = registrarLocal(desc);
    }
    const offline = !navigator.onLine;
    mostrarResultado(`<h2>Olá, ${esc(item.nome)}!</h2><p>${TEXTO[item.campo]} às <b>${horaSP(Date.parse(item.momento))}</b></p>${offline ? '<div class="off">Sem internet: salvo no aparelho. Será enviado automaticamente quando a conexão voltar.</div>' : ''}`);
    atualizarStatus();
    sincronizar();
  } catch (e: any) {
    if (parar || e?.message === 'cancelado') return;
    fechar();
    const negado = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
    mostrarResultado(`<h2>Não foi possível</h2><p>${esc(negado ? 'A câmera está bloqueada. Libere a permissão de câmera para o app.' : e?.message || 'Tente de novo.')}</p>`, true);
  }
}

// ---------- inicialização ----------
if (view === 'login') renderLogin(); else renderPrincipal();
setInterval(() => { if (view === 'principal') tickRelogio(); }, 1000);
// Não confiamos só em navigator.onLine (no WebView do Android ele mente): com marcações na fila, tenta a cada 15 s.
setInterval(() => { atualizarStatus(); if (getFila().length || Date.now() - Date.parse(getUltimaSync() || '1970-01-01') > 5 * 60_000) sincronizar(true); }, 15_000);
window.addEventListener('online', () => { atualizarStatus(); sincronizar(true); });
window.addEventListener('focus', () => { if (getFila().length) sincronizar(true); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && getFila().length) sincronizar(true); });
window.addEventListener('offline', atualizarStatus);
if (getCache()) { carregarFaceApi().catch(() => {}); sincronizar(true); if (view === 'principal') aquecerCamera(); }

// mantém a tela acesa
(async function wake() {
  const pedir = async () => { try { await (navigator as any).wakeLock?.request('screen'); } catch { /* ignora */ } };
  pedir(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedir(); });
})();

// instalável e offline no navegador (no APK o app já vem dentro do pacote)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !(window as any).Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
