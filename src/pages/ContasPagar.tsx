import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ContaPagarForm, CATEGORIA_CONTA, FORMA_PAGAMENTO, RECORRENCIA, STATUS_CONTA } from '@/components/forms/ContaPagarForm';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/loading';
import { useDebounce } from '@/hooks/useDebounce';
import { openStoredFile, removePrivateFile } from '@/lib/storage';
import { downloadCSV } from '@/lib/csv';
import { formatCurrency, formatDateBR, friendlyError } from '@/lib/utils';
import { addMonths, format } from 'date-fns';
import {
  Plus, Search, Receipt, Calendar, Repeat, AlertCircle, CheckCircle2, Clock, FileText, MoreHorizontal, Pencil, Trash2,
  TrendingUp, Layers, Download, CopyPlus,
} from 'lucide-react';

type Filter = 'todas' | 'mes_atual' | 'pagas' | 'pendentes' | 'em_atraso' | 'recorrentes' | 'variaveis';
const CAT_COLOR: Record<string, string> = {
  consumo: 'bg-blue-500/10 text-blue-700', assinaturas: 'bg-yellow-500/10 text-yellow-700', servicos_internos: 'bg-green-500/10 text-green-700',
  manutencao: 'bg-red-500/10 text-red-700', impostos: 'bg-purple-500/10 text-purple-700', outros: 'bg-gray-500/10 text-gray-700',
};
const STATUS_COLOR: Record<string, string> = {
  pago: 'bg-green-500/10 text-green-700', pendente: 'bg-red-500/10 text-red-700', agendado: 'bg-yellow-500/10 text-yellow-700', a_vencer: 'bg-gray-500/10 text-gray-700',
};
const MESES_REC: Record<string, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const today = () => new Date().toISOString().slice(0, 10);
const atrasada = (b: any) => b.status !== 'pago' && b.data_vencimento < today();
const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export default function ContasPagar() {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [filter, setFilter] = useState<Filter>('mes_atual');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [del, setDel] = useState<{ bill: any; all: boolean } | null>(null);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bills').select('*').order('data_vencimento', { ascending: true }).limit(10000);
      if (error) throw error;
      return data || [];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['alertas'] }); };

  const filtered = useMemo(() => {
    const ym = today().slice(0, 7);
    return bills.filter((b: any) => {
      const ok =
        filter === 'mes_atual' ? b.data_vencimento.startsWith(ym)
          : filter === 'pagas' ? b.status === 'pago'
          : filter === 'pendentes' ? b.status !== 'pago'
          : filter === 'em_atraso' ? atrasada(b)
          : filter === 'recorrentes' ? b.recorrencia && b.recorrencia !== 'unica'
          : filter === 'variaveis' ? b.valor_variavel
          : true;
      return ok && (!search || b.descricao.toLowerCase().includes(search));
    });
  }, [bills, filter, search]);

  const totais = useMemo(() => ({
    pendente: filtered.filter((b: any) => b.status !== 'pago').reduce((a: number, b: any) => a + Number(b.valor), 0),
    pago: filtered.filter((b: any) => b.status === 'pago').reduce((a: number, b: any) => a + Number(b.valor), 0),
    atraso: filtered.filter(atrasada).reduce((a: number, b: any) => a + Number(b.valor), 0),
    total: filtered.reduce((a: number, b: any) => a + Number(b.valor), 0),
  }), [filtered]);

  const setStatus = async (b: any, status: string) => {
    const upd: any = { status };
    if (status === 'pago') upd.data_pagamento = today();
    else if (b.status === 'pago') upd.data_pagamento = null;
    const { error } = await supabase.from('bills').update(upd).eq('id', b.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao alterar status'));
    toast.success(`Status alterado para ${STATUS_CONTA[status]}`);
    refresh();
  };

  const gerarProxima = async (b: any) => {
    const meses = MESES_REC[b.recorrencia];
    if (!meses) return;
    const venc = format(addMonths(parseLocal(b.data_vencimento), meses), 'yyyy-MM-dd');
    if (bills.some((x: any) => x.descricao === b.descricao && x.data_vencimento === venc)) return toast.info('A próxima conta já existe');
    const { error } = await supabase.from('bills').insert({
      descricao: b.descricao, valor: b.valor, data_vencimento: venc, categoria: b.categoria, forma_pagamento: b.forma_pagamento,
      recorrencia: b.recorrencia, observacoes: b.observacoes, status: 'pendente', responsavel_id: b.responsavel_id, valor_variavel: b.valor_variavel,
    });
    if (error) return toast.error(friendlyError(error, 'Erro ao gerar próxima conta'));
    toast.success(`Próxima conta criada para ${formatDateBR(venc)}`);
    refresh();
  };

  const remove = async () => {
    if (!del) return;
    const { bill, all } = del;
    const q = supabase.from('bills').delete();
    const { error } = all ? await q.eq('grupo_parcela_id', bill.grupo_parcela_id) : await q.eq('id', bill.id);
    setDel(null);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir'));
    if (!all) await removePrivateFile(bill.comprovante_url);
    toast.success(all ? 'Todas as parcelas foram excluídas!' : 'Conta excluída com sucesso!');
    refresh();
  };

  const exportar = () => downloadCSV('contas-a-pagar.csv',
    ['Descrição', 'Valor', 'Vencimento', 'Pagamento', 'Categoria', 'Forma', 'Recorrência', 'Status', 'Parcela'],
    filtered.map((b: any) => [b.descricao, Number(b.valor).toFixed(2).replace('.', ','), formatDateBR(b.data_vencimento), formatDateBR(b.data_pagamento),
      CATEGORIA_CONTA[b.categoria] || b.categoria, FORMA_PAGAMENTO[b.forma_pagamento] || '', RECORRENCIA[b.recorrencia] || '', STATUS_CONTA[b.status] || b.status,
      b.total_parcelas > 1 ? `${b.parcela_atual}/${b.total_parcelas}` : '']));

  const filters: [Filter, string, any][] = [
    ['todas', 'Todas', Receipt], ['mes_atual', 'Mês Atual', Calendar], ['pagas', 'Pagas', CheckCircle2], ['pendentes', 'Pendentes', AlertCircle],
    ['em_atraso', 'Em Atraso', AlertCircle], ['recorrentes', 'Recorrentes', Repeat], ['variaveis', 'Variáveis', TrendingUp],
  ];
  const statusIcon = (s: string) => (s === 'pago' ? <CheckCircle2 className="h-4 w-4" /> : s === 'pendente' ? <AlertCircle className="h-4 w-4" /> : s === 'agendado' ? <Clock className="h-4 w-4" /> : <Calendar className="h-4 w-4" />);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contas a Pagar - Imobiliária</h1>
            <p className="text-muted-foreground">Gerencie todas as despesas da imobiliária</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportar}><Download className="mr-2 h-4 w-4" /> Exportar</Button>
            {canCreate('contas_pagar') && <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nova Conta</Button>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map(([t, l, Icon]) => (
            <Button key={t} variant={filter === t ? 'default' : 'outline'} size="sm" onClick={() => setFilter(t)}>
              <Icon className="mr-2 h-4 w-4" />{l}{t === 'em_atraso' && bills.filter(atrasada).length > 0 ? ` (${bills.filter(atrasada).length})` : ''}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por descrição..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>

        <div className="rounded-md border overflow-x-auto">
          {isLoading ? <div className="p-4"><TableSkeleton rows={6} cols={8} /></div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" /><TableHead>Descrição</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead>
                  <TableHead>Agendamento/Pgto</TableHead><TableHead>Categoria</TableHead><TableHead>Recorrência</TableHead><TableHead>Status</TableHead>
                  <TableHead>Parcela</TableHead><TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhuma conta encontrada</TableCell></TableRow>
                ) : filtered.map((b: any) => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(b)}>
                    <TableCell><div className="flex items-center gap-1" title={b.valor_variavel ? 'Valor variável' : undefined}><Receipt className="h-5 w-5 text-muted-foreground" />{b.valor_variavel && <TrendingUp className="h-4 w-4 text-orange-500" />}</div></TableCell>
                    <TableCell className="font-medium">{b.descricao}</TableCell>
                    <TableCell className="font-semibold whitespace-nowrap">{formatCurrency(Number(b.valor))}</TableCell>
                    <TableCell>{formatDateBR(b.data_vencimento)}</TableCell>
                    <TableCell>{b.data_pagamento ? formatDateBR(b.data_pagamento) : '-'}</TableCell>
                    <TableCell><Badge variant="secondary" className={CAT_COLOR[b.categoria] || CAT_COLOR.outros}>{(CATEGORIA_CONTA[b.categoria] || b.categoria).split(' (')[0]}</Badge></TableCell>
                    <TableCell>{b.recorrencia ? <Badge variant="secondary">{RECORRENCIA[b.recorrencia] || b.recorrencia}</Badge> : '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={STATUS_COLOR[b.status] || STATUS_COLOR.a_vencer}><span className="flex items-center gap-1">{statusIcon(b.status)}{STATUS_CONTA[b.status] || b.status}</span></Badge>
                        {atrasada(b) && <Badge variant="secondary" className="bg-red-500/10 text-red-700">Atraso</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{b.total_parcelas > 1 ? <Badge variant="outline" className="flex w-fit items-center gap-1"><Layers className="h-3 w-3" />{b.parcela_atual}/{b.total_parcelas}</Badge> : '-'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate('contas_pagar') && (
                            <>
                              <DropdownMenuItem disabled={b.status === 'pago'} onClick={() => setStatus(b, 'pago')} className="text-green-600"><CheckCircle2 className="mr-2 h-4 w-4" />Marcar como Pago</DropdownMenuItem>
                              <DropdownMenuItem disabled={b.status === 'pendente'} onClick={() => setStatus(b, 'pendente')} className="text-red-600"><AlertCircle className="mr-2 h-4 w-4" />Marcar como Pendente</DropdownMenuItem>
                              <DropdownMenuItem disabled={b.status === 'agendado'} onClick={() => setStatus(b, 'agendado')} className="text-yellow-600"><Clock className="mr-2 h-4 w-4" />Marcar como Agendado</DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {canCreate('contas_pagar') && MESES_REC[b.recorrencia] && <DropdownMenuItem onClick={() => gerarProxima(b)}><CopyPlus className="mr-2 h-4 w-4" />Gerar próxima ({RECORRENCIA[b.recorrencia]})</DropdownMenuItem>}
                          {b.comprovante_url && <DropdownMenuItem onClick={() => openStoredFile(b.comprovante_url)}><FileText className="mr-2 h-4 w-4" />Ver Comprovante</DropdownMenuItem>}
                          {canUpdate('contas_pagar') && <DropdownMenuItem onClick={() => setEditing(b)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>}
                          {canDelete('contas_pagar') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDel({ bill: b, all: false })} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                              {b.grupo_parcela_id && b.total_parcelas > 1 && <DropdownMenuItem onClick={() => setDel({ bill: b, all: true })} className="text-red-600"><Layers className="mr-2 h-4 w-4" />Excluir Todas Parcelas</DropdownMenuItem>}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Total Pendente</div><div className="text-2xl font-bold">{formatCurrency(totais.pendente)}</div></div>
          <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Total Pago</div><div className="text-2xl font-bold">{formatCurrency(totais.pago)}</div></div>
          <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Total em Atraso</div><div className="text-2xl font-bold text-red-600">{formatCurrency(totais.atraso)}</div></div>
          <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Total Geral</div><div className="text-2xl font-bold">{formatCurrency(totais.total)}</div></div>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Conta a Pagar</DialogTitle></DialogHeader>
          {addOpen && <ContaPagarForm onSuccess={() => { setAddOpen(false); refresh(); }} onCancel={() => setAddOpen(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Conta a Pagar</DialogTitle></DialogHeader>
          {editing && <ContaPagarForm bill={editing} onSuccess={() => { setEditing(null); refresh(); }} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Detalhes da Conta</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Informações Gerais</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Descrição:</span><span className="font-medium text-right">{selected.descricao}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span className="font-bold text-lg">{formatCurrency(Number(selected.valor))}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><Badge className={STATUS_COLOR[selected.status]}>{STATUS_CONTA[selected.status] || selected.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Categoria:</span><Badge className={CAT_COLOR[selected.categoria]}>{CATEGORIA_CONTA[selected.categoria] || selected.categoria}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Recorrência:</span><span>{RECORRENCIA[selected.recorrencia] || '-'}</span></div>
                  {selected.valor_variavel && <div className="flex justify-between"><span className="text-muted-foreground">Tipo de Valor:</span><Badge className="bg-orange-100 text-orange-800">Variável</Badge></div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Datas</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vencimento:</span><span>{formatDateBR(selected.data_vencimento)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pagamento:</span><span>{formatDateBR(selected.data_pagamento)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Forma de Pagamento:</span><span>{FORMA_PAGAMENTO[selected.forma_pagamento] || '-'}</span></div>
                  {selected.total_parcelas > 1 && <div className="flex justify-between"><span className="text-muted-foreground">Parcela:</span><Badge variant="outline"><Layers className="h-3 w-3 mr-1" />{selected.parcela_atual}/{selected.total_parcelas}</Badge></div>}
                </CardContent>
              </Card>
              {selected.observacoes && (
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Observações</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.observacoes}</p></CardContent></Card>
              )}
              {selected.comprovante_url && <Button className="w-full" onClick={() => openStoredFile(selected.comprovante_url)}><FileText className="h-4 w-4 mr-2" /> Ver Comprovante</Button>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        onConfirm={remove}
        title={del?.all ? 'Excluir Todas as Parcelas' : 'Excluir Conta'}
        description={del?.all
          ? `Tem certeza que deseja excluir TODAS as ${del.bill.total_parcelas} parcelas deste parcelamento?`
          : del?.bill?.total_parcelas > 1
            ? `Esta conta faz parte de um parcelamento (${del?.bill.parcela_atual}/${del?.bill.total_parcelas}). Excluir apenas esta parcela?`
            : `Tem certeza que deseja excluir a conta "${del?.bill?.descricao}"?`}
        confirmText={del?.all ? 'Excluir Todas' : 'Excluir'}
      />
    </DashboardLayout>
  );
}
