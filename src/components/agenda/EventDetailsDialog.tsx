import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, MapPin, User, Building2, Calendar, Pencil, Trash2, CheckCircle2, FileText, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { friendlyError } from '@/lib/utils';
import { openWhatsapp, hasValidWhatsapp } from '@/lib/whatsapp';
import { TIPOS_EVENTO, tipoLight, isDone } from './AgendaParts';

interface Props {
  event: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUpdate: () => void;
  onEdit: (e: any) => void;
}

export const EventDetailsDialog = ({ event, open, onOpenChange, onUpdate, onEdit }: Props) => {
  const { user, roles } = useAuth();
  const [loading, setLoading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!event) return null;
  // Só quem criou o evento (ou o administrador) pode alterá-lo
  const canEdit = event.corretor_id === user?.id || roles.includes('admin');

  const setStatus = async (done: boolean) => {
    setLoading(true);
    const { error } = await supabase
      .from('calendar_events')
      .update({ status: done ? 'concluido' : 'pendente', concluido_em: done ? new Date().toISOString() : null })
      .eq('id', event.id);
    setLoading(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao atualizar evento'));
    toast.success(done ? 'Evento concluído!' : 'Evento reaberto!');
    onUpdate();
    if (done) onOpenChange(false);
  };

  const remove = async () => {
    setLoading(true);
    const { error } = await supabase.from('calendar_events').delete().eq('id', event.id);
    setLoading(false);
    setConfirmDel(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao excluir evento'));
    toast.success('Evento excluído!');
    onUpdate();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle className="break-words">{event.titulo}</DialogTitle>
              <Badge className={`${tipoLight[event.tipo] || tipoLight.outro} border shrink-0`}>{TIPOS_EVENTO[event.tipo] || event.tipo}</Badge>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="capitalize">{format(new Date(event.data_inicio), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span></div>
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{format(new Date(event.data_inicio), 'HH:mm')} - {format(new Date(event.data_fim), 'HH:mm')}</div>
              {event.cliente && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" /><span>{event.cliente.nome}</span>
                  {hasValidWhatsapp(event.cliente.whatsapp) && (
                    <button type="button" className="text-green-600 hover:opacity-80" onClick={() => openWhatsapp(event.cliente.whatsapp)} title="Abrir WhatsApp">
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              {event.imovel && <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{event.imovel.codigo} - {event.imovel.endereco}</div>}
              {event.local && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{event.local}</div>}
              {event.corretor && <div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" />Responsável: {event.corretor.nome}</div>}
            </div>
            {event.observacoes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4" />Observações</div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{event.observacoes}</p>
                </div>
              </>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <Badge variant={isDone(event) ? 'default' : 'secondary'}>
                {isDone(event) ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Concluído</> : 'Pendente'}
              </Badge>
              {event.concluido_em && <span className="text-xs text-muted-foreground">Concluído em {format(new Date(event.concluido_em), "dd/MM/yyyy 'às' HH:mm")}</span>}
            </div>
            {canEdit && (
              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <Button variant="destructive" size="sm" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(event)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                  {isDone(event) ? (
                    <Button variant="outline" size="sm" onClick={() => setStatus(false)} disabled={loading}>Reabrir</Button>
                  ) : (
                    <Button size="sm" onClick={() => setStatus(true)} disabled={loading}><CheckCircle2 className="h-4 w-4 mr-1" />Concluir</Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        onConfirm={remove}
        loading={loading}
        title="Excluir evento?"
        description={`Esta ação não pode ser desfeita. O evento "${event.titulo}" será excluído permanentemente.`}
        confirmText="Excluir"
      />
    </>
  );
};
