import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import OcorrenciaForm, { TIPOS_OCORRENCIA, STATUS_OCORRENCIA, PRIORIDADE_OCORRENCIA } from '@/components/forms/OcorrenciaForm';
import { usePermissions } from '@/contexts/PermissionsContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListSkeleton } from '@/components/ui/loading';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { formatCurrency, formatDateBR, friendlyError } from '@/lib/utils';

const statusVariant: Record<string, any> = { em_aberto: 'destructive', em_andamento: 'default', resolvido: 'secondary' };
const prioridadeVariant: Record<string, any> = { baixa: 'secondary', media: 'default', alta: 'destructive', urgente: 'destructive' };

export default function Ocorrencias() {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [statusFilter, setStatusFilter] = useState('all');
  const [prioridadeFilter, setPrioridadeFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [del, setDel] = useState<any>(null);

  const { data: ocorrencias = [], isLoading } = useQuery({
    queryKey: ['property_incidents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_incidents')
        .select('*, inquilino:clients!property_incidents_inquilino_id_fkey(nome, whatsapp), imovel:properties!property_incidents_imovel_id_fkey(codigo, endereco, bairro, cidade), tecnico:profiles!property_incidents_tecnico_responsavel_id_fkey(nome)')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(
    () =>
      ocorrencias.filter((o: any) => {
        const s = !search || [o.numero, o.inquilino?.nome, o.imovel?.endereco, o.imovel?.codigo].some((v) => (v || '').toLowerCase().includes(search));
        return s && (statusFilter === 'all' || o.status === statusFilter)
          && (prioridadeFilter === 'all' || o.prioridade === prioridadeFilter)
          && (tipoFilter === 'all' || o.tipo === tipoFilter);
      }),
    [ocorrencias, search, statusFilter, prioridadeFilter, tipoFilter],
  );
  const pg = usePagination({ data: filtered, itemsPerPage: 20 });

  const counts = useMemo(() => {
    const c: Record<string, number> = { em_aberto: 0, em_andamento: 0, resolvido: 0 };
    ocorrencias.forEach((o: any) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [ocorrencias]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['property_incidents'] });
  const open = (o?: any) => { setSelected(o || null); setDialogOpen(true); };
  const close = () => { setDialogOpen(false); setSelected(null); refresh(); };

  const remove = async () => {
    const { error } = await supabase.from('property_incidents').delete().eq('id', del.id);
    if (error) toast.error(friendlyError(error, 'Erro ao excluir ocorrência'));
    else toast.success('Ocorrência excluída');
    setDel(null);
    refresh();
  };

  const hasFilters = searchTerm || statusFilter !== 'all' || prioridadeFilter !== 'all' || tipoFilter !== 'all';
  const readOnly = !!selected && !canUpdate('ocorrencias');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Ocorrências Imobiliárias</h1>
            <p className="text-muted-foreground">Gerencie todas as ocorrências e manutenções dos imóveis</p>
          </div>
          {canCreate('ocorrencias') && (
            <Button onClick={() => open()} size="lg"><Plus className="mr-2 h-4 w-4" /> Nova Ocorrência</Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {Object.entries(STATUS_OCORRENCIA).map(([k, l]) => (
            <Card key={k} className="card-premium cursor-pointer" onClick={() => setStatusFilter(statusFilter === k ? 'all' : k)}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{l}</p>
                <p className={`text-2xl font-bold ${k === 'em_aberto' ? 'text-destructive' : k === 'resolvido' ? 'text-green-600' : ''}`}>{counts[k] || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Filtre as ocorrências por diferentes critérios</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nº, inquilino ou endereço" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_OCORRENCIA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
                <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as prioridades</SelectItem>
                  {Object.entries(PRIORIDADE_OCORRENCIA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {Object.entries(TIPOS_OCORRENCIA).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter('all'); setPrioridadeFilter('all'); setTipoFilter('all'); }}>
                Limpar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <ListSkeleton count={4} />
        ) : filtered.length > 0 ? (
          <>
            <div className="grid gap-4">
              {pg.paginatedData.map((o: any) => (
                <Card key={o.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex flex-wrap gap-3 items-start justify-between">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <CardTitle className="text-lg">Ocorrência #{o.numero}</CardTitle>
                          <Badge variant={statusVariant[o.status] || 'outline'}>{STATUS_OCORRENCIA[o.status] || o.status}</Badge>
                          <Badge variant={prioridadeVariant[o.prioridade] || 'outline'}>{PRIORIDADE_OCORRENCIA[o.prioridade] || o.prioridade}</Badge>
                        </div>
                        <CardDescription>
                          {o.inquilino?.nome || '—'} • {o.imovel?.endereco}{o.imovel?.bairro ? `, ${o.imovel.bairro}` : ''}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => open(o)}>{canUpdate('ocorrencias') ? 'Ver / Editar' : 'Ver Detalhes'}</Button>
                        {canDelete('ocorrencias') && (
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDel(o)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">{TIPOS_OCORRENCIA[o.tipo] || o.tipo}</p></div>
                      <div><p className="text-muted-foreground">Data da Reclamação</p><p className="font-medium">{formatDateBR(o.data_reclamacao)}</p></div>
                      <div><p className="text-muted-foreground">Técnico Responsável</p><p className="font-medium">{o.tecnico?.nome || 'Não atribuído'}</p></div>
                      <div><p className="text-muted-foreground">Custo</p><p className="font-medium">{o.custo ? formatCurrency(Number(o.custo)) : 'N/A'}</p></div>
                    </div>
                    {o.descricao && (
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">Descrição</p>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{o.descricao}</p>
                      </div>
                    )}
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
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhuma ocorrência encontrada</p>
              <p className="text-sm text-muted-foreground">{hasFilters ? 'Tente ajustar os filtros' : 'Crie uma nova ocorrência para começar'}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : close())}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Ocorrência</DialogTitle>
          {dialogOpen && <OcorrenciaForm ocorrencia={selected} readOnly={readOnly} onSuccess={close} onCancel={close} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        onConfirm={remove}
        title="Excluir ocorrência"
        description={`Excluir a ocorrência #${del?.numero}? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
      />
    </DashboardLayout>
  );
}
