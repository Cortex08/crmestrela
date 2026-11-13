import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@/lib/moduleMapping';

const Perfil = () => {
  const { profile, roles, refreshProfile } = useAuth();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);
  const [pwd, setPwd] = useState({ nova: '', confirmar: '' });
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    setNome(profile?.nome || '');
    setTelefone(profile?.telefone || '');
  }, [profile]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !nome.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ nome: nome.trim(), telefone: telefone.trim() || null }).eq('id', profile.id);
    setSaving(false);
    if (error) return toast.error('Erro ao salvar');
    toast.success('Perfil atualizado');
    refreshProfile();
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.nova.length < 8 || !/[A-Za-z]/.test(pwd.nova) || !/\d/.test(pwd.nova)) return toast.error('A senha precisa de 8+ caracteres, com letras e números');
    if (pwd.nova !== pwd.confirmar) return toast.error('As senhas não conferem');
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.nova });
    setSavingPwd(false);
    if (error) return toast.error('Não foi possível trocar a senha');
    toast.success('Senha alterada');
    setPwd({ nova: '', confirmar: '' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold">Meu Perfil</h1>
          <p className="text-muted-foreground">Seus dados e senha de acesso</p>
        </div>

        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="text-lg">Dados pessoais</CardTitle>
            <CardDescription className="flex flex-wrap gap-1 pt-1">
              {roles.map((r) => <Badge key={r} variant="outline">{ROLE_LABELS[r] || r}</Badge>)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2"><Label>Email</Label><Input value={profile?.email || ''} disabled /></div>
              <div className="space-y-2"><Label>Nome</Label><Input maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input maxLength={30} value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="card-premium">
          <CardHeader><CardTitle className="text-lg">Trocar senha</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-4">
              <div className="space-y-2"><Label>Nova senha</Label><Input type="password" autoComplete="new-password" value={pwd.nova} onChange={(e) => setPwd({ ...pwd, nova: e.target.value })} /></div>
              <div className="space-y-2"><Label>Confirmar nova senha</Label><Input type="password" autoComplete="new-password" value={pwd.confirmar} onChange={(e) => setPwd({ ...pwd, confirmar: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres, com letras e números.</p>
              <Button type="submit" disabled={savingPwd}>{savingPwd ? 'Salvando...' : 'Trocar senha'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Perfil;
