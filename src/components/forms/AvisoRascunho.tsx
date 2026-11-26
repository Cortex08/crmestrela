import { format, isToday, isYesterday } from 'date-fns';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';

const quando = (t: number) => {
  const d = new Date(t);
  if (isToday(d)) return `hoje às ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return `ontem às ${format(d, 'HH:mm')}`;
  return format(d, "dd/MM 'às' HH:mm");
};

/** Faixa no topo do formulário avisando que o rascunho foi recuperado, com opção de descartar */
export const AvisoRascunho = ({ salvoEm, texto, onDescartar }: { salvoEm: number; texto: string; onDescartar: () => void }) => (
  <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
    <History className="h-4 w-4 shrink-0 text-primary" />
    <p className="min-w-0 flex-1">{texto} <span className="text-muted-foreground">(salvo {quando(salvoEm)})</span></p>
    <Button type="button" size="sm" variant="ghost" onClick={onDescartar}>Descartar</Button>
  </div>
);
