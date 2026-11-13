import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LogIn, LogOut, Coffee, Play, ScanFace, CheckCircle2, LogOut as Sair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { FaceCapture } from '@/components/FaceCapture';
import { carregarFaceApi } from '@/lib/face';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { friendlyError } from '@/lib/utils';

const MENSAGEM: Record<string, { texto: string; icon: any }> = {
  entrada: { texto: 'Entrada registrada', icon: LogIn },
  saida_almoco: { texto: 'Saída para o almoço registrada', icon: Coffee },
  retorno_almoco: { texto: 'Retorno do almoço registrado', icon: Play },
  saida: { texto: 'Saída registrada', icon: LogOut },
};

interface Resultado { nome: string; campo: string; hora: string }

/** Tela do celular único de ponto: qualquer funcionário se aproxima, o rosto identifica quem é e o ponto é registrado. */
export default function PontoQuiosque() {
  const { roles, signOut, profile } = useAuth();
  const [agora, setAgora] = useState(new Date());
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => { carregarFaceApi().catch(() => {}); }, []); // prepara o reconhecimento antes de alguém chegar
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  // baixa e aquece o reconhecimento facial em segundo plano, para a câmera abrir rápido
  useEffect(() => { const t = setTimeout(() => { import('@/lib/face').then((m) => m.carregarFaceApi()).catch(() => {}); }, 800); return () => clearTimeout(t); }, []);

  // mantém a tela acesa enquanto o celular está na recepção (quando o navegador permite)
  useEffect(() => {
    let lock: any = null;
    const pedir = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignora */ } };
    pedir();
    const volta = () => { if (document.visibilityState === 'visible') pedir(); };
    document.addEventListener('visibilitychange', volta);
    return () => { document.removeEventListener('visibilitychange', volta); lock?.release?.().catch(() => undefined); };
  }, []);

  // some sozinho para o próximo funcionário
  useEffect(() => {
    if (!resultado) return;
    const t = setTimeout(() => setResultado(null), 6000);
    return () => clearTimeout(t);
  }, [resultado]);

  if (!roles.includes('ponto') && !roles.includes('admin')) return <Navigate to="/" replace />;

  const Icone = resultado ? MENSAGEM[resultado.campo]?.icon || CheckCircle2 : ScanFace;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-br from-primary/10 via-background to-background">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="w-9 h-9 shrink-0" />
          <span className="font-semibold truncate">Ponto · Grupo Estrela de Davi</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()} title={`Sair (${profile?.nome || ''})`}>
          <Sair className="h-4 w-4 mr-1" />Sair
        </Button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-8 text-center gap-6">
        <div>
          <div className="text-6xl sm:text-7xl font-mono font-bold tracking-tight text-primary">
            {format(agora, 'HH:mm')}<span className="text-3xl sm:text-4xl text-primary/60">{format(agora, ':ss')}</span>
          </div>
          <div className="text-muted-foreground capitalize mt-1">{format(agora, "EEEE, dd 'de' MMMM", { locale: ptBR })}</div>
        </div>

        {resultado ? (
          <div className="w-full max-w-sm rounded-3xl bg-green-600 text-white p-8 shadow-xl" role="status" aria-live="polite">
            <Icone className="h-16 w-16 mx-auto mb-3" />
            <p className="text-2xl font-bold">Olá, {resultado.nome}!</p>
            <p className="mt-1 text-lg">{MENSAGEM[resultado.campo]?.texto || 'Ponto registrado'} às <strong className="font-mono">{resultado.hora}</strong></p>
          </div>
        ) : (
          <button
            onClick={() => setAberto(true)}
            className="w-full max-w-sm h-28 rounded-3xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-2xl font-bold shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          >
            <ScanFace className="h-9 w-9" />Bater ponto
          </button>
        )}

        <p className="text-sm text-muted-foreground max-w-xs">
          Toque no botão, olhe de frente para a câmera. O sistema reconhece você e registra a próxima marcação: entrada, almoço, retorno ou saída.
        </p>
      </main>

      <FaceCapture
        open={aberto}
        onOpenChange={setAberto}
        titulo="Bater ponto"
        descricao="Olhe de frente para a câmera e fique parado."
        onRosto={async (d) => {
          const { data, error } = await supabase.rpc('registrar_ponto_quiosque' as any, { _descriptor: d, _localizacao: null });
          if (error) throw new Error(friendlyError(error, 'Não foi possível registrar o ponto. Tente de novo.'));
          setResultado(data as Resultado);
          setAberto(false);
        }}
      />
    </div>
  );
}
