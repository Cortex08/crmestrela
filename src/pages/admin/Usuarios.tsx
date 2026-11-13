import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UserPlus, MoreVertical, KeyRound, ShieldCheck, UserX, UserCheck, Trash2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { MODULES, ROLE_LABELS } from '@/lib/moduleMapping';
import { ListSkeleton } from '@/components/ui/loading';

const ALL_ROLES = ['admin', 'documentacao', 'financeiro', 'consultor', 'rh', 'prospector', 'celular', 'ponto'];
const EDITABLE_ROLES = ALL_ROLES.filter((r) => r !== 'admin' && r !== 'ponto'); // "ponto" não tem módulos para configurar
const PASSWORD_HINT = 'Mínimo 8 caracteres, com letras e números';

async function callAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error || data?.error) {
    let msg = data?.error;
    try {
      msg = msg || (await (error as any)?.context?.json())?.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || 'Erro ao processar');
  }
  return data;
}

const RolePicker = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
  <div className="grid grid-cols-2 gap-2">
    {ALL_ROLES.map((r) => (
      <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={value.includes(r)} onCheckedChange={(c) => onChange(c ? [...value, r] : value.filter((x) => x !== r))} />
        {ROLE_LABELS[r]}
      </label>
    ))}
  </div>
);

const Usuarios = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ nome: '', email: '', telefone: '', password: '', roles: ['consultor'] as string[] });
  const [saving, setSaving] = useState(false);
  const [rolesEdit, setRolesEdit] = useState<{ id: string; nome: string; roles: string[] } | null>(null);
  const [pwdEdit, setPwdEdit] = useState<{ id: string; nome: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'delete' | 'status'; id: string; nome: string; status?: string } | null>(null);
  const [permRole, setPermRole] = useState('consultor');
  const [permDraft, setPermDraft] = useState<Record<string, { can_create: boolean; can_read: boolean; can_update: boolean; can_delete: boolean }> | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('id, nome, email, telefone, status, created_at').order('nome'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      const roles = (r.data || []) as { user_id: string; role: string }[];
      return (p.data || []).map((u: any) => ({ ...u, roles: roles.filter((x) => x.user_id === u.id).map((x) => x.role) }));
    },
  });

  const { data: perms = [] } = useQuery({
    queryKey: ['role-permissions', permRole],
    queryFn: async () => {
      const { data } = await supabase.from('role_permissions').select('*').eq('role', permRole);
      return data || [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setSaving(true);
    try {
      await fn();
      toast.success(ok);
      refresh();
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.roles.length) return toast.error('Escolha pelo menos um cargo');
    const ok = await run(() => callAdmin({ action: 'create', ...newUser }), 'Usuário criado!');
    if (ok) {
      setCreateOpen(false);
      setNewUser({ nome: '', email: '', telefone: '', password: '', roles: ['consultor'] });
    }
  };

  const currentPerms = permDraft ?? Object.fromEntries(
    MODULES.map((m) => {
      const p: any = perms.find((x: any) => x.module === m.id);
      return [m.id, { can_create: !!p?.can_create, can_read: !!p?.can_read, can_update: !!p?.can_update, can_delete: !!p?.can_delete }];
    }),
  );

  const togglePerm = (module: string, key: 'can_create' | 'can_read' | 'can_update' | 'can_delete', value: boolean) => {
    const next = { ...currentPerms, [module]: { ...currentPerms[module], [key]: value } };
    if (key !== 'can_read' && value) next[module].can_read = true; // quem cria/edita/exclui precisa ver
    if (key === 'can_read' && !value) next[module] = { can_create: false, can_read: false, can_update: false, can_delete: false };
    setPermDraft(next);
  };

  const savePerms = async () => {
    setSaving(true);
    const rows = Object.entries(currentPerms).map(([module, p]) => ({ role: permRole, module, ...p }));
    const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'role,module' });
    setSaving(false);
    if (error) return toast.error('Erro ao salvar permissões');
    toast.success(`Permissões de ${ROLE_LABELS[permRole]} salvas`);
    setPermDraft(null);
    queryClient.invalidateQueries({ queryKey: ['role-permissions', permRole] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Usuários</h1>
            <p className="text-muted-foreground">Gerencie a equipe, cargos e permissões</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Novo Usuário</Button>
        </div>

        <p className="text-sm text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2">
          <strong className="text-foreground">Ponto em um único celular:</strong> crie um usuário só com a função <em>{ROLE_LABELS.ponto}</em>, entre com ele nesse celular
          e deixe-o na recepção. Ele abre direto na tela de bater ponto, reconhece quem é pelo rosto e não acessa mais nada do sistema.
          Os funcionários precisam ter o rosto cadastrado em Funcionários.
        </p>

        <Tabs defaultValue="usuarios">
          <TabsList>
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
            <TabsTrigger value="permissoes">Permissões por cargo</TabsTrigger>
          </TabsList>

          <TabsContent value="usuarios" className="mt-4">
            <Card className="card-premium">
              <CardContent className="pt-6">
                {isLoading ? (
                  <ListSkeleton count={4} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="hidden md:table-cell">Email</TableHead>
                        <TableHead>Cargos</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u: any) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.nome}{u.id === user?.id && <span className="text-xs text-muted-foreground"> (você)</span>}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{u.email}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.roles.length ? u.roles.map((r: string) => <Badge key={r} variant={r === 'admin' ? 'default' : 'outline'}>{ROLE_LABELS[r] || r}</Badge>) : <span className="text-xs text-destructive">Sem cargo</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={u.status === 'ativo' ? 'bg-success/10 text-success border-success/30' : 'bg-muted text-muted-foreground'}>
                              {u.status === 'ativo' ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setRolesEdit({ id: u.id, nome: u.nome, roles: u.roles })}><ShieldCheck />Alterar cargos</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPwdEdit({ id: u.id, nome: u.nome, password: '' })}><KeyRound />Redefinir senha</DropdownMenuItem>
                                {u.id !== user?.id && (
                                  <>
                                    <DropdownMenuItem onClick={() => setConfirm({ type: 'status', id: u.id, nome: u.nome, status: u.status === 'ativo' ? 'inativo' : 'ativo' })}>
                                      {u.status === 'ativo' ? <><UserX />Desativar acesso</> : <><UserCheck />Reativar acesso</>}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setConfirm({ type: 'delete', id: u.id, nome: u.nome })}><Trash2 />Excluir usuário</DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permissoes" className="mt-4">
            <Card className="card-premium">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-lg">Permissões por cargo</CardTitle>
                  <CardDescription>O administrador sempre tem acesso total. As regras valem também no banco de dados.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={permRole} onValueChange={(v) => { setPermRole(v); setPermDraft(null); }}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>{EDITABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button onClick={savePerms} disabled={!permDraft || saving}><Save className="mr-2 h-4 w-4" />Salvar</Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Módulo</TableHead>
                      <TableHead className="text-center">Ver</TableHead>
                      <TableHead className="text-center">Criar</TableHead>
                      <TableHead className="text-center">Editar</TableHead>
                      <TableHead className="text-center">Excluir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MODULES.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        {(['can_read', 'can_create', 'can_update', 'can_delete'] as const).map((k) => (
                          <TableCell key={k} className="text-center">
                            <Checkbox checked={currentPerms[m.id]?.[k]} onCheckedChange={(c) => togglePerm(m.id, k, c === true)} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
            <form onSubmit={createUser} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label><Input required maxLength={200} value={newUser.nome} onChange={(e) => setNewUser({ ...newUser, nome: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email *</Label><Input required type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input maxLength={30} value={newUser.telefone} onChange={(e) => setNewUser({ ...newUser, telefone: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Senha inicial *</Label>
                <Input required type="text" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                <p className="text-xs text-muted-foreground">{PASSWORD_HINT}. Passe para a pessoa e peça para trocar em "Meu Perfil".</p>
              </div>
              <div className="space-y-2"><Label>Cargos *</Label><RolePicker value={newUser.roles} onChange={(roles) => setNewUser({ ...newUser, roles })} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Criando...' : 'Criar usuário'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!rolesEdit} onOpenChange={(o) => !o && setRolesEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Cargos de {rolesEdit?.nome}</DialogTitle></DialogHeader>
            {rolesEdit && (
              <div className="space-y-4">
                <RolePicker value={rolesEdit.roles} onChange={(roles) => setRolesEdit({ ...rolesEdit, roles })} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setRolesEdit(null)}>Cancelar</Button>
                  <Button
                    disabled={saving || !rolesEdit.roles.length}
                    onClick={async () => { if (await run(() => callAdmin({ action: 'update_roles', user_id: rolesEdit.id, roles: rolesEdit.roles }), 'Cargos atualizados')) setRolesEdit(null); }}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!pwdEdit} onOpenChange={(o) => !o && setPwdEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova senha para {pwdEdit?.nome}</DialogTitle></DialogHeader>
            {pwdEdit && (
              <div className="space-y-4">
                <Input type="text" autoComplete="new-password" value={pwdEdit.password} onChange={(e) => setPwdEdit({ ...pwdEdit, password: e.target.value })} />
                <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setPwdEdit(null)}>Cancelar</Button>
                  <Button
                    disabled={saving}
                    onClick={async () => { if (await run(() => callAdmin({ action: 'reset_password', user_id: pwdEdit.id, password: pwdEdit.password }), 'Senha redefinida')) setPwdEdit(null); }}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
          loading={saving}
          variant={confirm?.type === 'delete' || confirm?.status === 'inativo' ? 'danger' : 'info'}
          title={confirm?.type === 'delete' ? 'Excluir usuário' : confirm?.status === 'inativo' ? 'Desativar acesso' : 'Reativar acesso'}
          description={
            confirm?.type === 'delete'
              ? `Excluir ${confirm?.nome}? A pessoa perde o acesso e isso não pode ser desfeito. Prefira desativar se quiser manter o histórico.`
              : confirm?.status === 'inativo'
                ? `${confirm?.nome} não conseguirá mais entrar no sistema até ser reativado.`
                : `${confirm?.nome} voltará a ter acesso ao sistema.`
          }
          confirmText={confirm?.type === 'delete' ? 'Excluir' : 'Confirmar'}
          onConfirm={async () => {
            if (!confirm) return;
            const ok = confirm.type === 'delete'
              ? await run(() => callAdmin({ action: 'delete', user_id: confirm.id }), 'Usuário excluído')
              : await run(() => callAdmin({ action: 'set_status', user_id: confirm.id, status: confirm.status }), 'Status atualizado');
            if (ok) setConfirm(null);
          }}
        />
      </div>
    </DashboardLayout>
  );
};

export default Usuarios;
