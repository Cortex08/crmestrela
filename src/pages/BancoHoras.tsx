import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useDebounce } from '@/hooks/useDebounce';
import { DEPARTAMENTOS, CARGOS, TIPOS_BANCO, fmtHorasDec, intervalToMin } from '@/lib/rh';
import { downloadCSV } from '@/lib/csv';
import { friendlyError, toNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { Clock, Plus, TrendingUp, TrendingDown, AlertTriangle, History, Search, Filter, Loader2, Download, Trash2, Import } from 'lucide-react';

const blank = () => ({ employee_id: '', tipo: 'credito', horas: '', descricao: '', data_referencia: format(new Date(), 'yyyy-MM-dd') });

export default function BancoHoras() {
  const { canCreate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const q = useDebounce(busca, 250).toLowerCase();
  const [dep, setDep] = useState('todos');
  const [formOpen, setFormOpen] = useState(false);
  const [f, setF] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [hist, setHist] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMes, setImportMes] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'));

  const { data: saldos = [], isLoading } = useQuery({
    queryKey: ['hour-bank-balances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hour_bank_balance').select('*').order('employee_name');
      if (error) throw error;
      return (data || []).map((b: any) => ({ ...b, saldo_atual: Number(b.saldo_atual) || 0 }));
    },
  });

  const { data: txs = [] } = useQuery({
    queryKey: ['hour-bank-transactions', hist?.employee_id],
    enabled: !!hist,
    queryFn: async () => {
      const { data, error } = await supabase.from('hour_bank_transactions').select('*').eq('employee_id', hist.employee_id).order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      return data || [];
    },
  });

  const filtrados = useMemo(() => saldos.filter((b: any) =>
    (!q || b.employee_name.toLowerCase().includes(q)) && (dep === 'todos' || b.departamento === dep)), [saldos, q, dep]);

  const stats = {
    positivo: saldos.filter((b: any) => b.saldo_atual > 0).reduce((a: number, b: any) => a + b.saldo_atual, 0),
    negativo: saldos.filter((b: any) => b.saldo_atual < 0).reduce((a: number, b: any) => a + Math.abs(b.saldo_atual), 0),
    alerta: saldos.filter((b: any) => b.saldo_atual > 40 || b.saldo_atual < -20).length,
    media: saldos.length ? saldos.reduce((a: number, b: any) => a + b.saldo_atual, 0) / saldos.length : 0,
  };

  const refresh = () => { qc.invalidateQueries({ queryKey: ['hour-bank-balances'] }); qc.invalidateQueries({ queryKey: ['hour-bank-transactions'] }); };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const horas = toNumber(f.horas);
    if (!f.employee_id || !horas || horas <= 0) return toast.error('Preencha funcionário e horas');
    if (horas > 500) return toast.error('Quantidade de horas inválida');
    setSaving(true);
    const { error } = await supabase.from('hour_bank_transactions').insert({
      employee_id: f.employee_id, tipo: f.tipo, horas, descricao: f.descricao.trim() || null, data_referencia: f.data_referencia,
    });
    setSaving(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao registrar transação'));
    toast.success('Transação registrada!');
    setFormOpen(false);
    setF(blank());
    refresh();
  };

  // Lança como crédito as horas extras do ponto de um mês (uma vez por funcionário/mês)
  const importarExtras = async () => {
    setSaving(true);
    try {
      const base = parseISO(`${importMes}-01`);
      const [{ data: regs, error }, { data: ja, error: e2 }] = await Promise.all([
        supabase.from('time_records').select('employee_id, horas_extras').gte('data', format(startOfMonth(base), 'yyyy-MM-dd')).lte('data', format(endOfMonth(base), 'yyyy-MM-dd')).limit(10000),
        supabase.from('hour_bank_transactions').select('employee_id').eq('tipo', 'credito').eq('data_referencia', format(endOfMonth(base), 'yyyy-MM-dd')).like('descricao', 'Horas extras do ponto%'),
      ]);
      if (error || e2) throw error || e2;
      const feitos = new Set((ja || []).map((t: any) => t.employee_id));
      const soma = new Map<string, number>();
      (regs || []).forEach((r: any) => soma.set(r.employee_id, (soma.get(r.employee_id) || 0) + intervalToMin(r.horas_extras)));
      const novos = [...soma.entries()].filter(([id, min]) => min >= 1 && !feitos.has(id));
      if (!novos.length) { toast.info('Nada para importar neste mês (sem extras ou já importado)'); return; }
      const label = format(base, 'MMMM/yyyy', { locale: ptBR });
      for (const [id, min] of novos) {
        const { error: e } = await supabase.from('hour_bank_transactions').insert({
          employee_id: id, tipo: 'credito', horas: Math.round((min / 60) * 100) / 100,
          descricao: `Horas extras do ponto — ${label}`, data_referencia: format(endOfMonth(base), 'yyyy-MM-dd'),
        });
        if (e) throw e;
      }
      toast.success(`${novos.length} lançamento(s) de horas extras importado(s)`);
      setImportOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Erro ao importar horas extras'));
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    const { error } = await supabase.from('hour_bank_transactions').delete().eq('id', del.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir'));
    toast.success('Transação excluída');
    setDel(null);
    refresh();
  };

  const exportar = () => downloadCSV('banco-de-horas', ['Funcionário', 'Departamento', 'Cargo', 'Saldo (h)', 'Última atualização'],
    filtrados.map((b: any) => [b.employee_name, DEPARTAMENTOS[b.departamento], CARGOS[b.cargo], b.saldo_atual.toFixed(2).replace('.', ','),
      b.ultima_atualizacao ? format(new Date(b.ultima_atualizacao), 'dd/MM/yyyy HH:mm') : '']));

  const kpi = (icon: React.ReactNode, label: string, value: React.ReactNode, cor: string, txt = '') => (
    <Card><CardContent className="pt-6 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${cor}`}>{icon}</div>
      <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-2xl font-bold ${txt}`}>{value}</p></div>
    </CardContent></Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Banco de Horas</h1>
            <p className="text-muted-foreground">Gerencie o saldo de horas extras dos funcionários</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" />Exportar</Button>
            {canCreate('banco_horas') && <Button variant="outline" onClick={() => setImportOpen(true)}><Import className="h-4 w-4 mr-2" />Importar do Ponto</Button>}
            {canCreate('banco_horas') && <Button onClick={() => { setF(blank()); setFormOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova Transação</Button>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpi(<TrendingUp className="h-6 w-6 text-green-600" />, 'Total a Compensar', fmtHorasDec(stats.positivo), 'bg-green-100', 'text-green-600')}
          {kpi(<TrendingDown className="h-6 w-6 text-red-600" />, 'Total Devedor', fmtHorasDec(stats.negativo), 'bg-red-100', 'text-red-600')}
          {kpi(<AlertTriangle className="h-6 w-6 text-amber-600" />, 'Em Alerta', stats.alerta, 'bg-amber-100')}
          {kpi(<Clock className="h-6 w-6 text-blue-600" />, 'Média Geral', fmtHorasDec(stats.media), 'bg-blue-100')}
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar funcionário..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-10" />
            </div>
            <Select value={dep} onValueChange={setDep}>
              <SelectTrigger className="w-full md:w-[220px]"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Departamentos</SelectItem>
                {Object.entries(DEPARTAMENTOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Saldo por Funcionário</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <TableSkeleton /> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funcionário</TableHead><TableHead className="hidden md:table-cell">Departamento</TableHead><TableHead className="hidden md:table-cell">Cargo</TableHead>
                      <TableHead className="text-right">Saldo Atual</TableHead><TableHead className="hidden sm:table-cell">Última Atualização</TableHead><TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum funcionário encontrado</TableCell></TableRow>
                    ) : filtrados.map((b: any) => (
                      <TableRow key={b.employee_id}>
                        <TableCell className="font-medium">{b.employee_name}</TableCell>
                        <TableCell className="hidden md:table-cell">{DEPARTAMENTOS[b.departamento] || b.departamento}</TableCell>
                        <TableCell className="hidden md:table-cell">{CARGOS[b.cargo] || b.cargo}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={b.saldo_atual > 0 ? 'default' : b.saldo_atual < 0 ? 'destructive' : 'secondary'} className={b.saldo_atual > 40 ? 'bg-amber-500 hover:bg-amber-500' : ''}>
                            {fmtHorasDec(b.saldo_atual)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{b.ultima_atualizacao ? format(new Date(b.ultima_atualizacao), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setHist(b)}><History className="h-4 w-4 mr-1" />Histórico</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">Alerta: saldo acima de 40h ou abaixo de -20h.</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Transação</DialogTitle></DialogHeader>
          <form onSubmit={salvar} className="space-y-4">
            <div className="space-y-2">
              <Label>Funcionário *</Label>
              <Select value={f.employee_id} onValueChange={(v) => setF((s) => ({ ...s, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
                <SelectContent>{saldos.map((b: any) => <SelectItem key={b.employee_id} value={b.employee_id}>{b.employee_name} — {fmtHorasDec(b.saldo_atual)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={f.tipo} onValueChange={(v) => setF((s) => ({ ...s, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credito">Crédito (Horas Extras)</SelectItem>
                    <SelectItem value="debito">Débito (Compensação)</SelectItem>
                    <SelectItem value="pagamento">Pagamento</SelectItem>
                    <SelectItem value="expiracao">Expiração</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Horas *</Label><Input type="number" step="0.25" min="0.25" max="500" placeholder="Ex: 2.5" value={f.horas} onChange={(e) => setF((s) => ({ ...s, horas: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Data de Referência</Label><Input type="date" value={f.data_referencia} onChange={(e) => setF((s) => ({ ...s, data_referencia: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea placeholder="Motivo ou observações..." value={f.descricao} onChange={(e) => setF((s) => ({ ...s, descricao: e.target.value }))} maxLength={500} /></div>
            <p className="text-xs text-muted-foreground">O saldo é calculado automaticamente pelo sistema.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Registrar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Importar horas extras do ponto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Soma as horas extras registradas no ponto de cada funcionário no mês e lança como crédito. Cada mês só é importado uma vez por funcionário.</p>
            <div className="space-y-2"><Label>Mês</Label><Input type="month" value={importMes} onChange={(e) => setImportMes(e.target.value)} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
              <Button onClick={importarExtras} disabled={saving || !importMes}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Importar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!hist} onOpenChange={(o) => !o && setHist(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Histórico — {hist?.employee_name}</DialogTitle></DialogHeader>
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Horas</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Descrição</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {txs.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma transação encontrada</TableCell></TableRow>
                  : txs.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell>{format(parseISO(t.data_referencia), 'dd/MM/yyyy')}</TableCell>
                      <TableCell><Badge className={TIPOS_BANCO[t.tipo]?.[1]}>{TIPOS_BANCO[t.tipo]?.[0] || t.tipo}</Badge></TableCell>
                      <TableCell className={`text-right ${t.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>{t.tipo === 'credito' ? '+' : '-'}{fmtHorasDec(Number(t.horas))}</TableCell>
                      <TableCell className="text-right font-medium">{fmtHorasDec(Number(t.saldo_posterior))}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={t.descricao || ''}>{t.descricao || '-'}</TableCell>
                      <TableCell>{canDelete('banco_horas') && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDel(t)}><Trash2 className="h-3.5 w-3.5" /></Button>}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">O saldo atual considera todas as transações. O "Saldo" de cada linha é o valor no momento do lançamento.</p>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir transação?" description="O saldo do funcionário será recalculado sem este lançamento." onConfirm={excluir} />
    </DashboardLayout>
  );
}
