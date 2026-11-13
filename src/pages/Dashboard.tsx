import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bar } from '@/components/charts/FinancialDashboard';
import { usePermissions } from '@/contexts/PermissionsContext';
import { CardSkeleton } from '@/components/ui/loading';
import { formatCurrency, friendlyError, toNumber } from '@/lib/utils';
import {
  TrendingUp, DollarSign, Building2, Users, FileText, Target, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle2, Clock, Pencil,
} from 'lucide-react';

const ETAPAS: [string, string][] = [
  ['novo_lead', 'Novo Lead'], ['qualificando', 'Qualificando'], ['visita_agendada', 'Visita Agendada'], ['proposta', 'Proposta'],
  ['negociacao', 'Negociação'], ['fechado_ganho', 'Ganho'], ['fechado_perdido', 'Perdido'],
];
const STATUS_IMOVEL: [string, string, string][] = [
  ['disponivel', 'Disponível', 'hsl(217 91% 60%)'], ['reservado', 'Reservado', 'hsl(38 92% 50%)'],
  ['alugado', 'Alugado', 'hsl(142 71% 45%)'], ['vendido', 'Vendido', 'hsl(0 84% 60%)'],
];
const sum = (l: any[], k: string) => l.reduce((a, x) => a + Number(x[k] || 0), 0);

export default function Dashboard() {
  const qc = useQueryClient();
  const { canRead, canCreate, canUpdate } = usePermissions();
  const [editMeta, setEditMeta] = useState(false);
  const [metaInput, setMetaInput] = useState('');
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metricas'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const from6 = format(startOfMonth(subMonths(now, 5)), 'yyyy-MM-dd');
      const mStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const mEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      const q = (ok: boolean, p: any) => (ok ? p : Promise.resolve({ data: [] }));
      const [t, props, contracts, deals, pays, clients, incidents, goals] = await Promise.all([
        supabase.from('financial_transactions').select('tipo, valor, data_competencia').gte('data_competencia', from6).limit(20000),
        q(canRead('imoveis'), supabase.from('properties').select('status').limit(10000)),
        q(canRead('contratos'), supabase.from('contracts').select('status, valor, data_fim').eq('arquivado', false).limit(10000)),
        q(canRead('funil'), supabase.from('deals').select('etapa, valor_estimado').limit(10000)),
        supabase.from('owner_payments').select('inquilino_pagou, valor_aluguel, data_vencimento').gte('mes_referencia', mStart).lte('mes_referencia', mEnd).limit(5000),
        q(canRead('clientes'), supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', mStart)),
        q(canRead('ocorrencias'), supabase.from('property_incidents').select('status').neq('status', 'resolvido').limit(5000)),
        supabase.from('company_goals').select('*').eq('ano', ano).eq('mes', mes).is('funcionario_id', null).limit(1),
      ]);
      return {
        transactions: t.data || [], properties: props.data || [], contracts: contracts.data || [], deals: deals.data || [],
        payments: pays.data || [], clientesMes: (clients as any).count || 0, incidents: incidents.data || [], goal: (goals.data || [])[0] || null,
      };
    },
  });

  if (isLoading || !data) {
    return <DashboardLayout><div className="space-y-6"><h1 className="text-3xl font-bold">Dashboard de Métricas</h1><CardSkeleton count={8} /></div></DashboardLayout>;
  }

  const monthTx = (d: Date) => data.transactions.filter((t: any) => t.data_competencia?.startsWith(format(d, 'yyyy-MM')));
  const recMes = sum(monthTx(now).filter((t: any) => t.tipo === 'receita'), 'valor');
  const despMes = sum(monthTx(now).filter((t: any) => t.tipo === 'despesa'), 'valor');
  const recAnt = sum(monthTx(subMonths(now, 1)).filter((t: any) => t.tipo === 'receita'), 'valor');
  const variacao = recAnt > 0 ? Math.round(((recMes - recAnt) / recAnt) * 1000) / 10 : 0;

  const chart = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    const l = monthTx(d);
    return { name: format(d, 'MMM', { locale: ptBR }), r: sum(l.filter((t: any) => t.tipo === 'receita'), 'valor'), d: sum(l.filter((t: any) => t.tipo === 'despesa'), 'valor') };
  });
  const chartMax = Math.max(1, ...chart.map((c) => Math.max(c.r, c.d)));

  const totalImoveis = data.properties.length;
  const byStatus = STATUS_IMOVEL.map(([k, l, c]) => ({ k, l, c, n: data.properties.filter((p: any) => p.status === k).length }));
  const disponiveis = byStatus[0].n;
  const ocupacao = totalImoveis ? Math.round(((totalImoveis - disponiveis) / totalImoveis) * 100) : 0;
  let acc = 0;
  const donut = totalImoveis
    ? `conic-gradient(${byStatus.filter((s) => s.n).map((s) => { const a = acc; acc += (s.n / totalImoveis) * 360; return `${s.c} ${a}deg ${acc}deg`; }).join(', ')})`
    : 'hsl(var(--muted))';

  const ativos = data.contracts.filter((c: any) => c.status === 'ativo');
  const vencendo = ativos.filter((c: any) => { if (!c.data_fim) return false; const d = differenceInCalendarDays(parseISO(c.data_fim), now); return d >= 0 && d <= 30; }).length;
  const pipeline = sum(data.deals, 'valor_estimado');
  const ganhos = data.deals.filter((d: any) => d.etapa === 'fechado_ganho').length;
  const perdidos = data.deals.filter((d: any) => d.etapa === 'fechado_perdido').length;
  const conversao = ganhos + perdidos ? Math.round((ganhos / (ganhos + perdidos)) * 100) : 0;
  const funil = ETAPAS.map(([k, l]) => ({ l, n: data.deals.filter((d: any) => d.etapa === k).length }));
  const funilMax = Math.max(1, ...funil.map((f) => f.n));

  const todayISO = format(now, 'yyyy-MM-dd');
  const pagAtrasados = data.payments.filter((p: any) => !p.inquilino_pagou && p.data_vencimento && p.data_vencimento < todayISO).length;
  const inad = data.payments.length ? Math.round((pagAtrasados / data.payments.length) * 100) : 0;
  const potencial = sum(data.payments, 'valor_aluguel');
  const recebido = sum(data.payments.filter((p: any) => p.inquilino_pagou), 'valor_aluguel');
  const abertas = data.incidents.filter((i: any) => i.status === 'em_aberto').length;
  const andamento = data.incidents.filter((i: any) => i.status === 'em_andamento').length;

  const meta = data.goal ? Number(data.goal.meta_geral) : 0;
  const progresso = meta ? Math.min(100, Math.round((recMes / meta) * 1000) / 10) : 0;

  const saveMeta = async () => {
    const v = toNumber(metaInput);
    if (!v || v <= 0) return toast.error('Informe uma meta maior que zero');
    const { error } = data.goal
      ? await supabase.from('company_goals').update({ meta_geral: v }).eq('id', data.goal.id)
      : await supabase.from('company_goals').insert({ ano, mes, meta_geral: v });
    if (error) return toast.error(friendlyError(error, 'Erro ao salvar meta'));
    toast.success('Meta do mês salva');
    setEditMeta(false);
    qc.invalidateQueries({ queryKey: ['dashboard-metricas'] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard de Métricas</h1>
          <p className="text-muted-foreground mt-1 capitalize">Visão geral do desempenho • {format(now, "MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center justify-between"><span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Taxa de Ocupação</span><Badge variant={ocupacao >= 80 ? 'default' : ocupacao >= 50 ? 'secondary' : 'destructive'}>{ocupacao}%</Badge></CardTitle></CardHeader>
            <CardContent><Bar value={ocupacao} /><div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{totalImoveis - disponiveis} ocupados</span><span>{disponiveis} disponíveis</span></div></CardContent>
          </Card>
          <Card className={`card-premium ${inad > 10 ? 'border-destructive/50' : ''}`}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${inad > 10 ? 'text-destructive' : 'text-warning'}`} />Inadimplência</span><Badge variant={inad <= 5 ? 'default' : inad <= 10 ? 'secondary' : 'destructive'}>{inad}%</Badge></CardTitle></CardHeader>
            <CardContent><Bar value={inad} className={inad > 10 ? 'bg-destructive' : 'bg-warning'} /><div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{pagAtrasados} em atraso</span><span>{formatCurrency(recebido)} recebido</span></div></CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center justify-between"><span className="flex items-center gap-2"><Target className="h-4 w-4 text-success" />Conversão Funil</span><Badge variant={conversao >= 30 ? 'default' : 'secondary'}>{conversao}%</Badge></CardTitle></CardHeader>
            <CardContent><Bar value={conversao} className="bg-success" /><div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{ganhos} ganhos</span><span>{formatCurrency(pipeline)} pipeline</span></div></CardContent>
          </Card>
          <Card className={`card-premium ${vencendo > 0 ? 'border-warning/50' : ''}`}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center justify-between"><span className="flex items-center gap-2"><FileText className="h-4 w-4 text-accent" />Contratos Ativos</span><span className="text-xl font-bold">{ativos.length}</span></CardTitle></CardHeader>
            <CardContent>
              {vencendo > 0
                ? <Badge className="bg-warning/10 text-warning border-warning/20"><Clock className="h-3 w-3 mr-1" />{vencendo} vencem em 30 dias</Badge>
                : <Badge variant="outline" className="text-success border-success/30"><CheckCircle2 className="h-3 w-3 mr-1" />Nenhum vencendo</Badge>}
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />Ocorrências</CardTitle></CardHeader>
            <CardContent className="flex gap-2"><Badge variant="destructive">{abertas} abertas</Badge><Badge variant="secondary">{andamento} em andamento</Badge></CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Novos Clientes (Mês)</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2"><span className="text-2xl font-bold">{data.clientesMes}</span><TrendingUp className="h-4 w-4 text-success" /></CardContent>
          </Card>
          <Card className="card-premium md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><DollarSign className="h-4 w-4 text-success" />Aluguéis do Mês</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div><p className="text-2xl font-bold text-success">{formatCurrency(recebido)}</p><p className="text-xs text-muted-foreground">de {formatCurrency(potencial)} previsto</p></div>
              <div className="w-32 text-right"><Bar value={(recebido / (potencial || 1)) * 100} /><p className="text-xs text-muted-foreground mt-1">{Math.round((recebido / (potencial || 1)) * 100)}% recebido</p></div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Receitas do Mês</CardTitle><DollarSign className="h-4 w-4 text-success" /></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(recMes)}</div>
              <div className="flex items-center text-xs mt-1">
                {variacao > 0 ? <><ArrowUpRight className="h-3 w-3 text-success mr-1" /><span className="text-success">+{variacao}%</span></>
                  : variacao < 0 ? <><ArrowDownRight className="h-3 w-3 text-destructive mr-1" /><span className="text-destructive">{variacao}%</span></>
                  : <><Minus className="h-3 w-3 text-muted-foreground mr-1" /><span className="text-muted-foreground">0%</span></>}
                <span className="text-muted-foreground ml-1">vs mês anterior</span>
              </div>
            </CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Lucro Líquido</CardTitle><TrendingUp className="h-4 w-4 text-primary" /></CardHeader>
            <CardContent><div className={`text-2xl font-bold ${recMes - despMes >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(recMes - despMes)}</div><p className="text-xs text-muted-foreground">Despesas: {formatCurrency(despMes)}</p></CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Valor em Contratos</CardTitle><FileText className="h-4 w-4 text-accent" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatCurrency(sum(ativos, 'valor'))}</div><p className="text-xs text-muted-foreground">{ativos.length} contratos ativos</p></CardContent>
          </Card>
          <Card className="card-premium">
            <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Pipeline de Vendas</CardTitle><Target className="h-4 w-4 text-warning" /></CardHeader>
            <CardContent><div className="text-2xl font-bold">{data.deals.length}</div><p className="text-xs text-muted-foreground">{formatCurrency(pipeline)} potencial</p></CardContent>
          </Card>
        </div>

        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Meta do Mês</CardTitle>
            {(canCreate('financeiro') || canUpdate('financeiro')) && !editMeta && (
              <Button variant="ghost" size="sm" onClick={() => { setMetaInput(meta ? String(meta) : ''); setEditMeta(true); }}><Pencil className="h-4 w-4 mr-1" />{meta ? 'Alterar' : 'Definir meta'}</Button>
            )}
          </CardHeader>
          <CardContent>
            {editMeta ? (
              <div className="flex flex-wrap gap-2 items-center">
                <Input type="number" min="1" step="100" placeholder="Ex: 100000" value={metaInput} onChange={(e) => setMetaInput(e.target.value)} className="w-48" />
                <Button onClick={saveMeta}>Salvar</Button>
                <Button variant="outline" onClick={() => setEditMeta(false)}>Cancelar</Button>
              </div>
            ) : meta ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span>Progresso: {formatCurrency(recMes)} de {formatCurrency(meta)}</span><span className="font-bold">{progresso}%</span></div>
                <div className="h-4 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${progresso >= 100 ? 'bg-success' : progresso >= 70 ? 'bg-primary' : progresso >= 40 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${progresso}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma meta definida para este mês.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="card-premium">
            <CardHeader><CardTitle>Receitas vs Despesas</CardTitle><CardDescription>Últimos 6 meses</CardDescription></CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-64 border-b pb-1">
                {chart.map((c) => (
                  <div key={c.name} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="flex items-end gap-1 h-full w-full justify-center">
                      <div className="w-1/3 bg-success rounded-t" style={{ height: `${(c.r / chartMax) * 100}%` }} title={`Receitas: ${formatCurrency(c.r)}`} />
                      <div className="w-1/3 bg-destructive rounded-t" style={{ height: `${(c.d / chartMax) * 100}%` }} title={`Despesas: ${formatCurrency(c.d)}`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-1">{chart.map((c) => <span key={c.name} className="flex-1 text-center text-xs text-muted-foreground capitalize">{c.name}</span>)}</div>
              <div className="flex gap-4 justify-center mt-3 text-xs"><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success" />Receitas</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive" />Despesas</span></div>
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader><CardTitle>Imóveis por Status</CardTitle><CardDescription>{totalImoveis} imóveis cadastrados</CardDescription></CardHeader>
            <CardContent className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative h-48 w-48 shrink-0 rounded-full" style={{ background: donut }}>
                <div className="absolute inset-8 rounded-full bg-card flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold">{totalImoveis}</span><span className="text-xs text-muted-foreground">imóveis</span>
                </div>
              </div>
              <div className="space-y-2 w-full">
                {byStatus.map((s) => (
                  <div key={s.k} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: s.c }} />{s.l}</span>
                    <span className="font-medium">{s.n}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="card-premium">
          <CardHeader><CardTitle>Funil de Vendas</CardTitle><CardDescription>Negociações por etapa</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {funil.map((f) => (
              <div key={f.l} className="flex items-center gap-3">
                <span className="w-32 text-sm shrink-0">{f.l}</span>
                <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden"><div className="h-full bg-primary rounded" style={{ width: `${(f.n / funilMax) * 100}%` }} /></div>
                <span className="w-8 text-right text-sm font-medium">{f.n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
