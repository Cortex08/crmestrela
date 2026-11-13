import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/loading';
import { FuncionarioForm } from '@/components/forms/FuncionarioForm';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useDebounce } from '@/hooks/useDebounce';
import { CARGOS, DEPARTAMENTOS, DEPARTAMENTO_CORES } from '@/lib/rh';
import { downloadCSV } from '@/lib/csv';
import { FaceCapture } from '@/components/FaceCapture';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { formatCurrency, formatDateBR, friendlyError } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus, Search, MoreHorizontal, Pencil, Trash2, History, MessageCircle, Copy, Download, UsersRound, UserCheck, UserX, KeyRound, Building2, Briefcase, ScanFace } from 'lucide-react';

type Vista = 'todos' | 'ativos' | 'departamentos' | 'cargos' | 'relatorio';

const Funcionarios = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>('ativos');
  const [busca, setBusca] = useState('');
  const q = useDebounce(busca, 250).toLowerCase();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const [hist, setHist] = useState<any>(null);
  const [rostoDe, setRostoDe] = useState<any>(null);
  const [rostoDel, setRostoDel] = useState<any>(null);

  const { data: emps = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('*').order('nome').limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rostos = [] } = useQuery({
    queryKey: ['rostos-cadastrados-rh'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rostos_cadastrados');
      if (error) throw error;
      return (data || []) as { employee_id: string }[];
    },
  });
  const temRosto = (id: string) => rostos.some((r) => r.employee_id === id);

  const { data: historico = [] } = useQuery({
    queryKey: ['employee-history', hist?.id],
    enabled: !!hist,
    queryFn: async () => {
      const { data, error } = await supabase.from('employee_history').select('*').eq('employee_id', hist.id).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const filtrados = useMemo(() => emps.filter((e: any) => {
    if (vista !== 'todos' && vista !== 'relatorio' && e.status !== 'ativo') return false;
    if (!q) return true;
    return [e.nome, e.email, e.telefone, DEPARTAMENTOS[e.departamento], CARGOS[e.cargo]].some((v) => (v || '').toLowerCase().includes(q));
  }), [emps, vista, q]);

  const ativos = emps.filter((e: any) => e.status === 'ativo');
  const folhaMensal = ativos.reduce((s: number, e: any) => s + (Number(e.salario_fixo) || 0), 0);
  const semConta = ativos.filter((e: any) => !e.user_id).length;

  const agrupar = (campo: 'departamento' | 'cargo') => {
    const m = new Map<string, any[]>();
    filtrados.forEach((e: any) => { const k = e[campo]; m.set(k, [...(m.get(k) || []), e]); });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ['employees'] });

  const excluir = async () => {
    const { error } = await supabase.from('employees').delete().eq('id', del.id);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir funcionário'));
    toast.success('Funcionário excluído');
    setDel(null);
    refresh();
  };

  const msgAcesso = (e: any) =>
    `Olá ${e.nome.split(' ')[0]}! Seu acesso ao CRM Estrela de Davi:\n\n🔗 ${window.location.origin}/login\n📧 Login: ${e.email || '(seu email)'}\n\nUse a senha que o administrador passou para você. Para bater o ponto, abra o menu "Ponto".`;

  const exportar = () => {
    downloadCSV('funcionarios', ['Nome', 'Email', 'Telefone', 'Departamento', 'Cargo', 'Status', 'Admissão', 'Saída', 'Salário', 'Comissão', 'Horário', 'Conta de acesso'],
      filtrados.map((e: any) => [e.nome, e.email, e.telefone, DEPARTAMENTOS[e.departamento], CARGOS[e.cargo], e.status, formatDateBR(e.data_admissao),
        formatDateBR(e.data_saida), e.salario_fixo, e.comissao_acordada, e.horario_trabalho, e.user_id ? 'Sim' : 'Não']));
  };

  const linha = (e: any) => (
    <TableRow key={e.id} className={e.status !== 'ativo' ? 'opacity-60' : ''}>
      <TableCell>
        <div className="font-medium">{e.nome}</div>
        <div className="text-xs text-muted-foreground">{e.email || '—'}</div>
      </TableCell>
      <TableCell><Badge variant="outline" className={DEPARTAMENTO_CORES[e.departamento]}>{DEPARTAMENTOS[e.departamento]}</Badge></TableCell>
      <TableCell>{CARGOS[e.cargo]}</TableCell>
      <TableCell className="hidden md:table-cell">{e.telefone || '—'}</TableCell>
      <TableCell className="hidden lg:table-cell">{formatDateBR(e.data_admissao)}</TableCell>
      <TableCell className="hidden lg:table-cell text-right">{e.salario_fixo != null ? formatCurrency(e.salario_fixo) : '—'}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 items-start">
          <Badge className={e.status === 'ativo' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-700 hover:bg-gray-100'}>{e.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge>
          {!e.user_id && e.status === 'ativo' && <span className="text-[11px] text-amber-600">sem acesso</span>}
          {e.status === 'ativo' && (temRosto(e.id) ? <span className="text-[11px] text-green-600">rosto cadastrado</span> : <span className="text-[11px] text-muted-foreground">sem rosto</span>)}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate('funcionarios') && <DropdownMenuItem onClick={() => { setEditing(e); setFormOpen(true); }}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => setHist(e)}><History className="h-4 w-4 mr-2" />Histórico</DropdownMenuItem>
            {canUpdate('funcionarios') && <DropdownMenuItem onClick={() => setRostoDe(e)}><ScanFace className="h-4 w-4 mr-2" />{temRosto(e.id) ? 'Refazer rosto' : 'Cadastrar rosto'}</DropdownMenuItem>}
            {canUpdate('funcionarios') && temRosto(e.id) && <DropdownMenuItem onClick={() => setRostoDel(e)}><ScanFace className="h-4 w-4 mr-2" />Remover rosto</DropdownMenuItem>}
            {e.user_id && hasValidWhatsapp(e.telefone) && <DropdownMenuItem onClick={() => openWhatsapp(e.telefone, msgAcesso(e))}><MessageCircle className="h-4 w-4 mr-2" />Enviar acesso no WhatsApp</DropdownMenuItem>}
            {e.user_id && <DropdownMenuItem onClick={() => navigator.clipboard.writeText(msgAcesso(e)).then(() => toast.success('Mensagem copiada'))}><Copy className="h-4 w-4 mr-2" />Copiar link de acesso</DropdownMenuItem>}
            {canDelete('funcionarios') && (<><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => setDel(e)}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem></>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );

  const tabela = (lista: any[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead><TableHead>Departamento</TableHead><TableHead>Cargo</TableHead>
            <TableHead className="hidden md:table-cell">Telefone</TableHead><TableHead className="hidden lg:table-cell">Admissão</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Salário</TableHead><TableHead>Status</TableHead><TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.length === 0
            ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Nenhum funcionário encontrado</TableCell></TableRow>
            : lista.map(linha)}
        </TableBody>
      </Table>
    </div>
  );

  const kpi = (icon: React.ReactNode, label: string, value: React.ReactNode, cor: string) => (
    <Card><CardContent className="pt-6 flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${cor}`}>{icon}</div>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
    </CardContent></Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Funcionários</h1>
            <p className="text-muted-foreground">Equipe, cargos, departamentos e acesso ao sistema</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-2" />Exportar</Button>
            {canCreate('funcionarios') && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo Funcionário</Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpi(<UsersRound className="h-5 w-5 text-blue-600" />, 'Total', emps.length, 'bg-blue-100')}
          {kpi(<UserCheck className="h-5 w-5 text-green-600" />, 'Ativos', ativos.length, 'bg-green-100')}
          {kpi(<KeyRound className="h-5 w-5 text-amber-600" />, 'Ativos sem acesso', semConta, 'bg-amber-100')}
          {kpi(<UserX className="h-5 w-5 text-purple-600" />, 'Folha fixa mensal', formatCurrency(folhaMensal), 'bg-purple-100')}
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="ativos">Ativos</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
              <TabsTrigger value="cargos">Cargos</TabsTrigger>
              <TabsTrigger value="relatorio">Relatório</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar funcionário..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>

        {isLoading ? <TableSkeleton /> : (
          <>
            {(vista === 'ativos' || vista === 'todos') && <Card><CardContent className="pt-4">{tabela(filtrados)}</CardContent></Card>}

            {(vista === 'departamentos' || vista === 'cargos') && (
              <div className="space-y-4">
                {agrupar(vista === 'departamentos' ? 'departamento' : 'cargo').map(([k, lista]) => (
                  <Card key={k}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        {vista === 'departamentos' ? <Building2 className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                        {vista === 'departamentos' ? DEPARTAMENTOS[k] : CARGOS[k]}
                        <Badge variant="secondary">{lista.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>{tabela(lista)}</CardContent>
                  </Card>
                ))}
                {filtrados.length === 0 && <p className="text-center text-muted-foreground py-10">Nenhum funcionário ativo</p>}
              </div>
            )}

            {vista === 'relatorio' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(['departamento', 'cargo'] as const).map((campo) => {
                  const grupos = new Map<string, { n: number; sal: number }>();
                  ativos.forEach((e: any) => {
                    const g = grupos.get(e[campo]) || { n: 0, sal: 0 };
                    grupos.set(e[campo], { n: g.n + 1, sal: g.sal + (Number(e.salario_fixo) || 0) });
                  });
                  const max = Math.max(1, ...[...grupos.values()].map((g) => g.n));
                  return (
                    <Card key={campo}>
                      <CardHeader><CardTitle className="text-base">Ativos por {campo === 'departamento' ? 'departamento' : 'cargo'}</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {[...grupos.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, g]) => (
                          <div key={k}>
                            <div className="flex justify-between text-sm mb-1">
                              <span>{campo === 'departamento' ? DEPARTAMENTOS[k] : CARGOS[k]}</span>
                              <span className="text-muted-foreground">{g.n} · {formatCurrency(g.sal)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(g.n / max) * 100}%` }} /></div>
                          </div>
                        ))}
                        {grupos.size === 0 && <p className="text-sm text-muted-foreground">Sem dados</p>}
                      </CardContent>
                    </Card>
                  );
                })}
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-muted-foreground">Inativos</p><p className="text-lg font-semibold">{emps.length - ativos.length}</p></div>
                    <div><p className="text-muted-foreground">Salário médio</p><p className="text-lg font-semibold">{formatCurrency(ativos.length ? folhaMensal / ativos.length : 0)}</p></div>
                    <div><p className="text-muted-foreground">Com acesso ao sistema</p><p className="text-lg font-semibold">{ativos.length - semConta}</p></div>
                    <div><p className="text-muted-foreground">Admitidos este ano</p><p className="text-lg font-semibold">{emps.filter((e: any) => e.data_admissao?.startsWith(String(new Date().getFullYear()))).length}</p></div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle></DialogHeader>
          <FuncionarioForm funcionario={editing} onCancel={() => setFormOpen(false)} onSuccess={() => { setFormOpen(false); setEditing(null); refresh(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!hist} onOpenChange={(o) => !o && setHist(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Histórico — {hist?.nome}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {historico.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhuma alteração registrada</p>}
            {historico.map((h: any) => {
              const val = (v: string | null) => (h.tipo === 'cargo' ? CARGOS[v || ''] : h.tipo === 'departamento' ? DEPARTAMENTOS[v || ''] : h.tipo === 'salario' && v ? formatCurrency(Number(v)) : v) || '—';
              return (
                <div key={h.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex justify-between"><span className="font-medium">{h.descricao}</span><span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString('pt-BR')}</span></div>
                  {(h.valor_anterior || h.valor_novo) && <p className="text-muted-foreground mt-1">{val(h.valor_anterior)} → {val(h.valor_novo)}</p>}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <FaceCapture
        open={!!rostoDe}
        onOpenChange={(o) => !o && setRostoDe(null)}
        titulo={`Cadastrar rosto — ${rostoDe?.nome || ''}`}
        descricao="A própria pessoa deve estar na frente da câmera, de frente, em local claro."
        onRosto={async (d) => {
          const { error } = await supabase.rpc('cadastrar_rosto', { _employee_id: rostoDe.id, _descriptor: d });
          if (error) throw new Error(friendlyError(error, 'Erro ao cadastrar o rosto'));
          toast.success('Rosto cadastrado!');
          qc.invalidateQueries({ queryKey: ['rostos-cadastrados-rh'] });
          setRostoDe(null);
        }}
      />
      <ConfirmDialog
        open={!!rostoDel}
        onOpenChange={(o) => !o && setRostoDel(null)}
        title="Remover o rosto cadastrado?"
        description={`O cadastro facial de ${rostoDel?.nome} será apagado. Ele ainda poderá bater o ponto, mas sem verificação facial, até cadastrar de novo.`}
        confirmText="Remover"
        onConfirm={async () => {
          const { error } = await supabase.rpc('remover_rosto', { _employee_id: rostoDel.id });
          if (error) toast.error(friendlyError(error, 'Erro ao remover o rosto'));
          else { toast.success('Rosto removido'); qc.invalidateQueries({ queryKey: ['rostos-cadastrados-rh'] }); }
          setRostoDel(null);
        }}
      />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Excluir funcionário?"
        description={`${del?.nome} e todo o histórico de ponto, banco de horas e folha dele serão apagados. Para manter o histórico, prefira marcar como Inativo.`}
        onConfirm={excluir}
      />
    </DashboardLayout>
  );
};

export default Funcionarios;
