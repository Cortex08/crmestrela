import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Search, Phone, MessageSquare, Eye, MapPin, Clock, AlertTriangle, Home, Trash2, Download, FileText, FileSpreadsheet, ListPlus, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import ProspectForm from '@/components/forms/ProspectForm';
import ProspectContactForm from '@/components/forms/ProspectContactForm';
import ProspectDetails from '@/components/prospects/ProspectDetails';
import { DashboardLayout } from '@/components/DashboardLayout';
import { UpcomingEvents } from '@/components/agenda/AgendaParts';
import { EventDetailsDialog } from '@/components/agenda/EventDetailsDialog';
import { EventoForm } from '@/components/forms/EventoForm';
import { useOptions } from '@/hooks/useOptions';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { openWhatsapp } from '@/lib/whatsapp';
import { friendlyError } from '@/lib/utils';
import {
  STATUS_PROSPECT, STATUS_PROSPECT_COLOR, TIPO_IMOVEL_PROSPECT, TIPO_CAPTACAO, PROXIMA_ACAO, precisaAtencao, fmtDate,
} from '@/lib/prospeccao';

const download = (content: string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

export default function Prospeccao() {
  const { user } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const { profiles } = useOptions(true, { profiles: true });
  const [formOpen, setFormOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [statusF, setStatusF] = useState('todos');
  const [tipoF, setTipoF] = useState('todos');
  const [captF, setCaptF] = useState('todos');
  const [bairroF, setBairroF] = useState('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [del, setDel] = useState<any>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const navigate = useNavigate();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [evt, setEvt] = useState<any>(null);
  const [evtEdit, setEvtEdit] = useState<any>(null);

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ['prospects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_prospects')
        .select('*, responsavel_prospeccao:profiles!property_prospects_responsavel_prospeccao_id_fkey(nome), responsavel_contato:profiles!property_prospects_responsavel_contato_id_fkey(nome)')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ['calendar_events', 'prospeccao'],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data } = await supabase
        .from('calendar_events')
        .select('*, cliente:clients(id, nome, whatsapp), imovel:properties(id, codigo, endereco, titulo), corretor:profiles!calendar_events_corretor_id_fkey(id, nome)')
        .gte('data_inicio', since)
        .order('data_inicio')
        .limit(500);
      return data || [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['prospects'] });

  const filtered = useMemo(
    () =>
      prospects.filter((p: any) => {
        const s = !search || [p.endereco, p.bairro, p.proprietario_nome, p.proprietario_telefone, p.proprietario_telefone2]
          .some((v) => (v || '').toLowerCase().includes(search)) ||
          (search.replace(/\D/g, '') && [p.proprietario_telefone, p.proprietario_telefone2].some((v) => (v || '').replace(/\D/g, '').includes(search.replace(/\D/g, ''))));
        return s && (statusF === 'todos' || p.status === statusF) && (tipoF === 'todos' || p.tipo_imovel === tipoF)
          && (captF === 'todos' || p.tipo_captacao === captF) && (bairroF === 'todos' || p.bairro === bairroF);
      }),
    [prospects, search, statusF, tipoF, captF, bairroF],
  );
  const pg = usePagination({ data: filtered, itemsPerPage: 25 });
  const bairros = useMemo(() => [...new Set(prospects.map((p: any) => p.bairro))].sort() as string[], [prospects]);
  const attention = useMemo(() => prospects.filter(precisaAtencao), [prospects]);
  const current = selected ? prospects.find((p: any) => p.id === selected.id) || selected : null;

  const setStatus = async (p: any, status: string) => {
    // captado: o imóvel é criado na hora e já vai para "Aguardando Dados"
    if (status === 'captado' && p.status !== 'captado') {
      if (!canCreate('imoveis')) return toast.error('Você não tem permissão para criar o imóvel desta prospecção.');
      const ok = await convert(p);
      if (ok) {
        await supabase.from('property_prospects').update({ status: 'captado' }).eq('id', p.id);
        refresh();
      }
      return;
    }
    qc.setQueryData(['prospects'], (old: any[] = []) => old.map((x) => (x.id === p.id ? { ...x, status } : x)));
    const { error } = await supabase.from('property_prospects').update({ status }).eq('id', p.id);
    if (error) toast.error(friendlyError(error, 'Erro ao atualizar status'));
    else toast.success('Status atualizado!');
    refresh();
  };

  const convert = async (p: any) => {
    setConverting(p.id);
    const { error } = await supabase.rpc('converter_prospeccao_em_imovel', { _prospect_id: p.id });
    setConverting(null);
    if (error) { toast.error(error.code === 'P0001' ? error.message : friendlyError(error, 'Erro ao converter prospecção em imóvel')); return false; }
    toast.success('Captado! O imóvel foi para "Aguardando Dados".', { action: { label: 'Abrir', onClick: () => navigate('/prospeccao-aguardando') } });
    refresh();
    qc.invalidateQueries({ queryKey: ['properties'] });
    qc.invalidateQueries({ queryKey: ['pending-properties'] });
    return true;
  };

  const remove = async () => {
    const p = del;
    const { error } = await supabase.from('property_prospects').delete().eq('id', p.id);
    setDel(null);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir prospecção'));
    toast.success('Prospecção excluída com sucesso!');
    setDetailsOpen(false);
    setSelected(null);
    refresh();
  };

  const allSelected = filtered.length > 0 && filtered.every((p: any) => selectedIds.has(p.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map((p: any) => p.id)));
  const toggle = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedPhones = () => [...new Set(prospects.filter((p: any) => selectedIds.has(p.id)).flatMap((p: any) => [p.proprietario_telefone, p.proprietario_telefone2]).filter(Boolean))] as string[];

  const exportTxt = () => {
    const ph = selectedPhones();
    if (!ph.length) return toast.error('Nenhum número selecionado');
    download(ph.join('\n'), 'numeros_prospeccao.txt', 'text/plain');
    toast.success(`${ph.length} números exportados em TXT`);
  };
  const exportCsv = () => {
    const ph = selectedPhones();
    if (!ph.length) return toast.error('Nenhum número selecionado');
    download('﻿Telefone\n' + ph.map((p) => `"${p.replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`).join('\n'), 'numeros_prospeccao.csv', 'text/csv;charset=utf-8');
    toast.success(`${ph.length} números exportados em Excel/CSV`);
  };

  const bulkLines = bulk.split('\n').map((l) => l.trim()).filter((l) => l.replace(/\D/g, '').length >= 8);
  const importBulk = async () => {
    const unique: string[] = [...new Map<string, string>(bulkLines.map((l) => [l.replace(/\D/g, ''), l] as [string, string])).values()];
    if (!unique.length) return toast.error('Cole pelo menos um número válido');
    if (unique.length > 1000) return toast.error('Importe no máximo 1000 números por vez');
    setBulkBusy(true);
    try {
      const { data: dup, error: e1 } = await supabase.rpc('prospect_phones_existentes', { _phones: unique, _ignorar: null });
      if (e1) throw e1;
      const existing = new Set<string>(dup || []);
      const fresh = unique.filter((p) => !existing.has(p.replace(/\D/g, '')));
      if (!fresh.length) { toast.error(`Todos os ${unique.length} número(s) já existem no sistema`); return; }
      const { error } = await supabase.from('property_prospects').insert(fresh.map((phone) => ({
        tipo_captacao: 'aluguel', tipo_imovel: 'outro', endereco: 'A definir', bairro: 'A definir', cidade: 'A definir',
        estado: 'MG', status: 'novo', proprietario_telefone: phone.slice(0, 30), proprietario_origem: 'importacao', responsavel_prospeccao_id: user?.id || null,
      })));
      if (error) throw error;
      const dups = unique.length - fresh.length;
      toast.success(dups ? `${fresh.length} número(s) importado(s)! ${dups} duplicado(s) ignorado(s).` : `${fresh.length} número(s) importado(s) com sucesso!`);
      setBulk(''); setBulkOpen(false); refresh();
    } catch (err) {
      toast.error(friendlyError(err, 'Erro ao importar números'));
    } finally {
      setBulkBusy(false);
    }
  };

  const openDetails = (p: any) => { setSelected(p); setDetailsOpen(true); };
  const openContact = (p: any) => { setSelected(p); setContactOpen(true); };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="h-6 w-6 text-primary" /> Prospecção de Imóveis (Placas)</h1>
            <p className="text-muted-foreground">Captação ativa de imóveis através de placas encontradas na rua</p>
          </div>
          {canCreate('prospeccao') && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setBulkOpen(true)}><ListPlus className="h-4 w-4 mr-2" /> Importar Números</Button>
              <Button onClick={() => { setSelected(null); setFormOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nova Prospecção</Button>
            </div>
          )}
        </div>

        {attention.length > 0 && (
          <Card className="border-orange-500 bg-orange-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700"><AlertTriangle className="h-4 w-4" /> Imóveis sem contato há mais de 3 dias ({attention.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {attention.slice(0, 5).map((p: any) => (
                  <Badge key={p.id} variant="outline" className="cursor-pointer hover:bg-orange-100" onClick={() => openDetails(p)}>{p.endereco}, {p.bairro}</Badge>
                ))}
                {attention.length > 5 && <Badge variant="outline">+{attention.length - 5} mais</Badge>}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {Object.entries(STATUS_PROSPECT).map(([k, l]) => (
            <Card key={k} className={`cursor-pointer hover:shadow-md transition-shadow ${statusF === k ? 'ring-2 ring-primary' : ''}`} onClick={() => setStatusF(statusF === k ? 'todos' : k)}>
              <CardContent className="p-4 text-center">
                <div className={`w-3 h-3 rounded-full ${STATUS_PROSPECT_COLOR[k]} mx-auto mb-2`} />
                <p className="text-2xl font-bold">{prospects.filter((p: any) => p.status === k).length}</p>
                <p className="text-xs text-muted-foreground">{l}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por endereço, telefone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusF} onValueChange={setStatusF}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os Status</SelectItem>{Object.entries(STATUS_PROSPECT).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={tipoF} onValueChange={setTipoF}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os Tipos</SelectItem>{Object.entries(TIPO_IMOVEL_PROSPECT).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={captF} onValueChange={setCaptF}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todas as Captações</SelectItem>{Object.entries(TIPO_CAPTACAO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={bairroF} onValueChange={setBairroF}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todos">Todos os Bairros</SelectItem>{bairros.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {selectedIds.size > 0 && (
          <Card>
            <CardContent className="p-3 flex flex-wrap gap-2 items-center justify-between">
              <span className="text-sm font-medium">{selectedIds.size} prospecção(ões) selecionada(s)</span>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Download className="h-4 w-4 mr-2" /> Baixar Números</Button></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={exportTxt}><FileText className="h-4 w-4 mr-2" /> Exportar TXT</DropdownMenuItem>
                    <DropdownMenuItem onClick={exportCsv}><FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar Excel (CSV)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar seleção</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                    <TableHead>Endereço</TableHead><TableHead>Tipo</TableHead><TableHead>Captação</TableHead><TableHead>Status</TableHead>
                    <TableHead>Proprietário</TableHead><TableHead>Responsável</TableHead><TableHead>Último Contato</TableHead>
                    <TableHead>Próxima Ação</TableHead><TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhuma prospecção encontrada</TableCell></TableRow>
                  ) : (
                    pg.paginatedData.map((p: any) => {
                      const warn = precisaAtencao(p);
                      return (
                        <TableRow key={p.id} className={warn ? 'bg-orange-50' : ''}>
                          <TableCell><Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggle(p.id)} /></TableCell>
                          <TableCell>
                            <button type="button" className="text-left hover:underline" onClick={() => openDetails(p)}>
                              <p className="font-medium">{p.endereco}{p.numero ? `, ${p.numero}` : ''}</p>
                              <p className="text-xs text-muted-foreground">{p.bairro}, {p.cidade}</p>
                            </button>
                          </TableCell>
                          <TableCell><Badge variant="outline">{TIPO_IMOVEL_PROSPECT[p.tipo_imovel] || p.tipo_imovel}</Badge></TableCell>
                          <TableCell><Badge variant="secondary">{TIPO_CAPTACAO[p.tipo_captacao] || p.tipo_captacao}</Badge></TableCell>
                          <TableCell>
                            <Select value={p.status} onValueChange={(v) => setStatus(p, v)} disabled={!canUpdate('prospeccao')}>
                              <SelectTrigger className="w-[150px]">
                                <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${STATUS_PROSPECT_COLOR[p.status]}`} /><span className="text-xs">{STATUS_PROSPECT[p.status]}</span></div>
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_PROSPECT).map(([k, l]) => (
                                  <SelectItem key={k} value={k}><div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${STATUS_PROSPECT_COLOR[k]}`} />{l}</div></SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><p className="text-sm">{p.proprietario_nome || '-'}</p><p className="text-xs text-muted-foreground">{p.proprietario_telefone || '-'}</p></TableCell>
                          <TableCell><p className="text-sm">{p.responsavel_contato?.nome || '-'}</p></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {warn && <Clock className="h-3 w-3 text-orange-500" />}
                              <span className={warn ? 'text-orange-600 font-medium' : ''}>{fmtDate(p.ultimo_contato)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{p.proxima_acao ? PROXIMA_ACAO[p.proxima_acao] : '-'}</p>
                            {p.data_proxima_acao && <p className="text-xs text-muted-foreground">{fmtDate(p.data_proxima_acao)}</p>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openDetails(p)} title="Ver detalhes"><Eye className="h-4 w-4" /></Button>
                              {canCreate('prospeccao') && <Button variant="ghost" size="icon" onClick={() => openContact(p)} title="Registrar contato"><Phone className="h-4 w-4" /></Button>}
                              {p.proprietario_whatsapp && p.proprietario_telefone && (
                                <Button variant="ghost" size="icon" onClick={() => openWhatsapp(p.proprietario_telefone)} title="Abrir WhatsApp"><MessageSquare className="h-4 w-4 text-green-600" /></Button>
                              )}
                              {canUpdate('prospeccao') && canCreate('imoveis') && !['captado', 'perdido'].includes(p.status) && (
                                <Button variant="ghost" size="icon" onClick={() => convert(p)} disabled={converting === p.id} title="Converter em Imóvel" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                  {converting === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Home className="h-4 w-4" />}
                                </Button>
                              )}
                              {canDelete('prospeccao') && (
                                <Button variant="ghost" size="icon" onClick={() => setDel(p)} title="Excluir" className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="p-3">
              <PaginationControls
                currentPage={pg.currentPage} totalPages={pg.totalPages} totalItems={pg.totalItems}
                startIndex={pg.startIndex} endIndex={pg.endIndex} itemsPerPage={pg.itemsPerPage}
                onPageChange={pg.goToPage} onItemsPerPageChange={pg.setItemsPerPage} itemsPerPageOptions={[25, 50, 100]}
              />
            </div>
          </CardContent>
        </Card>

        <UpcomingEvents events={events} onEventClick={setEvt} />
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Importar Lista de Números</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cole os números (um por linha)</Label>
              <Textarea placeholder={'(31) 99999-0001\n(31) 99999-0002\n(31) 99999-0003'} className="min-h-[200px] font-mono text-sm" value={bulk} onChange={(e) => setBulk(e.target.value)} disabled={bulkBusy} />
              <p className="text-xs text-muted-foreground">Cada linha será criada como uma nova prospecção com status "Novo". Números repetidos são ignorados.</p>
              {bulk.trim() && <p className="text-sm font-medium text-primary">{bulkLines.length} número(s) detectado(s)</p>}
            </div>
            <Button onClick={importBulk} disabled={bulkBusy || !bulkLines.length} className="w-full">
              {bulkBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</> : <><ListPlus className="mr-2 h-4 w-4" /> Importar Números</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected ? 'Editar Prospecção' : 'Nova Prospecção'}</DialogTitle></DialogHeader>
          {formOpen && (
            <ProspectForm key={selected?.id || 'novo'} prospect={selected ? current : null} profiles={profiles} onSuccess={() => { setFormOpen(false); refresh(); }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes da Prospecção</DialogTitle></DialogHeader>
          {current && (
            <ProspectDetails
              prospect={current}
              onEdit={canUpdate('prospeccao') ? () => { setDetailsOpen(false); setFormOpen(true); } : undefined}
              onAddContact={canCreate('prospeccao') ? () => { setDetailsOpen(false); setContactOpen(true); } : undefined}
              onDelete={canDelete('prospeccao') ? () => setDel(current) : undefined}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Contato</DialogTitle></DialogHeader>
          {contactOpen && current && (
            <ProspectContactForm
              prospectId={current.id}
              profiles={profiles}
              onSuccess={() => {
                setContactOpen(false);
                refresh();
                qc.invalidateQueries({ queryKey: ['prospect-contacts', current.id] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <EventDetailsDialog
        event={evt}
        open={!!evt}
        onOpenChange={(o) => !o && setEvt(null)}
        onUpdate={() => qc.invalidateQueries({ queryKey: ['calendar_events'] })}
        onEdit={(e) => { setEvt(null); setEvtEdit(e); }}
      />
      <EventoForm open={!!evtEdit} onOpenChange={(o) => !o && setEvtEdit(null)} event={evtEdit} onSuccess={() => qc.invalidateQueries({ queryKey: ['calendar_events'] })} />

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        onConfirm={remove}
        title="Excluir Prospecção"
        description={`Tem certeza que deseja excluir a prospecção "${del?.endereco}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
      />
    </DashboardLayout>
  );
}
