import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, parseISO, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/contexts/PermissionsContext';
import { STATUS_PONTO, statusPonto, fmtHora, fmtMin, intervalToMin, DEPARTAMENTOS } from '@/lib/rh';
import { downloadCSV } from '@/lib/csv';
import { cn, friendlyError } from '@/lib/utils';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ChevronDown, Download, Pencil, Plus, Trash2, Clock, Users, AlertTriangle, TrendingUp, Loader2 } from 'lucide-react';

const CAMPOS = [['entrada', 'Entrada'], ['saida_almoco', 'Saída almoço'], ['retorno_almoco', 'Retorno almoço'], ['saida', 'Saída']] as const;
type Campo = (typeof CAMPOS)[number][0];

const RelatorioPonto = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [mes, setMes] = useState(new Date());
  const [dep, setDep] = useState('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<any>(null);
  const ini = format(startOfMonth(mes), 'yyyy-MM-dd');
  const fim = format(endOfMonth(mes), 'yyyy-MM-dd');

  const { data: emps = [] } = useQuery({
    queryKey: ['employees-rel-ponto'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('id, nome, departamento, cargo, status').order('nome');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: regs = [], isLoading } = useQuery({
    queryKey: ['ponto-relatorio', ini],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_records').select('*').gte('data', ini).lte('data', fim).order('data').limit(10000);
      if (error) throw error;
      return data || [];
    },
  });

  const linhas = useMemo(() => {
    const porEmp = new Map<string, any[]>();
    regs.forEach((r: any) => porEmp.set(r.employee_id, [...(porEmp.get(r.employee_id) || []), r]));
    return emps
      .filter((e: any) => (e.status === 'ativo' || porEmp.has(e.id)) && (dep === 'todos' || e.departamento === dep))
      .map((e: any) => {
        const rs = porEmp.get(e.id) || [];
        const st = rs.map(statusPonto);
        const total = rs.reduce((s, r) => s + intervalToMin(r.horas_trabalhadas), 0);
        const completos = st.filter((s) => s === 'completo').length;
        return {
          e, rs, total, completos,
          extras: rs.reduce((s, r) => s + intervalToMin(r.horas_extras), 0),
          incompletos: st.filter((s) => s === 'incompleto').length,
          justificados: st.filter((s) => s === 'justificado').length,
          media: completos ? total / completos : 0,
        };
      });
  }, [emps, regs, dep]);

  const tot = linhas.reduce((a, l) => ({ horas: a.horas + l.total, extras: a.extras + l.extras, inc: a.inc + l.incompletos }), { horas: 0, extras: 0, inc: 0 });

  const abrirEdicao = (reg: any, emp?: any) => {
    const f: Record<string, string> = { data: reg?.data || format(new Date(), 'yyyy-MM-dd'), observacoes: reg?.observacoes || '', justificativa: reg?.justificativa || '' };
    CAMPOS.forEach(([c]) => { f[c] = reg?.[c] ? format(parseISO(reg[c]), 'HH:mm') : ''; });
    setForm(f);
    setEdit(reg || { novo: true, employee_id: emp.id, nome: emp.nome });
  };

  const salvar = async () => {
    if (!form.data) return toast.error('Informe a data');
    setSaving(true);
    try {
      const ts = (h: string) => (h ? new Date(`${form.data}T${h}:00`).toISOString() : null);
      const payload: any = { observacoes: form.observacoes.trim() || null };
      CAMPOS.forEach(([c]) => { payload[c] = ts(form[c]); });
      if (form.justificativa.trim()) { payload.justificativa = form.justificativa.trim(); if (!payload.saida) payload.status = 'justificado'; }
      else payload.justificativa = null;
      const { error } = edit.novo
        ? await supabase.from('time_records').insert({ ...payload, employee_id: edit.employee_id, data: form.data })
        : await supabase.from('time_records').update(payload).eq('id', edit.id);
      if (error) throw error;
      toast.success(edit.novo ? 'Registro criado' : 'Registro ajustado');
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['ponto-relatorio'] });
    } catch (e: any) {
      toast.error(friendlyError(e, 'Erro ao salvar registro'));
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    const { error } = await supabase.from('time_records').delete().eq('id', del.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir'));
    toast.success('Registro excluído');
    setDel(null);
    qc.invalidateQueries({ queryKey: ['ponto-relatorio'] });
  };

  const exportar = () => {
    const nome = new Map(emps.map((e: any) => [e.id, e.nome]));
    downloadCSV(`relatorio-ponto-${format(mes, 'yyyy-MM')}`, ['Funcionário', 'Data', 'Entrada', 'Saída Almoço', 'Retorno', 'Saída', 'Horas', 'Extras', 'Status', 'Justificativa', 'IP entrada', 'Local entrada'],
      linhas.flatMap((l) => l.rs).map((r: any) => [nome.get(r.employee_id), format(parseISO(r.data), 'dd/MM/yyyy'), fmtHora(r.entrada), fmtHora(r.saida_almoco), fmtHora(r.retorno_almoco), fmtHora(r.saida),
        fmtMin(intervalToMin(r.horas_trabalhadas)), fmtMin(intervalToMin(r.horas_extras)), STATUS_PONTO[statusPonto(r)]?.[0], r.justificativa, r.ip_entrada, r.localizacao_entrada]));
  };

  const kpi = (icon: React.ReactNode, label: string, value: React.ReactNode, cor: string) => (
    <Card><CardContent className="pt-6 flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${cor}`}>{icon}</div>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
    </CardContent></Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Relatório de Ponto</h1>
            <p className="text-muted-foreground">Horas trabalhadas, extras e pendências da equipe</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 border rounded-md px-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMes((m) => addMonths(m, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium min-w-[110px] text-center capitalize">{format(mes, 'MMMM yyyy', { locale: ptBR })}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMes((m) => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Select value={dep} onValueChange={setDep}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos departamentos</SelectItem>
                {Object.entries(DEPARTAMENTOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" />Exportar</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpi(<Users className="h-5 w-5 text-blue-600" />, 'Funcionários', linhas.length, 'bg-blue-100')}
          {kpi(<Clock className="h-5 w-5 text-green-600" />, 'Horas no mês', fmtMin(tot.horas), 'bg-green-100')}
          {kpi(<TrendingUp className="h-5 w-5 text-purple-600" />, 'Horas extras', fmtMin(tot.extras), 'bg-purple-100')}
          {kpi(<AlertTriangle className="h-5 w-5 text-red-600" />, 'Registros incompletos', tot.inc, 'bg-red-100')}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Resumo por funcionário</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <TableSkeleton /> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" /><TableHead>Funcionário</TableHead><TableHead className="text-center">Dias</TableHead>
                      <TableHead className="text-center">Horas</TableHead><TableHead className="text-center">Extras</TableHead>
                      <TableHead className="text-center hidden md:table-cell">Média/dia</TableHead><TableHead className="text-center">Pendências</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Nenhum funcionário</TableCell></TableRow>}
                    {linhas.map((l) => (
                      <Fragment key={l.e.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setAberto(aberto === l.e.id ? null : l.e.id)}>
                          <TableCell><ChevronDown className={cn('h-4 w-4 transition-transform', aberto === l.e.id && 'rotate-180')} /></TableCell>
                          <TableCell><div className="font-medium">{l.e.nome}</div><div className="text-xs text-muted-foreground">{DEPARTAMENTOS[l.e.departamento]}</div></TableCell>
                          <TableCell className="text-center">{l.rs.length}</TableCell>
                          <TableCell className="text-center font-mono">{fmtMin(l.total)}</TableCell>
                          <TableCell className="text-center font-mono text-purple-600">{fmtMin(l.extras)}</TableCell>
                          <TableCell className="text-center font-mono hidden md:table-cell">{fmtMin(l.media)}</TableCell>
                          <TableCell className="text-center">
                            {l.incompletos > 0 && <Badge className={STATUS_PONTO.incompleto[1]}>{l.incompletos} incompleto(s)</Badge>}
                            {l.justificados > 0 && <Badge className={cn('ml-1', STATUS_PONTO.justificado[1])}>{l.justificados} just.</Badge>}
                            {!l.incompletos && !l.justificados && <span className="text-muted-foreground text-sm">—</span>}
                          </TableCell>
                        </TableRow>
                        {aberto === l.e.id && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={7} className="p-3">
                              <div className="flex justify-end mb-2">
                                {canCreate('funcionarios') && <Button size="sm" variant="outline" onClick={() => abrirEdicao(null, l.e)}><Plus className="h-3 w-3 mr-1" />Lançar dia</Button>}
                              </div>
                              {l.rs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Sem registros no mês</p> : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Data</TableHead><TableHead className="text-center">Entrada</TableHead><TableHead className="text-center">Almoço</TableHead>
                                      <TableHead className="text-center">Saída</TableHead><TableHead className="text-center">Horas</TableHead><TableHead>Status</TableHead><TableHead className="w-20" />
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {l.rs.map((r: any) => {
                                      const st = statusPonto(r);
                                      return (
                                        <TableRow key={r.id}>
                                          <TableCell className="whitespace-nowrap">{format(parseISO(r.data), 'dd/MM EEE', { locale: ptBR })}</TableCell>
                                          <TableCell className="text-center font-mono text-sm">{fmtHora(r.entrada)}</TableCell>
                                          <TableCell className="text-center font-mono text-sm">{r.saida_almoco ? `${fmtHora(r.saida_almoco)}-${fmtHora(r.retorno_almoco)}` : '--'}</TableCell>
                                          <TableCell className="text-center font-mono text-sm">{fmtHora(r.saida)}</TableCell>
                                          <TableCell className="text-center font-mono text-sm">{r.horas_trabalhadas ? fmtMin(intervalToMin(r.horas_trabalhadas)) : '--'}</TableCell>
                                          <TableCell>
                                            <Badge className={cn('text-xs', STATUS_PONTO[st]?.[1])} title={r.justificativa || ''}>{STATUS_PONTO[st]?.[0]}</Badge>
                                            {(() => {
                                              const v = Object.values(r.verificacao_facial || {}) as any[];
                                              if (!v.length) return null;
                                              if (v.some((x) => x.status === 'nao_confere')) return <Badge className="ml-1 text-[10px] bg-red-100 text-red-700 hover:bg-red-100" title="Em alguma batida o rosto não bateu com o cadastro">Rosto não confere</Badge>;
                                              if (v.some((x) => x.status === 'sem_verificacao')) return <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100" title="Alguma batida sem reconhecimento facial">Sem rosto</Badge>;
                                              return <Badge className="ml-1 text-[10px] bg-green-100 text-green-700 hover:bg-green-100" title="Todas as batidas com rosto confirmado">Rosto ✓</Badge>;
                                            })()}
                                          </TableCell>
                                          <TableCell className="text-right whitespace-nowrap">
                                            {canUpdate('funcionarios') && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEdicao(r)}><Pencil className="h-3.5 w-3.5" /></Button>}
                                            {canDelete('funcionarios') && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDel(r)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{edit?.novo ? `Lançar dia — ${edit?.nome}` : 'Ajustar registro de ponto'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Data</Label><Input type="date" value={form.data || ''} disabled={!edit?.novo} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS.map(([c, label]) => (
                <div key={c} className="space-y-1"><Label className="text-xs">{label}</Label>
                  <Input type="time" value={form[c as Campo] || ''} onChange={(e) => setForm((f) => ({ ...f, [c]: e.target.value }))} /></div>
              ))}
            </div>
            <div className="space-y-2"><Label>Justificativa</Label><Textarea rows={2} value={form.justificativa || ''} onChange={(e) => setForm((f) => ({ ...f, justificativa: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Observações do RH</Label><Textarea rows={2} value={form.observacoes || ''} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">Horas trabalhadas, extras e status são recalculados automaticamente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Excluir registro de ponto?" description="Esta ação não pode ser desfeita." onConfirm={excluir} />
    </DashboardLayout>
  );
};

export default RelatorioPonto;
