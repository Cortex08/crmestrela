import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ScanFace, CameraOff, CheckCircle2 } from 'lucide-react';
import { lerRosto, AMOSTRAS, type EstadoRosto } from '@/lib/face';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  descricao?: string;
  /** Pode lançar um erro: a mensagem aparece na tela com o botão "Tentar de novo". */
  onRosto: (descritor: number[]) => void | Promise<void>;
  /** Se informado, mostra o botão para seguir sem reconhecimento (o registro fica sinalizado) */
  onSemRosto?: () => void;
}

const PASSOS: { fase: EstadoRosto['fase']; nome: string }[] = [
  { fase: 'posicionar', nome: 'Enquadrar' },
  { fase: 'lendo', nome: 'Ler' },
];

/** Abre a câmera frontal com uma moldura oval, guia o enquadramento, lê o rosto em várias amostras e devolve o descritor do rosto. */
export function FaceCapture({ open, onOpenChange, titulo, descricao, onRosto, onSemRosto }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [carregando, setCarregando] = useState('Abrindo a câmera…');
  const [estado, setEstado] = useState<EstadoRosto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    let parar = false;
    let stream: MediaStream | null = null;
    setErro(null); setEnviando(false); setEstado(null); setCarregando('Abrindo a câmera…');

    (async () => {
      let desc: number[];
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não permite usar a câmera.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false });
        for (let i = 0; i < 30 && !videoRef.current && !parar; i++) await new Promise((r) => setTimeout(r, 50));
        if (parar || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setCarregando('Carregando o reconhecimento…');
        desc = await lerRosto(videoRef.current, (e) => { if (!parar) { setCarregando(''); setEstado(e); } }, () => parar);
        if (parar) return;
        stream.getTracks().forEach((t) => t.stop());
      } catch (e: any) {
        if (parar || e?.message === 'cancelado') return;
        const negado = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError';
        const semCamera = e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError';
        setErro(negado ? 'A câmera está bloqueada. Libere o acesso à câmera nas permissões do navegador e tente de novo.'
          : semCamera ? 'Não encontrei nenhuma câmera neste aparelho.'
          : e?.message || 'Não foi possível usar a câmera.');
        return;
      }
      // rosto lido: envia (erros do envio aparecem na tela, sem travar)
      try {
        setEnviando(true);
        await onRosto(desc);
      } catch (e: any) {
        if (!parar) { setEnviando(false); setErro(e?.message || 'Não foi possível confirmar. Tente de novo.'); }
      }
    })();

    return () => { parar = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tentativa]);

  const ok = !!estado?.ok;
  const faseAtual = estado?.fase ?? 'posicionar';
  const idxFase = PASSOS.findIndex((p) => p.fase === faseAtual);
  const dica = enviando ? 'Confirmando…' : carregando || estado?.dica || 'Coloque o rosto no centro da moldura';

  return (
    <Dialog open={open} onOpenChange={(o) => !enviando && onOpenChange(o)}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] p-4 gap-3 max-h-[100dvh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2"><ScanFace className="h-5 w-5" />{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        <ol className="flex items-center gap-2 text-xs" aria-label="Etapas">
          {PASSOS.map((p, i) => {
            const feito = enviando || i < idxFase;
            const atual = !enviando && i === idxFase;
            return (
              <li key={p.fase} className={cn('flex-1 rounded-full px-2 py-1 text-center font-medium border transition-colors',
                feito ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300' : atual ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-transparent')}>
                {i + 1}. {p.nome}
              </li>
            );
          })}
        </ol>

        <div className="relative mx-auto w-full max-w-sm aspect-[3/4] max-h-[58dvh] rounded-2xl overflow-hidden bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]" />

          {/* moldura oval: escurece o que está fora e muda de cor conforme o enquadramento */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <mask id="rosto-furo">
                <rect width="300" height="400" fill="white" />
                <ellipse cx="150" cy="180" rx="95" ry="125" fill="black" />
              </mask>
            </defs>
            <rect width="300" height="400" fill="rgba(0,0,0,0.55)" mask="url(#rosto-furo)" />
            <ellipse cx="150" cy="180" rx="95" ry="125" fill="none" strokeWidth="4" strokeLinecap="round"
              className={cn('transition-colors duration-200', ok || enviando ? 'stroke-green-400' : 'stroke-white/90')}
              strokeDasharray={ok || enviando ? undefined : '10 8'} />
          </svg>

          {enviando && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <CheckCircle2 className="h-16 w-16 text-green-400" />
            </div>
          )}

          {!erro && (
            <div className="absolute inset-x-0 bottom-0 p-3">
              <div className={cn('rounded-xl px-3 py-2.5 text-center text-sm sm:text-base font-semibold text-white flex items-center justify-center gap-2 backdrop-blur-sm',
                ok || enviando ? 'bg-green-600/85' : 'bg-black/70')} role="status" aria-live="polite">
                {(carregando || enviando) && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                <span>{dica}</span>
              </div>
              {faseAtual === 'lendo' && !enviando && (
                <div className="flex justify-center gap-1.5 mt-2" aria-hidden="true">
                  {Array.from({ length: AMOSTRAS }, (_, i) => i).map((i) => <span key={i} className={cn('h-1.5 w-6 rounded-full', i < (estado?.leituras ?? 0) ? 'bg-green-400' : 'bg-white/40')} />)}
                </div>
              )}
            </div>
          )}

          {erro && (
            <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center text-center p-5 gap-3">
              <CameraOff className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm">{erro}</p>
              <Button size="sm" onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">Dica: rosto de frente, sem boné ou óculos escuros e com a luz no rosto, não atrás de você. A imagem não é gravada nem enviada; só um código numérico do rosto é comparado.</p>
        {onSemRosto && (
          <Button variant="outline" disabled={enviando} onClick={onSemRosto}>Bater ponto sem reconhecimento facial</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
