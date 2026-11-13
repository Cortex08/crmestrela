import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Users, FileText, Key, AlertCircle, TrendingUp, ArrowRight, Plus, UserCheck, Clock, CheckCircle2,
  AlertTriangle, Bell, DollarSign, Calendar,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useAuth } from '@/contexts/AuthContext';

// Conta registros direto no banco (rápido, não baixa a tabela inteira)
const count = async (table: string, apply?: (q: any) => any) => {
  let q: any = supabase.from(table).select('id', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count: c } = await q;
  return c ?? 0;
};

const Index = () => {
  const { canRead } = usePermissions();
  const { roles } = useAuth();
  const verAlertas = roles.includes('financeiro') || roles.includes('admin');

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const [
        totalImoveis, imoveisDisponiveis, totalClientes, inquilinos, proprietarios,
        totalContratos, contratosAtivos, totalChaves, chavesEmUso, ocorrenciasAbertas, ocorrenciasUrgentes,
      ] = await Promise.all([
        count('properties'),
        count('properties', (q) => q.eq('status', 'disponivel')),
        count('clients'),
        count('clients', (q) => q.eq('tipo', 'inquilino')),
        count('clients', (q) => q.eq('tipo', 'proprietario')),
        count('contracts'),
        count('contracts', (q) => q.eq('status', 'ativo')),
        count('keys'),
        count('keys', (q) => q.eq('status', 'em_uso')),
        count('property_incidents', (q) => q.neq('status', 'resolvido')),
        count('property_incidents', (q) => q.neq('status', 'resolvido').eq('prioridade', 'urgente')),
      ]);
      return { totalImoveis, imoveisDisponiveis, totalClientes, inquilinos, proprietarios, totalContratos, contratosAtivos, totalChaves, chavesEmUso, ocorrenciasAbertas, ocorrenciasUrgentes };
    },
  });

  const { data: recentOcorrencias = [] } = useQuery({
    queryKey: ['dashboard-recent-incidents'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('property_incidents')
        .select('id, numero, tipo, status, prioridade, inquilino:clients!property_incidents_inquilino_id_fkey(nome), imovel:properties!property_incidents_imovel_id_fkey(endereco, bairro)')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data as any[]) || [];
    },
  });

  const { data: alerts } = useQuery({
    queryKey: ['dashboard-alerts-summary'],
    enabled: verAlertas,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [contratosVencer, pagamentosAtraso, contasVencer] = await Promise.all([
        count('contracts', (q) => q.eq('status', 'ativo').not('data_fim', 'is', null).lte('data_fim', format(addDays(new Date(), 30), 'yyyy-MM-dd')).gte('data_fim', today)),
        count('owner_payments', (q) => q.eq('inquilino_pagou', false).not('data_vencimento', 'is', null).lt('data_vencimento', today)),
        count('bills', (q) => q.neq('status', 'pago').lte('data_vencimento', format(addDays(new Date(), 7), 'yyyy-MM-dd'))),
      ]);
      return { contratosVencer, pagamentosAtraso, contasVencer, total: contratosVencer + pagamentosAtraso + contasVencer };
    },
  });

  const s = stats || {
    totalImoveis: 0, imoveisDisponiveis: 0, totalClientes: 0, inquilinos: 0, proprietarios: 0,
    totalContratos: 0, contratosAtivos: 0, totalChaves: 0, chavesEmUso: 0, ocorrenciasAbertas: 0, ocorrenciasUrgentes: 0,
  };

  const statusBadge = (status: string) => {
    const v: Record<string, [string, string]> = {
      em_aberto: ['Em Aberto', 'bg-destructive/10 text-destructive border-destructive/20'],
      em_andamento: ['Em Andamento', 'bg-warning/10 text-warning border-warning/20'],
      resolvido: ['Resolvido', 'bg-success/10 text-success border-success/20'],
    };
    const [label, cls] = v[status] || [status, ''];
    return <Badge variant="outline" className={cls}>{label}</Badge>;
  };

  const prioridadeBadge = (p: string) => {
    const v: Record<string, [string, string]> = {
      baixa: ['Baixa', 'bg-muted text-muted-foreground'],
      media: ['Média', 'bg-primary/10 text-primary'],
      alta: ['Alta', 'bg-warning/10 text-warning'],
      urgente: ['Urgente', 'bg-destructive text-destructive-foreground'],
    };
    const [label, cls] = v[p] || [p, ''];
    return <Badge className={cls}>{label}</Badge>;
  };

  const quickActions = [
    { label: 'Novo Imóvel', icon: Building2, href: '/imoveis', color: 'text-primary', module: 'imoveis' },
    { label: 'Novo Cliente', icon: Users, href: '/clientes', color: 'text-success', module: 'clientes' },
    { label: 'Nova Ocorrência', icon: AlertCircle, href: '/ocorrencias', color: 'text-warning', module: 'ocorrencias' },
    { label: 'Novo Contrato', icon: FileText, href: '/contratos', color: 'text-accent', module: 'contratos' },
  ].filter((a) => canRead(a.module));

  const statCards = [
    { to: '/imoveis', module: 'imoveis', title: 'Imóveis', icon: <Building2 className="h-4 w-4 text-primary" />, value: s.totalImoveis, sub: `${s.imoveisDisponiveis} disponíveis` },
    { to: '/clientes', module: 'clientes', title: 'Clientes', icon: <Users className="h-4 w-4 text-success" />, value: s.totalClientes, sub: `${s.inquilinos} inquilinos · ${s.proprietarios} proprietários` },
    { to: '/contratos', module: 'contratos', title: 'Contratos', icon: <FileText className="h-4 w-4 text-accent" />, value: s.totalContratos, sub: `${s.contratosAtivos} ativos` },
    { to: '/chaves', module: 'chaves', title: 'Chaves', icon: <Key className="h-4 w-4 text-warning" />, value: s.totalChaves, sub: `${s.chavesEmUso} em uso` },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground">Bem-vindo ao seu CRM Imobiliário. Aqui está um resumo do seu negócio.</p>
        </div>

        {quickActions.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {quickActions.map((a) => (
              <Link key={a.label} to={a.href}>
                <Button variant="outline" className="gap-2 h-10">
                  <a.icon className={`h-4 w-4 ${a.color}`} />
                  {a.label}
                </Button>
              </Link>
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((c) => (
            <Link key={c.title} to={c.to} className={canRead(c.module) ? '' : 'pointer-events-none'}>
              <Card className="card-premium cursor-pointer hover:border-primary/50 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{c.title}</CardTitle>
                  {c.icon}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{c.value}</div>
                  <p className="text-xs text-muted-foreground">{c.sub}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {verAlertas && alerts && alerts.total > 0 && (
          <Card className={`card-premium ${alerts.pagamentosAtraso > 0 ? 'border-destructive/50' : 'border-warning/50'}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${alerts.pagamentosAtraso > 0 ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                  <Bell className={`h-5 w-5 ${alerts.pagamentosAtraso > 0 ? 'text-destructive' : 'text-warning'}`} />
                </div>
                <div>
                  <CardTitle className="text-base">Alertas Pendentes</CardTitle>
                  <CardDescription>{alerts.total} itens requerem atenção</CardDescription>
                </div>
              </div>
              <Link to="/alertas">
                <Button variant="outline" size="sm" className="gap-2">Ver todos <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {alerts.pagamentosAtraso > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <DollarSign className="h-5 w-5 text-destructive" />
                    <div><p className="font-medium text-destructive">{alerts.pagamentosAtraso} pagamentos</p><p className="text-xs text-muted-foreground">em atraso</p></div>
                  </div>
                )}
                {alerts.contratosVencer > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <FileText className="h-5 w-5 text-warning" />
                    <div><p className="font-medium text-warning">{alerts.contratosVencer} contratos</p><p className="text-xs text-muted-foreground">a vencer</p></div>
                  </div>
                )}
                {alerts.contasVencer > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
                    <Calendar className="h-5 w-5 text-accent" />
                    <div><p className="font-medium text-accent">{alerts.contasVencer} contas</p><p className="text-xs text-muted-foreground">próximos 7 dias</p></div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {(s.ocorrenciasAbertas > 0 || s.ocorrenciasUrgentes > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            {s.ocorrenciasUrgentes > 0 && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader className="flex flex-row items-center gap-3 pb-2 space-y-0">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <div>
                    <CardTitle className="text-base text-destructive">Ocorrências Urgentes</CardTitle>
                    <CardDescription>Requerem atenção imediata</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-destructive">{s.ocorrenciasUrgentes}</span>
                    <Link to="/ocorrencias"><Button variant="destructive" size="sm" className="gap-2">Ver todas <ArrowRight className="h-4 w-4" /></Button></Link>
                  </div>
                </CardContent>
              </Card>
            )}
            {s.ocorrenciasAbertas > 0 && (
              <Card className="border-warning/50 bg-warning/5">
                <CardHeader className="flex flex-row items-center gap-3 pb-2 space-y-0">
                  <Clock className="h-5 w-5 text-warning" />
                  <div>
                    <CardTitle className="text-base text-warning">Ocorrências Pendentes</CardTitle>
                    <CardDescription>Aguardando resolução</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-warning">{s.ocorrenciasAbertas}</span>
                    <Link to="/ocorrencias"><Button variant="outline" size="sm" className="gap-2 border-warning text-warning hover:bg-warning hover:text-warning-foreground">Ver todas <ArrowRight className="h-4 w-4" /></Button></Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Ocorrências Recentes</CardTitle>
              <CardDescription>Últimas ocorrências registradas no sistema</CardDescription>
            </div>
            <Link to="/ocorrencias">
              <Button variant="outline" size="sm" className="gap-2">Ver todas <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentOcorrencias.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-success mb-3" />
                <p className="text-muted-foreground">Nenhuma ocorrência registrada</p>
                <Link to="/ocorrencias" className="mt-3">
                  <Button variant="outline" size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova Ocorrência</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {recentOcorrencias.map((o: any) => (
                  <div key={o.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <AlertCircle className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">#{o.numero} - {o.inquilino?.nome || 'Inquilino'}</p>
                        <p className="text-sm text-muted-foreground">{o.imovel?.endereco}, {o.imovel?.bairro}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {prioridadeBadge(o.prioridade)}
                      {statusBadge(o.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { to: '/funcionarios', title: 'Funcionários', desc: 'Gerenciar equipe', icon: <UserCheck className="h-5 w-5 text-primary" />, bg: 'bg-primary/10' },
            { to: '/contas-pagar', title: 'Contas a Pagar', desc: 'Gestão financeira', icon: <TrendingUp className="h-5 w-5 text-warning" />, bg: 'bg-warning/10' },
            { to: '/documentos', title: 'Documentos', desc: 'Central de arquivos', icon: <FileText className="h-5 w-5 text-accent" />, bg: 'bg-accent/10' },
          ].map((n) => (
            <Link key={n.to} to={n.to}>
              <Card className="card-premium cursor-pointer hover:border-primary/50 transition-colors h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${n.bg}`}>{n.icon}</div>
                    <div>
                      <CardTitle className="text-base">{n.title}</CardTitle>
                      <CardDescription>{n.desc}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
