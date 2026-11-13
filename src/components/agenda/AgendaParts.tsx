import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay, isSameMonth,
  isToday, isTomorrow, isPast, isWithinInterval, addMonths, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Clock, MapPin, User, CalendarDays, CheckCircle2, TrendingUp, Building2, Users, Phone, PenLine, ClipboardCheck,
  AlertCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';

export const TIPOS_EVENTO: Record<string, string> = {
  visita: 'Visita', reuniao: 'Reunião', ligacao: 'Ligação', assinatura: 'Assinatura', vistoria: 'Vistoria', outro: 'Outro',
};
export const tipoDot: Record<string, string> = {
  visita: 'bg-blue-500', reuniao: 'bg-purple-500', ligacao: 'bg-green-500', assinatura: 'bg-orange-500', vistoria: 'bg-yellow-500', outro: 'bg-gray-500',
};
export const tipoLight: Record<string, string> = {
  visita: 'bg-blue-100 text-blue-800 border-blue-200',
  reuniao: 'bg-purple-100 text-purple-800 border-purple-200',
  ligacao: 'bg-green-100 text-green-800 border-green-200',
  assinatura: 'bg-orange-100 text-orange-800 border-orange-200',
  vistoria: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  outro: 'bg-gray-100 text-gray-800 border-gray-200',
};
export const tipoBorder: Record<string, string> = {
  visita: 'border-l-blue-500', reuniao: 'border-l-purple-500', ligacao: 'border-l-green-500',
  assinatura: 'border-l-orange-500', vistoria: 'border-l-yellow-500', outro: 'border-l-gray-500',
};

export const isDone = (e: any) => e.status === 'concluido';
const WEEK = { weekStartsOn: 0 as const };
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07h–21h

interface ViewProps {
  events: any[];
  currentDate: Date;
  onDateChange: (d: Date) => void;
  onEventClick: (e: any) => void;
}

const sameDay = (e: any, d: Date) => isSameDay(new Date(e.data_inicio), d);
/** Eventos antes das 7h entram na linha das 7h; depois das 21h, na das 21h */
const hourOf = (e: any) => Math.min(21, Math.max(7, new Date(e.data_inicio).getHours()));

export const MonthView = ({ events, currentDate, onDateChange, onEventClick }: ViewProps) => {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate), WEEK), end: endOfWeek(endOfMonth(currentDate), WEEK) });
  return (
    <div className="space-y-2 overflow-x-auto">
      <div className="grid grid-cols-7 gap-1 min-w-[560px]">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
          <div key={d} className="p-2 text-center text-sm font-medium text-muted-foreground">{d}</div>
        ))}
        {days.map((day) => {
          const dayEvents = events.filter((e) => sameDay(e, day));
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[100px] p-1 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50',
                !isSameMonth(day, currentDate) && 'opacity-40',
                isToday(day) && 'border-primary bg-primary/5',
              )}
              onClick={() => onDateChange(day)}
            >
              <div className={cn('text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full', isToday(day) && 'bg-primary text-primary-foreground')}>
                {format(day, 'd')}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className={cn('text-xs p-1 rounded truncate border', tipoLight[e.tipo] || tipoLight.outro, isDone(e) && 'opacity-60 line-through')}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                  >
                    <span className="font-medium">{format(new Date(e.data_inicio), 'HH:mm')}</span> {e.titulo}
                  </div>
                ))}
                {dayEvents.length > 3 && <div className="text-xs text-muted-foreground text-center">+{dayEvents.length - 3} mais</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const WeekView = ({ events, currentDate, onEventClick }: ViewProps) => {
  const days = eachDayOfInterval({ start: startOfWeek(currentDate, WEEK), end: endOfWeek(currentDate, WEEK) });
  return (
    <ScrollArea className="h-[600px]">
      <div className="min-w-[800px]">
        <div className="grid grid-cols-8 border-b sticky top-0 bg-background z-10">
          <div className="p-2 text-center text-sm font-medium text-muted-foreground border-r">Hora</div>
          {days.map((day) => (
            <div key={day.toISOString()} className={cn('p-2 text-center border-r', isToday(day) && 'bg-primary/5')}>
              <div className="text-sm font-medium capitalize">{format(day, 'EEE', { locale: ptBR })}</div>
              <div className={cn('text-lg font-bold w-8 h-8 flex items-center justify-center mx-auto rounded-full', isToday(day) && 'bg-primary text-primary-foreground')}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>
        <div className="divide-y">
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-8 min-h-[60px]">
              <div className="p-2 text-xs text-muted-foreground border-r text-center">{String(hour).padStart(2, '0')}:00</div>
              {days.map((day) => (
                <div key={day.toISOString() + hour} className={cn('p-1 border-r', isToday(day) && 'bg-primary/5')}>
                  {events.filter((e) => sameDay(e, day) && hourOf(e) === hour).map((e) => (
                    <div
                      key={e.id}
                      className={cn('text-xs p-1 rounded mb-1 cursor-pointer border', tipoLight[e.tipo] || tipoLight.outro, isDone(e) && 'opacity-60')}
                      onClick={() => onEventClick(e)}
                    >
                      <div className="font-medium truncate">{e.titulo}</div>
                      {e.cliente && <div className="text-[10px] opacity-75 truncate">{e.cliente.nome}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
};

export const DayView = ({ events, currentDate, onEventClick }: ViewProps) => {
  const dayEvents = events.filter((e) => sameDay(e, currentDate));
  return (
    <div className="space-y-4">
      <div className={cn('text-center p-4 rounded-lg', isToday(currentDate) && 'bg-primary/5 border border-primary')}>
        <div className="text-sm text-muted-foreground capitalize">{format(currentDate, 'EEEE', { locale: ptBR })}</div>
        <div className="text-3xl font-bold">{format(currentDate, "dd 'de' MMMM", { locale: ptBR })}</div>
      </div>
      <ScrollArea className="h-[500px]">
        <div className="space-y-1">
          {HOURS.map((hour) => (
            <div key={hour} className="flex gap-4 min-h-[60px] border-b">
              <div className="w-16 py-2 text-sm text-muted-foreground text-right shrink-0">{String(hour).padStart(2, '0')}:00</div>
              <div className="flex-1 py-1 space-y-1 min-w-0">
                {dayEvents.filter((e) => hourOf(e) === hour).map((e) => (
                  <Card key={e.id} className={cn('cursor-pointer hover:shadow-md transition-shadow border-l-4', tipoBorder[e.tipo] || tipoBorder.outro, isDone(e) && 'opacity-60')} onClick={() => onEventClick(e)}>
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1 min-w-0">
                          <h4 className={cn('font-semibold', isDone(e) && 'line-through')}>{e.titulo}</h4>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(e.data_inicio), 'HH:mm')} - {format(new Date(e.data_fim), 'HH:mm')}</span>
                            {e.cliente && <span className="flex items-center gap-1"><User className="h-3 w-3" />{e.cliente.nome}</span>}
                            {e.local && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.local}</span>}
                          </div>
                        </div>
                        <Badge variant={isDone(e) ? 'default' : 'secondary'} className="shrink-0">{isDone(e) ? 'Concluído' : 'Pendente'}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

/** Mini calendário lateral (sem biblioteca extra) */
export const MiniCalendar = ({ selected, onSelect, events }: { selected: Date; onSelect: (d: Date) => void; events: any[] }) => {
  const [month, setMonth] = useState(startOfMonth(selected));
  useEffect(() => { setMonth(startOfMonth(selected)); }, [selected]);
  const days = eachDayOfInterval({ start: startOfWeek(month, WEEK), end: endOfWeek(endOfMonth(month), WEEK) });
  const hasEvent = (d: Date) => events.some((e) => sameDay(e, d));
  return (
    <div className="p-1 select-none">
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-medium capitalize">{format(month, 'MMMM yyyy', { locale: ptBR })}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground mb-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onSelect(d)}
            className={cn(
              'h-8 rounded-md text-sm transition-colors hover:bg-muted',
              !isSameMonth(d, month) && 'text-muted-foreground/40',
              isToday(d) && 'border border-primary',
              isSameDay(d, selected) && 'bg-primary text-primary-foreground hover:bg-primary',
              hasEvent(d) && 'font-bold underline decoration-primary underline-offset-4',
            )}
          >
            {format(d, 'd')}
          </button>
        ))}
      </div>
    </div>
  );
};

const tipoStats: Record<string, { label: string; icon: any; color: string }> = {
  visita: { label: 'Visitas', icon: Building2, color: 'text-blue-500' },
  reuniao: { label: 'Reuniões', icon: Users, color: 'text-purple-500' },
  ligacao: { label: 'Ligações', icon: Phone, color: 'text-green-500' },
  assinatura: { label: 'Assinaturas', icon: PenLine, color: 'text-orange-500' },
  vistoria: { label: 'Vistorias', icon: ClipboardCheck, color: 'text-yellow-500' },
  outro: { label: 'Outros', icon: CalendarDays, color: 'text-gray-500' },
};

export const AgendaStats = ({ events, currentDate }: { events: any[]; currentDate: Date }) => {
  const inRange = (s: Date, e: Date) => events.filter((ev) => isWithinInterval(new Date(ev.data_inicio), { start: s, end: e }));
  const month = inRange(startOfMonth(currentDate), endOfMonth(currentDate));
  const week = inRange(startOfWeek(currentDate, WEEK), endOfWeek(currentDate, WEEK));
  const doneMonth = month.filter(isDone).length;
  const rate = month.length ? (doneMonth / month.length) * 100 : 0;
  const doneWeek = week.filter(isDone).length;
  const byType = Object.entries(
    month.reduce((acc: Record<string, number>, e) => ({ ...acc, [e.tipo]: (acc[e.tipo] || 0) + 1 }), {}),
  ).sort((a, b) => (b[1] as number) - (a[1] as number));

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Eventos do Mês</CardTitle><CalendarDays className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{month.length}</div>
          <p className="text-xs text-muted-foreground">{doneMonth} concluídos, {month.length - doneMonth} pendentes</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Esta Semana</CardTitle><Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{week.length}</div>
          <p className="text-xs text-muted-foreground">{doneWeek} concluídos, {week.length - doneWeek} pendentes</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taxa de Conclusão</CardTitle><CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{rate.toFixed(0)}%</div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${rate}%` }} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Por Tipo</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {byType.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos no mês</p>}
            {byType.slice(0, 3).map(([tipo, count]) => {
              const info = tipoStats[tipo] || tipoStats.outro;
              const Icon = info.icon;
              return (
                <div key={tipo} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1"><Icon className={`h-3 w-3 ${info.color}`} />{info.label}</span>
                  <span className="font-medium">{count as number}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const UpcomingEvents = ({ events, onEventClick }: { events: any[]; onEventClick: (e: any) => void }) => {
  const now = new Date();
  const weekEnd = endOfWeek(now, WEEK);
  const pending = events.filter((e) => !isDone(e)).sort((a, b) => +new Date(a.data_inicio) - +new Date(b.data_inicio));
  const overdue = pending.filter((e) => isPast(new Date(e.data_fim)));
  const today = pending.filter((e) => isToday(new Date(e.data_inicio)) && !isPast(new Date(e.data_fim)));
  const tomorrow = pending.filter((e) => isTomorrow(new Date(e.data_inicio)));
  const week = pending.filter((e) => {
    const d = new Date(e.data_inicio);
    return d > now && d <= weekEnd && !isToday(d) && !isTomorrow(d);
  });

  const Item = ({ e, late }: { e: any; late?: boolean }) => (
    <Card className={cn('cursor-pointer hover:shadow-md transition-shadow border-l-4', tipoBorder[e.tipo] || tipoBorder.outro, late && 'bg-red-50')} onClick={() => onEventClick(e)}>
      <CardContent className="p-3">
        <div className="flex justify-between items-start gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="font-semibold truncate">{e.titulo}</h4>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{late ? format(new Date(e.data_inicio), 'dd/MM HH:mm') : format(new Date(e.data_inicio), 'HH:mm')}</span>
              {e.cliente && <span className="flex items-center gap-1 truncate"><User className="h-3 w-3" />{e.cliente.nome}</span>}
            </div>
          </div>
          {late && <Badge variant="destructive" className="shrink-0"><AlertCircle className="h-3 w-3 mr-1" />Atrasado</Badge>}
        </div>
      </CardContent>
    </Card>
  );

  const Section = ({ title, list, cls, max, late, showDay }: { title: string; list: any[]; cls?: string; max?: number; late?: boolean; showDay?: boolean }) =>
    list.length === 0 ? null : (
      <div className="space-y-2">
        <h5 className={cn('text-sm font-medium flex items-center gap-1', cls)}>{late && <AlertCircle className="h-4 w-4" />}{title} ({list.length})</h5>
        <div className="space-y-2">
          {list.slice(0, max ?? list.length).map((e) => (
            <div key={e.id}>
              {showDay && <p className="text-xs text-muted-foreground mb-1 capitalize">{format(new Date(e.data_inicio), 'EEEE, dd/MM', { locale: ptBR })}</p>}
              <Item e={e} late={late} />
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Próximos Eventos</span>
          <Badge variant="outline">{pending.length} pendentes</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-3">
          <div className="space-y-4">
            <Section title="Atrasados" list={overdue} cls="text-destructive" max={5} late />
            <Section title="Hoje" list={today} cls="text-primary" />
            <Section title="Amanhã" list={tomorrow} max={5} />
            <Section title="Esta Semana" list={week} cls="text-muted-foreground" max={5} showDay />
            {overdue.length + today.length + tomorrow.length + week.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum evento pendente</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
