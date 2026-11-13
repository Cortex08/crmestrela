import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, subMonths } from 'date-fns';
import { FileBarChart, Building2, Users, TrendingUp, Phone, MapPin, Calendar, Download, Filter, ArrowUpRight, PhoneCall } from 'lucide-react';
import { useOptions } from '@/hooks/useOptions';
import { STATUS_PROSPECT, STATUS_PROSPECT_COLOR, RESULTADO_CONTATO, fmtDate } from '@/lib/prospeccao';

const csv = (v: any) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

const RelatorioProspeccao = () => {
  const [meses, setMeses] = useState('3');
  const [resp, setResp] = useState('all');
  const [bairro, setBairro] = useState('all');
  const { profiles } = useOptions(true, { profiles: true });
  const inicio = startOfMonth(subMonths(new Date(), parseInt(meses) - 1)).toISOString();

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ['relatorio-prospects', meses],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_prospects')
        .select('id, created_at, endereco, numero, bairro, cidade, status, proprietario_nome, proprietario_telefone, ultimo_contato, responsavel_prospeccao_id, responsavel_prospeccao:profiles!property_prospects_responsavel_prospeccao_id_fkey(id, nome)')
        .gte('created_at', inicio)
        .order('created_at', { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['relatorio-contacts', meses],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospect_contacts')
        .select('id, resultado, quem_ligou_id, quem_ligou:profiles!prospect_contacts_quem_ligou_id_fkey(nome)')
        .gte('data_contato', inicio)
        .limit(20000);
      if (error) throw error;
      return data || [];
    },
  });

  const m = useMemo(() => {
    const list = prospects.filter((p: any) => (resp === 'all' || p.responsavel_prospeccao_id === resp) && (bairro === 'all' || p.bairro === bairro));
    const total = list.length;
    const captados = list.filter((p: any) => p.status === 'captado').length;
    const negociando = list.filter((p: any) => ['em_contato', 'interessado', 'em_negociacao'].includes(p.status)).length;
    const porStatus: Record<string, number> = {};
    const porBairro: Record<string, number> = {};
    const porResp: Record<string, { nome: string; total: number; captados: number }> = {};
    list.forEach((p: any) => {
      porStatus[p.status] = (porStatus[p.status] || 0) + 1;
      porBairro[p.bairro] = (porBairro[p.bairro] || 0) + 1;
      const id = p.responsavel_prospeccao?.id || 'none';
      porResp[id] ||= { nome: p.responsavel_prospeccao?.nome || 'Não atribuído', total: 0, captados: 0 };
      porResp[id].total++;
      if (p.status === 'captado') porResp[id].captados++;
    });
    const cont = contacts.filter((c: any) => resp === 'all' || c.quem_ligou_id === resp);
    const porResultado: Record<string, number> = {};
    cont.forEach((c: any) => { porResultado[c.resultado] = (porResultado[c.resultado] || 0) + 1; });
    return { list, total, captados, negociando, taxa: total ? ((captados / total) * 100).toFixed(1) : '0', porStatus, porBairro, porResp, totalContatos: cont.length, porResultado };
  }, [prospects, contacts, resp, bairro]);

  const bairros = useMemo(() => [...new Set(prospects.map((p: any) => p.bairro))].sort() as string[], [prospects]);

  const exportar = () => {
    const head = ['Data', 'Endereço', 'Bairro', 'Cidade', 'Status', 'Responsável Prospecção', 'Proprietário', 'Telefone', 'Último Contato'];
    const rows = m.list.map((p: any) => [
      fmtDate(p.created_at), `${p.endereco}${p.numero ? ', ' + p.numero : ''}`, p.bairro, p.cidade, STATUS_PROSPECT[p.status] || p.status,
      p.responsavel_prospeccao?.nome || '-', p.proprietario_nome || '-', p.proprietario_telefone || '-', fmtDate(p.ultimo_contato),
    ]);
    const content = '﻿' + [head, ...rows].map((r) => r.map(csv).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    a.download = `relatorio-prospeccao-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kpis: [string, string | number, any, string][] = [
    ['Total Prospectado', m.total, Building2, ''],
    ['Captados', m.captados, TrendingUp, 'text-green-600'],
    ['Em Negociação', m.negociando, Phone, 'text-blue-600'],
    ['Taxa de Conversão', `${m.taxa}%`, ArrowUpRight, ''],
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><FileBarChart className="h-8 w-8" /> Relatório de Prospecção</h1>
            <p className="text-muted-foreground">Análise de desempenho da prospecção de imóveis</p>
          </div>
          <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Filter className="h-4 w-4" /> Filtros</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Período</label>
                <Select value={meses} onValueChange={setMeses}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Mês atual</SelectItem>
                    <SelectItem value="3">Últimos 3 meses</SelectItem>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Último ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Responsável</label>
                <Select value={resp} onValueChange={setResp}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todos</SelectItem>{profiles.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bairro</label>
                <Select value={bairro} onValueChange={setBairro}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todos</SelectItem>{bairros.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(([l, v, Icon, c]) => (
            <Card key={l}>
              <CardHeader className="pb-2"><CardDescription>{l}</CardDescription></CardHeader>
              <CardContent><div className="flex items-center justify-between"><span className={`text-3xl font-bold ${c}`}>{v}</span><Icon className="h-8 w-8 text-muted-foreground" /></div></CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Por Status</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(m.porStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <div key={s} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${STATUS_PROSPECT_COLOR[s] || 'bg-gray-400'}`} /><span>{STATUS_PROSPECT[s] || s}</span></div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full ${STATUS_PROSPECT_COLOR[s] || 'bg-gray-400'}`} style={{ width: `${(n / (m.total || 1)) * 100}%` }} /></div>
                      <span className="text-sm font-medium w-8 text-right">{n}</span>
                    </div>
                  </div>
                ))}
                {m.total === 0 && <p className="text-sm text-muted-foreground">Sem dados no período</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Por Responsável</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.values(m.porResp).sort((a, b) => b.total - a.total).slice(0, 10).map((it, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span className="truncate max-w-[180px]">{it.nome}</span></div>
                    <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{it.captados} captados</span><Badge variant="secondary">{it.total}</Badge></div>
                  </div>
                ))}
                {m.total === 0 && <p className="text-sm text-muted-foreground">Sem dados no período</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><PhoneCall className="h-5 w-5" /> Ligações no Período ({m.totalContatos})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(m.porResultado).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                  <div key={r} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"><span className="text-sm">{RESULTADO_CONTATO[r] || r}</span><Badge variant="outline">{n}</Badge></div>
                ))}
                {m.totalContatos === 0 && <p className="text-sm text-muted-foreground">Nenhuma ligação registrada</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5" /> Por Bairro</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(m.porBairro).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([b, n]) => (
                  <div key={b} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"><span className="text-sm truncate">{b}</span><Badge variant="outline">{n}</Badge></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Calendar className="h-5 w-5" /> Prospecções Recentes</CardTitle>
            <CardDescription>Últimas prospecções cadastradas no período</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Data</TableHead><TableHead>Endereço</TableHead><TableHead>Bairro</TableHead><TableHead>Status</TableHead><TableHead>Proprietário</TableHead><TableHead>Responsável</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.list.slice(0, 20).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{fmtDate(p.created_at)}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{p.endereco}{p.numero ? `, ${p.numero}` : ''}</TableCell>
                        <TableCell>{p.bairro}</TableCell>
                        <TableCell><Badge className={`${STATUS_PROSPECT_COLOR[p.status] || 'bg-gray-500'} text-white`}>{STATUS_PROSPECT[p.status] || p.status}</Badge></TableCell>
                        <TableCell>{p.proprietario_nome || '-'}</TableCell>
                        <TableCell>{p.responsavel_prospeccao?.nome || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {m.list.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma prospecção encontrada no período</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default RelatorioProspeccao;
