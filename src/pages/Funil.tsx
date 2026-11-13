import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, DollarSign, GripVertical, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { usePermissions } from '@/contexts/PermissionsContext';
import { DealForm, ETAPAS } from '@/components/forms/DealForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency, friendlyError } from '@/lib/utils';
import {
  DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, DragStartEvent, DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Deal {
  id: string;
  titulo: string;
  etapa: string;
  valor_estimado: number | null;
  cliente?: { id: string; nome: string; whatsapp: string } | null;
  imovel?: { codigo: string; titulo: string } | null;
  corretor?: { nome: string } | null;
}

const DealCard = ({ deal, onEdit, onDelete, canUpdate, canDelete }: { deal: Deal; onEdit: () => void; onDelete: () => void; canUpdate: boolean; canDelete: boolean }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id, data: { etapa: deal.etapa }, disabled: !canUpdate });
  return (
    <Card ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }} className="card-premium hover:shadow-lg transition-all">
      <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0 p-4">
        <div className="flex items-center gap-2 min-w-0">
          {canUpdate && (
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded touch-none" aria-label="Arrastar">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <CardTitle className="text-sm font-medium truncate">{deal.titulo}</CardTitle>
        </div>
        {(canUpdate || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="h-3 w-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && <DropdownMenuItem onClick={onEdit}><Edit className="h-3 w-3 mr-2" />Editar</DropdownMenuItem>}
              {canDelete && <DropdownMenuItem onClick={onDelete} className="text-destructive"><Trash2 className="h-3 w-3 mr-2" />Excluir</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        <p className="text-xs text-muted-foreground"><strong>Cliente:</strong> {deal.cliente?.nome || 'N/A'}</p>
        {deal.imovel && <p className="text-xs text-muted-foreground"><strong>Imóvel:</strong> {deal.imovel.codigo}</p>}
        {deal.valor_estimado ? (
          <div className="flex items-center text-xs font-semibold text-primary"><DollarSign className="h-3 w-3 mr-1" />{formatCurrency(deal.valor_estimado)}</div>
        ) : null}
        <p className="text-xs text-muted-foreground"><strong>Corretor:</strong> {deal.corretor?.nome || 'N/A'}</p>
        {hasValidWhatsapp(deal.cliente?.whatsapp) && (
          <Button size="sm" variant="outline" className="w-full mt-2" onClick={(e) => { e.stopPropagation(); openWhatsapp(deal.cliente!.whatsapp); }}>
            <MessageSquare className="h-3 w-3 mr-1" />WhatsApp
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const Column = ({ etapa, deals, onEdit, onDelete, canUpdate, canDelete }: {
  etapa: (typeof ETAPAS)[number]; deals: Deal[]; onEdit: (d: Deal) => void; onDelete: (d: Deal) => void; canUpdate: boolean; canDelete: boolean;
}) => {
  // A coluna inteira recebe cards, inclusive quando está vazia (no original não recebia)
  const { setNodeRef, isOver } = useDroppable({ id: `col-${etapa.value}`, data: { etapa: etapa.value } });
  const total = deals.reduce((s, d) => s + (d.valor_estimado || 0), 0);
  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${etapa.cor}`} />
          <h3 className="font-semibold text-sm">{etapa.label}</h3>
        </div>
        <Badge variant="outline">{deals.length}</Badge>
      </div>
      {total > 0 && <div className="text-xs text-muted-foreground mb-2">{formatCurrency(total)}</div>}
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`space-y-2 min-h-[200px] p-2 rounded-lg border-2 border-dashed transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-muted bg-muted/30'}`}>
          {deals.length === 0 ? (
            <div className="flex items-center justify-center h-[100px] text-xs text-muted-foreground">{canUpdate ? 'Arraste cards aqui' : 'Sem negociações'}</div>
          ) : (
            deals.map((d) => <DealCard key={d.id} deal={d} onEdit={() => onEdit(d)} onDelete={() => onDelete(d)} canUpdate={canUpdate} canDelete={canDelete} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
};

const Funil = () => {
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, titulo, etapa, valor_estimado, cliente:clients(id, nome, whatsapp), imovel:properties(codigo, titulo), corretor:profiles(nome)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as Deal[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deals'] });

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || !canUpdate('funil')) return;
    const deal = deals.find((d) => d.id === active.id);
    const target = (over.data.current as any)?.etapa as string | undefined;
    if (!deal || !target || target === deal.etapa) return;

    // Atualiza a tela na hora e desfaz se o banco recusar
    queryClient.setQueryData<Deal[]>(['deals'], (old = []) => old.map((d) => (d.id === deal.id ? { ...d, etapa: target } : d)));
    const { error } = await supabase.from('deals').update({ etapa: target, ultima_interacao: new Date().toISOString() }).eq('id', deal.id);
    if (error) {
      toast.error(friendlyError(error, 'Erro ao mover negociação'));
      refresh();
    } else {
      toast.success(`Movido para ${ETAPAS.find((e) => e.value === target)?.label}`);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('deals').delete().eq('id', toDelete.id);
    if (error) toast.error(friendlyError(error, 'Erro ao excluir'));
    else {
      toast.success('Negociação excluída');
      refresh();
    }
    setToDelete(null);
  };

  const active = activeId ? deals.find((d) => d.id === activeId) : null;
  const totalPipeline = deals.reduce((s, d) => s + (d.valor_estimado || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Funil de Vendas</h1>
            <p className="text-muted-foreground">Arraste os cards entre as etapas • {deals.length} negociações</p>
          </div>
          {canCreate('funil') && <DealForm onSuccess={refresh} />}
        </div>

        {isLoading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" /></div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {ETAPAS.map((etapa) => (
                <Column
                  key={etapa.value}
                  etapa={etapa}
                  deals={deals.filter((d) => d.etapa === etapa.value)}
                  onEdit={(d) => setEditingId(d.id)}
                  onDelete={setToDelete}
                  canUpdate={canUpdate('funil')}
                  canDelete={canDelete('funil')}
                />
              ))}
            </div>
            <DragOverlay>
              {active ? (
                <Card className="card-premium shadow-2xl rotate-3 w-[280px]">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{active.titulo}</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground">{active.cliente?.nome}</p></CardContent>
                </Card>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <Card className="card-premium"><CardContent className="pt-4"><div className="text-2xl font-bold">{deals.length}</div><p className="text-xs text-muted-foreground">Total de negociações</p></CardContent></Card>
          <Card className="card-premium"><CardContent className="pt-4"><div className="text-2xl font-bold text-primary">{formatCurrency(totalPipeline)}</div><p className="text-xs text-muted-foreground">Valor total do pipeline</p></CardContent></Card>
          <Card className="card-premium"><CardContent className="pt-4"><div className="text-2xl font-bold text-success">{deals.filter((d) => d.etapa === 'fechado_ganho').length}</div><p className="text-xs text-muted-foreground">Negócios ganhos</p></CardContent></Card>
          <Card className="card-premium"><CardContent className="pt-4"><div className="text-2xl font-bold text-destructive">{deals.filter((d) => d.etapa === 'fechado_perdido').length}</div><p className="text-xs text-muted-foreground">Negócios perdidos</p></CardContent></Card>
        </div>
      </div>

      <DealForm dealId={editingId} open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)} onSuccess={refresh} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir negociação"
        description={`Tem certeza que deseja excluir "${toDelete?.titulo}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
      />
    </DashboardLayout>
  );
};

export default Funil;
