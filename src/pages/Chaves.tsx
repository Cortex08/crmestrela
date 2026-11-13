import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { Key, Search, MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ChaveForm } from '@/components/forms/ChaveForm';
import { usePermissions } from '@/contexts/PermissionsContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/loading';
import { useDebounce } from '@/hooks/useDebounce';
import { friendlyError } from '@/lib/utils';

const ETIQUETAS: Record<string, [string, string]> = {
  bolsa: ['Bolsa', 'bg-blue-500 text-white'],
  local: ['Local', 'bg-green-500 text-white'],
  reserva: ['Reserva', 'bg-yellow-500 text-black'],
  devolucao: ['Devolução', 'bg-red-500 text-white'],
};

const Chaves = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [activeFilter, setActiveFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<any>(null);
  const [del, setDel] = useState<any>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('keys')
        .select('id, numero, etiqueta, entregue, observacoes, imovel_id, proprietario_id, properties(codigo, endereco), proprietario:clients!keys_proprietario_id_fkey(nome)')
        .order('numero', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['keys'] });

  const searched = useMemo(
    () =>
      !search
        ? keys
        : keys.filter((k: any) =>
            [k.numero, k.properties?.codigo, k.properties?.endereco, k.proprietario?.nome]
              .some((v) => (v || '').toLowerCase().includes(search)),
          ),
    [keys, search],
  );

  const byFilter = (f: string) =>
    f === 'all' || f === 'molho' ? searched : f === 'entregues' ? searched.filter((k: any) => k.entregue) : searched.filter((k: any) => k.etiqueta === f);
  const filtered = byFilter(activeFilter);

  // "Molho": chaves agrupadas por imóvel
  const molhos = useMemo(() => {
    const map = new Map<string, { codigo: string; endereco: string; keys: any[] }>();
    searched.forEach((k: any) => {
      const id = k.imovel_id;
      if (!map.has(id)) map.set(id, { codigo: k.properties?.codigo || '—', endereco: k.properties?.endereco || '', keys: [] });
      map.get(id)!.keys.push(k);
    });
    return Array.from(map.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [searched]);

  const toggleEntregue = async (k: any) => {
    qc.setQueryData(['keys'], (old: any[] = []) => old.map((x) => (x.id === k.id ? { ...x, entregue: !k.entregue } : x)));
    const { error } = await supabase.from('keys').update({ entregue: !k.entregue }).eq('id', k.id);
    if (error) {
      toast.error(friendlyError(error, 'Erro ao atualizar status'));
      refresh();
    } else toast.success('Status de entrega atualizado');
  };

  const remove = async () => {
    const { error } = await supabase.from('keys').delete().eq('id', del.id);
    if (error) toast.error(friendlyError(error, 'Erro ao excluir chave'));
    else toast.success('Chave excluída com sucesso');
    setDel(null);
    refresh();
  };

  const etiquetaBadge = (e: string | null) => {
    const [label, cls] = (e && ETIQUETAS[e]) || ['Sem etiqueta', 'bg-gray-500 text-white'];
    return <Badge className={cls}>{label}</Badge>;
  };

  const tabs: [string, string][] = [
    ['all', 'Todas'], ['bolsa', 'Bolsa'], ['local', 'Local'], ['reserva', 'Reserva'],
    ['devolucao', 'Devolução'], ['entregues', 'Entregues'],
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Controle de Chaves</h1>
            <p className="text-muted-foreground">Gerencie e organize todas as chaves dos imóveis</p>
          </div>
          {canCreate('chaves') && (
            <Button onClick={() => { setEditingKey(null); setFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Nova Chave
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por número, código, endereço ou proprietário..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>

        <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
          <TabsList className="flex flex-wrap h-auto w-full justify-start">
            {tabs.map(([v, l]) => <TabsTrigger key={v} value={v}>{l} ({byFilter(v).length})</TabsTrigger>)}
            <TabsTrigger value="molho">Molho ({molhos.length})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeFilter} className="mt-6">
            {isLoading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Key className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Nenhuma chave encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">{searchTerm ? 'Tente buscar com outros termos' : 'Cadastre a primeira chave do sistema'}</p>
              </div>
            ) : activeFilter === 'molho' ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {molhos.map((m) => (
                  <Card key={m.codigo + m.endereco} className="card-premium">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4 text-primary" /> {m.codigo}</CardTitle>
                      <p className="text-xs text-muted-foreground">{m.endereco}</p>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {m.keys.map((k) => (
                        <div key={k.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                          <span className="font-medium">Nº {k.numero}</span>
                          {etiquetaBadge(k.etiqueta)}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]"><Key className="h-4 w-4" /></TableHead>
                      <TableHead className="w-[100px]">Nº Chave</TableHead>
                      <TableHead>Local (Endereço)</TableHead>
                      <TableHead>Proprietário</TableHead>
                      <TableHead className="w-[140px]">Etiqueta</TableHead>
                      <TableHead className="w-[100px] text-center">Entregue</TableHead>
                      <TableHead>Observações</TableHead>
                      <TableHead className="w-[80px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((k: any) => (
                      <TableRow key={k.id}>
                        <TableCell><div className="flex justify-center"><Key className="h-5 w-5 text-primary" /></div></TableCell>
                        <TableCell className="font-medium">{k.numero}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{k.properties?.codigo}</span>
                            <span className="text-xs text-muted-foreground">{k.properties?.endereco}</span>
                          </div>
                        </TableCell>
                        <TableCell>{k.proprietario?.nome || '-'}</TableCell>
                        <TableCell>{etiquetaBadge(k.etiqueta)}</TableCell>
                        <TableCell>
                          <div className="flex justify-center">
                            <Checkbox checked={!!k.entregue} onCheckedChange={() => toggleEntregue(k)} disabled={!canUpdate('chaves')} />
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          {k.observacoes ? <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{k.observacoes}</p> : <span className="text-muted-foreground text-sm">-</span>}
                        </TableCell>
                        <TableCell>
                          {(canUpdate('chaves') || canDelete('chaves')) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canUpdate('chaves') && (
                                  <DropdownMenuItem onClick={() => { setEditingKey(k); setFormOpen(true); }}>
                                    <Pencil className="mr-2 h-4 w-4" /> Editar
                                  </DropdownMenuItem>
                                )}
                                {canDelete('chaves') && (
                                  <DropdownMenuItem onClick={() => setDel(k)} className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ChaveForm open={formOpen} onOpenChange={setFormOpen} editingKey={editingKey} onSuccess={refresh} />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        onConfirm={remove}
        title="Excluir Chave"
        description={`Tem certeza que deseja excluir a chave nº ${del?.numero}? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
      />
    </DashboardLayout>
  );
};

export default Chaves;
