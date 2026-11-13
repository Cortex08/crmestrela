import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { FolderOpen, Search, FileText, Eye, File, DollarSign, User, Home, Archive, Camera, Clock, Upload, MoreHorizontal, Trash2, ArchiveRestore } from 'lucide-react';
import { toast } from 'sonner';
import { DocumentUploadDialog } from '@/components/forms/DocumentUploadDialog';
import { usePermissions } from '@/contexts/PermissionsContext';
import { openStoredFile, removePrivateFile } from '@/lib/storage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeleton } from '@/components/ui/loading';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { friendlyError } from '@/lib/utils';

const TIPO_DOC: Record<string, string> = {
  rg: 'RG', cpf: 'CPF', cnh: 'CNH', contrato: 'Contrato', contrato_assinado: 'Contrato Assinado', comprovante: 'Comprovante',
  impressao: 'Impressão', solicitacao: 'Solicitação', boleto: 'Boleto', recibo: 'Recibo', doc_imovel: 'Doc. Imóvel',
  foto_vistoria: 'Vistoria', arquivo_interno: 'Arquivo Interno', arquivo_morto: 'Arquivo Morto',
};
const CATEGORIA: Record<string, string> = {
  contratos: 'Contratos', documentos_pessoais: 'Documentos Pessoais', financeiro: 'Financeiro',
  juridico: 'Jurídico', administrativo: 'Administrativo', arquivo_morto: 'Arquivo Morto',
};
const STATUS_COLOR: Record<string, string> = { ativo: 'bg-green-500', vencido: 'bg-red-500', arquivado: 'bg-gray-500' };

const TABS: [string, string, any][] = [
  ['todos', 'Todos', FileText], ['contratos', 'Contratos', File], ['financeiro', 'Financeiro', DollarSign],
  ['pessoais', 'Pessoais', User], ['imovel', 'Imóvel', Home], ['arquivo_morto', 'Arquivo Morto', Archive],
  ['vistorias', 'Vistorias', Camera], ['recentes', 'Recentes', Clock],
];

const matchTab = (doc: any, tab: string) => {
  switch (tab) {
    case 'contratos': return doc.categoria === 'contratos';
    case 'financeiro': return doc.categoria === 'financeiro';
    case 'pessoais': return doc.categoria === 'documentos_pessoais';
    case 'imovel': return doc.tipo === 'doc_imovel' || doc.categoria === 'juridico';
    case 'arquivo_morto': return doc.status === 'arquivado' || doc.categoria === 'arquivo_morto';
    case 'vistorias': return doc.tipo === 'foto_vistoria';
    case 'recentes': return Date.now() - new Date(doc.created_at).getTime() <= 30 * 864e5;
    default: return true;
  }
};

const Documentos = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('todos');
  const [del, setDel] = useState<any>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('*, clients(nome, tipo)').order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      return data || [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['documents'] });

  const searched = useMemo(
    () => (!search ? documents : documents.filter((d: any) =>
      [d.nome, TIPO_DOC[d.tipo] || d.tipo, CATEGORIA[d.categoria] || d.categoria, d.clients?.nome, d.endereco]
        .some((v) => (v || '').toLowerCase().includes(search)))),
    [documents, search],
  );
  const filtered = useMemo(() => searched.filter((d: any) => matchTab(d, activeTab)), [searched, activeTab]);
  const pg = usePagination({ data: filtered, itemsPerPage: 20 });

  const setStatus = async (doc: any, status: string) => {
    const { error } = await supabase.from('documents').update({ status }).eq('id', doc.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao atualizar documento'));
    toast.success(status === 'arquivado' ? 'Documento arquivado' : 'Documento reativado');
    refresh();
  };

  const remove = async () => {
    const doc = del;
    const { error } = await supabase.from('documents').delete().eq('id', doc.id);
    setDel(null);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir documento'));
    await removePrivateFile(doc.url);
    toast.success('Documento excluído');
    refresh();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">📂 Documentos</h1>
            <p className="text-muted-foreground">Gerencie todos os documentos da imobiliária</p>
          </div>
          {canCreate('documentos') && (
            <Button onClick={() => setDialogOpen(true)}><Upload className="mr-2 h-4 w-4" /> Enviar Documento</Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, tipo, categoria ou cliente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto w-full justify-start">
            {TABS.map(([v, l, Icon]) => (
              <TabsTrigger key={v} value={v} className="flex items-center gap-2">
                <Icon className="h-4 w-4" /> {l} <span className="text-xs text-muted-foreground">({searched.filter((d: any) => matchTab(d, v)).length})</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4 mt-6">
            {isLoading ? (
              <ListSkeleton count={5} />
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum documento encontrado</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4">
                  {pg.paginatedData.map((doc: any) => (
                    <Card key={doc.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                          <div className="flex items-start space-x-4 flex-1 min-w-0">
                            <FileText className="h-6 w-6 text-primary mt-1 shrink-0" />
                            <div className="flex-1 space-y-2 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-lg break-words">{doc.nome}</h3>
                                <Badge variant="outline" className="text-xs">{TIPO_DOC[doc.tipo] || doc.tipo || '—'}</Badge>
                                <Badge className={STATUS_COLOR[doc.status] || 'bg-gray-500'}>{doc.status}</Badge>
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                {doc.clients && <p className="flex items-center gap-2"><User className="h-4 w-4" /><span className="font-medium">Cliente:</span> {doc.clients.nome}</p>}
                                {doc.endereco && <p className="flex items-center gap-2"><Home className="h-4 w-4" /><span className="font-medium">Endereço:</span> {doc.endereco}</p>}
                                <p className="flex items-center gap-2"><FolderOpen className="h-4 w-4" /><span className="font-medium">Categoria:</span> {CATEGORIA[doc.categoria] || doc.categoria}</p>
                                {doc.enviado_por && <p className="flex items-center gap-2"><User className="h-4 w-4" /><span className="font-medium">Enviado por:</span> {doc.enviado_por}</p>}
                                <p className="flex items-center gap-2"><Clock className="h-4 w-4" /><span className="font-medium">Data:</span> {new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>
                                {doc.observacoes && <p className="mt-2 p-2 bg-muted rounded-md whitespace-pre-wrap break-words"><span className="font-medium">Obs:</span> {doc.observacoes}</p>}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="sm" onClick={() => openStoredFile(doc.url)}><Eye className="mr-2 h-4 w-4" /> Visualizar</Button>
                            {(canUpdate('documentos') || canDelete('documentos')) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canUpdate('documentos') && (doc.status === 'arquivado' ? (
                                    <DropdownMenuItem onClick={() => setStatus(doc, 'ativo')}><ArchiveRestore className="mr-2 h-4 w-4" /> Reativar</DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => setStatus(doc, 'arquivado')}><Archive className="mr-2 h-4 w-4" /> Arquivar</DropdownMenuItem>
                                  ))}
                                  {canDelete('documentos') && (
                                    <DropdownMenuItem className="text-red-600" onClick={() => setDel(doc)}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <PaginationControls
                  currentPage={pg.currentPage} totalPages={pg.totalPages} totalItems={pg.totalItems}
                  startIndex={pg.startIndex} endIndex={pg.endIndex} itemsPerPage={pg.itemsPerPage}
                  onPageChange={pg.goToPage} onItemsPerPageChange={pg.setItemsPerPage} itemsPerPageOptions={[20, 50, 100]}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <DocumentUploadDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={refresh} showTrigger={false} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        onConfirm={remove}
        title="Excluir documento"
        description={`Excluir "${del?.nome}"? O arquivo será apagado e esta ação não pode ser desfeita.`}
        confirmText="Excluir"
      />
    </DashboardLayout>
  );
};

export default Documentos;
