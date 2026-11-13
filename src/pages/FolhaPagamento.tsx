import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, endOfMonth, subMonths, addMonths, parseISO } from 'date-fns';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TableSkeleton } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useDebounce } from '@/hooks/useDebounce';
import { CARGOS, STATUS_FOLHA } from '@/lib/rh';
import { downloadCSV } from '@/lib/csv';
import { formatCurrency, friendlyError, toNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { DollarSign, Plus, Calculator, Download, TrendingUp, Users, Check, RefreshCw, Search, Wallet, MoreHorizontal, Pencil, Trash2, Loader2 } from 'lucide-react';

const NUMS = ['salario_base', 'comissoes', 'horas_extras_qtd', 'horas_extras_valor', 'bonus', 'descontos'] as const;
const blank = () => ({ employee_id: '', salario_base: '', comissoes: '', horas_extras_qtd: '', horas_extras_valor: '', bonus: '', descontos: '', descricao_descontos: '', observacoes: '', status: 'calculado' });

export default function FolhaPagamento() {
  const { canCreate, canUpdate, canDelete, canRead } = usePermissions();
  const qc = useQueryClient();
  const [mes, setMes] = useState(format(new Date(), 'yyyy-MM'));
  const [busca, setBusca] = useState('');
  const q = useDebounce(busca, 250).toLowerCase();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [f, setF] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [del, setDel] = useState<any>(null);
  const mesRef = `${mes}-01`;

  const { data: folhas = [], isLoading } = useQuery({
    queryKey: ['payroll', mes],
    queryFn: async () => {
      const { data, error } = await supabase.from('payroll').select('*, employees(nome, departamento, cargo, salario_fixo, chave_pix)').eq('mes_referencia', mesRef);
      if (error) throw error;
      return (data || []).sort((a: any, b: any) => (a.employees?.nome || '').localeCompare(b.employees?.nome || ''));
    },
  });

  const { data: emps = [] } = useQuery({
    queryKey: ['employees-for-payroll'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('id, nome, cargo, salario_fixo, user_id').eq('status', 'ativo').order('nome');
      if (error) throw error;
      return data || [];
    },
  });

  const filtrados = useMemo(() => folhas.filter((p: any) => !q || (p.employees?.nome || '').toLowerCase().includes(q)), [folhas, q]);
  const stats = {
    bruto: folhas.reduce((a: number, p: any) => a + (Number(p.total_bruto) || 0), 0),
    liquido: folhas.reduce((a: number, p: any) => a + (Number(p.total_liquido) || 0), 0),
    descontos: folhas.reduce((a: number, p: any) => a + (Number(p.descontos) || 0), 0),
    pendentes: folhas.filter((p: any) => p.status !== 'pago').length,
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });

  // Comissões do mês por usuário (quem tem acesso ao financeiro)
  const comissoesDoMes = async (): Promise<Map<string, number>> => {
    const m = new Map<string, number>();
    if (!canRead('financeiro')) return m;
    const { data } = await supabase.from('commissions').select('funcionario_id, valor')
      .gte('data_fechamento', mesRef).lte('data_fechamento', format(endOfMonth(parseISO(mesRef)), 'yyyy-MM-dd'));
    (data || []).forEach((c: any) => m.set(c.funcionario_id, (m.get(c.funcionario_id) || 0) + (Number(c.valor) || 0)));
    return m;
  };

  const gerarTodas = async () => {
    const existentes = new Set(folhas.map((p: any) => p.employee_id));
    const novos = emps.filter((e: any) => !existentes.has(e.id));
    if (!novos.length) return toast.info('Todos os funcionários ativos já têm folha neste mês');
    setGerando(true);
    try {
      const com = await comissoesDoMes();
      const { error } = await supabase.from('payroll').insert(novos.map((e: any) => ({
        employee_id: e.id, mes_referencia: mesRef, salario_base: Number(e.salario_fixo) || 0,
        comissoes: Math.round((com.get(e.user_id) || 0) * 100) / 100, status: 'rascunho',
      })));
      if (error) throw error;
      toast.success(`${novos.length} folha(s) gerada(s)`);
      refresh();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Erro ao gerar folhas'));
    } finally {
      setGerando(false);
    }
  };

  const abrir = (p?: any) => {
    setEditing(p || null);
    if (!p) setF(blank());
    else {
      const s = (v: any) => (v === null || v === undefined || Number(v) === 0 ? '' : String(v));
      setF({
        employee_id: p.employee_id, salario_base: String(p.salario_base ?? ''), comissoes: s(p.comissoes), horas_extras_qtd: s(p.horas_extras_qtd),
        horas_extras_valor: s(p.horas_extras_valor), bonus: s(p.bonus), descontos: s(p.descontos), descricao_descontos: p.descricao_descontos || '',
        observacoes: p.observacoes || '', status: p.status === 'rascunho' ? 'calculado' : p.status,
      });
    }
    setOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.employee_id) return toast.error('Selecione um funcionário');
    const vals: Record<string, number> = {};
    for (const k of NUMS) {
      const n = toNumber(f[k]) ?? 0;
      if (n < 0) return toast.error('Os valores não podem ser negativos');
      vals[k] = n;
    }
    setSaving(true);
    const payload = { ...vals, descricao_descontos: f.descricao_descontos.trim() || null, observacoes: f.observacoes.trim() || null, status: f.status };
    const { error } = editing
      ? await supabase.from('payroll').update(payload).eq('id', editing.id)
      : await supabase.from('payroll').insert({ ...payload, employee_id: f.employee_id, mes_referencia: mesRef });
    setSaving(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao salvar folha'));
    toast.success('Folha salva com sucesso!');
    setOpen(false);
    refresh();
  };

  const mudarStatus = async (p: any, status: string) => {
    const { error } = await supabase.from('payroll').update({ status }).eq('id', p.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao atualizar'));
    toast.success(status === 'pago' ? 'Pagamento registrado!' : 'Status atualizado');
    refresh();
  };

  const excluir = async () => {
    const { error } = await supabase.from('payroll').delete().eq('id', del.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir'));
    toast.success('Folha excluída');
    setDel(null);
    refresh();
  };

  const exportar = () => downloadCSV(`folha-${mes}`, ['Funcionário', 'Cargo', 'Salário', 'Comissões', 'HE (qtd)', 'HE (R$)', 'Bônus', 'Descontos', 'Desc. descontos', 'Bruto', 'Líquido', 'Status', 'Pago em', 'Chave PIX'],
    filtrados.map((p: any) => [p.employees?.nome, CARGOS[p.employees?.cargo], p.salario_base, p.comissoes, p.horas_extras_qtd, p.horas_extras_valor, p.bonus, p.descontos,
      p.descricao_descontos, p.total_bruto, p.total_liquido, STATUS_FOLHA[p.status]?.[0], p.data_pagamento, p.employees?.chave_pix]));

  const bruto = (['salario_base', 'comissoes', 'horas_extras_valor', 'bonus'] as const).reduce((a, k) => a + (toNumber(f[k]) || 0), 0);
  const liquido = bruto - (toNumber(f.descontos) || 0);
  const mesesOpts = Array.from({ length: 15 }, (_, i) => addMonths(subMonths(new Date(), 12), i)).reverse();
  const num = (k: (typeof NUMS)[number], label: string, step = '0.01') => (
    <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" step={step} placeholder="0,00" value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} /></div>
  );
  const kpi = (icon: React.ReactNode, label: string, value: React.ReactNode, cor: string) => (
    <Card><CardContent className="pt-6 flex items-center gap-3">
      <div className={`p-3 rounded-lg ${cor}`}>{icon}</div>
      <div><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
    </CardContent></Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Folha de Pagamento</h1>
            <p className="text-muted-foreground">Gerencie salários, comissões e benefícios</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-[190px] capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{mesesOpts.map((d) => <SelectItem key={format(d, 'yyyy-MM')} value={format(d, 'yyyy-MM')} className="capitalize">{format(d, 'MMMM yyyy', { locale: ptBR })}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" />Exportar</Button>
            {canCreate('folha_pagamento') && <Button variant="outline" onClick={gerarTodas} disabled={gerando}><RefreshCw className={`h-4 w-4 mr-2 ${gerando ? 'animate-spin' : ''}`} />Gerar Todas</Button>}
            {canCreate('folha_pagamento') && <Button onClick={() => abrir()}><Plus className="h-4 w-4 mr-2" />Nova Folha</Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {kpi(<TrendingUp className="h-5 w-5 text-blue-600" />, 'Total Bruto', formatCurrency(stats.bruto), 'bg-blue-100')}
          {kpi(<DollarSign className="h-5 w-5 text-green-600" />, 'Total Líquido', formatCurrency(stats.liquido), 'bg-green-100')}
          {kpi(<Wallet className="h-5 w-5 text-red-600" />, 'Descontos', formatCurrency(stats.descontos), 'bg-red-100')}
          {kpi(<Users className="h-5 w-5 text-purple-600" />, 'Funcionários', folhas.length, 'bg-purple-100')}
          {kpi(<Calculator className="h-5 w-5 text-amber-600" />, 'Pendentes', stats.pendentes, 'bg-amber-100')}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar funcionário..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-10" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="capitalize">Folha de {format(parseISO(mesRef), 'MMMM yyyy', { locale: ptBR })}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <TableSkeleton /> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funcionário</TableHead><TableHead className="text-right">Salário</TableHead><TableHead className="text-right hidden md:table-cell">Comissões</TableHead>
                      <TableHead className="text-right hidden md:table-cell">HE</TableHead><TableHead className="text-right hidden lg:table-cell">Bônus</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Descontos</TableHead><TableHead className="text-right">Líquido</TableHead><TableHead>Status</TableHead><TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhuma folha encontrada. Clique em "Gerar Todas" para criar.</TableCell></TableRow>
                    ) : filtrados.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell><p className="font-medium">{p.employees?.nome}</p><p className="text-xs text-muted-foreground">{CARGOS[p.employees?.cargo]}</p></TableCell>
                        <TableCell className="text-right">{formatCurrency(p.salario_base)}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">{formatCurrency(p.comissoes || 0)}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">{formatCurrency(p.horas_extras_valor || 0)}</TableCell>
                        <TableCell className="text-right hidden lg:table-cell">{formatCurrency(p.bonus || 0)}</TableCell>
                        <TableCell className="text-right text-red-600 hidden md:table-cell">-{formatCurrency(p.descontos || 0)}</TableCell>
                        <TableCell className="text-right font-bold text-green-600">{formatCurrency(p.total_liquido || 0)}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_FOLHA[p.status]?.[1]}>{STATUS_FOLHA[p.status]?.[0] || p.status}</Badge>
                          {p.data_pagamento && <div className="text-[11px] text-muted-foreground mt-0.5">{format(parseISO(p.data_pagamento), 'dd/MM/yyyy')}</div>}
                        </TableCell>
                        <TableCell>
                          {(canUpdate('folha_pagamento') || canDelete('folha_pagamento')) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canUpdate('folha_pagamento') && <DropdownMenuItem onClick={() => abrir(p)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>}
                                {canUpdate('folha_pagamento') && p.status !== 'aprovado' && p.status !== 'pago' && <DropdownMenuItem onClick={() => mudarStatus(p, 'aprovado')}><Check className="h-4 w-4 mr-2" />Aprovar</DropdownMenuItem>}
                                {canUpdate('folha_pagamento') && p.status !== 'pago' && <DropdownMenuItem onClick={() => mudarStatus(p, 'pago')} className="text-green-600"><DollarSign className="h-4 w-4 mr-2" />Marcar como pago</DropdownMenuItem>}
                                {canUpdate('folha_pagamento') && p.status === 'pago' && <DropdownMenuItem onClick={() => mudarStatus(p, 'aprovado')}><RefreshCw className="h-4 w-4 mr-2" />Desfazer pagamento</DropdownMenuItem>}
                                {canDelete('folha_pagamento') && (<><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setDel(p)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem></>)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Editar Folha — ${editing.employees?.nome}` : 'Nova Folha de Pagamento'}</DialogTitle></DialogHeader>
          <form onSubmit={salvar} className="space-y-4">
            {!editing && (
              <div className="space-y-2">
                <Label>Funcionário *</Label>
                <Select value={f.employee_id} onValueChange={(v) => { const e: any = emps.find((x: any) => x.id === v); setF((s) => ({ ...s, employee_id: v, salario_base: e?.salario_fixo != null ? String(e.salario_fixo) : s.salario_base })); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
                  <SelectContent>
                    {emps.filter((e: any) => !folhas.some((p: any) => p.employee_id === e.id)).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome} — {CARGOS[e.cargo]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {num('salario_base', 'Salário Base (R$)')}
              {num('comissoes', 'Comissões (R$)')}
              {num('horas_extras_qtd', 'Horas Extras (Qtd)', '0.5')}
              {num('horas_extras_valor', 'Valor HE (R$)')}
              {num('bonus', 'Bônus (R$)')}
              {num('descontos', 'Descontos (R$)')}
            </div>
            <div className="space-y-2"><Label>Descrição dos Descontos</Label><Input placeholder="Ex: Vale transporte, INSS, adiantamento..." value={f.descricao_descontos} onChange={(e) => setF((s) => ({ ...s, descricao_descontos: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={f.status} onValueChange={(v) => setF((s) => ({ ...s, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_FOLHA).map(([v, [l]]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Bruto</span><span>{formatCurrency(bruto)}</span></div>
                <div className="flex justify-between font-semibold"><span>Líquido</span><span className="text-green-600">{formatCurrency(liquido)}</span></div>
              </div>
            </div>
            <div className="space-y-2"><Label>Observações</Label><Textarea rows={2} value={f.observacoes} onChange={(e) => setF((s) => ({ ...s, observacoes: e.target.value }))} /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir folha?" description={`A folha de ${del?.employees?.nome} neste mês será apagada.`} onConfirm={excluir} />
    </DashboardLayout>
  );
}
