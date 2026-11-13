import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, User, UserPlus, Briefcase, Clock, DollarSign, Link2, CheckCircle2 } from 'lucide-react';
import { CARGOS, DEPARTAMENTOS, DEPARTAMENTO_CORES } from '@/lib/rh';
import { ROLE_LABELS } from '@/lib/moduleMapping';
import { friendlyError, toNumber } from '@/lib/utils';

interface Props {
  funcionario?: any | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const ROLES = ['admin', 'documentacao', 'financeiro', 'consultor', 'rh', 'prospector', 'celular'];

const fmtCPF = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
};

async function callAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error || data?.error) {
    let msg = data?.error;
    try { msg = msg || (await (error as any)?.context?.json())?.error; } catch { /* ignore */ }
    throw new Error(msg || 'Erro ao criar conta de acesso');
  }
  return data;
}

const blank = {
  nome: '', email: '', telefone: '', data_nascimento: '', endereco: '', cpf: '', rg: '',
  departamento: 'comercial', cargo: 'prospeccao', status: 'ativo', tipo_contrato: '',
  data_admissao: '', data_saida: '', horario_trabalho: '', pausas: '',
  salario_fixo: '', comissao_acordada: '', chave_pix: '', banco: '', agencia: '', conta: '',
};

export function FuncionarioForm({ funcionario, onSuccess, onCancel }: Props) {
  const { roles: myRoles } = useAuth();
  const isAdmin = myRoles.includes('admin');
  const editing = !!funcionario;
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState(blank);
  const [criarConta, setCriarConta] = useState(false);
  const [senha, setSenha] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [vincularId, setVincularId] = useState('');

  useEffect(() => {
    if (!funcionario) return setF(blank);
    const s = (v: any) => (v === null || v === undefined ? '' : String(v));
    setF({
      nome: s(funcionario.nome), email: s(funcionario.email), telefone: s(funcionario.telefone), data_nascimento: s(funcionario.data_nascimento),
      endereco: s(funcionario.endereco), cpf: fmtCPF(s(funcionario.cpf)), rg: s(funcionario.rg), departamento: funcionario.departamento,
      cargo: funcionario.cargo, status: funcionario.status, tipo_contrato: s(funcionario.tipo_contrato), data_admissao: s(funcionario.data_admissao),
      data_saida: s(funcionario.data_saida), horario_trabalho: s(funcionario.horario_trabalho), pausas: s(funcionario.pausas),
      salario_fixo: s(funcionario.salario_fixo), comissao_acordada: s(funcionario.comissao_acordada), chave_pix: s(funcionario.chave_pix),
      banco: s(funcionario.banco), agencia: s(funcionario.agencia), conta: s(funcionario.conta),
    });
  }, [funcionario]);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Usuários do sistema ainda não ligados a nenhum funcionário (só admin)
  const { data: livres = [] } = useQuery({
    queryKey: ['profiles-sem-funcionario'],
    enabled: isAdmin && !funcionario?.user_id,
    queryFn: async () => {
      const [{ data: profs, error }, { data: emps }] = await Promise.all([
        supabase.from('profiles').select('id, nome, email').eq('status', 'ativo').order('nome'),
        supabase.from('employees').select('user_id').not('user_id', 'is', null),
      ]);
      if (error) throw error;
      const usados = new Set((emps || []).map((e: any) => e.user_id));
      return (profs || []).filter((p: any) => !usados.has(p.id));
    },
  });

  const toggleRole = (r: string) => setRoles((c) => (c.includes(r) ? c.filter((x) => x !== r) : [...c, r]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.nome.trim()) return toast.error('Informe o nome');
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error('Email inválido');
    const cpf = f.cpf.replace(/\D/g, '');
    if (cpf && cpf.length !== 11) return toast.error('CPF deve ter 11 dígitos');
    const salario = toNumber(f.salario_fixo);
    if (salario !== null && salario < 0) return toast.error('Salário inválido');
    if (criarConta) {
      if (!f.email.trim()) return toast.error('Email é obrigatório para criar a conta de acesso');
      if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return toast.error('Senha: mínimo 8 caracteres, com letras e números');
      if (roles.length === 0) return toast.error('Selecione pelo menos um cargo de acesso');
    }
    setLoading(true);
    try {
      const n = (v: string) => v.trim() || null;
      const payload: any = {
        nome: f.nome.trim().slice(0, 200), email: n(f.email.toLowerCase()), telefone: n(f.telefone), data_nascimento: n(f.data_nascimento),
        endereco: n(f.endereco), cpf: cpf || null, rg: n(f.rg), departamento: f.departamento, cargo: f.cargo, status: f.status,
        tipo_contrato: n(f.tipo_contrato), data_admissao: n(f.data_admissao), data_saida: n(f.data_saida),
        horario_trabalho: n(f.horario_trabalho), pausas: n(f.pausas), salario_fixo: salario, comissao_acordada: n(f.comissao_acordada),
        chave_pix: n(f.chave_pix), banco: n(f.banco), agencia: n(f.agencia), conta: n(f.conta),
      };
      if (vincularId) payload.user_id = vincularId;

      let id = funcionario?.id;
      if (editing) {
        const { error } = await supabase.from('employees').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('employees').insert(payload).select('id').single();
        if (error) throw error;
        id = data.id;
      }

      if (criarConta) {
        try {
          const res = await callAdmin({ action: 'create', email: f.email.trim().toLowerCase(), password: senha, nome: f.nome.trim(), telefone: n(f.telefone), roles });
          const { error } = await supabase.from('employees').update({ user_id: res.user_id }).eq('id', id);
          if (error) throw error;
          toast.success(editing ? 'Funcionário atualizado e conta de acesso criada!' : 'Funcionário cadastrado com conta de acesso!');
        } catch (err: any) {
          toast.warning(`Funcionário salvo, mas a conta de acesso não foi criada: ${err.message}`);
        }
      } else {
        toast.success(editing ? 'Funcionário atualizado com sucesso!' : 'Funcionário cadastrado com sucesso!');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(friendlyError(err, 'Erro ao salvar funcionário'));
    } finally {
      setLoading(false);
    }
  };

  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-2"><Label>{label}</Label><Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  );
  const sel = (k: 'departamento' | 'cargo' | 'status', label: string, opts: Record<string, string>) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={f[k]} onValueChange={(v) => set(k, v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(opts).map(([v, l]) => (
            <SelectItem key={v} value={v}>{k === 'departamento' ? <Badge variant="outline" className={DEPARTAMENTO_CORES[v]}>{l}</Badge> : l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const section = (icon: React.ReactNode, title: string, children: React.ReactNode, className = '') => (
    <Card className={className}>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
  const temConta = !!funcionario?.user_id;

  return (
    <form onSubmit={submit} className="space-y-5">
      {section(<User className="h-5 w-5" />, 'Dados Pessoais', (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('nome', 'Nome Completo *', { required: true, maxLength: 200 })}
          {field('email', 'Email', { type: 'email', placeholder: 'email@exemplo.com' })}
          {field('telefone', 'Telefone', { placeholder: '(00) 00000-0000' })}
          {field('data_nascimento', 'Data de Nascimento', { type: 'date' })}
          <div className="space-y-2"><Label>CPF</Label><Input value={f.cpf} onChange={(e) => set('cpf', fmtCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} /></div>
          {field('rg', 'RG')}
          <div className="space-y-2 md:col-span-2"><Label>Endereço</Label><Textarea rows={2} className="resize-none" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></div>
        </div>
      ))}

      {isAdmin && !temConta && section(<UserPlus className="h-5 w-5" />, 'Acesso ao Sistema', (
        <div className="space-y-4">
          {livres.length > 0 && !criarConta && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Link2 className="h-4 w-4" />Vincular a um usuário que já existe</Label>
              <Select value={vincularId || 'none'} onValueChange={(v) => setVincularId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {livres.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome} {p.email ? `(${p.email})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {!vincularId && (
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={criarConta} onChange={(e) => setCriarConta(e.target.checked)} />
              Criar uma conta de acesso nova para este funcionário
            </label>
          )}
          {criarConta && (
            <>
              <div className="space-y-2">
                <Label>Senha inicial *</Label>
                <Input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 8 caracteres, com letras e números" maxLength={72} />
                <p className="text-xs text-muted-foreground">O funcionário entra com o email acima e esta senha. Ele pode trocar depois em Meu Perfil.</p>
              </div>
              <div className="space-y-2">
                <Label>Cargos de acesso ao sistema *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button type="button" key={r} onClick={() => toggleRole(r)}
                      className={`flex items-center gap-2 p-2 rounded-md border text-sm text-left transition-colors ${roles.includes(r) ? 'bg-primary/10 border-primary' : 'hover:bg-muted'}`}>
                      <span className={`h-4 w-4 rounded border flex items-center justify-center ${roles.includes(r) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                        {roles.includes(r) && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ), 'border-primary/20 bg-primary/5')}

      {temConta && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />Este funcionário já tem conta de acesso ao sistema (gerencie em Usuários).
        </div>
      )}

      {section(<Briefcase className="h-5 w-5" />, 'Cargo e Departamento', (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sel('departamento', 'Departamento *', DEPARTAMENTOS)}
          {sel('cargo', 'Cargo *', CARGOS)}
          {sel('status', 'Status *', { ativo: 'Ativo', inativo: 'Inativo' })}
          {field('tipo_contrato', 'Tipo de Contrato', { placeholder: 'CLT, PJ, Estágio...' })}
          {field('data_admissao', 'Data de Admissão', { type: 'date' })}
          {field('data_saida', 'Data de Saída', { type: 'date' })}
        </div>
      ))}

      {section(<Clock className="h-5 w-5" />, 'Horário de Trabalho', (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('horario_trabalho', 'Horário de Trabalho', { placeholder: 'Ex: 09h às 12:25h - 13:25h às 18h' })}
          {field('pausas', 'Pausas', { placeholder: 'Ex: 12:25h às 13:25h' })}
        </div>
      ))}

      {section(<DollarSign className="h-5 w-5" />, 'Dados Financeiros', (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {field('salario_fixo', 'Salário Fixo (R$)', { type: 'number', min: '0', step: '0.01', placeholder: '0,00' })}
          {field('comissao_acordada', 'Comissão Acordada', { placeholder: 'Ex: 10% por venda' })}
          {field('chave_pix', 'Chave PIX')}
          {field('banco', 'Banco')}
          {field('agencia', 'Agência')}
          {field('conta', 'Conta')}
        </div>
      ))}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Atualizar' : 'Cadastrar Funcionário'}</Button>
      </div>
    </form>
  );
}
