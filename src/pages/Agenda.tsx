import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, CalendarDays, List, Grid3X3, Search, RefreshCw, Download, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EventoForm } from '@/components/forms/EventoForm';
import { EventDetailsDialog } from '@/components/agenda/EventDetailsDialog';
import { MonthView, WeekView, DayView, AgendaStats, UpcomingEvents, MiniCalendar, TIPOS_EVENTO, tipoDot, isDone } from '@/components/agenda/AgendaParts';
import { useOptions } from '@/hooks/useOptions';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/use-mobile';
import { AgendaMobile } from '@/components/agenda/AgendaMobile';
import { cn } from '@/lib/utils';

const csvCell = (v: any) => {
  let s = String(v ?? '');
  // Evita que o Excel interprete o conteúdo como fórmula
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

const Agenda = () => {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selected, setSelected] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState('all');
  const { profiles } = useOptions(true, { profiles: true });
  const isMobile = useIsMobile();

  // Carrega 3 meses ao redor da data visível (rápido mesmo com muitos eventos)
  const rangeStart = startOfWeek(startOfMonth(subMonths(currentDate, 1)));
  const rangeEnd = endOfWeek(endOfMonth(addMonths(currentDate, 1)));
  const rangeKey = format(rangeStart, 'yyyy-MM-dd');

  const { data: events = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['calendar_events', rangeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*, cliente:clients(id, nome, whatsapp), imovel:properties(id, codigo, endereco, titulo), corretor:profiles!calendar_events_corretor_id_fkey(id, nome)')
        .gte('data_inicio', rangeStart.toISOString())
        .lte('data_inicio', rangeEnd.toISOString())
        .order('data_inicio', { ascending: true })
        .limit(3000);
      if (error) throw error;
      return data || [];
    },
    placeholderData: (prev) => prev,
  });

  // Eventos atrasados de qualquer data (para o painel "Próximos Eventos")
  const { data: overdue = [] } = useQuery({
    queryKey: ['calendar_events', 'overdue'],
    queryFn: async () => {
      const { data } = await supabase
        .from('calendar_events')
        .select('*, cliente:clients(id, nome, whatsapp), imovel:properties(id, codigo, endereco, titulo), corretor:profiles!calendar_events_corretor_id_fkey(id, nome)')
        .neq('status', 'concluido')
        .lt('data_fim', new Date().toISOString())
        .order('data_inicio', { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['calendar_events'] });

  const filtered = useMemo(
    () =>
      events.filter((e: any) => {
        const s = !search || [e.titulo, e.cliente?.nome, e.imovel?.codigo, e.local].some((v) => (v || '').toLowerCase().includes(search));
        const st = filterStatus === 'all' || (filterStatus === 'concluido' ? isDone(e) : !isDone(e));
        return s && st && (filterTipo === 'all' || e.tipo === filterTipo) && (filterResp === 'all' || e.corretor_id === filterResp);
      }),
    [events, search, filterTipo, filterStatus, filterResp],
  );
  const upcomingPool = useMemo(() => {
    const ids = new Set(filtered.map((e: any) => e.id));
    return [...filtered, ...overdue.filter((e: any) => !ids.has(e.id) && (filterResp === 'all' || e.corretor_id === filterResp))];
  }, [filtered, overdue, filterResp]);

  const move = (dir: 1 | -1) => {
    if (view === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (view === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
  };

  const title =
    view === 'month' ? format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })
      : view === 'week' ? `Semana de ${format(startOfWeek(currentDate), 'dd/MM')} a ${format(endOfWeek(currentDate), 'dd/MM')}`
      : format(currentDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  const current = (selected && [...events, ...overdue].find((e: any) => e.id === selected.id)) || selected;
  const openEvent = (e: any) => { setSelected(e); setDetailsOpen(true); };

  const exportCSV = () => {
    const list = filtered.filter((e: any) => isWithinInterval(new Date(e.data_inicio), { start: startOfMonth(currentDate), end: endOfMonth(currentDate) }));
    const rows = [
      ['Título', 'Tipo', 'Data', 'Hora Início', 'Hora Fim', 'Cliente', 'Imóvel', 'Local', 'Status', 'Responsável'].map(csvCell).join(';'),
      ...list.map((e: any) => [
        e.titulo, TIPOS_EVENTO[e.tipo] || e.tipo, format(new Date(e.data_inicio), 'dd/MM/yyyy'),
        format(new Date(e.data_inicio), 'HH:mm'), format(new Date(e.data_fim), 'HH:mm'),
        e.cliente?.nome, e.imovel?.codigo, e.local, isDone(e) ? 'Concluído' : 'Pendente', e.corretor?.nome,
      ].map(csvCell).join(';')),
    ].join('\n');
    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agenda-${format(currentDate, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filtrosAtivos = [filterTipo, filterStatus, filterResp].filter((v) => v !== 'all').length;
  const filtrosMobile = (
    <>
      <div className="space-y-1"><label className="text-sm font-medium">Tipo</label>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{Object.entries(TIPOS_EVENTO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select></div>
      <div className="space-y-1"><label className="text-sm font-medium">Status</label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="concluido">Concluídos</SelectItem></SelectContent>
        </Select></div>
      <div className="space-y-1"><label className="text-sm font-medium">Responsável</label>
        <Select value={filterResp} onValueChange={setFilterResp}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
        </Select></div>
      {filtrosAtivos > 0 && <Button variant="ghost" className="w-full" onClick={() => { setFilterTipo('all'); setFilterStatus('all'); setFilterResp('all'); }}>Limpar filtros</Button>}
    </>
  );

  if (isMobile) {
    return (
      <DashboardLayout>
        <AgendaMobile
          events={filtered} pool={upcomingPool} currentDate={currentDate} setCurrentDate={setCurrentDate}
          onEventClick={openEvent} onNew={() => { setEditing(null); setFormOpen(true); }}
          isLoading={isLoading} isFetching={isFetching} onRefresh={() => refetch()}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm} filtros={filtrosMobile} filtrosAtivos={filtrosAtivos}
        />
        <EventDetailsDialog
          event={current} open={detailsOpen} onOpenChange={setDetailsOpen} onUpdate={refresh}
          onEdit={(e) => { setDetailsOpen(false); setEditing(e); setFormOpen(true); }}
        />
        <EventoForm open={formOpen} onOpenChange={setFormOpen} event={editing} defaultDate={currentDate} onSuccess={refresh} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Agenda</h1>
            <p className="text-muted-foreground">Gerencie compromissos, visitas e reuniões</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4 mr-1', isFetching && 'animate-spin')} /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Novo Evento</Button>
          </div>
        </div>

        <AgendaStats events={filtered} currentDate={currentDate} />

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por título, cliente, imóvel ou local..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos tipos</SelectItem>
                    {Object.entries(TIPOS_EVENTO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="pendente">Pendentes</SelectItem>
                    <SelectItem value="concluido">Concluídos</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterResp} onValueChange={setFilterResp}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3 min-w-0">
            <Card className="card-premium">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
                    <h2 className="text-lg font-semibold capitalize">{title}</h2>
                  </div>
                  <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                    <TabsList>
                      <TabsTrigger value="month" className="gap-1"><Grid3X3 className="h-4 w-4" />Mês</TabsTrigger>
                      <TabsTrigger value="week" className="gap-1"><CalendarDays className="h-4 w-4" />Semana</TabsTrigger>
                      <TabsTrigger value="day" className="gap-1"><List className="h-4 w-4" />Dia</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-[500px]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>
                ) : view === 'month' ? (
                  <MonthView events={filtered} currentDate={currentDate} onDateChange={(d) => { setCurrentDate(d); setView('day'); }} onEventClick={openEvent} />
                ) : view === 'week' ? (
                  <WeekView events={filtered} currentDate={currentDate} onDateChange={setCurrentDate} onEventClick={openEvent} />
                ) : (
                  <DayView events={filtered} currentDate={currentDate} onDateChange={setCurrentDate} onEventClick={openEvent} />
                )}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Calendário</CardTitle></CardHeader>
              <CardContent className="p-2"><MiniCalendar selected={currentDate} onSelect={setCurrentDate} events={filtered} /></CardContent>
            </Card>
            <UpcomingEvents events={upcomingPool} onEventClick={openEvent} />
          </div>
        </div>

        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">Legenda:</span>
              {Object.entries(TIPOS_EVENTO).map(([k, l]) => (
                <div key={k} className="flex items-center gap-1"><div className={`w-3 h-3 rounded ${tipoDot[k]}`} /><span>{l}</span></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <EventDetailsDialog
        event={current}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onUpdate={refresh}
        onEdit={(e) => { setDetailsOpen(false); setEditing(e); setFormOpen(true); }}
      />
      <EventoForm open={formOpen} onOpenChange={setFormOpen} event={editing} defaultDate={currentDate} onSuccess={refresh} />
    </DashboardLayout>
  );
};

export default Agenda;
