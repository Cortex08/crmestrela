import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Plus, Search, Calendar, MapPin, Users, Briefcase, Handshake, Archive, Eye, AlertTriangle, Clock, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ContratoForm, ContratoCategoria, STATUS_CONTRATO_OPTIONS } from '@/components/forms/ContratoForm';
import { ContractDocumentUpload } from '@/components/forms/ContractDocumentUpload';
import { usePermissions } from '@/contexts/PermissionsContext';
import { differenceInMonths, parseISO, isAfter, isBefore, addMonths } from 'date-fns';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { ListSkeleton } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { openStoredFile, removePrivateFile } from '@/lib/storage';
import { formatCurrency, formatDateBR, friendlyError } from '@/lib/utils';

const categoriaLabel: Record<string, string> = { inquilino: 'Inquilino', proprietario: 'Proprietário', funcionario: 'Funcionário', parceria: 'Parceria' };
const categoriaIcon: Record<string, any> = { inquilino: Users, proprietario: Users, funcionario: Briefcase, parceria: Handshake };
const statusColor: Record<string, string> = { rascunho: 'bg-gray-500', ativo: 'bg-green-500', encerrado: 'bg-red-500' };
const statusContratoColor: Record<string, string> = {
  renovar: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/40',
  verificar: 'bg-orange-500/20 text-orange-700 border-orange-500/40',
  em_contrato: 'bg-green-500/20 text-green-700 border-green-500/40',
  em_deposito: 'bg-blue-500/20 text-blue-700 border-blue-500/40',
  vai_sair: 'bg-purple-500/20 text-purple-700 border-purple-500/40',
  saiu_chave_devolvida: 'bg-gray-500/20 text-gray-700 border-gray-500/40',
  saiu_com_proprietario: 'bg-gray-500/20 text-gray-700 border-gray-500/40',
};
const statusContratoLabel = (s: string) => STATUS_CONTRATO_OPTIONS.find((o) => o.value === s)?.label || s;

const mesesRestantes = (dataFim: string | null) => {
  if (!dataFim) return null;
  const fim = parseISO(dataFim);
  return isBefore(fim, new Date()) ? 0 : differenceInMonths(fim, new Date());
};
const precisaNotificar = (dataInicio: string | null, prazo: number | null) =>
  !!dataInicio && !!prazo && isAfter(new Date(), addMonths(parseISO(dataInicio), prazo - 1));

const Contratos = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [newOpen, setNewOpen] = useState(false);
  const [newCategoria, setNewCategoria] = useState<ContratoCategoria>('inquilino');
  const [details, setDetails] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [archive, setArchive] = useState<{ open: boolean; id: string; archive: boolean }>({ open: false, id: '', archive: true });
  const [del, setDel] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const debounced = useDebounce(searchTerm, 300);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`*,
          clients:clients!contracts_cliente_id_fkey(nome),
          employees(nome),
          proprietario_vinculado:clients!contracts_proprietario_vinculado_id_fkey(nome),
          inquilino_vinculado:clients!contracts_inquilino_vinculado_id_fkey(nome)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: documentCounts = {} } = useQuery({
    queryKey: ['contract-doc-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('documents').select('contrato_id').not('contrato_id', 'is', null);
      const counts: Record<string, number> = {};
      (data || []).forEach((d: any) => (counts[d.contrato_id] = (counts[d.contrato_id] || 0) + 1));
      return counts;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['contracts'] });
    queryClient.invalidateQueries({ queryKey: ['contract-doc-counts'] });
  };

  const inquilinosPorProprietario = useMemo(() => {
    const m: Record<string, number> = {};
    contracts.forEach((c: any) => {
      if (c.categoria === 'inquilino' && c.proprietario_vinculado_id) m[c.proprietario_vinculado_id] = (m[c.proprietario_vinculado_id] || 0) + 1;
    });
    return m;
  }, [contracts]);

  const clienteNome = (c: any) =>
    c.categoria === 'funcionario' ? c.employees?.nome || 'N/A' : c.categoria === 'parceria' ? c.parceria_nome || 'N/A' : c.clients?.nome || 'N/A';

  const filtered = useMemo(() => {
    const t = debounced.toLowerCase();
    return contracts.filter((c: any) => {
      const matches = !t || [c.codigo, clienteNome(c), c.endereco_imovel, c.tipo, c.contato_vinculado].some((x) => x?.toLowerCase().includes(t));
      const matchesStatus = statusFilter === 'todos' || c.status_contrato === statusFilter;
      if (activeTab === 'arquivados') return matches && c.arquivado && matchesStatus;
      if (activeTab === 'todos') return matches && !c.arquivado && matchesStatus;
      return matches && c.categoria === activeTab && !c.arquivado && matchesStatus;
    });
  }, [contracts, debounced, statusFilter, activeTab]);

  const pg = usePagination({ data: filtered, itemsPerPage: 10 });
  const proximosVencimento = contracts.filter((c: any) => precisaNotificar(c.data_inicio, c.prazo_meses) && !c.arquivado && c.status === 'ativo').length;

  const confirmArchive = async () => {
    const { error } = await supabase.from('contracts').update({ arquivado: archive.archive }).eq('id', archive.id);
    if (error) toast.error(friendlyError(error, 'Erro ao arquivar contrato'));
    else {
      toast.success(archive.archive ? 'Contrato arquivado!' : 'Contrato desarquivado!');
      refresh();
    }
    setArchive({ open: false, id: '', archive: true });
  };

  const confirmDelete = async () => {
    const contract = contracts.find((c: any) => c.id === del.id);
    const { data: docs } = await supabase.from('documents').select('url').eq('contrato_id', del.id);
    const { error } = await supabase.from('contracts').delete().eq('id', del.id);
    if (error) toast.error(friendlyError(error, 'Erro ao excluir contrato'));
    else {
      // Limpa os arquivos guardados (documentos são apagados junto pelo banco)
      await Promise.all([...(docs || []).map((d: any) => removePrivateFile(d.url)), removePrivateFile(contract?.arquivo_url)]);
      toast.success('Contrato excluído com sucesso!');
      refresh();
    }
    setDel({ open: false, id: '' });
  };

  const openNew = () => {
    setNewCategoria(['inquilino', 'proprietario', 'funcionario', 'parceria'].includes(activeTab) ? (activeTab as ContratoCategoria) : 'inquilino');
    setNewOpen(true);
  };

  const tabs = [
    ['todos', 'Todos', FileText], ['inquilino', 'Inquilinos', Users], ['proprietario', 'Proprietários', Users],
    ['funcionario', 'Funcionários', Briefcase], ['parceria', 'Parcerias', Handshake], ['arquivados', 'Arquivados', Archive],
  ] as const;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Contratos</h1>
            <p className="text-muted-foreground">Gerencie todos os contratos da imobiliária</p>
          </div>
          {proximosVencimento > 0 && (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="text-sm text-yellow-700 font-medium">{proximosVencimento} contrato(s) próximo(s) do vencimento</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por código, cliente, endereço, contato..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Status</SelectItem>
              {STATUS_CONTRATO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start lg:grid lg:grid-cols-6">
            {tabs.map(([v, l, Icon]) => (
              <TabsTrigger key={v} value={v} className="flex items-center gap-2"><Icon className="h-4 w-4" />{l}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          {canCreate('contratos') && (
            <div className="flex justify-end">
              <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo Contrato</Button>
            </div>
          )}

          {isLoading ? (
            <ListSkeleton count={5} />
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum contrato encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4">
                {pg.paginatedData.map((c: any) => {
                  const meses = mesesRestantes(c.data_fim);
                  const notificar = precisaNotificar(c.data_inicio, c.prazo_meses);
                  const Icon = categoriaIcon[c.categoria] || FileText;
                  return (
                    <Card key={c.id} className={`hover:shadow-md transition-shadow ${notificar ? 'border-yellow-500/50' : ''}`}>
                      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon className="h-4 w-4" />
                          <CardTitle className="text-base font-medium">{clienteNome(c)}</CardTitle>
                          <Badge variant="outline" className="text-xs">{categoriaLabel[c.categoria]}</Badge>
                          {c.status_contrato && <Badge variant="outline" className={statusContratoColor[c.status_contrato]}>{statusContratoLabel(c.status_contrato)}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          {meses !== null && (
                            <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${meses <= 1 ? 'bg-red-500/20 text-red-700' : meses <= 3 ? 'bg-yellow-500/20 text-yellow-700' : 'bg-green-500/20 text-green-700'}`}>
                              <Clock className="h-3 w-3" />
                              {meses} {meses === 1 ? 'mês' : 'meses'}
                            </div>
                          )}
                          <Badge className={`${statusColor[c.status] || 'bg-gray-500'} hover:${statusColor[c.status] || 'bg-gray-500'}`}>{c.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {c.categoria === 'inquilino' && c.proprietario_vinculado && (
                            <div className="flex items-center text-sm bg-blue-500/10 p-2 rounded">
                              <Users className="mr-2 h-4 w-4 text-blue-600" />
                              <span className="font-medium text-blue-700">Proprietário:</span>
                              <span className="ml-2 text-blue-600">{c.proprietario_vinculado.nome}</span>
                            </div>
                          )}
                          {c.categoria === 'proprietario' && c.inquilino_vinculado && (
                            <div className="flex items-center text-sm bg-purple-500/10 p-2 rounded">
                              <Users className="mr-2 h-4 w-4 text-purple-600" />
                              <span className="font-medium text-purple-700">Inquilino:</span>
                              <span className="ml-2 text-purple-600">{c.inquilino_vinculado.nome}</span>
                            </div>
                          )}
                          {c.categoria === 'proprietario' && c.cliente_id && inquilinosPorProprietario[c.cliente_id] > 0 && (
                            <div className="flex items-center text-sm bg-green-500/10 p-2 rounded">
                              <Users className="mr-2 h-4 w-4 text-green-600" />
                              <span className="font-medium text-green-700">{inquilinosPorProprietario[c.cliente_id]} inquilino(s) vinculado(s)</span>
                            </div>
                          )}
                          {c.tipo_imovel && <div className="text-sm"><span className="font-medium">Tipo Imóvel:</span><span className="ml-2 text-muted-foreground capitalize">{c.tipo_imovel}</span></div>}
                          {c.contato_vinculado && <div className="text-sm"><span className="font-medium">Contato:</span><span className="ml-2 text-muted-foreground">{c.contato_vinculado}</span></div>}
                          {c.endereco_imovel && (
                            <div className="flex items-center text-sm">
                              <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">{c.endereco_imovel}{c.numero_unidade && `, ${c.numero_unidade}`}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm pt-2 flex-wrap gap-2">
                            <div className="flex items-center gap-4 flex-wrap">
                              {c.data_inicio && <div className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Início: {formatDateBR(c.data_inicio)}</span></div>}
                              {c.data_fim && <div className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Encerramento: {formatDateBR(c.data_fim)}</span></div>}
                              {c.data_pagamento_acordado && <span className="text-xs text-muted-foreground">Pgto dia {c.data_pagamento_acordado}</span>}
                            </div>
                            {c.valor ? <span className="font-bold text-primary">{formatCurrency(c.valor)}</span> : null}
                          </div>
                          <div className="flex items-center gap-2 pt-2 flex-wrap">
                            <Button size="sm" onClick={() => setDetails(c)}><FolderOpen className="mr-2 h-4 w-4" />Documentos ({documentCounts[c.id] || 0})</Button>
                            {c.arquivo_url && <Button size="sm" variant="outline" onClick={() => openStoredFile(c.arquivo_url)}><Eye className="mr-2 h-4 w-4" />Ver Contrato</Button>}
                            {canUpdate('contratos') && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
                                <Button size="sm" variant="outline" onClick={() => setArchive({ open: true, id: c.id, archive: !c.arquivado })}>
                                  {!c.arquivado && <Archive className="mr-2 h-4 w-4" />}
                                  {c.arquivado ? 'Desarquivar' : 'Arquivar'}
                                </Button>
                              </>
                            )}
                            {canDelete('contratos') && (
                              <Button size="sm" variant="destructive" onClick={() => setDel({ open: true, id: c.id })}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <PaginationControls
                currentPage={pg.currentPage} totalPages={pg.totalPages} totalItems={pg.totalItems} startIndex={pg.startIndex} endIndex={pg.endIndex}
                itemsPerPage={pg.itemsPerPage} onPageChange={pg.goToPage} onItemsPerPageChange={pg.setItemsPerPage}
              />
            </>
          )}
        </div>

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Contrato - {categoriaLabel[newCategoria]}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Selecione a categoria do contrato:</p>
              <div className="grid grid-cols-2 gap-4">
                {(['inquilino', 'proprietario', 'funcionario', 'parceria'] as const).map((cat) => {
                  const Icon = categoriaIcon[cat];
                  return (
                    <Button key={cat} type="button" variant={newCategoria === cat ? 'default' : 'outline'} className="h-16 sm:h-20" onClick={() => setNewCategoria(cat)}>
                      <Icon className="mr-2 h-5 w-5" />{categoriaLabel[cat]}
                    </Button>
                  );
                })}
              </div>
              <ContratoForm key={newCategoria} categoria={newCategoria} onSuccess={() => { setNewOpen(false); refresh(); }} />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Editar Contrato - {editing?.codigo}</DialogTitle></DialogHeader>
            {editing && <ContratoForm categoria={editing.categoria} contratoId={editing.id} onSuccess={() => { setEditing(null); refresh(); }} />}
          </DialogContent>
        </Dialog>

        <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-6"><FileText className="h-5 w-5" />Detalhes do Contrato - {details?.codigo}</DialogTitle>
            </DialogHeader>
            {details && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><label className="text-muted-foreground block">Cliente</label><p className="font-medium">{clienteNome(details)}</p></div>
                  <div><label className="text-muted-foreground block">Categoria</label><Badge variant="outline">{categoriaLabel[details.categoria]}</Badge></div>
                  {details.endereco_imovel && <div className="col-span-2"><label className="text-muted-foreground block">Endereço</label><p className="font-medium">{details.endereco_imovel}{details.numero_unidade && `, ${details.numero_unidade}`}</p></div>}
                  {details.data_inicio && <div><label className="text-muted-foreground block">Data Início</label><p className="font-medium">{formatDateBR(details.data_inicio)}</p></div>}
                  {details.data_fim && <div><label className="text-muted-foreground block">Data Encerramento</label><p className="font-medium">{formatDateBR(details.data_fim)}</p></div>}
                  {details.valor ? <div><label className="text-muted-foreground block">Valor</label><p className="font-medium text-primary">{formatCurrency(details.valor)}</p></div> : null}
                  {details.status_contrato && <div><label className="text-muted-foreground block">Status</label><Badge variant="outline" className={statusContratoColor[details.status_contrato]}>{statusContratoLabel(details.status_contrato)}</Badge></div>}
                </div>
                <ContractDocumentUpload
                  contratoId={details.id}
                  clienteId={details.cliente_id}
                  endereco={details.endereco_imovel || undefined}
                  canEdit={canUpdate('contratos')}
                  onDocumentChange={() => queryClient.invalidateQueries({ queryKey: ['contract-doc-counts'] })}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={archive.open}
          onOpenChange={(open) => setArchive((a) => ({ ...a, open }))}
          onConfirm={confirmArchive}
          title={archive.archive ? 'Arquivar Contrato' : 'Desarquivar Contrato'}
          description={archive.archive ? 'Tem certeza que deseja arquivar este contrato? Ele será movido para a aba de arquivados.' : 'Tem certeza que deseja desarquivar este contrato?'}
          confirmText={archive.archive ? 'Arquivar' : 'Desarquivar'}
          variant="warning"
        />
        <ConfirmDialog
          open={del.open}
          onOpenChange={(open) => setDel((d) => ({ ...d, open }))}
          onConfirm={confirmDelete}
          title="Excluir Contrato"
          description="Tem certeza que deseja excluir este contrato? Todos os documentos vinculados também serão removidos. Esta ação não pode ser desfeita."
          confirmText="Excluir"
        />
      </div>
    </DashboardLayout>
  );
};

export default Contratos;
