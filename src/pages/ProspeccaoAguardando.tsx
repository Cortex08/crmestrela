import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Search, FileWarning, CheckCircle, Pencil, AlertCircle, Loader2 } from 'lucide-react';
import { ImovelEditDialog } from '@/components/forms/ImovelEditDialog';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateBR, friendlyError } from '@/lib/utils';

const PENDENTE_LABEL: Record<string, string> = { proprietario: 'Proprietário', fotos: 'Fotos', detalhes: 'Detalhes', documentos: 'Documentos', valores: 'Valores' };

/** Quais itens ainda faltam no imóvel (calculado com os dados atuais) */
const pendencias = (p: any) => {
  const out: string[] = [];
  if (!p.proprietario_id) out.push('proprietario');
  if (!p.fotos?.length) out.push('fotos');
  if (p.quartos === null || p.banheiros === null || !p.descricao) out.push('detalhes');
  if (!(Number(p.valor_venda) > 0) && !(Number(p.valor_aluguel) > 0)) out.push('valores');
  return out;
};
const progresso = (p: any) => {
  let ok = 0;
  if (p.proprietario_id) ok++;
  if (p.fotos?.length) ok++;
  if (p.quartos !== null && p.banheiros !== null) ok++;
  if (p.descricao) ok++;
  if (Number(p.valor_venda) > 0 || Number(p.valor_aluguel) > 0) ok++;
  return (ok / 5) * 100;
};

export default function ProspeccaoAguardando() {
  const qc = useQueryClient();
  const { canUpdate } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const search = useDebounce(searchTerm, 250).toLowerCase();
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['pending-properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*, prospect:property_prospects!properties_prospect_id_fkey(proprietario_nome, proprietario_telefone, tipo_imovel), proprietario:clients!properties_proprietario_id_fkey(nome)')
        .eq('aguardando_dados', true)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(
    () => items.filter((p: any) => !search || [p.endereco, p.bairro, p.codigo, p.prospect?.proprietario_nome, p.proprietario?.nome].some((v) => (v || '').toLowerCase().includes(search))),
    [items, search],
  );

  const refresh = () => { qc.invalidateQueries({ queryKey: ['pending-properties'] }); qc.invalidateQueries({ queryKey: ['properties'] }); };

  const concluir = async (p: any) => {
    setBusy(p.id);
    const { error } = await supabase.from('properties').update({ aguardando_dados: false, dados_pendentes: [] }).eq('id', p.id);
    setBusy(null);
    if (error) return toast.error(friendlyError(error, 'Erro ao atualizar imóvel'));
    toast.success('Imóvel marcado como completo!');
    refresh();
  };

  const kpis: [string, number, string][] = [
    ['Aguardando Dados', items.length, 'text-orange-500'],
    ['Sem Proprietário', items.filter((p: any) => !p.proprietario_id).length, 'text-red-500'],
    ['Sem Fotos', items.filter((p: any) => !p.fotos?.length).length, 'text-yellow-500'],
    ['Sem Valores', items.filter((p: any) => !(Number(p.valor_venda) > 0) && !(Number(p.valor_aluguel) > 0)).length, 'text-blue-500'],
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileWarning className="h-6 w-6 text-orange-500" /> Prospecção (Aguardando Dados)</h1>
          <p className="text-muted-foreground">Imóveis captados que aguardam informações completas</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(([l, v, c]) => (
            <Card key={l}><CardContent className="p-4 text-center"><p className={`text-3xl font-bold ${c}`}>{v}</p><p className="text-sm text-muted-foreground">{l}</p></CardContent></Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por endereço, código, proprietário..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Imóveis Pendentes</CardTitle>
            <CardDescription>Complete os dados para disponibilizar o imóvel no sistema</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead><TableHead>Endereço</TableHead><TableHead>Tipo</TableHead><TableHead>Proprietário</TableHead>
                    <TableHead>Progresso</TableHead><TableHead>Pendências</TableHead><TableHead>Data</TableHead><TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle className="h-12 w-12 text-green-500" />
                          <p>Nenhum imóvel aguardando dados!</p>
                          <p className="text-xs">Todos os imóveis captados já estão completos.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p: any) => {
                      const prog = progresso(p);
                      const pend = pendencias(p);
                      return (
                        <TableRow key={p.id}>
                          <TableCell><Badge variant="outline">{p.codigo}</Badge></TableCell>
                          <TableCell><p className="font-medium">{p.endereco}</p><p className="text-xs text-muted-foreground">{p.bairro}, {p.cidade}</p></TableCell>
                          <TableCell><Badge variant={p.tipo === 'venda' ? 'default' : 'secondary'}>{p.tipo === 'venda' ? 'Venda' : 'Locação'}</Badge></TableCell>
                          <TableCell>
                            {p.proprietario?.nome || p.prospect?.proprietario_nome || (
                              <span className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Não vinculado</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="h-2 w-24 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${prog}%` }} /></div>
                              <span className="text-xs text-muted-foreground">{Math.round(prog)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {pend.map((i) => <Badge key={i} variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">{PENDENTE_LABEL[i] || i}</Badge>)}
                              {pend.length === 0 && <span className="text-xs text-green-700">Tudo preenchido</span>}
                            </div>
                          </TableCell>
                          <TableCell>{formatDateBR(p.created_at)}</TableCell>
                          <TableCell className="text-right">
                            {canUpdate('imoveis') && (
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setEditing(p)}><Pencil className="h-4 w-4 mr-1" /> {prog > 0 ? 'Continuar' : 'Preencher'}</Button>
                                {prog >= 80 && (
                                  <Button size="sm" onClick={() => concluir(p)} disabled={busy === p.id} className="bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="h-4 w-4 mr-1" /> Concluir
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {editing && (
        <ImovelEditDialog rascunho property={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} onSuccess={() => { setEditing(null); refresh(); }} />
      )}
    </DashboardLayout>
  );
}
