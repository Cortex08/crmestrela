import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Users, Receipt } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import { CardSkeleton } from '@/components/ui/loading';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export const Bar = ({ value, className }: { value: number; className?: string }) => (
  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
    <div className={cn('h-full rounded-full bg-primary transition-all', className)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

const monthKeys = (n: number) => Array.from({ length: n }, (_, i) => format(subMonths(new Date(), n - 1 - i), 'yyyy-MM'));
const label = (k: string) => format(new Date(`${k}-15T12:00:00`), 'MMM/yy', { locale: ptBR });

export const FinancialDashboard = () => {
  const { canRead } = usePermissions();
  const verPagamentos = canRead('financeiro');
  const start = format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['financial-dashboard', start],
    queryFn: async () => {
      const [t, p] = await Promise.all([
        supabase.from('financial_transactions').select('tipo, categoria, valor, data_competencia').gte('data_competencia', start).limit(20000),
        verPagamentos
          ? supabase.from('owner_payments').select('mes_referencia, data_vencimento, inquilino_pagou').gte('mes_referencia', start).limit(20000)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return { transactions: t.data || [], payments: p.data || [] };
    },
  });

  if (isLoading || !data) return <CardSkeleton count={4} />;

  const keys = monthKeys(6);
  const todayISO = format(new Date(), 'yyyy-MM-dd');
  const monthly = keys.map((k) => {
    const list = data.transactions.filter((t: any) => t.data_competencia?.startsWith(k));
    const receitas = list.filter((t: any) => t.tipo === 'receita').reduce((a: number, t: any) => a + Number(t.valor), 0);
    const despesas = list.filter((t: any) => t.tipo === 'despesa').reduce((a: number, t: any) => a + Number(t.valor), 0);
    const pays = data.payments.filter((p: any) => p.mes_referencia?.startsWith(k));
    // Atrasado = não pago e vencimento já passou (ou mês já terminou, se não houver vencimento)
    const atrasados = pays.filter((p: any) => !p.inquilino_pagou && (p.data_vencimento ? p.data_vencimento < todayISO : k < todayISO.slice(0, 7))).length;
    return { k, receitas, despesas, saldo: receitas - despesas, total: pays.length, atrasados, taxa: pays.length ? (atrasados / pays.length) * 100 : 0 };
  });

  const totalReceitas = monthly.reduce((a, m) => a + m.receitas, 0);
  const totalDespesas = monthly.reduce((a, m) => a + m.despesas, 0);
  const totalPag = monthly.reduce((a, m) => a + m.total, 0);
  const atrasados = monthly.reduce((a, m) => a + m.atrasados, 0);
  const taxa = totalPag ? (atrasados / totalPag) * 100 : 0;

  const catMap = new Map<string, number>();
  data.transactions.filter((t: any) => t.tipo === 'despesa').forEach((t: any) => catMap.set(t.categoria || 'Outros', (catMap.get(t.categoria || 'Outros') || 0) + Number(t.valor)));
  const cats = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxMov = Math.max(1, ...monthly.map((m) => Math.max(m.receitas, m.despesas)));
  const maxSaldo = Math.max(1, ...monthly.map((m) => Math.abs(m.saldo)));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Receitas</CardTitle><TrendingUp className="h-4 w-4 text-success" /></CardHeader>
          <CardContent><div className="text-2xl font-bold text-success">{formatCurrency(totalReceitas)}</div><p className="text-xs text-muted-foreground">Últimos 6 meses</p></CardContent>
        </Card>
        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Total Despesas</CardTitle><TrendingDown className="h-4 w-4 text-destructive" /></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{formatCurrency(totalDespesas)}</div><p className="text-xs text-muted-foreground">Últimos 6 meses</p></CardContent>
        </Card>
        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Saldo</CardTitle><DollarSign className="h-4 w-4 text-primary" /></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${totalReceitas - totalDespesas >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(totalReceitas - totalDespesas)}</div><p className="text-xs text-muted-foreground">Receitas - Despesas</p></CardContent>
        </Card>
        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Taxa Inadimplência</CardTitle><AlertTriangle className="h-4 w-4 text-warning" /></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${taxa > 10 ? 'text-destructive' : 'text-warning'}`}>{taxa.toFixed(1)}%</div><p className="text-xs text-muted-foreground">{atrasados} de {totalPag} em atraso</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="card-premium">
          <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Receitas vs Despesas</CardTitle><CardDescription>Últimos 6 meses</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {monthly.map((m) => (
              <div key={m.k} className="space-y-2">
                <div className="flex justify-between text-sm"><span className="font-medium capitalize">{label(m.k)}</span><span className={m.saldo >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(m.saldo)}</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Receitas</span><span>{formatCurrency(m.receitas)}</span></div><Bar value={(m.receitas / maxMov) * 100} className="bg-success" /></div>
                  <div><div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Despesas</span><span>{formatCurrency(m.despesas)}</span></div><Bar value={(m.despesas / maxMov) * 100} className="bg-destructive" /></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-premium">
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-success" /> Evolução do Saldo</CardTitle><CardDescription>Saldo mensal ao longo do tempo</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {monthly.map((m) => (
              <div key={m.k} className="flex items-center gap-3">
                <span className="w-14 text-sm font-medium capitalize">{label(m.k)}</span>
                <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${m.saldo >= 0 ? 'bg-success' : 'bg-destructive'}`} style={{ width: `${(Math.abs(m.saldo) / maxSaldo) * 100}%` }} />
                </div>
                <span className={`w-28 text-sm font-medium text-right ${m.saldo >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(m.saldo)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-premium">
          <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-warning" /> Despesas por Categoria</CardTitle><CardDescription>Distribuição das despesas</CardDescription></CardHeader>
          <CardContent>
            {cats.length ? (
              <div className="space-y-3">
                {cats.map(([name, v]) => {
                  const pct = totalDespesas ? (v / totalDespesas) * 100 : 0;
                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex justify-between text-sm"><span className="font-medium">{name}</span><span className="text-muted-foreground">{formatCurrency(v)}</span></div>
                      <div className="flex items-center gap-2"><div className="flex-1"><Bar value={pct} /></div><span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(0)}%</span></div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground">Sem dados de despesas no período</div>
            )}
          </CardContent>
        </Card>

        <Card className="card-premium">
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-destructive" /> Taxa de Inadimplência</CardTitle><CardDescription>Percentual de aluguéis em atraso por mês</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {monthly.map((m) => (
              <div key={m.k} className="space-y-1">
                <div className="flex justify-between text-sm"><span className="font-medium capitalize">{label(m.k)}</span><span className={m.taxa > 10 ? 'text-destructive' : 'text-warning'}>{m.taxa.toFixed(1)}%</span></div>
                <div className="flex items-center gap-2"><div className="flex-1"><Bar value={m.taxa} className={m.taxa > 10 ? 'bg-destructive' : 'bg-warning'} /></div><span className="text-xs text-muted-foreground w-16 text-right">{m.atrasados}/{m.total}</span></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FinancialDashboard;
