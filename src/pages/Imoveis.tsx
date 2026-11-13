import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Search, Building2, MapPin, DollarSign, Home, CheckCircle, Users, FileText, Eye, Phone, Mail, MessageSquare,
  Bed, Bath, Car, Maximize2, PawPrint, Armchair, Trash2, Pencil, SlidersHorizontal, X, Download,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImovelForm } from '@/components/forms/ImovelForm';
import { ImportarImovelDialog } from '@/components/forms/ImportarImovelDialog';
import { ImovelEditDialog } from '@/components/forms/ImovelEditDialog';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { CardSkeleton } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { formatCurrency, friendlyError } from '@/lib/utils';

const statusLabels: Record<string, string> = { disponivel: 'Disponível', reservado: 'Reservado', alugado: 'Alugado', vendido: 'Vendido' };
const statusPill: Record<string, string> = {
  disponivel: 'bg-green-100 text-green-800 border border-green-200',
  reservado: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  alugado: 'bg-blue-100 text-blue-800 border border-blue-200',
  vendido: 'bg-purple-100 text-purple-800 border border-purple-200',
};

type ConfirmState = { open: boolean; type: 'remove' | 'rent' | 'delete'; propertyId: string; propertyCode: string };

const Imoveis = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'venda' | 'locacao'>('todos');
  const [f, setF] = useState({ status: 'todos', quartos: 'todos', banheiros: 'todos', vagas: 'todos', pets: 'todos', mobiliado: 'todos', precoMin: '', precoMax: '', areaMin: '', areaMax: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, type: 'remove', propertyId: '', propertyCode: '' });
  const [details, setDetails] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [editProperty, setEditProperty] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const debounced = useDebounce(searchTerm, 300);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, codigo, titulo, tipo, status, endereco, numero, complemento, bairro, cidade, estado, cep, quartos, banheiros, vagas, area_util, area_total, aceita_pets, mobiliado, valor_venda, valor_aluguel, valor_condominio, valor_iptu, descricao, fotos, published_on_website, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['properties'] });

  const updateProperty = async (id: string, values: Record<string, any>, ok: string, fail: string) => {
    setBusy(id);
    const { error } = await supabase.from('properties').update(values).eq('id', id);
    setBusy(null);
    if (error) toast.error(friendlyError(error, fail));
    else {
      toast.success(ok);
      refresh();
    }
  };

  const openDetails = async (p: any) => {
    setDetails(p);
    setDetailsOpen(true);
    setLoadingDetails(true);
    const { data } = await supabase
      .from('properties')
      .select('*, proprietario:clients!properties_proprietario_id_fkey(nome, whatsapp, email, telefone)')
      .eq('id', p.id)
      .single();
    if (data) setDetails(data);
    setLoadingDetails(false);
  };

  const filtered = useMemo(() => {
    const term = debounced.toLowerCase();
    const num = (v: string) => (v === '' ? null : Number(v));
    const pMin = num(f.precoMin), pMax = num(f.precoMax), aMin = num(f.areaMin), aMax = num(f.areaMax);
    const matchCount = (val: number | null, filter: string, maxBucket: number) =>
      filter === 'todos' || (Number(filter) >= maxBucket ? (val ?? 0) >= Number(filter) : val === Number(filter));
    return properties.filter((p: any) => {
      const matchesSearch = !term || [p.codigo, p.titulo, p.endereco, p.bairro, p.cidade].some((x) => x?.toLowerCase().includes(term));
      const valor = p.tipo === 'venda' ? p.valor_venda : p.valor_aluguel;
      return (
        matchesSearch &&
        (tipoFiltro === 'todos' || p.tipo === tipoFiltro) &&
        (f.status === 'todos' || p.status === f.status) &&
        matchCount(p.quartos, f.quartos, 4) &&
        matchCount(p.banheiros, f.banheiros, 3) &&
        matchCount(p.vagas, f.vagas, 3) &&
        (f.pets === 'todos' || (f.pets === 'sim') === !!p.aceita_pets) &&
        (f.mobiliado === 'todos' || (f.mobiliado === 'sim') === !!p.mobiliado) &&
        (pMin === null || (valor ?? 0) >= pMin) &&
        (pMax === null || (valor !== null && valor <= pMax)) &&
        (aMin === null || (p.area_util ?? 0) >= aMin) &&
        (aMax === null || (p.area_util !== null && p.area_util <= aMax))
      );
    });
  }, [properties, debounced, tipoFiltro, f]);

  const pg = usePagination({ data: filtered, itemsPerPage: 12 });

  const activeFilters = [f.status, f.quartos, f.banheiros, f.vagas, f.pets, f.mobiliado].filter((v) => v !== 'todos').length +
    [f.precoMin, f.precoMax, f.areaMin, f.areaMax].filter(Boolean).length;
  const clearFilters = () => setF({ status: 'todos', quartos: 'todos', banheiros: 'todos', vagas: 'todos', pets: 'todos', mobiliado: 'todos', precoMin: '', precoMax: '', areaMin: '', areaMax: '' });

  const handleConfirm = async () => {
    const { type, propertyId } = confirm;
    if (type === 'remove') await updateProperty(propertyId, { published_on_website: false, website_last_sync: new Date().toISOString() }, 'Imóvel removido do site!', 'Erro ao remover imóvel do site');
    if (type === 'rent') await updateProperty(propertyId, { status: 'alugado' }, 'Imóvel marcado como alugado!', 'Erro ao atualizar status do imóvel');
    if (type === 'delete') {
      setBusy(propertyId);
      const { error } = await supabase.from('properties').delete().eq('id', propertyId);
      setBusy(null);
      if (error) toast.error(friendlyError(error, 'Erro ao excluir imóvel'));
      else {
        toast.success('Imóvel excluído com sucesso!');
        refresh();
      }
    }
    setConfirm((c) => ({ ...c, open: false }));
  };

  const filterSelect = (label: string, key: keyof typeof f, options: [string, string][]) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={f[key]} onValueChange={(v) => setF({ ...f, [key]: v })}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Imóveis</h1>
            <p className="text-sm text-muted-foreground">Gerenciar imóveis para venda e locação</p>
          </div>
          {canCreate('imoveis') && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}><Download className="mr-2 h-4 w-4" />Importar imóvel</Button>
              <ImovelForm onSuccess={refresh} />
            </div>
          )}
        </div>

        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por código, título, endereço, bairro, cidade..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 shrink-0">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filtros</span>
                {activeFilters > 0 && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">{activeFilters}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] max-h-[70vh] overflow-y-auto" align="end">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm">Filtros avançados</h4>
                {activeFilters > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}><X className="h-3 w-3 mr-1" /> Limpar filtros</Button>
                )}
              </div>
              <Separator className="mb-3" />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {filterSelect('Status', 'status', [['todos', 'Todos os status'], ['disponivel', 'Disponível'], ['reservado', 'Reservado'], ['vendido', 'Vendido'], ['alugado', 'Alugado']])}
                  {filterSelect('Quartos', 'quartos', [['todos', 'Todos os quartos'], ['1', '1 quarto'], ['2', '2 quartos'], ['3', '3 quartos'], ['4', '4+ quartos']])}
                  {filterSelect('Banheiros', 'banheiros', [['todos', 'Todos os banheiros'], ['1', '1 banheiro'], ['2', '2 banheiros'], ['3', '3+ banheiros']])}
                  {filterSelect('Vagas de garagem', 'vagas', [['todos', 'Todas as vagas'], ['1', '1 vaga'], ['2', '2 vagas'], ['3', '3+ vagas']])}
                  {filterSelect('Aceita pets?', 'pets', [['todos', 'Indiferente'], ['sim', 'Aceita pets'], ['nao', 'Não aceita pets']])}
                  {filterSelect('Mobiliado?', 'mobiliado', [['todos', 'Indiferente'], ['sim', 'Mobiliado'], ['nao', 'Não mobiliado']])}
                </div>
                <Separator />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Faixa de preço (R$)</label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Mínimo" value={f.precoMin} onChange={(e) => setF({ ...f, precoMin: e.target.value })} className="h-8 text-xs" />
                    <Input type="number" placeholder="Máximo" value={f.precoMax} onChange={(e) => setF({ ...f, precoMax: e.target.value })} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Área útil (m²)</label>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Mínimo" value={f.areaMin} onChange={(e) => setF({ ...f, areaMin: e.target.value })} className="h-8 text-xs" />
                    <Input type="number" placeholder="Máximo" value={f.areaMax} onChange={(e) => setF({ ...f, areaMax: e.target.value })} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Tabs value={tipoFiltro} onValueChange={(v: any) => setTipoFiltro(v)}>
          <TabsList>
            <TabsTrigger value="todos">Todos ({properties.length})</TabsTrigger>
            <TabsTrigger value="venda">Venda ({properties.filter((p: any) => p.tipo === 'venda').length})</TabsTrigger>
            <TabsTrigger value="locacao">Locação ({properties.filter((p: any) => p.tipo === 'locacao').length})</TabsTrigger>
          </TabsList>

          <TabsContent value={tipoFiltro} className="mt-6">
            {isLoading ? (
              <CardSkeleton count={6} />
            ) : filtered.length === 0 ? (
              <Card className="card-premium">
                <CardContent className="py-12 text-center">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum imóvel encontrado</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {pg.paginatedData.map((p: any) => (
                    <Card key={p.id} className="card-premium cursor-pointer hover:shadow-lg transition-shadow overflow-hidden" onClick={() => openDetails(p)}>
                      {p.fotos?.length > 0 && (
                        <div className="relative h-48 overflow-hidden">
                          <img src={p.fotos[0]} alt={p.titulo} loading="lazy" className="w-full h-full object-cover" />
                          <Button size="sm" variant="secondary" className="absolute top-2 right-2 bg-white/90 hover:bg-white" onClick={(e) => { e.stopPropagation(); openDetails(p); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canUpdate('imoveis') && (
                            <Button size="sm" variant="secondary" className="absolute top-2 right-14 bg-white/90 hover:bg-white" onClick={(e) => { e.stopPropagation(); setEditProperty(p); setEditOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                      <CardHeader>
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-muted-foreground">{p.codigo}</p>
                            <CardTitle className="text-lg truncate">{p.titulo}</CardTitle>
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">{p.tipo === 'venda' ? 'Venda' : 'Locação'}</span>
                            {p.published_on_website && <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 border border-green-200 whitespace-nowrap">Publicado no Site</span>}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <MapPin className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">{p.endereco}, {p.bairro}</span>
                        </div>
                        <div className="flex items-center text-sm font-semibold">
                          <DollarSign className="mr-2 h-4 w-4" />
                          {p.tipo === 'venda' ? formatCurrency(p.valor_venda) : `${formatCurrency(p.valor_aluguel)}/mês`}
                        </div>
                        <div className="flex gap-3 text-sm text-muted-foreground">
                          {p.quartos ? <span>{p.quartos} quartos</span> : null}
                          {p.banheiros ? <span>{p.banheiros} banheiros</span> : null}
                          {p.vagas ? <span>{p.vagas} vagas</span> : null}
                        </div>
                        {(p.aceita_pets || p.mobiliado) && (
                          <div className="flex gap-2">
                            {p.aceita_pets && <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">Aceita Pets</span>}
                            {p.mobiliado && <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200">Mobiliado</span>}
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-2 gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${statusPill[p.status] || 'bg-gray-100 text-gray-800'}`}>{statusLabels[p.status] || p.status}</span>
                          {p.status === 'disponivel' && p.tipo === 'locacao' && canUpdate('imoveis') && (
                            <Button size="sm" variant="outline" className="text-xs" onClick={(e) => { e.stopPropagation(); setConfirm({ open: true, type: 'rent', propertyId: p.id, propertyCode: p.codigo }); }}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Marcar como Alugado
                            </Button>
                          )}
                        </div>
                        {canUpdate('imoveis') && (
                          <div className="flex gap-2 pt-2">
                            {!p.published_on_website ? (
                              <Button size="sm" className="flex-1" disabled={busy === p.id} onClick={(e) => { e.stopPropagation(); updateProperty(p.id, { published_on_website: true, website_last_sync: new Date().toISOString() }, 'Imóvel publicado no site com sucesso!', 'Erro ao publicar imóvel no site'); }}>
                                {busy === p.id ? 'Publicando...' : 'Publicar no Site'}
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="secondary" className="flex-1" disabled={busy === p.id} onClick={(e) => { e.stopPropagation(); updateProperty(p.id, { website_last_sync: new Date().toISOString() }, 'Imóvel atualizado no site com sucesso!', 'Erro ao atualizar imóvel no site'); }}>
                                  {busy === p.id ? 'Atualizando...' : 'Atualizar'}
                                </Button>
                                <Button size="sm" variant="destructive" className="flex-1" disabled={busy === p.id} onClick={(e) => { e.stopPropagation(); setConfirm({ open: true, type: 'remove', propertyId: p.id, propertyCode: p.codigo }); }}>
                                  Remover
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                        {canUpdate('imoveis') && !p.fotos?.length && (
                          <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setEditProperty(p); setEditOpen(true); }}>
                            <Pencil className="h-4 w-4 mr-1" /> Editar
                          </Button>
                        )}
                        {canDelete('imoveis') && (
                          <Button size="sm" variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setConfirm({ open: true, type: 'delete', propertyId: p.id, propertyCode: p.codigo }); }}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir Imóvel
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <PaginationControls
                  currentPage={pg.currentPage} totalPages={pg.totalPages} totalItems={pg.totalItems} startIndex={pg.startIndex}
                  endIndex={pg.endIndex} itemsPerPage={pg.itemsPerPage} onPageChange={pg.goToPage} onItemsPerPageChange={pg.setItemsPerPage}
                  itemsPerPageOptions={[12, 24, 48]}
                />
              </>
            )}
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={confirm.open}
          onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
          onConfirm={handleConfirm}
          title={confirm.type === 'remove' ? 'Remover do Site' : confirm.type === 'delete' ? 'Excluir Imóvel' : 'Marcar como Alugado'}
          description={
            confirm.type === 'remove'
              ? 'Tem certeza que deseja remover este imóvel do site? Ele ficará indisponível para visualização pública.'
              : confirm.type === 'delete'
                ? `Tem certeza que deseja excluir o imóvel ${confirm.propertyCode}? Esta ação não pode ser desfeita.`
                : 'Tem certeza que deseja marcar este imóvel como alugado?'
          }
          confirmText={confirm.type === 'remove' ? 'Remover' : confirm.type === 'delete' ? 'Excluir' : 'Confirmar'}
          variant={confirm.type === 'rent' ? 'warning' : 'danger'}
          loading={busy === confirm.propertyId}
        />

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-6">
                <Building2 className="h-5 w-5 shrink-0" />
                {details?.codigo} - {details?.titulo || details?.endereco}
              </DialogTitle>
            </DialogHeader>
            {details && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2"><Home className="h-4 w-4" />Informações do Imóvel</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Código:</span><span className="font-mono">{details.codigo}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><Badge variant="outline">{details.tipo === 'venda' ? 'Venda' : 'Locação'}</Badge></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className={`text-xs px-2 py-1 rounded-full ${statusPill[details.status]}`}>{statusLabels[details.status]}</span></div>
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><Bed className="h-4 w-4" /> Quartos:</span><span>{details.quartos ?? '—'}</span></div>
                      <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><Bath className="h-4 w-4" /> Banheiros:</span><span>{details.banheiros ?? '—'}</span></div>
                      <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><Car className="h-4 w-4" /> Vagas:</span><span>{details.vagas ?? '—'}</span></div>
                      <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><Maximize2 className="h-4 w-4" /> Área Útil:</span><span>{details.area_util ? `${details.area_util} m²` : '—'}</span></div>
                      {details.area_total && <div className="flex justify-between"><span className="text-muted-foreground">Área Total:</span><span>{details.area_total} m²</span></div>}
                      <Separator className="my-2" />
                      <div className="flex gap-2 flex-wrap">
                        {details.aceita_pets && <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100"><PawPrint className="h-3 w-3 mr-1" /> Aceita Pets</Badge>}
                        {details.mobiliado && <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100"><Armchair className="h-3 w-3 mr-1" /> Mobiliado</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4" />Endereço</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="font-medium">{details.endereco}{details.numero ? `, ${details.numero}` : ''}</p>
                      {details.complemento && <p className="text-muted-foreground">{details.complemento}</p>}
                      <p className="text-muted-foreground">{details.bairro}</p>
                      <p className="text-muted-foreground">{details.cidade} - {details.estado}</p>
                      {details.cep && <p className="text-muted-foreground">CEP: {details.cep}</p>}
                      <Separator className="my-2" />
                      <div className="flex justify-between"><span className="text-muted-foreground">Valor Aluguel:</span><span className="font-medium">{formatCurrency(details.valor_aluguel)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Valor Venda:</span><span className="font-medium">{formatCurrency(details.valor_venda)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Condomínio:</span><span>{formatCurrency(details.valor_condominio)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">IPTU:</span><span>{formatCurrency(details.valor_iptu)}</span></div>
                    </CardContent>
                  </Card>
                </div>

                {loadingDetails && <p className="text-sm text-muted-foreground">Carregando detalhes...</p>}

                {details.proprietario && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" />Proprietário</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-3 items-center justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-lg">{details.proprietario.nome}</p>
                          {details.proprietario.email && <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-4 w-4" /> {details.proprietario.email}</p>}
                          {details.proprietario.telefone && <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-4 w-4" /> {details.proprietario.telefone}</p>}
                        </div>
                        {hasValidWhatsapp(details.proprietario.whatsapp) && (
                          <Button size="sm" variant="outline" onClick={() => openWhatsapp(details.proprietario.whatsapp)}>
                            <MessageSquare className="h-4 w-4 mr-1" /> WhatsApp
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(details.descricao || details.observacoes || details.complementos) && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" />Descrição e Observações</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {details.descricao && <div><p className="text-sm font-medium mb-1">Descrição:</p><p className="text-sm text-muted-foreground whitespace-pre-wrap">{details.descricao}</p></div>}
                      {details.complementos && <div><p className="text-sm font-medium mb-1">Complementos:</p><p className="text-sm text-muted-foreground whitespace-pre-wrap">{details.complementos}</p></div>}
                      {details.observacoes && <div><p className="text-sm font-medium mb-1">Observações:</p><p className="text-sm text-muted-foreground whitespace-pre-wrap">{details.observacoes}</p></div>}
                    </CardContent>
                  </Card>
                )}

                {details.fotos?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Fotos ({details.fotos.length})</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {details.fotos.map((foto: string, i: number) => (
                          <a key={i} href={foto} target="_blank" rel="noopener noreferrer">
                            <img src={foto} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-24 object-cover rounded-md hover:opacity-80 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <ImportarImovelDialog open={importOpen} onOpenChange={setImportOpen} onSuccess={refresh} />
        <ImovelEditDialog property={editProperty} open={editOpen} onOpenChange={setEditOpen} onSuccess={refresh} />
      </div>
    </DashboardLayout>
  );
};

export default Imoveis;
