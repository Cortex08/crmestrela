import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link, Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Bell, FileText, DollarSign, Calendar, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, MapPin } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDateBR } from '@/lib/utils';
import { cn } from '@/lib/utils';

const today = () => format(new Date(), 'yyyy-MM-dd');
const diff = (d: string) => differenceInCalendarDays(parseISO(d), new Date());

const urgency = (days: number, atraso = false) => {
  if (atraso) {
    if (days > 10) return <Badge variant="destructive">Crítico - {days} dias</Badge>;
    if (days > 5) return <Badge className="bg-destructive/80 text-destructive-foreground">Urgente - {days} dias</Badge>;
    return <Badge className="bg-warning text-warning-foreground">{days} dias em atraso</Badge>;
  }
  if (days < 0) return <Badge variant="destructive">Vencido há {-days} dias</Badge>;
  if (days === 0) return <Badge variant="destructive">Vence hoje</Badge>;
  if (days <= 3) return <Badge variant="destructive">Vence em {days} dias</Badge>;
  if (days <= 7) return <Badge className="bg-warning text-warning-foreground">Vence em {days} dias</Badge>;
  return <Badge variant="outline">{days} dias restantes</Badge>;
};

const Empty = ({ text }: { text: string }) => (
  <div className="text-center py-8"><CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" /><p className="text-muted-foreground">{text}</p></div>
);

const AlertRow = ({ tone, icon: Icon, title, sub, badge, to }: { tone: 'red' | 'yellow' | 'muted'; icon: any; title: string; sub: string; badge: React.ReactNode; to: string }) => (
  <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border',
    tone === 'red' ? 'bg-destructive/5 border-destructive/20' : tone === 'yellow' ? 'bg-warning/5 border-warning/20' : 'bg-muted/50')}>
    <div className="flex items-center gap-4 min-w-0">
      <div className={cn('h-10 w-10 shrink-0 rounded-full flex items-center justify-center', tone === 'red' ? 'bg-destructive/10' : tone === 'yellow' ? 'bg-warning/10' : 'bg-accent/10')}>
        <Icon className={cn('h-5 w-5', tone === 'red' ? 'text-destructive' : tone === 'yellow' ? 'text-warning' : 'text-accent')} />
      </div>
      <div className="min-w-0"><p className="font-medium truncate">{title}</p><p className="text-sm text-muted-foreground truncate">{sub}</p></div>
    </div>
    <div className="flex items-center gap-3 shrink-0">
      {badge}
      <Link to={to}><Button variant="outline" size="sm"><ExternalLink className="h-4 w-4" /></Button></Link>
    </div>
  </div>
);

export default function Alertas() {
  const qc = useQueryClient();
  const { canRead } = usePermissions();
  const { roles } = useAuth();
  // alertas: só o financeiro (e o administrador) enxergam
  const podeVer = roles.includes('financeiro') || roles.includes('admin');
  const verContratos = podeVer && canRead('contratos');
  const verFinanceiro = podeVer && canRead('financeiro');
  const verContas = podeVer && canRead('contas_pagar');

  const { data: contracts = [] } = useQuery({
    queryKey: ['alertas', 'contratos'],
    enabled: verContratos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, codigo, tipo, data_fim, endereco_imovel, cliente:clients!contracts_cliente_id_fkey(nome)')
        .eq('status', 'ativo')
        .eq('arquivado', false)
        .not('data_fim', 'is', null)
        .lte('data_fim', format(addDays(new Date(), 30), 'yyyy-MM-dd'))
        .order('data_fim')
        .limit(300);
      if (error) throw error;
      return (data || []).map((c: any) => ({ ...c, dias: diff(c.data_fim) }));
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['alertas', 'pagamentos'],
    enabled: verFinanceiro,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('owner_payments')
        .select('id, mes_referencia, data_vencimento, valor_aluguel, valor_total, proprietario:clients!owner_payments_proprietario_id_fkey(nome), inquilino:clients!owner_payments_inquilino_id_fkey(nome)')
        .eq('inquilino_pagou', false)
        .not('data_vencimento', 'is', null)
        .lt('data_vencimento', today())
        .order('data_vencimento')
        .limit(300);
      if (error) throw error;
      return (data || []).map((p: any) => ({ ...p, atraso: -diff(p.data_vencimento) }));
    },
  });

  const { data: bills = [] } = useQuery({
    queryKey: ['alertas', 'contas'],
    enabled: verContas,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select('id, descricao, data_vencimento, valor, categoria')
        .neq('status', 'pago')
        .lte('data_vencimento', format(addDays(new Date(), 7), 'yyyy-MM-dd'))
        .order('data_vencimento')
        .limit(300);
      if (error) throw error;
      return (data || []).map((b: any) => ({ ...b, dias: diff(b.data_vencimento) }));
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ['alertas', 'ocorrencias'],
    enabled: canRead('ocorrencias'),
    queryFn: async () => {
      const { data } = await supabase
        .from('property_incidents')
        .select('id, numero, prioridade, status, data_reclamacao, imovel:properties!property_incidents_imovel_id_fkey(endereco)')
        .neq('status', 'resolvido')
        .in('prioridade', ['alta', 'urgente'])
        .order('data_reclamacao')
        .limit(100);
      return data || [];
    },
  });

  const overdueBills = bills.filter((b: any) => b.dias < 0);
  const upcomingBills = bills.filter((b: any) => b.dias >= 0);
  const total = contracts.length + payments.length + bills.length + incidents.length;
  const criticos = payments.filter((p: any) => p.atraso > 5).length + overdueBills.length + contracts.filter((c: any) => c.dias < 0).length
    + incidents.filter((i: any) => i.prioridade === 'urgente').length;

  const payRow = (p: any) => (
    <AlertRow key={`p-${p.id}`} tone="red" icon={DollarSign} to="/controle-pagamentos"
      title={`Aluguel em atraso - ${p.inquilino?.nome || 'Inquilino'}`}
      sub={`${format(parseISO(p.mes_referencia), 'MMMM/yyyy', { locale: ptBR })} • ${formatCurrency(Number(p.valor_total ?? p.valor_aluguel))}`}
      badge={urgency(p.atraso, true)} />
  );
  const billRow = (b: any) => (
    <AlertRow key={`b-${b.id}`} tone={b.dias < 0 ? 'red' : 'muted'} icon={Calendar} to="/contas-pagar"
      title={b.descricao} sub={`${b.categoria} • ${formatCurrency(Number(b.valor))} • ${formatDateBR(b.data_vencimento)}`} badge={urgency(b.dias)} />
  );
  const contractRow = (c: any) => (
    <AlertRow key={`c-${c.id}`} tone={c.dias < 0 ? 'red' : 'yellow'} icon={FileText} to="/contratos"
      title={`Contrato ${c.codigo} - ${c.cliente?.nome || 'N/A'}`} sub={`${c.tipo} • ${c.endereco_imovel || ''} • Vence em ${formatDateBR(c.data_fim)}`} badge={urgency(c.dias)} />
  );
  const incidentRow = (i: any) => (
    <AlertRow key={`i-${i.id}`} tone={i.prioridade === 'urgente' ? 'red' : 'yellow'} icon={AlertTriangle} to="/ocorrencias"
      title={`Ocorrência #${i.numero} (${i.prioridade})`} sub={`${i.imovel?.endereco || ''} • aberta em ${formatDateBR(i.data_reclamacao)}`}
      badge={<Badge variant="outline">{i.status === 'em_aberto' ? 'Em aberto' : 'Em andamento'}</Badge>} />
  );

  const summary: [string, number, any, string, string][] = [
    ['Críticos', criticos, AlertTriangle, criticos > 0 ? 'text-destructive' : 'text-muted-foreground', ''],
    ['Contratos', contracts.length, FileText, 'text-primary', 'a vencer em 30 dias'],
    ['Pagamentos', payments.length, DollarSign, 'text-warning', 'em atraso'],
    ['Contas', bills.length, Calendar, 'text-accent', 'próximos 7 dias'],
  ];

  if (!podeVer) return <Navigate to="/" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3"><Bell className="h-8 w-8 text-primary" /> Central de Alertas</h1>
            <p className="text-muted-foreground mt-1">Monitore vencimentos e pendências importantes</p>
          </div>
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['alertas'] })} className="gap-2"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {summary.map(([l, v, Icon, c, sub], i) => (
            <Card key={l} className={i === 0 && criticos > 0 ? 'border-destructive bg-destructive/5' : ''}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Icon className={`h-4 w-4 ${c}`} />{l}</CardTitle></CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${i === 0 && criticos > 0 ? 'text-destructive' : ''}`}>{v}</div>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto justify-start">
            <TabsTrigger value="all" className="gap-2">Todos <Badge variant="secondary">{total}</Badge></TabsTrigger>
            {verContratos && <TabsTrigger value="contracts" className="gap-2">Contratos <Badge variant="secondary">{contracts.length}</Badge></TabsTrigger>}
            {verFinanceiro && <TabsTrigger value="payments" className="gap-2">Pagamentos <Badge variant="secondary">{payments.length}</Badge></TabsTrigger>}
            {verContas && <TabsTrigger value="bills" className="gap-2">Contas <Badge variant="secondary">{bills.length}</Badge></TabsTrigger>}
            {incidents.length > 0 && <TabsTrigger value="incidents" className="gap-2">Ocorrências <Badge variant="secondary">{incidents.length}</Badge></TabsTrigger>}
          </TabsList>

          <TabsContent value="all">
            <Card>
              <CardHeader><CardTitle>Todos os Alertas</CardTitle><CardDescription>Vencimentos e pendências ordenados por urgência</CardDescription></CardHeader>
              <CardContent>
                {total === 0 ? <Empty text="Nenhum alerta no momento" /> : (
                  <ScrollArea className="h-[460px] pr-3">
                    <div className="space-y-3">
                      {payments.map(payRow)}
                      {overdueBills.map(billRow)}
                      {incidents.filter((i: any) => i.prioridade === 'urgente').map(incidentRow)}
                      {contracts.map(contractRow)}
                      {incidents.filter((i: any) => i.prioridade !== 'urgente').map(incidentRow)}
                      {upcomingBills.map(billRow)}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="contracts">
            <Card>
              <CardHeader><CardTitle>Contratos a Vencer</CardTitle><CardDescription>Contratos ativos vencidos ou com vencimento nos próximos 30 dias</CardDescription></CardHeader>
              <CardContent>{contracts.length === 0 ? <Empty text="Nenhum contrato a vencer" /> : <div className="space-y-3">{contracts.map(contractRow)}</div>}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments">
            <Card>
              <CardHeader><CardTitle>Pagamentos em Atraso</CardTitle><CardDescription>Aluguéis não pagos após a data de vencimento</CardDescription></CardHeader>
              <CardContent>{payments.length === 0 ? <Empty text="Nenhum pagamento em atraso" /> : <div className="space-y-3">{payments.map(payRow)}</div>}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="bills">
            <Card>
              <CardHeader><CardTitle>Contas a Pagar</CardTitle><CardDescription>Contas vencidas ou com vencimento nos próximos 7 dias</CardDescription></CardHeader>
              <CardContent>{bills.length === 0 ? <Empty text="Nenhuma conta a vencer" /> : <div className="space-y-3">{bills.map(billRow)}</div>}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="incidents">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Ocorrências de Alta Prioridade</CardTitle><CardDescription>Ocorrências urgentes ou de alta prioridade ainda não resolvidas</CardDescription></CardHeader>
              <CardContent><div className="space-y-3">{incidents.map(incidentRow)}</div></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
