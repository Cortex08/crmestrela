import { useMemo, useState, type ReactNode } from 'react';
import {
  format, isToday, isTomorrow, isSameDay, isSameMonth, isPast, addDays, subDays, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, RefreshCw, Phone, MessageCircle, MapPin, Building2, User, CheckCircle2, CalendarX2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIPOS_EVENTO, tipoDot, tipoBorder, isDone } from './AgendaParts';

type Sub = 'proximos' | 'dia' | 'mes';

interface Props {
  events: any[];            // eventos filtrados do período carregado
  pool: any[];              // eventos para "Próximos" (inclui atrasados)
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
  onEventClick: (e: any) => void;
  onNew: () => void;
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  filtros: ReactNode;
  filtrosAtivos: number;
}

const soDigitos = (s: string) => (s || '').replace(/\D/g, '');
const linkZap = (tel: string) => { const d = soDigitos(tel); return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : ''; };
const diaTexto = (d: Date) => (isToday(d) ? 'Hoje' : isTomorrow(d) ? 'Amanhã' : format(d, "EEEE, dd 'de' MMM", { locale: ptBR }));

function Cartao({ e, onClick, mostrarDia }: { e: any; onClick: () => void; mostrarDia?: boolean }) {
  const ini = new Date(e.data_inicio), fim = new Date(e.data_fim);
  const atrasado = !isDone(e) && isPast(fim);
  const tel = e.cliente?.whatsapp as string | undefined;
  return (
    <div
      role="button" tabIndex={0} onClick={onClick} onKeyDown={(ev) => { if (ev.key === 'Enter') onClick(); }}
      className={cn('rounded-2xl border border-l-4 bg-card/80 backdrop-blur-xl p-3.5 shadow-sm active:scale-[0.99] transition-transform', tipoBorder[e.tipo] || tipoBorder.outro, atrasado && 'bg-red-50/80', isDone(e) && 'opacity-60')}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-center leading-tight min-w-[52px]">
          <p className="text-base font-bold tabular-nums">{format(ini, 'HH:mm')}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">{format(fim, 'HH:mm')}</p>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full shrink-0', tipoDot[e.tipo] || tipoDot.outro)} />
            <span className="text-xs text-muted-foreground">{TIPOS_EVENTO[e.tipo] || e.tipo}</span>
            {atrasado && <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-destructive"><AlertCircle className="h-3 w-3" />Atrasado</span>}
            {isDone(e) && <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-green-700"><CheckCircle2 className="h-3 w-3" />Concluído</span>}
          </div>
          <h4 className={cn('font-semibold leading-snug break-words', isDone(e) && 'line-through')}>{e.titulo}</h4>
          {mostrarDia && <p className="text-xs text-muted-foreground capitalize">{format(ini, "EEE, dd/MM", { locale: ptBR })}</p>}
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {e.cliente && <p className="flex items-center gap-1.5 truncate"><User className="h-3.5 w-3.5 shrink-0" />{e.cliente.nome}</p>}
            {e.imovel && <p className="flex items-center gap-1.5 truncate"><Building2 className="h-3.5 w-3.5 shrink-0" />{e.imovel.codigo} · {e.imovel.endereco}</p>}
            {e.local && <p className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" />{e.local}</p>}
          </div>
        </div>
      </div>
      {tel && (
        <div className="mt-3 flex gap-2" onClick={(ev) => ev.stopPropagation()}>
          <a href={`tel:${soDigitos(tel)}`} className="flex-1"><Button variant="outline" size="sm" className="w-full h-10"><Phone className="h-4 w-4 mr-1.5" />Ligar</Button></a>
          <a href={linkZap(tel)} target="_blank" rel="noopener noreferrer" className="flex-1"><Button variant="outline" size="sm" className="w-full h-10 text-green-700"><MessageCircle className="h-4 w-4 mr-1.5" />WhatsApp</Button></a>
        </div>
      )}
    </div>
  );
}

const Vazio = ({ texto }: { texto: string }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/50 py-14 text-center text-muted-foreground">
    <CalendarX2 className="h-10 w-10" /><p className="text-sm">{texto}</p>
  </div>
);

export function AgendaMobile({ events, pool, currentDate, setCurrentDate, onEventClick, onNew, isLoading, isFetching, onRefresh, searchTerm, setSearchTerm, filtros, filtrosAtivos }: Props) {
  const [sub, setSub] = useState<Sub>('proximos');
  const [busca, setBusca] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  // ---- Próximos ----
  const proximos = useMemo(() => {
    const pend = pool.filter((e) => !isDone(e)).sort((a, b) => +new Date(a.data_inicio) - +new Date(b.data_inicio));
    const atrasados = pend.filter((e) => isPast(new Date(e.data_fim))).reverse();
    const futuros = pend.filter((e) => !isPast(new Date(e.data_fim)));
    const grupos = new Map<string, any[]>();
    futuros.forEach((e) => { const k = format(new Date(e.data_inicio), 'yyyy-MM-dd'); grupos.set(k, [...(grupos.get(k) || []), e]); });
    return { atrasados, grupos: [...grupos.entries()] };
  }, [pool]);

  // ---- Dia / Mês ----
  const doDia = useMemo(
    () => events.filter((e) => isSameDay(new Date(e.data_inicio), currentDate)).sort((a, b) => +new Date(a.data_inicio) - +new Date(b.data_inicio)),
    [events, currentDate],
  );
  const semana = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
  const mes = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) });
  const porDia = (d: Date) => events.filter((e) => isSameDay(new Date(e.data_inicio), d));

  const abas: [Sub, string][] = [['proximos', 'Próximos'], ['dia', 'Dia'], ['mes', 'Mês']];

  const ListaDoDia = () => (
    doDia.length === 0 ? <Vazio texto="Nada marcado para este dia." /> : <div className="space-y-3">{doDia.map((e) => <Cartao key={e.id} e={e} onClick={() => onEventClick(e)} />)}</div>
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Buscar" onClick={() => setBusca((v) => !v)}><Search className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Filtros" className="relative" onClick={() => setFiltrosAbertos(true)}>
            <SlidersHorizontal className="h-5 w-5" />
            {filtrosAtivos > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">{filtrosAtivos}</span>}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Atualizar" onClick={onRefresh} disabled={isFetching}><RefreshCw className={cn('h-5 w-5', isFetching && 'animate-spin')} /></Button>
        </div>
      </div>

      {busca && (
        <Input autoFocus placeholder="Buscar título, cliente, imóvel ou local…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-11" />
      )}

      {/* subpáginas */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/70 backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-1 rounded-full bg-foreground/5 p-1">
          {abas.map(([k, l]) => (
            <button key={k} onClick={() => setSub(k)} aria-pressed={sub === k}
              className={cn('h-10 rounded-full text-sm font-semibold transition-colors', sub === k ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : sub === 'proximos' ? (
        <div className="space-y-6">
          {proximos.atrasados.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-destructive"><AlertCircle className="h-4 w-4" />Atrasados ({proximos.atrasados.length})</h2>
              {proximos.atrasados.slice(0, 15).map((e) => <Cartao key={e.id} e={e} mostrarDia onClick={() => onEventClick(e)} />)}
            </section>
          )}
          {proximos.grupos.length === 0 && proximos.atrasados.length === 0 && <Vazio texto="Nenhum evento próximo. Toque em + para criar." />}
          {proximos.grupos.map(([dia, lista]) => {
            const d = new Date(dia + 'T12:00:00');
            return (
              <section key={dia} className="space-y-3">
                <h2 className="text-sm font-bold capitalize">{diaTexto(d)} <span className="font-normal text-muted-foreground">· {lista.length}</span></h2>
                {lista.map((e) => <Cartao key={e.id} e={e} onClick={() => onEventClick(e)} />)}
              </section>
            );
          })}
        </div>
      ) : sub === 'dia' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Dia anterior" onClick={() => setCurrentDate(subDays(currentDate, 1))}><ChevronLeft className="h-5 w-5" /></Button>
            <button className="text-center" onClick={() => setCurrentDate(new Date())}>
              <p className="font-bold capitalize">{diaTexto(currentDate)}</p>
              <p className="text-xs text-muted-foreground">{format(currentDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
            </button>
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Próximo dia" onClick={() => setCurrentDate(addDays(currentDate, 1))}><ChevronRight className="h-5 w-5" /></Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {semana.map((d) => {
              const n = porDia(d).length, sel = isSameDay(d, currentDate);
              return (
                <button key={d.toISOString()} onClick={() => setCurrentDate(d)}
                  className={cn('flex flex-col items-center rounded-2xl py-2 text-xs transition-colors', sel ? 'bg-primary text-primary-foreground shadow' : isToday(d) ? 'bg-primary/10 text-primary' : 'bg-card/70')}>
                  <span className="uppercase opacity-80">{format(d, 'EEEEE', { locale: ptBR })}</span>
                  <span className="text-base font-bold">{format(d, 'd')}</span>
                  <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', n ? (sel ? 'bg-primary-foreground' : 'bg-primary') : 'bg-transparent')} />
                </button>
              );
            })}
          </div>
          <ListaDoDia />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Mês anterior" onClick={() => setCurrentDate(subMonths(currentDate, 1))}><ChevronLeft className="h-5 w-5" /></Button>
            <button className="font-bold capitalize" onClick={() => setCurrentDate(new Date())}>{format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}</button>
            <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Próximo mês" onClick={() => setCurrentDate(addMonths(currentDate, 1))}><ChevronRight className="h-5 w-5" /></Button>
          </div>
          <div className="rounded-2xl border bg-card/70 backdrop-blur-xl p-2">
            <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground pb-1">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => <span key={i}>{l}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {mes.map((d) => {
                const lista = porDia(d), sel = isSameDay(d, currentDate);
                return (
                  <button key={d.toISOString()} onClick={() => setCurrentDate(d)}
                    className={cn('flex h-12 flex-col items-center justify-center rounded-xl text-sm', !isSameMonth(d, currentDate) && 'opacity-35', sel ? 'bg-primary text-primary-foreground font-bold' : isToday(d) && 'bg-primary/10 font-bold text-primary')}>
                    {format(d, 'd')}
                    <span className="mt-0.5 flex h-1.5 gap-0.5">
                      {[...new Set(lista.map((e) => e.tipo))].slice(0, 3).map((t) => <i key={t} className={cn('h-1.5 w-1.5 rounded-full', sel ? 'bg-primary-foreground' : tipoDot[t] || tipoDot.outro)} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <h2 className="text-sm font-bold capitalize">{diaTexto(currentDate)} <span className="font-normal text-muted-foreground">· {doDia.length} evento(s)</span></h2>
          <ListaDoDia />
        </div>
      )}

      <button onClick={onNew} aria-label="Novo evento"
        className="fixed right-4 z-30 h-14 w-14 rounded-full bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <Plus className="h-7 w-7" />
      </button>

      <Dialog open={filtrosAbertos} onOpenChange={setFiltrosAbertos}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Filtros da agenda</DialogTitle></DialogHeader>
          <div className="space-y-3">{filtros}</div>
          <Button className="w-full" onClick={() => setFiltrosAbertos(false)}>Aplicar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
