// Tudo que precisa sobreviver sem internet fica guardado no aparelho (localStorage).
export interface Rosto {
  employee_id: string; nome: string; descriptor: number[];
  hoje: { entrada: string | null; saida_almoco: string | null; retorno_almoco: string | null; saida: string | null };
}
export interface Cache { rostos: Rosto[]; atualizado: string; offset: number; diaCache: string }
export interface Item { id: string; employee_id: string; nome: string; momento: string; relogio_dispositivo: string; distancia: number; campo: string }
export interface Rejeitado { nome: string; campo: string; momento: string; erro: string }

function ler<T>(k: string, padrao: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } }
function gravar(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } }

export const getCache = () => ler<Cache | null>('ponto.cache', null);
export const setCache = (c: Cache) => gravar('ponto.cache', c);
export const getFila = () => ler<Item[]>('ponto.fila', []);
export const setFila = (f: Item[]) => gravar('ponto.fila', f);
export const getRejeitados = () => ler<Rejeitado[]>('ponto.rejeitados', []);
export const setRejeitados = (r: Rejeitado[]) => gravar('ponto.rejeitados', r.slice(-50));
export const getUltimaSync = () => ler<string | null>('ponto.ultimaSync', null);
export const setUltimaSync = (s: string) => gravar('ponto.ultimaSync', s);

export const diaSP = (d: Date | number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
export const horaSP = (d: Date | number) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(d);
