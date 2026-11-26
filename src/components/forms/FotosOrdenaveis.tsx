import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownUp, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Grade de fotos do imóvel. A primeira é a capa.
 *  - No computador: arraste com o mouse para mudar a ordem.
 *  - Em qualquer aparelho: "Ordenar" -> toque nas fotos na ordem desejada (bom no celular, onde arrastar é ruim).
 *
 * Para ficar leve, a grade mostra miniaturas pequenas geradas no navegador (as fotos originais têm até
 * 2000 px; redesenhar 20 delas a cada movimento do mouse é o que fazia travar).
 */

// ---- miniaturas (geradas uma vez por foto e guardadas enquanto a página estiver aberta)
const cache = new Map<string, Promise<string>>();
const LADO = 240;
const gerarMiniatura = (url: string) => {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const blob = await (await fetch(url, { mode: 'cors' })).blob();
        const bmp = await createImageBitmap(blob);
        const esc = Math.min(1, LADO / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * esc));
        c.height = Math.max(1, Math.round(bmp.height * esc));
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        const mini = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.8));
        return mini ? URL.createObjectURL(mini) : url;
      } catch {
        return url; // sem miniatura: usa a foto original
      }
    })());
  }
  return cache.get(url)!;
};
const useMiniatura = (url: string) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    gerarMiniatura(url).then((m) => { if (vivo) setSrc(m); });
    return () => { vivo = false; };
  }, [url]);
  return src;
};

const Miniatura = ({ url, className }: { url: string; className?: string }) => {
  const src = useMiniatura(url);
  return src
    ? <img src={src} alt="" draggable={false} decoding="async" className={cn('h-full w-full object-cover', className)} />
    : <div className={cn('h-full w-full animate-pulse bg-muted', className)} />;
};

// ---- uma foto da grade
const Foto = memo(({ url, i, total, ordenando, ordemTocada, onRemover, onTocar }: {
  url: string; i: number; total: number; ordenando: boolean; ordemTocada: number;
  onRemover: (url: string) => void; onTocar: (url: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url, disabled: ordenando });
  const tocada = ordemTocada > 0;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('group relative aspect-[4/3] select-none overflow-hidden rounded-lg bg-muted [contain:layout_paint]',
        isDragging && 'opacity-30')}
    >
      {ordenando ? (
        <button type="button" onClick={() => onTocar(url)} aria-pressed={tocada}
          aria-label={tocada ? `Foto ${i + 1}: escolhida como ${ordemTocada}ª. Toque para desfazer` : `Foto ${i + 1}: toque para escolher como a próxima`}
          className="absolute inset-0 h-full w-full">
          <Miniatura url={url} className={cn(!tocada && 'opacity-60')} />
          <span className={cn('absolute inset-0 grid place-items-center text-2xl font-bold text-white',
            tocada ? 'bg-primary/40' : 'bg-black/10')}>
            {tocada ? ordemTocada : ''}
          </span>
        </button>
      ) : (
        <>
          <div {...attributes} {...listeners} aria-label={`Foto ${i + 1} de ${total}${i === 0 ? ' (capa)' : ''}. Arraste para mudar a ordem`}
            className="h-full w-full cursor-grab active:cursor-grabbing">
            <Miniatura url={url} />
          </div>
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {i === 0 ? 'Capa' : i + 1}
          </span>
          <button type="button" onClick={() => onRemover(url)} aria-label={`Remover foto ${i + 1}`}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-opacity hover:bg-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
});
Foto.displayName = 'Foto';

export const FotosOrdenaveis = ({ fotos, onChange }: { fotos: string[]; onChange: (f: string[]) => void }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const unicas = useMemo(() => Array.from(new Set(fotos)), [fotos]);
  useEffect(() => { if (unicas.length !== fotos.length) onChange(unicas); }, [unicas, fotos.length, onChange]);

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const [tocadas, setTocadas] = useState<string[]>([]);

  const inicio = ({ active }: DragStartEvent) => setArrastando(String(active.id));
  const fim = ({ active, over }: DragEndEvent) => {
    setArrastando(null);
    if (!over || active.id === over.id) return;
    const de = unicas.indexOf(String(active.id));
    const para = unicas.indexOf(String(over.id));
    if (de >= 0 && para >= 0) onChange(arrayMove(unicas, de, para));
  };

  const remover = (url: string) => onChange(unicas.filter((u) => u !== url));
  const tocar = (url: string) => setTocadas((t) => (t.includes(url) ? t.filter((u) => u !== url) : [...t, url]));
  // as tocadas vêm primeiro, na ordem do toque; as outras continuam depois, na ordem em que estavam
  const aplicar = () => {
    if (tocadas.length) onChange([...tocadas, ...unicas.filter((u) => !tocadas.includes(u))]);
    setOrdenando(false); setTocadas([]);
  };

  return (
    <div className="mt-4 space-y-2">
      {unicas.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {ordenando
              ? tocadas.length === 0 ? 'Toque nas fotos na ordem que você quer. A primeira vira a capa.' : `${tocadas.length} de ${unicas.length} escolhidas. As que faltarem ficam no final.`
              : 'Arraste para mudar a ordem ou use "Ordenar". A primeira é a capa.'}
          </p>
          {ordenando ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => { setOrdenando(false); setTocadas([]); }}>Cancelar</Button>
              <Button type="button" size="sm" onClick={aplicar}><Check className="mr-1 h-4 w-4" />Pronto</Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setOrdenando(true)}>
              <ArrowDownUp className="mr-1 h-4 w-4" />Ordenar
            </Button>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={inicio} onDragEnd={fim} onDragCancel={() => setArrastando(null)}>
        <SortableContext items={unicas} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {unicas.map((url, i) => (
              <Foto key={url} url={url} i={i} total={unicas.length} ordenando={ordenando}
                ordemTocada={tocadas.indexOf(url) + 1} onRemover={remover} onTocar={tocar} />
            ))}
          </div>
        </SortableContext>
        {/* a foto "na mão" é uma cópia leve que segue o mouse; a grade só abre espaço.
            Fica fora da janela (no body): dentro dela, o deslocamento da janela tirava a foto do lugar. */}
        {createPortal(
          <DragOverlay zIndex={60}>
            {arrastando ? (
              <div className="aspect-[4/3] overflow-hidden rounded-lg shadow-2xl ring-2 ring-primary">
                <Miniatura url={arrastando} />
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  );
};
