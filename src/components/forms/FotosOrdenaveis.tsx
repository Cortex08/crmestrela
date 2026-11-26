import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, GripVertical, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Grade de fotos do imóvel que dá para reordenar arrastando (mouse ou dedo).
 * A primeira foto é a capa (aparece no site e nos cards). Também tem setas e
 * "Usar como capa" para quem preferir tocar em vez de arrastar.
 */

const Foto = ({ url, i, total, onRemover, onMover, onCapa }: {
  url: string; i: number; total: number;
  onRemover: () => void; onMover: (para: number) => void; onCapa: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={cn('group relative select-none rounded-lg', isDragging && 'opacity-80 shadow-xl ring-2 ring-primary')}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab touch-manipulation active:cursor-grabbing"
        aria-label={`Foto ${i + 1} de ${total}. Arraste para mudar a ordem`}
      >
        <img src={url} alt="" loading="lazy" draggable={false} className="pointer-events-none h-24 w-full rounded-lg object-cover" />
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {i === 0 ? 'Capa' : i + 1}
        </span>
        <GripVertical className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded bg-black/40 text-white" />
      </div>
      <button type="button" onClick={onRemover} aria-label={`Remover foto ${i + 1}`}
        className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="absolute bottom-1 right-1 flex gap-1">
        {i > 0 && (
          <button type="button" onClick={onCapa} title="Usar como capa" aria-label={`Usar a foto ${i + 1} como capa`}
            className="rounded bg-black/60 p-0.5 text-white hover:bg-black/80">
            <Star className="h-3.5 w-3.5" />
          </button>
        )}
        {i > 0 && (
          <button type="button" onClick={() => onMover(i - 1)} aria-label={`Mover foto ${i + 1} para trás`}
            className="rounded bg-black/60 p-0.5 text-white hover:bg-black/80">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        {i < total - 1 && (
          <button type="button" onClick={() => onMover(i + 1)} aria-label={`Mover foto ${i + 1} para frente`}
            className="rounded bg-black/60 p-0.5 text-white hover:bg-black/80">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const FotosOrdenaveis = ({ fotos, onChange }: { fotos: string[]; onChange: (f: string[]) => void }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // no celular: segura um pouquinho e arrasta (assim não atrapalha a rolagem da tela)
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const fim = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const de = fotos.indexOf(String(active.id));
    const para = fotos.indexOf(String(over.id));
    if (de < 0 || para < 0) return;
    onChange(arrayMove(fotos, de, para));
  };
  // a mesma foto enviada duas vezes teria o mesmo id; não deixamos isso acontecer
  const unicas = Array.from(new Set(fotos));
  if (unicas.length !== fotos.length) queueMicrotask(() => onChange(unicas));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={fim}>
      <SortableContext items={unicas} strategy={rectSortingStrategy}>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {unicas.map((url, i) => (
            <Foto
              key={url} url={url} i={i} total={unicas.length}
              onRemover={() => onChange(unicas.filter((_, k) => k !== i))}
              onMover={(para) => onChange(arrayMove(unicas, i, para))}
              onCapa={() => onChange(arrayMove(unicas, i, 0))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
