import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Plus, Users, DollarSign, CheckCircle2, XCircle, Clock, AlertTriangle, Calendar, ArrowUpDown, MoreHorizontal, Trash2, Pencil,
  RefreshCw, Sparkles, MessageSquare, Download, Loader2, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import { format, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PagamentoForm } from '@/components/forms/PagamentoForm';
import { TableSkeleton } from '@/components/ui/loading';
import { useDebounce } from '@/hooks/useDebounce';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { openStoredFile } from '@/lib/storage';
import { downloadCSV } from '@/lib/csv';
import { formatCurrency, formatDateBR, friendlyError } from '@/lib/utils';

type SortField = 'data_vencimento' | 'inquilino' | 'proprietario' | 'valor';
const todayISO = () => format(new Date(), 'yyyy-MM-dd');
const venc = (p: any) => p.data_vencimento || p.mes_referencia;
const emAtraso = (p: any) => !p.inquilino_pagou && venc(p) < todayISO();
const venceHoje = (p: any) => !p.inquilino_pagou && venc(p) === todayISO();
const comissao = (p: any) => Number(p.valor_aluguel || 0) - Number(p.valor_repasse || 0);

export default function ControlePagamentos() {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [mes, setMes] = useState(format(new Date(), 'yyyy-MM'));
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [fInq, setFInq] = useState('todos');
  const [fProp, setFProp] = useState('todos');
  const [view, setView] = useState('planilha');
  const [sortField, setSortField] = useState<SortField>('data_vencimento');
  const [asc, setAsc] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genMes, setGenMes] = useState(format(addMonths(new Date(), 1), 'yyyy-MM'));
  const [genBusy, setGenBusy] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['owner_payments', mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('owner_payments')
        .select('*, proprietario:clients!owner_payments_proprietario_id_fkey(id, nome, whatsapp), inquilino:clients!owner_payments_inquilino_id_fkey(id, nome, whatsapp)')
        .eq('mes_referencia', `${mes}-01`)
        .order('data_vencimento', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['owner_payments'] }); qc.invalidateQueries({ queryKey: ['alertas'] }); qc.invalidateQueries({ queryKey: ['financial-dashboard'] }); };

  const filtered = useMemo(() => {
    const r = payments.filter((p: any) => {
      const s = !search || [p.proprietario?.nome, p.inquilino?.nome].some((v) => (v || '').toLowerCase().includes(search));
      const i = fInq === 'todos' || (fInq === 'pagou' ? p.inquilino_pagou : fInq === 'pendente' ? !p.inquilino_pagou : emAtraso(p));
      const o = fProp === 'todos' || (fProp === 'recebeu' ? p.proprietario_recebeu : !p.proprietario_recebeu);
      return s && i && o;
    });
    r.sort((a: any, b: any) => {
      const c = sortField === 'valor' ? Number(a.valor_aluguel) - Number(b.valor_aluguel)
        : sortField === 'inquilino' ? (a.inquilino?.nome || '').localeCompare(b.inquilino?.nome || '')
        : sortField === 'proprietario' ? (a.proprietario?.nome || '').localeCompare(b.proprietario?.nome || '')
        : venc(a).localeCompare(venc(b));
      return asc ? c : -c;
    });
    return r;
  }, [payments, search, fInq, fProp, sortField, asc]);

  const alertas = useMemo(() => ({
    hoje: payments.filter(venceHoje).length,
    atraso: payments.filter(emAtraso).length,
    repasses: payments.filter((p: any) => p.inquilino_pagou && !p.proprietario_recebeu && p.data_repasse_sugerida && p.data_repasse_sugerida <= todayISO()).length,
  }), [payments]);

  const totais = useMemo(() => {
    const aluguel = filtered.reduce((a: number, p: any) => a + Number(p.valor_aluguel || 0), 0);
    const repasse = filtered.reduce((a: number, p: any) => a + Number(p.valor_repasse || 0), 0);
    return {
      aluguel, repasse, comissao: aluguel - repasse,
      pagaram: filtered.filter((p: any) => p.inquilino_pagou).length,
      pendentes: filtered.filter((p: any) => !p.inquilino_pagou).length,
      atraso: filtered.filter(emAtraso).length,
      receberam: filtered.filter((p: any) => p.proprietario_recebeu).length,
      naoReceberam: filtered.filter((p: any) => !p.proprietario_recebeu).length,
    };
  }, [filtered]);

  const byOwner = useMemo(() => {
    const g: Record<string, { owner: any; list: any[] }> = {};
    filtered.forEach((p: any) => { (g[p.proprietario_id] ||= { owner: p.proprietario, list: [] }).list.push(p); });
    return Object.values(g).sort((a, b) => (a.owner?.nome || '').localeCompare(b.owner?.nome || ''));
  }, [filtered]);

  const toggle = async (p: any, field: 'inquilino_pagou' | 'proprietario_recebeu') => {
    const v = !p[field];
    if (field === 'proprietario_recebeu' && v && !p.inquilino_pagou) toast.warning('Atenção: o inquilino ainda não pagou este aluguel');
    qc.setQueryData(['owner_payments', mes], (old: any[] = []) => old.map((x) => (x.id === p.id ? { ...x, [field]: v } : x)));
    const { error } = await supabase.from('owner_payments').update({ [field]: v }).eq('id', p.id);
    if (error) toast.error(friendlyError(error, 'Erro ao atualizar'));
    else toast.success(field === 'inquilino_pagou' ? (v ? 'Pagamento confirmado' : 'Pagamento desmarcado') : (v ? 'Repasse confirmado' : 'Repasse desmarcado'));
    refresh();
  };

  const remove = async () => {
    const { error } = await supabase.from('owner_payments').delete().eq('id', del.id);
    setDel(null);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir registro'));
    toast.success('Registro excluído com sucesso!');
    refresh();
  };

  const gerar = async () => {
    setGenBusy(true);
    const { data, error } = await supabase.rpc('gerar_alugueis_mes', { _mes: `${genMes}-01` });
    setGenBusy(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao gerar aluguéis'));
    const n = (data as any)?.criados ?? 0;
    if (n > 0) toast.success(`${n} registro(s) de aluguel gerados para ${format(parseISO(`${genMes}-01`), 'MMMM/yyyy', { locale: ptBR })}`);
    else toast.info('Nenhum registro novo: todos já existiam para o mês escolhido');
    setGenOpen(false);
    setMes(genMes);
    refresh();
  };

  const cobrar = (p: any) => openWhatsapp(p.inquilino?.whatsapp,
    `Olá ${p.inquilino?.nome?.split(' ')[0] || ''}! Lembramos que o aluguel de ${format(parseISO(p.mes_referencia), 'MMMM/yyyy', { locale: ptBR })} no valor de ${formatCurrency(Number(p.valor_total ?? p.valor_aluguel))} venceu em ${formatDateBR(venc(p))}. Qualquer dúvida estamos à disposição.`);

  const exportar = () => downloadCSV(`pagamentos-${mes}.csv`,
    ['Vencimento', 'Inquilino', 'Proprietário', 'Aluguel', 'Encargos', 'Total', 'Comissão', 'Repasse', 'Inquilino pagou', 'Data pgto', 'Repasse feito', 'Data repasse', 'Observações'],
    filtered.map((p: any) => [formatDateBR(venc(p)), p.inquilino?.nome, p.proprietario?.nome, Number(p.valor_aluguel).toFixed(2).replace('.', ','),
      Number(p.encargos_extras || 0).toFixed(2).replace('.', ','), Number(p.valor_total ?? p.valor_aluguel).toFixed(2).replace('.', ','),
      comissao(p).toFixed(2).replace('.', ','), Number(p.valor_repasse).toFixed(2).replace('.', ','), p.inquilino_pagou ? 'Sim' : 'Não',
      formatDateBR(p.data_pagamento_inquilino), p.proprietario_recebeu ? 'Sim' : 'Não', formatDateBR(p.data_repasse_proprietario), p.observacoes]));

  const sortBy = (f: SortField) => { if (f === sortField) setAsc(!asc); else { setSortField(f); setAsc(true); } };
  const SortBtn = ({ f, children }: { f: SortField; children: React.ReactNode }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium hover:bg-transparent" onClick={() => sortBy(f)}>{children}<ArrowUpDown className="ml-1 h-3 w-3" /></Button>
  );
  const statusBadge = (p: any) => p.inquilino_pagou ? <Badge className="bg-green-100 text-green-700">Pago</Badge>
    : emAtraso(p) ? <Badge variant="destructive">Atrasado</Badge>
    : venceHoje(p) ? <Badge variant="outline" className="bg-yellow-100 text-yellow-700">Vence Hoje</Badge>
    : <Badge variant="outline">Em Aberto</Badge>;

  const Actions = ({ p }: { p: any }) => (canUpdate('financeiro') || canDelete('financeiro') || p.comprovante_inquilino_url) ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdate('financeiro') && <DropdownMenuItem onClick={() => { setEditing(p); setFormOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>}
        {emAtraso(p) && hasValidWhatsapp(p.inquilino?.whatsapp) && <DropdownMenuItem onClick={() => cobrar(p)}><MessageSquare className="mr-2 h-4 w-4" />Cobrar no WhatsApp</DropdownMenuItem>}
        {p.comprovante_inquilino_url && <DropdownMenuItem onClick={() => openStoredFile(p.comprovante_inquilino_url)}><FileText className="mr-2 h-4 w-4" />Comprovante inquilino</DropdownMenuItem>}
        {p.comprovante_repasse_url && <DropdownMenuItem onClick={() => openStoredFile(p.comprovante_repasse_url)}><FileText className="mr-2 h-4 w-4" />Comprovante repasse</DropdownMenuItem>}
        {canDelete('financeiro') && <DropdownMenuItem className="text-destructive" onClick={() => setDel(p)}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const empty = <div className="text-center py-8"><Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><p className="text-muted-foreground">Nenhum registro encontrado</p>{canCreate('financeiro') && <p className="text-sm text-muted-foreground mt-1">Use "Gerar Mês" para criar os aluguéis a partir dos contratos ativos.</p>}</div>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Controle de Pagamentos</h1>
            <p className="text-muted-foreground">Módulo financeiro imobiliário completo</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" />Exportar</Button>
            {canCreate('financeiro') && <Button variant="outline" className="gap-2" onClick={() => setGenOpen(true)}><RefreshCw className="h-4 w-4" />Gerar Mês</Button>}
            {canCreate('financeiro') && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Novo Registro</Button>}
          </div>
        </div>

        {(alertas.hoje > 0 || alertas.atraso > 0 || alertas.repasses > 0) && (
          <div className="flex flex-wrap gap-2">
            {alertas.hoje > 0 && <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 px-3 py-1.5"><Clock className="w-4 h-4 mr-1" />{alertas.hoje} pagamento(s) vencem hoje</Badge>}
            {alertas.atraso > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 px-3 py-1.5 cursor-pointer" onClick={() => setFInq('atraso')}><AlertTriangle className="w-4 h-4 mr-1" />{alertas.atraso} pagamento(s) em atraso</Badge>}
            {alertas.repasses > 0 && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1.5"><Calendar className="w-4 h-4 mr-1" />{alertas.repasses} repasse(s) a fazer (4 dias após o pagamento)</Badge>}
          </div>
        )}

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
          <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Aluguel</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{formatCurrency(totais.aluguel)}</div></CardContent></Card>
          <Card className="border-emerald-200 bg-emerald-50/30"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Comissão Imobiliária</CardTitle><DollarSign className="h-4 w-4 text-emerald-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{formatCurrency(totais.comissao)}</div></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Repasse</CardTitle><DollarSign className="h-4 w-4 text-blue-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{formatCurrency(totais.repasse)}</div><p className="text-xs text-muted-foreground">para proprietários</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Inquilinos Pagaram</CardTitle><CheckCircle2 className="h-4 w-4 text-green-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{totais.pagaram}</div><p className="text-xs text-muted-foreground">{totais.pendentes} pendentes</p></CardContent></Card>
          <Card className={totais.atraso > 0 ? 'border-destructive/50' : ''}><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Em Atraso</CardTitle><Clock className="h-4 w-4 text-destructive" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{totais.atraso}</div><p className="text-xs text-muted-foreground">inquilinos</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Prop. Receberam</CardTitle><Users className="h-4 w-4 text-blue-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{totais.receberam}</div><p className="text-xs text-muted-foreground">{totais.naoReceberam} pendentes</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="w-44" />
              <Select value={fInq} onValueChange={setFInq}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos Inquilinos</SelectItem><SelectItem value="pagou">Pagaram</SelectItem><SelectItem value="pendente">Pendentes</SelectItem><SelectItem value="atraso">Em Atraso</SelectItem></SelectContent>
              </Select>
              <Select value={fProp} onValueChange={setFProp}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos Proprietários</SelectItem><SelectItem value="recebeu">Receberam</SelectItem><SelectItem value="pendente">Pendentes</SelectItem></SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="planilha">Planilha Mensal</TabsTrigger>
            <TabsTrigger value="inquilinos">Por Inquilino</TabsTrigger>
            <TabsTrigger value="proprietarios">Por Proprietário</TabsTrigger>
          </TabsList>

          <TabsContent value="planilha">
            <Card>
              <CardContent className="pt-6">
                {isLoading ? <TableSkeleton rows={6} cols={8} /> : filtered.length === 0 ? empty : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16"><SortBtn f="data_vencimento">Dia</SortBtn></TableHead>
                          <TableHead><SortBtn f="inquilino">Inquilino</SortBtn></TableHead>
                          <TableHead><SortBtn f="proprietario">Proprietário</SortBtn></TableHead>
                          <TableHead className="text-right"><SortBtn f="valor">Aluguel</SortBtn></TableHead>
                          <TableHead className="text-right">Comissão</TableHead>
                          <TableHead className="text-right">Repasse</TableHead>
                          <TableHead className="text-center">Data Pgto</TableHead>
                          <TableHead className="text-right">ENEL/SABESP</TableHead>
                          <TableHead className="text-center">Pago</TableHead>
                          <TableHead className="text-center">Repassado</TableHead>
                          <TableHead>Observações</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((p: any) => {
                          const late = emAtraso(p);
                          const today = venceHoje(p);
                          return (
                            <TableRow key={p.id} className={late ? 'bg-red-50/50' : today ? 'bg-yellow-50/50' : ''}>
                              <TableCell className="font-mono"><span className={late ? 'text-destructive font-bold' : today ? 'text-yellow-600 font-bold' : ''}>{venc(p).slice(8, 10)}</span></TableCell>
                              <TableCell className="font-medium whitespace-nowrap">{p.inquilino?.nome || '—'}{late && <Badge variant="destructive" className="ml-2 text-xs">Atraso</Badge>}{today && <Badge variant="outline" className="ml-2 text-xs bg-yellow-50">Vence Hoje</Badge>}</TableCell>
                              <TableCell className="whitespace-nowrap">{p.proprietario?.nome || '—'}</TableCell>
                              <TableCell className="text-right whitespace-nowrap">{formatCurrency(Number(p.valor_aluguel))}</TableCell>
                              <TableCell className="text-right text-emerald-600 font-medium whitespace-nowrap">{formatCurrency(comissao(p))}<span className="block text-[10px] text-muted-foreground">{Number(p.percentual_comissao)}%</span></TableCell>
                              <TableCell className="text-right text-blue-600 font-medium whitespace-nowrap">{formatCurrency(Number(p.valor_repasse))}{p.valor_repasse_manual !== null && <span className="block text-[10px] text-muted-foreground">manual</span>}</TableCell>
                              <TableCell className="text-center">{p.data_pagamento_inquilino ? formatDateBR(p.data_pagamento_inquilino).slice(0, 5) : '—'}</TableCell>
                              <TableCell className="text-right">{Number(p.encargos_extras) ? formatCurrency(Number(p.encargos_extras)) : '—'}</TableCell>
                              <TableCell className="text-center">
                                {canUpdate('financeiro') ? <Checkbox checked={!!p.inquilino_pagou} onCheckedChange={() => toggle(p, 'inquilino_pagou')} />
                                  : p.inquilino_pagou ? <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" /> : <XCircle className="h-5 w-5 text-destructive mx-auto" />}
                              </TableCell>
                              <TableCell className="text-center">
                                {canUpdate('financeiro') ? <Checkbox checked={!!p.proprietario_recebeu} onCheckedChange={() => toggle(p, 'proprietario_recebeu')} />
                                  : p.proprietario_recebeu ? <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" /> : <XCircle className="h-5 w-5 text-muted-foreground mx-auto" />}
                              </TableCell>
                              <TableCell className="max-w-[200px]"><span className="text-sm text-muted-foreground truncate block" title={p.observacoes || ''}>{p.observacoes || '—'}</span></TableCell>
                              <TableCell><Actions p={p} /></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inquilinos">
            <Card>
              <CardContent className="pt-6">
                {isLoading ? <TableSkeleton rows={5} cols={4} /> : filtered.length === 0 ? empty : (
                  <div className="space-y-3">
                    {filtered.map((p: any) => (
                      <div key={p.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border ${emAtraso(p) ? 'border-destructive/50 bg-red-50/50' : venceHoje(p) ? 'border-yellow-300 bg-yellow-50/50' : p.inquilino_pagou ? 'border-green-200 bg-green-50/30' : ''}`}>
                        <div className="flex flex-col"><span className="font-medium">{p.inquilino?.nome || 'Sem inquilino'}</span><span className="text-sm text-muted-foreground">Proprietário: {p.proprietario?.nome}</span></div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-right">
                            <div className="font-medium">{formatCurrency(Number(p.valor_total ?? p.valor_aluguel))}</div>
                            <div className="text-xs text-muted-foreground">Venc: {formatDateBR(venc(p)).slice(0, 5)}</div>
                            <div className="flex gap-2 mt-1"><span className="text-xs text-emerald-600">Comissão: {formatCurrency(comissao(p))}</span><span className="text-xs text-blue-600">Repasse: {formatCurrency(Number(p.valor_repasse))}</span></div>
                          </div>
                          {statusBadge(p)}
                          {canUpdate('financeiro') && <Checkbox checked={!!p.inquilino_pagou} onCheckedChange={() => toggle(p, 'inquilino_pagou')} />}
                          <Actions p={p} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="proprietarios">
            {isLoading ? <TableSkeleton rows={5} cols={4} /> : byOwner.length === 0 ? <Card><CardContent>{empty}</CardContent></Card> : (
              <div className="space-y-4">
                {byOwner.map(({ owner, list }) => {
                  const repasse = list.reduce((a, p) => a + Number(p.valor_repasse || 0), 0);
                  const repassado = list.filter((p) => p.proprietario_recebeu).reduce((a, p) => a + Number(p.valor_repasse || 0), 0);
                  const disponivel = list.filter((p) => p.inquilino_pagou && !p.proprietario_recebeu).reduce((a, p) => a + Number(p.valor_repasse || 0), 0);
                  return (
                    <Card key={owner?.id || 'x'}>
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <CardTitle className="text-lg">{owner?.nome || '—'}</CardTitle>
                          <div className="flex flex-wrap gap-2 text-sm">
                            <Badge variant="outline">{list.length} imóvel(is)</Badge>
                            <Badge variant="outline" className="text-green-700">{list.filter((p) => p.inquilino_pagou).length} pagos</Badge>
                            {list.filter(emAtraso).length > 0 && <Badge variant="destructive">{list.filter(emAtraso).length} em atraso</Badge>}
                            <Badge className="bg-blue-100 text-blue-700">Repasse: {formatCurrency(repasse)}</Badge>
                            {disponivel > 0 && <Badge className="bg-emerald-100 text-emerald-700">A repassar agora: {formatCurrency(disponivel)}</Badge>}
                            {repassado > 0 && <Badge variant="secondary">Já repassado: {formatCurrency(repassado)}</Badge>}
                            {hasValidWhatsapp(owner?.whatsapp) && <Button size="sm" variant="outline" className="h-6" onClick={() => openWhatsapp(owner.whatsapp)}><MessageSquare className="h-3 w-3 mr-1" />WhatsApp</Button>}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {list.map((p) => (
                            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-muted/30 text-sm">
                              <span className="font-medium">{p.inquilino?.nome || 'Sem inquilino'}</span>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span>{formatCurrency(Number(p.valor_aluguel))}</span>
                                <span className="text-blue-600">→ {formatCurrency(Number(p.valor_repasse))}</span>
                                {statusBadge(p)}
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  Repassado {canUpdate('financeiro') ? <Checkbox checked={!!p.proprietario_recebeu} onCheckedChange={() => toggle(p, 'proprietario_recebeu')} /> : p.proprietario_recebeu ? 'sim' : 'não'}
                                </span>
                                <Actions p={p} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <PagamentoForm open={formOpen} onOpenChange={setFormOpen} payment={editing} defaultMonth={mes} onSuccess={refresh} />

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Gerar Aluguéis do Mês</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              O sistema copia os aluguéis do mês anterior (mantendo valores, inquilinos e proprietários) e também cria os registros dos
              contratos de locação ativos que ainda não têm lançamento. Contratos encerrados ficam de fora e nada é duplicado.
            </div>
            <div className="space-y-2">
              <Label>Mês de destino</Label>
              <Input type="month" value={genMes} onChange={(e) => setGenMes(e.target.value)} />
              <p className="text-xs text-muted-foreground capitalize">Base: {genMes && format(addMonths(parseISO(`${genMes}-01`), -1), 'MMMM/yyyy', { locale: ptBR })}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Fechar</Button>
            <Button onClick={gerar} disabled={genBusy || !genMes}>{genBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Gerar Aluguéis</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        onConfirm={remove}
        title="Excluir registro"
        description={`Deseja realmente excluir o registro de ${del?.inquilino?.nome || 'pagamento'} referente a ${del ? format(parseISO(del.mes_referencia), 'MMMM/yyyy', { locale: ptBR }) : ''}?`}
        confirmText="Excluir"
      />
    </DashboardLayout>
  );
}
