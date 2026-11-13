import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, User, Phone, Mail, MessageSquare, Home, Calendar, DollarSign, FileText, CheckCircle2, Eye, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { openStoredFile } from '@/lib/storage';
import { ClienteForm } from '@/components/forms/ClienteForm';
import { DocumentUploadDialog } from '@/components/forms/DocumentUploadDialog';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { CardSkeleton, TableSkeleton } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatCurrency, formatDateBR, friendlyError } from '@/lib/utils';

type Tipo = 'todos' | 'inquilino' | 'proprietario' | 'interessado';

const tipoLabel: Record<string, string> = { inquilino: 'Inquilino', proprietario: 'Proprietário', interessado: 'Lead' };
const statusContrato: Record<string, [string, string]> = {
  em_contrato: ['Em Contrato', 'bg-green-500/10 text-green-700 border-green-500/20'],
  finalizado: ['Finalizado', 'bg-gray-500/10 text-gray-700 border-gray-500/20'],
  em_atraso: ['Em Atraso', 'bg-red-500/10 text-red-700 border-red-500/20'],
};
const tipoImovelBadge = (t: string) => (
  <Badge variant="outline" className={t === 'residencial' ? 'bg-purple-500/10 text-purple-700 border-purple-500/20' : 'bg-green-500/10 text-green-700 border-green-500/20'}>
    {t === 'residencial' ? 'Residencial' : 'Comercial'}
  </Badge>
);

const Clientes = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [tipo, setTipo] = useState<Tipo>('interessado');
  const [selected, setSelected] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [del, setDel] = useState<{ open: boolean; id: string; nome: string }>({ open: false, id: '', nome: '' });
  const debounced = useDebounce(searchTerm, 300);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: related, refetch: refetchRelated } = useQuery({
    queryKey: ['client-related', selected?.id],
    enabled: !!selected?.id && detailOpen,
    queryFn: async () => {
      const cols = 'id, codigo, tipo, status, valor, data_inicio, data_fim, endereco_imovel, numero_unidade, arquivo_url, cliente_id, proprietario_vinculado_id, cliente:clients!contracts_cliente_id_fkey(nome)';
      const [c, d] = await Promise.all([
        // contratos do próprio cliente + contratos dos inquilinos ligados a ele (quando é proprietário)
        supabase.from('contracts').select(cols).or(`cliente_id.eq.${selected.id},proprietario_vinculado_id.eq.${selected.id}`).order('created_at', { ascending: false }),
        supabase.from('documents').select('id, nome, tipo, url').eq('cliente_id', selected.id).order('created_at', { ascending: false }),
      ]);
      const ids = (c.data || []).map((x: any) => x.id);
      const cd = ids.length ? await supabase.from('documents').select('id, nome, tipo, url, contrato_id').in('contrato_id', ids) : { data: [] as any[] };
      const docsByContract: Record<string, any[]> = {};
      (cd.data || []).forEach((x: any) => { (docsByContract[x.contrato_id] ||= []).push(x); });
      return { contracts: c.data || [], documents: d.data || [], docsByContract };
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['clients'] });

  const counts = useMemo(() => ({
    interessado: clients.filter((c: any) => c.tipo === 'interessado').length,
    inquilino: clients.filter((c: any) => c.tipo === 'inquilino').length,
    proprietario: clients.filter((c: any) => c.tipo === 'proprietario').length,
  }), [clients]);

  const filtered = useMemo(() => {
    const t = debounced.toLowerCase();
    const digits = debounced.replace(/\D/g, '');
    return clients.filter((c: any) => {
      const matches = !t || c.nome?.toLowerCase().includes(t) || c.email?.toLowerCase().includes(t) ||
        (digits && (c.cpf_cnpj?.replace(/\D/g, '').includes(digits) || c.telefone?.replace(/\D/g, '').includes(digits) || c.whatsapp?.replace(/\D/g, '').includes(digits)));
      return matches && (tipo === 'todos' || c.tipo === tipo);
    });
  }, [clients, debounced, tipo]);

  const pg = usePagination({ data: filtered, itemsPerPage: 12 });

  const openClient = (c: any) => {
    setSelected(c);
    setDetailOpen(true);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('clients').delete().eq('id', del.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir cliente'));
    toast.success('Cliente excluído com sucesso!');
    setDel({ open: false, id: '', nome: '' });
    setDetailOpen(false);
    refresh();
  };

  const deleteBtn = (c: any) =>
    canDelete('clientes') && (
      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDel({ open: true, id: c.id, nome: c.nome }); }} aria-label="Excluir">
        <Trash2 className="h-4 w-4" />
      </Button>
    );

  const clientCard = (c: any) => (
    <Card key={c.id} className="card-premium cursor-pointer hover:shadow-lg transition-shadow" onClick={() => openClient(c)}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{c.nome}</CardTitle>
            <Badge variant="outline" className="mt-2">{tipoLabel[c.tipo]}</Badge>
          </div>
          {deleteBtn(c)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {c.email && <div className="flex items-center text-sm text-muted-foreground"><Mail className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{c.email}</span></div>}
        {c.telefone && <div className="flex items-center text-sm text-muted-foreground"><Phone className="mr-2 h-4 w-4" />{c.telefone}</div>}
        {c.interesse && <p className="text-sm text-muted-foreground"><strong>Interesse:</strong> {c.interesse}</p>}
        {hasValidWhatsapp(c.whatsapp) && (
          <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); openWhatsapp(c.whatsapp); }}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Abrir WhatsApp
          </Button>
        )}
      </CardContent>
    </Card>
  );

  const empty = (label: string) => (
    <Card className="card-premium">
      <CardContent className="py-12 text-center">
        <User className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Nenhum {label} encontrado</p>
      </CardContent>
    </Card>
  );

  const pagination = (
    <PaginationControls
      currentPage={pg.currentPage} totalPages={pg.totalPages} totalItems={pg.totalItems} startIndex={pg.startIndex} endIndex={pg.endIndex}
      itemsPerPage={pg.itemsPerPage} onPageChange={pg.goToPage} onItemsPerPageChange={pg.setItemsPerPage} itemsPerPageOptions={[12, 24, 48]}
    />
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Clientes</h1>
            <p className="text-muted-foreground">Gerenciar clientes e leads</p>
          </div>
          {canCreate('clientes') && <ClienteForm onSuccess={refresh} />}
        </div>

        <Card className="card-premium">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, email, CPF/CNPJ, telefone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </CardContent>
        </Card>

        <Tabs value={tipo} onValueChange={(v: any) => setTipo(v)}>
          <TabsList>
            <TabsTrigger value="interessado">Leads ({counts.interessado})</TabsTrigger>
            <TabsTrigger value="inquilino">Inquilinos ({counts.inquilino})</TabsTrigger>
            <TabsTrigger value="proprietario">Proprietários ({counts.proprietario})</TabsTrigger>
            <TabsTrigger value="todos">Todos ({clients.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div>
          {isLoading ? (
            tipo === 'inquilino' ? <TableSkeleton rows={5} cols={4} /> : <CardSkeleton count={6} />
          ) : filtered.length === 0 ? (
            empty(tipo === 'interessado' ? 'lead' : tipo === 'inquilino' ? 'inquilino' : tipo === 'proprietario' ? 'proprietário' : 'cliente')
          ) : tipo === 'inquilino' ? (
            <Card className="card-premium">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">DOC</TableHead>
                      <TableHead className="text-right">Valor do Aluguel</TableHead>
                      {canDelete('clientes') && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pg.paginatedData.map((c: any) => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => openClient(c)}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell>{c.tipo_imovel ? tipoImovelBadge(c.tipo_imovel) : <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                        <TableCell className="text-center">
                          {c.doc_completo ? <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" /> : <div className="h-5 w-5 rounded border-2 border-muted-foreground/30 mx-auto" />}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(c.valor_aluguel)}</TableCell>
                        {canDelete('clientes') && <TableCell>{deleteBtn(c)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {pagination}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{pg.paginatedData.map(clientCard)}</div>
              {pagination}
            </>
          )}
        </div>

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl pr-6">{selected?.nome}</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-6 mt-2">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground block">Tipo de Cliente</label>
                    <Badge variant="outline" className="mt-1">{tipoLabel[selected.tipo]}</Badge>
                  </div>
                  {selected.tipo === 'inquilino' && selected.tipo_imovel && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground block">Tipo de Imóvel</label>
                      <div className="mt-1">{tipoImovelBadge(selected.tipo_imovel)}</div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {selected.email && <div><label className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Mail className="h-4 w-4" />Email</label><p className="mt-1 break-all">{selected.email}</p></div>}
                  {selected.telefone && <div><label className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Phone className="h-4 w-4" />Telefone</label><p className="mt-1">{selected.telefone}</p></div>}
                  {selected.whatsapp && <div><label className="text-sm font-medium text-muted-foreground flex items-center gap-2"><MessageSquare className="h-4 w-4" />WhatsApp</label><p className="mt-1">{selected.whatsapp}</p></div>}
                  {selected.cpf_cnpj && <div><label className="text-sm font-medium text-muted-foreground">CPF/CNPJ</label><p className="mt-1">{selected.cpf_cnpj}</p></div>}
                </div>

                {selected.tipo === 'inquilino' && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2"><Home className="h-5 w-5" />Informações do Contrato</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">DOC Completo</label>
                        <div className="mt-1 flex items-center gap-2">
                          {selected.doc_completo ? <><CheckCircle2 className="h-5 w-5 text-green-600" /><span className="text-green-600">Sim</span></> : <span className="text-muted-foreground">Não</span>}
                        </div>
                      </div>
                      {selected.valor_aluguel && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Valor do Aluguel</label>
                          <p className="mt-1 font-semibold text-lg">{formatCurrency(selected.valor_aluguel)}</p>
                        </div>
                      )}
                      {selected.dia_pgto_aluguel && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" />Dia do Pagamento</label>
                          <p className="mt-1">Todo dia {selected.dia_pgto_aluguel}</p>
                        </div>
                      )}
                      {selected.status_contrato && statusContrato[selected.status_contrato] && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground block">Status do Contrato</label>
                          <Badge variant="outline" className={`mt-1 ${statusContrato[selected.status_contrato][1]}`}>{statusContrato[selected.status_contrato][0]}</Badge>
                        </div>
                      )}
                    </div>
                    {selected.endereco_imovel && (
                      <div className="mt-4">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Home className="h-4 w-4" />Endereço do Imóvel</label>
                        <p className="mt-1">{selected.endereco_imovel}</p>
                      </div>
                    )}
                    {selected.anotacoes_inquilino && (
                      <div className="mt-4">
                        <label className="text-sm font-medium text-muted-foreground">Anotações</label>
                        <p className="mt-1 text-sm bg-muted p-3 rounded whitespace-pre-wrap">{selected.anotacoes_inquilino}</p>
                      </div>
                    )}
                  </div>
                )}

                {selected.tipo === 'interessado' && (selected.interesse || selected.origem_lead) && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold text-lg mb-4">Informações do Lead</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {selected.interesse && <div><label className="text-sm font-medium text-muted-foreground">Interesse</label><p className="mt-1">{selected.interesse}</p></div>}
                      {selected.origem_lead && <div><label className="text-sm font-medium text-muted-foreground">Origem</label><p className="mt-1">{selected.origem_lead}</p></div>}
                    </div>
                  </div>
                )}

                {(related?.contracts?.length ?? 0) > 0 && (() => {
                  const proprios = related!.contracts.filter((c: any) => c.cliente_id === selected.id);
                  const dosInquilinos = related!.contracts.filter((c: any) => c.cliente_id !== selected.id);
                  const ativos = dosInquilinos.filter((c: any) => c.status === 'ativo');
                  const totalMes = ativos.reduce((t: number, c: any) => t + Number(c.valor || 0), 0);
                  const linha = (c: any, mostrarInquilino: boolean) => (
                    <div key={c.id} className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{c.codigo}{mostrarInquilino && c.cliente?.nome ? ` — ${c.cliente.nome}` : ''}</p>
                          <p className="text-sm text-muted-foreground truncate">{[c.tipo, c.endereco_imovel, c.numero_unidade].filter(Boolean).join(' • ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.valor ? formatCurrency(c.valor) : ''}{c.data_inicio ? ` • início ${formatDateBR(c.data_inicio)}` : ''}{c.data_fim ? ` • fim ${formatDateBR(c.data_fim)}` : ''}
                          </p>
                        </div>
                        <Badge>{c.status}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {c.arquivo_url && <Button size="sm" variant="outline" onClick={() => openStoredFile(c.arquivo_url)}><Eye className="h-4 w-4 mr-1" />Ler contrato</Button>}
                        {(related!.docsByContract?.[c.id] || []).map((d: any) => (
                          <Button key={d.id} size="sm" variant="outline" onClick={() => openStoredFile(d.url)}><FileText className="h-4 w-4 mr-1" />{d.nome}</Button>
                        ))}
                        {!c.arquivo_url && !(related!.docsByContract?.[c.id] || []).length && <span className="text-xs text-muted-foreground">Sem arquivo anexado</span>}
                      </div>
                    </div>
                  );
                  return (
                    <div className="border-t pt-4 space-y-4">
                      {dosInquilinos.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-lg mb-1 flex items-center gap-2"><FileText className="h-5 w-5" />Contratos dos inquilinos ({dosInquilinos.length})</h3>
                          <p className="text-sm text-muted-foreground mb-3">{ativos.length} ativo(s){totalMes > 0 ? ` • ${formatCurrency(totalMes)} em aluguéis por mês` : ''}</p>
                          <div className="space-y-2">{dosInquilinos.map((c: any) => linha(c, true))}</div>
                        </div>
                      )}
                      {proprios.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><FileText className="h-5 w-5" />Contratos ({proprios.length})</h3>
                          <div className="space-y-2">{proprios.map((c: any) => linha(c, false))}</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2"><FolderOpen className="h-5 w-5" />Documentos ({related?.documents?.length ?? 0})</h3>
                    {canUpdate('clientes') && (
                      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} clienteId={selected.id} onSuccess={() => refetchRelated()} />
                    )}
                  </div>
                  {(related?.documents?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      {related!.documents.map((d: any) => (
                        <div key={d.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="min-w-0"><p className="font-medium truncate">{d.nome}</p><p className="text-sm text-muted-foreground">{d.tipo || 'Documento'}</p></div>
                          <Button size="sm" variant="outline" onClick={() => openStoredFile(d.url)}><Eye className="h-4 w-4 mr-1" />Ver</Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Nenhum documento anexado</p>
                  )}
                </div>

                {selected.observacoes && (
                  <div className="border-t pt-4">
                    <label className="text-sm font-medium text-muted-foreground">Observações</label>
                    <p className="mt-1 text-sm bg-muted p-3 rounded whitespace-pre-wrap">{selected.observacoes}</p>
                  </div>
                )}

                <div className="border-t pt-4 flex flex-wrap gap-2">
                  {hasValidWhatsapp(selected.whatsapp) && (
                    <Button variant="outline" onClick={() => openWhatsapp(selected.whatsapp)}><MessageSquare className="mr-2 h-4 w-4" />WhatsApp</Button>
                  )}
                  {canUpdate('clientes') && (
                    <Button variant="outline" onClick={() => { setDetailOpen(false); setEditing(selected); }}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
                  )}
                  {canDelete('clientes') && (
                    <Button variant="destructive" onClick={() => setDel({ open: true, id: selected.id, nome: selected.nome })}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="pr-6">Editar Cliente - {editing?.nome}</DialogTitle>
            </DialogHeader>
            {editing && <ClienteForm clienteId={editing.id} embedMode onSuccess={() => { setEditing(null); refresh(); }} />}
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={del.open}
          onOpenChange={(open) => setDel((d) => ({ ...d, open }))}
          onConfirm={handleDelete}
          title="Excluir Cliente"
          description={`Tem certeza que deseja excluir "${del.nome}"? Contratos e documentos vinculados também serão removidos. Esta ação não pode ser desfeita.`}
          confirmText="Excluir"
        />
      </div>
    </DashboardLayout>
  );
};

export default Clientes;
