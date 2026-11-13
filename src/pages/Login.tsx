import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Mail, Sparkles, User, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';

const Login = () => {
  const { signIn, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    supabase.rpc('has_admin').then(({ data, error }) => {
      if (!error && data === false) setNeedsSetup(true);
    });
  }, []);

  if (!authLoading && user && !loading) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Preencha todos os campos');
      return;
    }
    setLoading(true);

    if (needsSetup) {
      if (!nome.trim()) {
        setLoading(false);
        return toast.error('Informe seu nome');
      }
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'bootstrap', email: email.trim(), password, nome: nome.trim() },
      });
      if (error || data?.error) {
        let msg = data?.error;
        try {
          msg = msg || (await (error as any)?.context?.json())?.error;
        } catch {
          /* ignore */
        }
        setLoading(false);
        return toast.error(msg || 'Não foi possível criar o administrador');
      }
      toast.success('Administrador criado! Entrando...');
      setNeedsSetup(false);
    }

    const { error } = await signIn(email, password);
    if (error) toast.error(error);
    else toast.success('Login realizado com sucesso!');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-white/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12">
          <div className="text-center space-y-8">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-white/30 rounded-full blur-2xl scale-150" />
              <Logo className="relative w-40 h-40 shadow-2xl p-2" />
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-bold text-white tracking-tight">Grupo Estrela de Davi</h1>
              <p className="text-xl text-white/80 font-light">Imobiliária</p>
            </div>
            <div className="mt-12 space-y-4 text-left max-w-sm mx-auto">
              {['Gestão completa de imóveis', 'Controle financeiro integrado', 'Acompanhamento de contratos', 'Relatórios em tempo real'].map((f, i) => (
                <div key={f} className="flex items-center gap-3 text-white/90 animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                  <span className="text-sm font-medium">{f}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Sistema de Gestão Imobiliária</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden text-center space-y-4">
            <Logo className="w-24 h-24 mx-auto shadow-lg p-1" />
            <h1 className="text-2xl font-bold text-primary">Estrela de Davi</h1>
          </div>

          <div className="text-center lg:text-left space-y-2">
            {needsSetup ? (
              <>
                <h2 className="text-3xl font-bold text-foreground flex items-center gap-2 justify-center lg:justify-start">
                  <ShieldCheck className="h-7 w-7 text-primary" /> Primeiro acesso
                </h2>
                <p className="text-muted-foreground">Crie a conta do administrador do sistema. Esta tela só aparece uma vez.</p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-foreground">Bem-vindo de volta!</h2>
                <p className="text-muted-foreground">Faça login para acessar sua conta</p>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {needsSetup && (
                <div className="space-y-2">
                  <Label htmlFor="nome">Seu nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} disabled={loading} maxLength={200} className="pl-10 h-12" />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="email" type="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="pl-10 h-12" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pl-10 pr-10 h-12"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Mostrar senha">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {needsSetup && <p className="text-xs text-muted-foreground">Mínimo 8 caracteres, com letras e números.</p>}
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5" disabled={loading}>
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{needsSetup ? 'Criando...' : 'Entrando...'}</span>
                </div>
              ) : needsSetup ? 'Criar administrador' : 'Entrar'}
            </Button>
          </form>

          <div className="pt-6 text-center">
            <p className="text-xs text-muted-foreground">Sistema exclusivo para colaboradores autorizados</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
