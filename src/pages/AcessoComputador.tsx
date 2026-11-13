import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Monitor, KeyRound, ScrollText, Plus, Copy, Lock, Unlock, RefreshCw, Ban, ShieldCheck, Download } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingCard } from '@/components/ui/loading';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { friendlyError } from '@/lib/utils';

const FUNCAO_URL = 'https://xwcuaicofmufcdzhtkqr.supabase.co/functions/v1/pc-bloqueio';
const rpc = async (nome: string, args?: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(nome as any, args as any);
  if (error) throw new Error(friendlyError(error, 'Não foi possível concluir a ação'));
  return data as any;
};
const dh = (v?: string | null) => (v ? format(new Date(v), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—');
// Versao do programa de bloqueio (atualize junto com public/BloqueadorPC.bat)
const BLOQUEADOR_VERSAO = '1.2';
const BLOQUEADOR_DATA = '13/11/2026';
const BLOQUEADOR_NOVIDADES = 'Mostra o progresso da instalação, token visível ao colar e pede para reiniciar o PC no final.';

const cpfFmt = (c: string) => (c?.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c || 'sem CPF');

const EVENTOS: Record<string, { label: string; cls: string }> = {
  login_correto: { label: 'Login correto', cls: 'bg-green-100 text-green-800 border-green-200' },
  login_falhou: { label: 'Login falhou', cls: 'bg-red-100 text-red-800 border-red-200' },
  bloqueio_ativado: { label: 'Bloqueio ativado', cls: 'bg-slate-100 text-slate-800 border-slate-200' },
  liberacao_admin: { label: 'Liberação por admin', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  liberacao_aplicada: { label: 'Liberação aplicada no PC', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  liberacao_encerrada: { label: 'Liberação encerrada', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  bloqueio_admin: { label: 'Bloqueio por admin', cls: 'bg-slate-100 text-slate-800 border-slate-200' },
  pc_sem_comunicacao: { label: 'PC sem comunicação', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
};

/* ------------------------------ Aba 1: Acesso ao Computador ------------------------------ */
function AbaAcessos() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['pc-acessos'], queryFn: () => rpc('pc_acessos_listar') });
  const [alvo, setAlvo] = useState<any>(null);
  const [senha, setSenha] = useState('');
  const [busca, setBusca] = useState('');

  const salvar = useMutation({
    mutationFn: () => rpc('pc_definir_senha', { _employee: alvo.employee_id, _senha: senha }),
    onSuccess: () => { toast.success('Senha do bloqueio salva'); setAlvo(null); setSenha(''); qc.invalidateQueries({ queryKey: ['pc-acessos'] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const alternar = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => rpc('pc_definir_acesso_ativo', { _employee: v.id, _ativo: v.ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pc-acessos'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const lista = (data as any[]).filter((f) => f.nome?.toLowerCase().includes(busca.toLowerCase()) || f.cpf?.includes(busca.replace(/\D/g, '') || '§'));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Input placeholder="Buscar funcionário ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Senhas são guardadas com bcrypt. Ninguém consegue ver a senha, nem o hash.</p>
      </div>
      {isLoading ? <LoadingCard /> : (
        <div className="grid gap-2">
          {lista.map((f) => (
            <Card key={f.employee_id}><CardContent className="p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{f.nome}</p>
                <p className="text-xs text-muted-foreground">CPF {cpfFmt(f.cpf)} · Última troca de senha: {dh(f.senha_trocada_em)}</p>
              </div>
              <div className="flex items-center gap-3">
                {f.tem_senha ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={f.ativo} onCheckedChange={(v) => alternar.mutate({ id: f.employee_id, ativo: v })} aria-label="Acesso ativo" />
                    {f.ativo ? 'Ativo' : 'Inativo'}
                  </label>
                ) : <Badge variant="outline">Sem senha</Badge>}
                <Button size="sm" variant="outline" disabled={f.cpf?.length !== 11} title={f.cpf?.length !== 11 ? 'Cadastre o CPF do funcionário primeiro' : ''} onClick={() => { setAlvo(f); setSenha(''); }}>
                  <KeyRound className="h-4 w-4 mr-1" />{f.tem_senha ? 'Trocar senha' : 'Definir senha'}
                </Button>
              </div>
            </CardContent></Card>
          ))}
          {!lista.length && <p className="text-sm text-muted-foreground text-center py-6">Nenhum funcionário encontrado.</p>}
        </div>
      )}
      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Senha do bloqueio — {alvo?.nome}</DialogTitle>
            <DialogDescription>Mínimo de 6 caracteres. Entregue a senha ao funcionário em mãos; ela não pode ser consultada depois.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="pc-senha">Nova senha</Label>
            <Input id="pc-senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setAlvo(null)}>Cancelar</Button>
            <Button disabled={senha.length < 6 || salvar.isPending} onClick={() => salvar.mutate()}>Salvar senha</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ Aba 2: Computadores ------------------------------ */
function AbaComputadores() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['pc-computadores'], queryFn: () => rpc('pc_computadores_listar'), refetchInterval: 15000 });
  const [novo, setNovo] = useState(false);
  const [ident, setIdent] = useState('');
  const [rede, setRede] = useState('');
  const [token, setToken] = useState<{ pc: string; token: string } | null>(null);
  const [lib, setLib] = useState<any>(null);
  const [minutos, setMinutos] = useState('60');
  const [motivo, setMotivo] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['pc-computadores'] });
  const falha = (e: any) => toast.error(e.message);

  const criar = useMutation({
    mutationFn: () => rpc('pc_criar_computador', { _identificacao: ident, _nome_rede: rede }),
    onSuccess: (r: any) => { setNovo(false); setToken({ pc: ident, token: r.token }); setIdent(''); setRede(''); refresh(); },
    onError: falha,
  });
  const liberar = useMutation({
    mutationFn: () => rpc('pc_liberar', { _id: lib.id, _minutos: Number(minutos), _motivo: motivo }),
    onSuccess: () => { toast.success('PC liberado'); setLib(null); setMotivo(''); refresh(); },
    onError: falha,
  });
  const bloquear = useMutation({ mutationFn: (id: string) => rpc('pc_bloquear', { _id: id }), onSuccess: () => { toast.success('PC bloqueado'); refresh(); }, onError: falha });
  const novoToken = useMutation({
    mutationFn: (pc: any) => rpc('pc_novo_token', { _id: pc.id }).then((t: string) => ({ pc: pc.identificacao, token: t })),
    onSuccess: (t) => { setToken(t); refresh(); }, onError: falha,
  });
  const revogar = useMutation({ mutationFn: (id: string) => rpc('pc_revogar', { _id: id }), onSuccess: () => { toast.success('PC revogado'); refresh(); }, onError: falha });
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Copiado'); } catch { toast.error('Copie manualmente'); } };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">Somente administradores alteram o status. Toda liberação expira e fica registrada com o seu nome.</p>
        <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4 mr-1" />Cadastrar PC</Button>
      </div>
      {isLoading ? <LoadingCard /> : (
        <div className="grid gap-2">
          {(data as any[]).map((pc) => (
            <Card key={pc.id} className={pc.ativo ? '' : 'opacity-60'}><CardContent className="p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Monitor className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium">{pc.identificacao} <span className="text-xs text-muted-foreground font-normal">{pc.nome_rede && `· ${pc.nome_rede}`}</span></p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className={`inline-block h-2 w-2 rounded-full ${pc.online ? 'bg-green-500' : 'bg-red-500'}`} />
                      {pc.online ? 'Online' : 'Sem comunicação'} · Última comunicação: {dh(pc.ultima_comunicacao)}
                    </p>
                  </div>
                </div>
                <Badge className={pc.status === 'liberado' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-200 text-slate-800 border-slate-300'}>
                  {!pc.ativo ? 'Revogado' : pc.status === 'liberado' ? 'Liberado' : 'Bloqueado'}
                </Badge>
              </div>
              {pc.status === 'liberado' && (
                <p className="text-sm">Liberado até <strong>{dh(pc.liberado_ate)}</strong> por <strong>{pc.liberado_por_nome}</strong> — {pc.motivo_liberacao}</p>
              )}
              {pc.ativo && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => { setLib(pc); setMinutos('60'); setMotivo(''); }}><Unlock className="h-4 w-4 mr-1" />Liberar</Button>
                  <Button size="sm" variant="outline" disabled={pc.status !== 'liberado'} onClick={() => bloquear.mutate(pc.id)}><Lock className="h-4 w-4 mr-1" />Bloquear agora</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm('Gerar um novo token invalida o anterior. O PC precisará ser reconfigurado. Continuar?')) novoToken.mutate(pc); }}><RefreshCw className="h-4 w-4 mr-1" />Novo token</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Revogar ${pc.identificacao}? O PC perde a comunicação com o CRM.`)) revogar.mutate(pc.id); }}><Ban className="h-4 w-4 mr-1" />Revogar</Button>
                </div>
              )}
            </CardContent></Card>
          ))}
          {!(data as any[]).length && <p className="text-sm text-muted-foreground text-center py-6">Nenhum PC cadastrado. Clique em "Cadastrar PC".</p>}
        </div>
      )}

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar PC</DialogTitle><DialogDescription>Um token exclusivo será gerado para este computador.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="pc-id">Identificação</Label><Input id="pc-id" placeholder="PC 1" value={ident} onChange={(e) => setIdent(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="pc-rede">Nome da máquina na rede</Label><Input id="pc-rede" placeholder="DESKTOP-ABC123" value={rede} onChange={(e) => setRede(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button><Button disabled={!ident.trim() || criar.isPending} onClick={() => criar.mutate()}>Cadastrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!token} onOpenChange={(o) => !o && setToken(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Token de {token?.pc}</DialogTitle>
            <DialogDescription>Aparece só desta vez. Digite no instalador do PC. Se perder, gere um novo.</DialogDescription></DialogHeader>
          <div className="rounded-md border bg-muted p-3 font-mono text-xs break-all select-all">{token?.token}</div>
          <p className="text-xs text-muted-foreground">URL do servidor: <span className="font-mono break-all">{FUNCAO_URL}</span></p>
          <DialogFooter><Button variant="outline" onClick={() => token && copiar(token.token)}><Copy className="h-4 w-4 mr-1" />Copiar token</Button><Button onClick={() => setToken(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lib} onOpenChange={(o) => !o && setLib(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Liberar {lib?.identificacao}</DialogTitle><DialogDescription>A liberação expira sozinha e fica registrada em seu nome.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Por quanto tempo?</Label>
              <Select value={minutos} onValueChange={setMinutos}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                {[['15', '15 minutos'], ['30', '30 minutos'], ['60', '1 hora'], ['120', '2 horas'], ['240', '4 horas'], ['480', '8 horas'], ['720', '12 horas']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor="pc-motivo">Motivo</Label><Textarea id="pc-motivo" rows={2} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLib(null)}>Cancelar</Button><Button disabled={!motivo.trim() || liberar.isPending} onClick={() => liberar.mutate()}>Liberar PC</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------ Aba 3: Registros de Acesso ------------------------------ */
function AbaRegistros() {
  const [evento, setEvento] = useState('todos');
  const { data = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pc-registros', evento],
    queryFn: () => rpc('pc_registros_listar', { _limite: 500, _evento: evento === 'todos' ? null : evento, _pc: null }),
    refetchInterval: 30000,
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Select value={evento} onValueChange={setEvento}><SelectTrigger className="w-60"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="todos">Todos os eventos</SelectItem>
          {Object.entries(EVENTOS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
        </SelectContent></Select>
        <div className="flex items-center gap-2"><p className="text-xs text-muted-foreground">Somente leitura: ninguém edita nem apaga.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className="h-4 w-4 mr-1" />Atualizar</Button></div>
      </div>
      {isLoading ? <LoadingCard /> : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Data e hora</th><th className="p-2">Computador</th><th className="p-2">Funcionário / CPF</th><th className="p-2">Evento</th><th className="p-2">Quem fez</th><th className="p-2">Detalhe</th></tr></thead>
            <tbody>
              {(data as any[]).map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{dh(r.ocorrido_em)}</td>
                  <td className="p-2">{r.computador_nome || '—'}</td>
                  <td className="p-2">{r.funcionario_nome || '—'}{r.cpf_mascarado && <span className="block text-xs text-muted-foreground">{r.cpf_mascarado}</span>}</td>
                  <td className="p-2"><Badge className={EVENTOS[r.evento]?.cls}>{EVENTOS[r.evento]?.label || r.evento}</Badge></td>
                  <td className="p-2">{r.feito_por_nome || '—'}</td>
                  <td className="p-2 text-muted-foreground">{r.detalhe || ''}</td>
                </tr>
              ))}
              {!(data as any[]).length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum registro ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AcessoComputador() {
  const { roles } = useAuth();
  if (!roles.includes('admin')) return <Navigate to="/" replace />;
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6" />Acesso ao Computador</h1>
          <p className="text-sm text-muted-foreground">Bloqueio dos computadores da empresa integrado ao CRM</p></div>
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 space-y-1">
              <p className="font-semibold flex items-center gap-2 flex-wrap"><Download className="h-4 w-4" />Programa para instalar no computador
                <Badge variant="secondary">Bloqueador versão {BLOQUEADOR_VERSAO}</Badge>
                <span className="text-xs font-normal text-muted-foreground">atualizado em {BLOQUEADOR_DATA}</span></p>
              <p className="text-xs text-muted-foreground">Novidades: {BLOQUEADOR_NOVIDADES}</p>
              <p className="text-sm text-muted-foreground">
                Baixe o arquivo e dê dois cliques no PC que será bloqueado (Windows). Ele pede permissão de administrador e instala tudo sozinho. Na primeira vez pede o token do computador: cadastre o PC na aba Computadores (Cadastrar PC), copie o token e cole quando o programa pedir (basta apertar Enter na pergunta da URL).
                Para remover depois: abra o prompt de comando como administrador e rode <code className="text-xs bg-muted px-1 rounded">BloqueadorPC.bat desinstalar</code>.
              </p>
              <p className="text-xs text-muted-foreground">Se o Windows avisar que o arquivo não é comum, clique em “Mais informações” → “Executar assim mesmo”.</p>
            </div>
            <Button asChild><a href={`/BloqueadorPC.bat?v=${BLOQUEADOR_VERSAO}`} download="BloqueadorPC.bat"><Download className="h-4 w-4 mr-2" />Baixar programa</a></Button>
          </CardContent>
        </Card>
        <Tabs defaultValue="computadores">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="computadores">Computadores</TabsTrigger>
            <TabsTrigger value="acessos">Acesso ao Computador</TabsTrigger>
            <TabsTrigger value="registros">Registros de Acesso</TabsTrigger>
          </TabsList>
          <TabsContent value="computadores"><AbaComputadores /></TabsContent>
          <TabsContent value="acessos"><AbaAcessos /></TabsContent>
          <TabsContent value="registros"><AbaRegistros /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
