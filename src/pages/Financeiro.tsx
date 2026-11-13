import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, TrendingDown, Calendar, BarChart3, Plus, MoreHorizontal, Pencil, Trash2, CheckCircle2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import { FinancialDashboard } from '@/components/charts/FinancialDashboard';
import { TransacaoForm, STATUS_TRANSACAO } from '@/components/forms/TransacaoForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeleton } from '@/components/ui/loading';
import { formatCurrency, formatDateBR, friendlyError } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv';

const STATUS_COLOR: Record<string, string> = { pendente: 'bg-yellow-500', pago: 'bg-green-500', atrasado: 'bg-red-500' };
const thisMonth = () => new Date().toISOString().slice(0, 7);

const Financeiro = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [tab, setTab] = useState('dashboard');
  const [mes, setMes] = useState(thisMonth());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [del, setDel] = useState<any>(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['financial_transactions', mes],
    queryFn: async () => {
      let q = supabase.from('financial_transactions').select('*').order('data_competencia', { ascending: false }).limit(5000);
      if (mes) {
        const [y, m] = mes.split('-').map(Number);
        const end = new Date(y, m, 0).getDate();
        q = q.gte('data_competencia', `${mes}-01`).lte('data_competencia', `${mes}-${String(end).padStart(2, '0')}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['financial_transactions'] }); qc.invalidateQueries({ queryKey: ['financial-dashboard'] }); };

  const summary = useMemo(() => {
    const r = transactions.filter((t: any) => t.tipo === 'receita').reduce((a: number, t: any) => a + Number(t.valor), 0);
    const d = transactions.filter((t: any) => t.tipo === 'despesa').reduce((a: number, t: any) => a + Number(t.valor), 0);
    return { r, d, s: r - d };
  }, [transactions]);

  const markPaid = async (t: any) => {
    const { error } = await supabase.from('financial_transactions').update({ status: 'pago', data_recebimento: new Date().toISOString().slice(0, 10) }).eq('id', t.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao atualizar'));
    toast.success(t.tipo === 'receita' ? 'Marcado como recebido' : 'Marcado como pago');
    refresh();
  };
  const remove = async () => {
    const { error } = await supabase.from('financial_transactions').delete().eq('id', del.id);
    setDel(null);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir'));
    toast.success('Transação excluída');
    refresh();
  };

  const exportar = () => downloadCSV(`financeiro-${mes || 'todos'}.csv`,
    ['Data', 'Tipo', 'Categoria', 'Valor', 'Status', 'Pago em', 'Observações'],
    transactions.map((t: any) => [formatDateBR(t.data_competencia), t.tipo, t.categoria, Number(t.valor).toFixed(2).replace('.', ','), STATUS_TRANSACAO[t.status] || t.status, formatDateBR(t.data_recebimento), t.observacoes]));

  const Row = ({ t }: { t: any }) => (
    <Card>
      <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
        <div className="flex items-center space-x-4 min-w-0">
          <div className={`p-2 rounded-full shrink-0 ${t.tipo === 'receita' ? 'bg-green-100' : 'bg-red-100'}`}>
            {t.tipo === 'receita' ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
          </div>
          <div className="min-w-0">
            <p className="font-medium">{t.categoria}{t.subcategoria ? <span className="text-xs text-muted-foreground"> · {t.subcategoria === 'fixa' ? 'fixa' : 'variável'}</span> : null}</p>
            <div className="flex items-center text-sm text-muted-foreground"><Calendar className="mr-1 h-3 w-3" />{formatDateBR(t.data_competencia)}</div>
            {t.observacoes && <p className="text-sm text-muted-foreground mt-1 break-words">{t.observacoes}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <Badge className={STATUS_COLOR[t.status] || 'bg-gray-500'}>{STATUS_TRANSACAO[t.status] || t.status}</Badge>
          <span className={`text-lg font-bold whitespace-nowrap ${t.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>{t.tipo === 'receita' ? '+' : '-'} {formatCurrency(Number(t.valor))}</span>
          {(canUpdate('financeiro') || canDelete('financeiro')) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canUpdate('financeiro') && t.status !== 'pago' && <DropdownMenuItem onClick={() => markPaid(t)}><CheckCircle2 className="mr-2 h-4 w-4" />{t.tipo === 'receita' ? 'Marcar recebido' : 'Marcar pago'}</DropdownMenuItem>}
                {canUpdate('financeiro') && <DropdownMenuItem onClick={() => { setEditing(t); setFormOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>}
                {canDelete('financeiro') && <DropdownMenuItem className="text-red-600" onClick={() => setDel(t)}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const list = (tipo?: string) => transactions.filter((t: any) => !tipo || t.tipo === tipo);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Financeiro</h1>
            <p className="text-muted-foreground">Controle financeiro e relatórios</p>
          </div>
          {canCreate('financeiro') && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Nova Transação</Button>}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="dashboard" className="gap-2"><BarChart3 className="h-4 w-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="transacoes" className="gap-2"><DollarSign className="h-4 w-4" /> Transações</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><FinancialDashboard /></TabsContent>

          <TabsContent value="transacoes" className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-muted-foreground">Mês:</label>
              <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
              <Button variant="ghost" size="sm" onClick={() => setMes('')}>Ver todos</Button>
              <Button variant="outline" size="sm" className="ml-auto" onClick={exportar}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Receitas</CardTitle><TrendingUp className="h-4 w-4 text-green-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{formatCurrency(summary.r)}</div></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Despesas</CardTitle><TrendingDown className="h-4 w-4 text-red-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{formatCurrency(summary.d)}</div></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Saldo</CardTitle><DollarSign className="h-4 w-4 text-primary" /></CardHeader><CardContent><div className={`text-2xl font-bold ${summary.s >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(summary.s)}</div></CardContent></Card>
            </div>

            {isLoading ? <ListSkeleton count={5} /> : (
              <Tabs defaultValue="todas" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="todas">Todas ({transactions.length})</TabsTrigger>
                  <TabsTrigger value="receitas">Receitas ({list('receita').length})</TabsTrigger>
                  <TabsTrigger value="despesas">Despesas ({list('despesa').length})</TabsTrigger>
                </TabsList>
                {[['todas', undefined], ['receitas', 'receita'], ['despesas', 'despesa']].map(([v, tipo]) => (
                  <TabsContent key={v} value={v as string} className="space-y-3">
                    {list(tipo).length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma transação no período</p> : list(tipo).map((t: any) => <Row key={t.id} t={t} />)}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <TransacaoForm open={formOpen} onOpenChange={setFormOpen} transacao={editing} onSuccess={refresh} />
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} onConfirm={remove} title="Excluir transação" description={`Excluir "${del?.categoria}" de ${formatCurrency(Number(del?.valor || 0))}?`} confirmText="Excluir" />
    </DashboardLayout>
  );
};

export default Financeiro;
