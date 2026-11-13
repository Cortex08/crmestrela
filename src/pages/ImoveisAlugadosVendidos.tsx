import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Building2, Users, User, DollarSign, FileText, FolderOpen, AlertTriangle, CheckCircle2, XCircle, Clock, Eye,
  Phone, Mail, MessageSquare, MapPin, Home, Key, ArrowUpDown, ExternalLink, AlertCircle, FileCheck, Plus,
} from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { openStoredFile } from '@/lib/storage';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { VinculoImovelForm } from '@/components/forms/VinculoImovelForm';
import { TableSkeleton } from '@/components/ui/loading';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDateBR } from '@/lib/utils';

type SortField = 'codigo' | 'endereco' | 'status' | 'proprietario' | 'valor';

const PERSON = 'id, nome, whatsapp, email, cpf_cnpj';
const activeContract = (p: any) => (p.contracts || []).find((c: any) => c.status === 'ativo');
const daysLeft = (c: any) => (c?.data_fim ? differenceInDays(parseISO(c.data_fim), new Date()) : null);

const statusBadge = (s: string) => (
  <Badge variant="outline" className={s === 'alugado' ? 'bg-blue-500/10 text-blue-700 border-blue-500/30' : 'bg-green-500/10 text-green-700 border-green-500/30'}>
    {s === 'alugado' ? 'Alugado' : s === 'vendido' ? 'Vendido' : s}
  </Badge>
);
const contratoBadge = (s: string) => {
  const m: Record<string, [string, string]> = {
    ativo: ['Ativo', 'bg-green-500/10 text-green-700 border-green-500/30'],
    encerrado: ['Encerrado', 'bg-gray-500/10 text-gray-700 border-gray-500/30'],
    rascunho: ['Rascunho', 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30'],
  };
  const [l, c] = m[s] || [s, ''];
  return <Badge variant="outline" className={c}>{l}</Badge>;
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}:</span><span className="text-right">{children}</span></div>
);

const PersonCard = ({ title, icon: Icon, person, empty }: { title: string; icon: any; person: any; empty: string }) => (
  <Card>
    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</CardTitle></CardHeader>
    <CardContent>
      {person ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-lg">{person.nome}</span>
            {hasValidWhatsapp(person.whatsapp) && (
              <Button size="sm" variant="outline" onClick={() => openWhatsapp(person.whatsapp)}><MessageSquare className="h-4 w-4 mr-1" /> WhatsApp</Button>
            )}
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            {person.cpf_cnpj && <div className="flex items-center gap-2"><FileCheck className="h-4 w-4" /> CPF/CNPJ: {person.cpf_cnpj}</div>}
            {person.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {person.email}</div>}
            {person.whatsapp && <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {person.whatsapp}</div>}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </CardContent>
  </Card>
);

const DocList = ({ title, docs }: { title: string; docs: any[] }) => (
  <Card>
    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
    <CardContent>
      {docs.length ? (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0"><p className="font-medium text-sm truncate">{d.nome}</p><p className="text-xs text-muted-foreground capitalize">{d.tipo || d.categoria}</p></div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => openStoredFile(d.url)}><ExternalLink className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Nenhum documento</p>
      )}
    </CardContent>
  </Card>
);

const ImoveisAlugadosVendidos = () => {
  const { canUpdate, canCreate, canRead } = usePermissions();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterProp, setFilterProp] = useState('todos');
  const [filterSit, setFilterSit] = useState('todos');
  const [sortField, setSortField] = useState<SortField>('codigo');
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState('geral');
  const [vinculoOpen, setVinculoOpen] = useState(false);

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties', 'alugados-vendidos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select(`*, proprietario:clients!properties_proprietario_id_fkey(${PERSON}),
          contracts!contracts_imovel_id_fkey(id, codigo, tipo, status, status_contrato, valor, data_inicio, data_fim, prazo_meses, categoria, created_at,
            inquilino_vinculado:clients!contracts_inquilino_vinculado_id_fkey(${PERSON}),
            cliente:clients!contracts_cliente_id_fkey(${PERSON}))`)
        .in('status', ['alugado', 'vendido'])
        .order('codigo')
        .limit(3000);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        contracts: (p.contracts || []).sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || '')),
      }));
    },
  });

  const selId = selected?.id;
  const ativo = selected ? activeContract(selected) : null;
  const { data: details } = useQuery({
    queryKey: ['alugados-detalhes', selId, ativo?.id],
    enabled: !!selId,
    queryFn: async () => {
      const [pays, cdocs, pdocs] = await Promise.all([
        ativo && canRead('financeiro')
          ? supabase.from('owner_payments').select('*').eq('contrato_id', ativo.id).order('mes_referencia', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        ativo ? supabase.from('documents').select('*').eq('contrato_id', ativo.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
        supabase.from('documents').select('*').eq('imovel_id', selId).order('created_at', { ascending: false }),
      ]);
      return { payments: pays.data || [], contractDocs: cdocs.data || [], propertyDocs: pdocs.data || [] };
    },
  });

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    properties.forEach((p: any) => p.proprietario && m.set(p.proprietario.id, p.proprietario.nome));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [properties]);

  const filtered = useMemo(() => {
    const list = properties.filter((p: any) => {
      const tenant = activeContract(p)?.inquilino_vinculado?.nome || activeContract(p)?.cliente?.nome;
      const s = !search || [p.codigo, p.titulo, p.endereco, p.bairro, p.proprietario?.nome, tenant].some((v) => (v || '').toLowerCase().includes(search));
      const sit = filterSit === 'todos' || (filterSit === 'ativo' ? !!activeContract(p) : filterSit === 'encerrado' ? !activeContract(p)
        : (() => { const d = daysLeft(activeContract(p)); return d !== null && d <= 30; })());
      return s && sit && (filterStatus === 'todos' || p.status === filterStatus) && (filterProp === 'todos' || p.proprietario_id === filterProp);
    });
    const val = (p: any) => (p.status === 'alugado' ? p.valor_aluguel : p.valor_venda) || 0;
    list.sort((a: any, b: any) => {
      let c = 0;
      if (sortField === 'valor') c = val(a) - val(b);
      else if (sortField === 'proprietario') c = (a.proprietario?.nome || '').localeCompare(b.proprietario?.nome || '');
      else c = String(a[sortField] || '').localeCompare(String(b[sortField] || ''), 'pt-BR', { numeric: true });
      return asc ? c : -c;
    });
    return list;
  }, [properties, search, filterStatus, filterProp, filterSit, sortField, asc]);

  const stats = useMemo(() => ({
    total: properties.length,
    alugados: properties.filter((p: any) => p.status === 'alugado').length,
    vendidos: properties.filter((p: any) => p.status === 'vendido').length,
    ativos: properties.filter((p: any) => activeContract(p)).length,
    vencendo: properties.filter((p: any) => { const d = daysLeft(activeContract(p)); return d !== null && d > 0 && d <= 30; }).length,
  }), [properties]);

  const sortBy = (f: SortField) => { if (f === sortField) setAsc(!asc); else { setSortField(f); setAsc(true); } };
  const SortBtn = ({ f, children }: { f: SortField; children: React.ReactNode }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium hover:bg-transparent" onClick={() => sortBy(f)}>{children}<ArrowUpDown className="ml-1 h-3 w-3" /></Button>
  );
  const openDetails = (p: any) => { setSelected(p); setTab('geral'); };
  const payments = details?.payments || [];
  const comprador = (p: any) => activeContract(p)?.inquilino_vinculado || activeContract(p)?.cliente || null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
          <div>
            <h1 className="text-3xl font-bold">Imóveis Alugados / Vendidos</h1>
            <p className="text-muted-foreground">Gestão completa de imóveis com vínculos e financeiro</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {stats.vencendo > 0 && (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm text-yellow-700 font-medium">{stats.vencendo} contrato(s) próximo(s) do vencimento</span>
              </div>
            )}
            {canUpdate('imoveis') && canCreate('contratos') && (
              <Button onClick={() => setVinculoOpen(true)}><Plus className="h-4 w-4 mr-2" /> Novo Vínculo</Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          {[
            ['Total', stats.total, Building2, '', 'text-muted-foreground/50'],
            ['Alugados', stats.alugados, Key, 'text-blue-600', 'text-blue-500/50'],
            ['Vendidos', stats.vendidos, Home, 'text-green-600', 'text-green-500/50'],
            ['Contratos Ativos', stats.ativos, FileText, '', 'text-muted-foreground/50'],
            ['Próx. Vencimento', stats.vencendo, AlertCircle, 'text-yellow-600', 'text-yellow-500/50'],
          ].map(([label, value, Icon, cls, icls]: any) => (
            <Card key={label} className={label === 'Próx. Vencimento' && stats.vencendo > 0 ? 'border-yellow-500/50' : ''}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm text-muted-foreground">{label}</p><p className={`text-2xl font-bold ${cls}`}>{value}</p></div>
                  <Icon className={`h-8 w-8 ${icls}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por código, endereço, proprietário, inquilino..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Status</SelectItem>
                  <SelectItem value="alugado">Alugados</SelectItem>
                  <SelectItem value="vendido">Vendidos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterProp} onValueChange={setFilterProp}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Proprietários</SelectItem>
                  {owners.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSit} onValueChange={setFilterSit}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas Situações</SelectItem>
                  <SelectItem value="ativo">Contrato Ativo</SelectItem>
                  <SelectItem value="encerrado">Sem contrato ativo</SelectItem>
                  <SelectItem value="vencendo">Vencendo / vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : filtered.length === 0 ? (
              <div className="text-center py-12"><Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><p className="text-muted-foreground">Nenhum imóvel encontrado</p></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><SortBtn f="codigo">Código</SortBtn></TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead><SortBtn f="status">Status</SortBtn></TableHead>
                      <TableHead><SortBtn f="endereco">Endereço</SortBtn></TableHead>
                      <TableHead><SortBtn f="proprietario">Proprietário</SortBtn></TableHead>
                      <TableHead>Inquilino/Comprador</TableHead>
                      <TableHead>Contrato</TableHead>
                      <TableHead className="text-right"><SortBtn f="valor">Valor</SortBtn></TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p: any) => {
                      const c = activeContract(p);
                      const d = daysLeft(c);
                      return (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetails(p)}>
                          <TableCell className="font-mono font-medium">{p.codigo}</TableCell>
                          <TableCell><Badge variant="outline">{p.tipo === 'venda' ? 'Venda' : 'Locação'}</Badge></TableCell>
                          <TableCell>{statusBadge(p.status)}</TableCell>
                          <TableCell>
                            <div className="max-w-[220px] truncate" title={`${p.endereco}, ${p.bairro}`}>
                              {p.endereco}{p.numero ? `, ${p.numero}` : ''}
                              <span className="text-muted-foreground text-xs block">{p.bairro}</span>
                            </div>
                          </TableCell>
                          <TableCell>{p.proprietario?.nome || '—'}</TableCell>
                          <TableCell>{comprador(p)?.nome || (p.status === 'vendido' ? 'Comprador não vinculado' : '—')}</TableCell>
                          <TableCell>
                            {c ? (
                              <div className="flex flex-col gap-1">
                                {contratoBadge(c.status)}
                                {d !== null && d <= 30 && (
                                  <span className={`text-xs ${d < 0 ? 'text-destructive' : 'text-yellow-700'}`}>{d < 0 ? `Vencido há ${-d} dias` : `Vence em ${d} dias`}</span>
                                )}
                                {c.data_inicio && (d === null || d > 30) && <span className="text-xs text-muted-foreground">{formatDateBR(c.data_inicio)}</span>}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sem contrato</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(p.status === 'alugado' ? p.valor_aluguel : p.valor_venda)}</TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetails(p); }}><Eye className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> {selected?.codigo} - {selected?.titulo || selected?.endereco}</DialogTitle>
            </DialogHeader>
            {selected && (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex flex-wrap h-auto w-full justify-start">
                  <TabsTrigger value="geral" className="gap-1.5"><Home className="h-4 w-4" />Geral</TabsTrigger>
                  <TabsTrigger value="pessoas" className="gap-1.5"><Users className="h-4 w-4" />Pessoas</TabsTrigger>
                  <TabsTrigger value="contrato" className="gap-1.5"><FileText className="h-4 w-4" />Contrato</TabsTrigger>
                  <TabsTrigger value="documentos" className="gap-1.5"><FolderOpen className="h-4 w-4" />Documentos</TabsTrigger>
                  {canRead('financeiro') && <TabsTrigger value="financeiro" className="gap-1.5"><DollarSign className="h-4 w-4" />Financeiro</TabsTrigger>}
                </TabsList>

                <TabsContent value="geral" className="space-y-4 mt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Informações do Imóvel</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <Row label="Código"><span className="font-mono">{selected.codigo}</span></Row>
                        <Row label="Tipo">{selected.tipo === 'venda' ? 'Venda' : 'Locação'}</Row>
                        <Row label="Status">{statusBadge(selected.status)}</Row>
                        <Separator className="my-2" />
                        <Row label="Quartos">{selected.quartos ?? '—'}</Row>
                        <Row label="Banheiros">{selected.banheiros ?? '—'}</Row>
                        <Row label="Vagas">{selected.vagas ?? '—'}</Row>
                        <Row label="Área">{selected.area_util ? `${selected.area_util} m²` : '—'}</Row>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Endereço</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                          <div>
                            <p>{selected.endereco}{selected.numero ? `, ${selected.numero}` : ''}</p>
                            {selected.complemento && <p>{selected.complemento}</p>}
                            <p>{selected.bairro}</p>
                            <p>{selected.cidade} - {selected.estado}</p>
                          </div>
                        </div>
                        <Separator className="my-2" />
                        <Row label="Valor Aluguel"><span className="font-medium">{formatCurrency(selected.valor_aluguel)}</span></Row>
                        <Row label="Valor Venda"><span className="font-medium">{formatCurrency(selected.valor_venda)}</span></Row>
                        <Row label="Condomínio">{formatCurrency(selected.valor_condominio)}</Row>
                        <Row label="IPTU">{formatCurrency(selected.valor_iptu)}</Row>
                      </CardContent>
                    </Card>
                  </div>
                  {selected.fotos?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Fotos</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {selected.fotos.slice(0, 8).map((f: string, i: number) => (
                            <img key={i} src={f} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-24 object-cover rounded-md" />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="pessoas" className="space-y-4 mt-4">
                  <PersonCard title="Proprietário" icon={User} person={selected.proprietario} empty="Proprietário não vinculado" />
                  <PersonCard
                    title={selected.status === 'alugado' ? 'Inquilino' : 'Comprador'}
                    icon={Users}
                    person={comprador(selected)}
                    empty={`${selected.status === 'alugado' ? 'Inquilino' : 'Comprador'} não vinculado ao contrato`}
                  />
                </TabsContent>

                <TabsContent value="contrato" className="space-y-4 mt-4">
                  {selected.contracts?.length ? selected.contracts.map((c: any) => {
                    const d = c.status === 'ativo' ? daysLeft(c) : null;
                    return (
                      <Card key={c.id} className={c.status === 'ativo' ? 'border-green-500/30' : ''}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" /> Contrato {c.codigo}</CardTitle>
                            {contratoBadge(c.status)}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <div className="grid gap-2 md:grid-cols-2">
                            <Row label="Tipo"><span className="capitalize">{c.tipo}</span></Row>
                            <Row label="Categoria"><span className="capitalize">{c.categoria}</span></Row>
                            <Row label="Valor"><span className="font-medium">{formatCurrency(c.valor)}</span></Row>
                            <Row label="Prazo">{c.prazo_meses ? `${c.prazo_meses} meses` : '—'}</Row>
                            <Row label="Início">{formatDateBR(c.data_inicio)}</Row>
                            <Row label="Fim">{formatDateBR(c.data_fim)}</Row>
                          </div>
                          {d !== null && (
                            <div className="pt-2 border-t">
                              {d < 0 ? (
                                <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Contrato vencido há {-d} dias</Badge>
                              ) : d <= 30 ? (
                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30 gap-1"><Clock className="h-3 w-3" /> Vence em {d} dias</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">{d} dias restantes</span>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  }) : (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">Nenhum contrato vinculado a este imóvel</p>
                        <p className="text-sm text-muted-foreground mt-1">Crie um contrato e vincule o imóvel para gerenciar aqui.</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="documentos" className="space-y-4 mt-4">
                  <DocList title="Documentos do Contrato" docs={details?.contractDocs || []} />
                  <DocList title="Documentos do Imóvel" docs={details?.propertyDocs || []} />
                </TabsContent>

                <TabsContent value="financeiro" className="space-y-4 mt-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card><CardContent className="pt-6 text-center"><p className="text-sm text-muted-foreground">Total Recebido</p><p className="text-2xl font-bold text-green-600">{formatCurrency(payments.filter((p: any) => p.inquilino_pagou).reduce((a: number, p: any) => a + Number(p.valor_total ?? p.valor_aluguel ?? 0), 0))}</p></CardContent></Card>
                    <Card><CardContent className="pt-6 text-center"><p className="text-sm text-muted-foreground">Total Repassado</p><p className="text-2xl font-bold text-blue-600">{formatCurrency(payments.filter((p: any) => p.proprietario_recebeu).reduce((a: number, p: any) => a + Number(p.valor_repasse || 0), 0))}</p></CardContent></Card>
                    <Card><CardContent className="pt-6 text-center"><p className="text-sm text-muted-foreground">Pendentes</p><p className="text-2xl font-bold text-yellow-600">{payments.filter((p: any) => !p.inquilino_pagou).length}</p></CardContent></Card>
                  </div>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Histórico de Pagamentos</CardTitle></CardHeader>
                    <CardContent>
                      {payments.length ? (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Referência</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Aluguel</TableHead>
                                <TableHead className="text-center">Inquilino</TableHead><TableHead className="text-right">Repasse</TableHead><TableHead className="text-center">Proprietário</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {payments.map((p: any) => (
                                <TableRow key={p.id}>
                                  <TableCell className="capitalize">{format(parseISO(p.mes_referencia), 'MMM/yyyy', { locale: ptBR })}</TableCell>
                                  <TableCell>{p.data_vencimento ? format(parseISO(p.data_vencimento), 'dd/MM') : '—'}</TableCell>
                                  <TableCell className="text-right font-medium">{formatCurrency(Number(p.valor_aluguel))}</TableCell>
                                  <TableCell className="text-center">{p.inquilino_pagou ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(Number(p.valor_repasse))}</TableCell>
                                  <TableCell className="text-center">{p.proprietario_recebeu ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">Nenhum pagamento registrado</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <VinculoImovelForm open={vinculoOpen} onOpenChange={setVinculoOpen} onSuccess={() => qc.invalidateQueries({ queryKey: ['properties'] })} />
    </DashboardLayout>
  );
};

export default ImoveisAlugadosVendidos;
