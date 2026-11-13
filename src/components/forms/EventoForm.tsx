import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { format, addHours, setHours, setMinutes } from 'date-fns';
import { friendlyError } from '@/lib/utils';
import { useOptions } from '@/hooks/useOptions';
import { TIPOS_EVENTO } from '@/components/agenda/AgendaParts';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event?: any | null;
  defaultDate?: Date;
  onSuccess?: () => void;
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

export const EventoForm = ({ open, onOpenChange, event, defaultDate, onSuccess }: Props) => {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes('admin');
  const [loading, setLoading] = useState(false);
  const { clients, properties, profiles } = useOptions(open, { clients: true, properties: true, profiles: isAdmin });
  const [form, setForm] = useState({
    titulo: '', tipo: 'visita', data_inicio: '', data_fim: '', cliente_id: '', imovel_id: '', local: '', observacoes: '', corretor_id: '',
  });

  useEffect(() => {
    if (!open) return;
    if (event) {
      setForm({
        titulo: event.titulo || '', tipo: event.tipo || 'visita',
        data_inicio: event.data_inicio ? fmt(new Date(event.data_inicio)) : '',
        data_fim: event.data_fim ? fmt(new Date(event.data_fim)) : '',
        cliente_id: event.cliente_id || '', imovel_id: event.imovel_id || '', local: event.local || '',
        observacoes: event.observacoes || '', corretor_id: event.corretor_id || '',
      });
    } else {
      // Sugere 9h do dia selecionado (ou a próxima hora cheia se for hoje)
      const base = defaultDate ? new Date(defaultDate) : new Date();
      let start = setMinutes(setHours(base, 9), 0);
      const now = new Date();
      if (start < now && format(base, 'yyyyMMdd') === format(now, 'yyyyMMdd')) start = setMinutes(addHours(now, 1), 0);
      setForm({
        titulo: '', tipo: 'visita', data_inicio: fmt(start), data_fim: fmt(addHours(start, 1)),
        cliente_id: '', imovel_id: '', local: '', observacoes: '', corretor_id: user?.id || '',
      });
    }
  }, [open, event, defaultDate, user?.id]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error('Usuário não autenticado');
    if (!form.titulo.trim()) return toast.error('Informe o título');
    if (!form.data_inicio) return toast.error('Informe a data/hora de início');
    const inicio = new Date(form.data_inicio);
    const fim = form.data_fim ? new Date(form.data_fim) : addHours(inicio, 1);
    if (fim < inicio) return toast.error('O fim não pode ser antes do início');
    setLoading(true);
    const payload: any = {
      titulo: form.titulo.trim().slice(0, 300), tipo: form.tipo,
      data_inicio: inicio.toISOString(), data_fim: fim.toISOString(),
      cliente_id: form.cliente_id || null, imovel_id: form.imovel_id || null,
      local: form.local.trim() || null, observacoes: form.observacoes.trim() || null,
    };
    if (isAdmin && form.corretor_id) payload.corretor_id = form.corretor_id;
    const { error } = event
      ? await supabase.from('calendar_events').update(payload).eq('id', event.id)
      : await supabase.from('calendar_events').insert({ ...payload, corretor_id: payload.corretor_id || user.id, status: 'pendente' });
    setLoading(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao salvar evento'));
    toast.success(event ? 'Evento atualizado!' : 'Evento criado com sucesso!');
    onOpenChange(false);
    onSuccess?.();
  };

  const none = (k: 'cliente_id' | 'imovel_id') => ({
    value: form[k] || 'none',
    onValueChange: (v: string) => set(k, v === 'none' ? '' : v),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{event ? 'Editar Evento' : 'Novo Evento'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input id="titulo" required maxLength={300} placeholder="Ex: Visita ao apartamento" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => set('tipo', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TIPOS_EVENTO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_inicio">Data/Hora Início *</Label>
              <Input id="data_inicio" type="datetime-local" required value={form.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_fim">Data/Hora Fim</Label>
              <Input id="data_fim" type="datetime-local" value={form.data_fim} min={form.data_inicio} onChange={(e) => set('data_fim', e.target.value)} />
            </div>
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={form.corretor_id} onValueChange={(v) => set('corretor_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select {...none('cliente_id')}>
              <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Imóvel</Label>
            <Select {...none('imovel_id')}>
              <SelectTrigger><SelectValue placeholder="Selecione um imóvel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} - {p.titulo || p.endereco}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="local">Local</Label>
            <Input id="local" placeholder="Endereço ou local do evento" value={form.local} onChange={(e) => set('local', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : event ? 'Salvar' : 'Criar Evento'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
