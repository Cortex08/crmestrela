import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/utils';
import { useOptions } from '@/hooks/useOptions';

type Etiqueta = 'bolsa' | 'local' | 'reserva' | 'devolucao';
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editingKey?: any | null;
  onSuccess: () => void;
}

const empty = { numero: '', imovel_id: '', proprietario_id: '', etiqueta: 'bolsa' as Etiqueta, entregue: false, observacoes: '' };

export const ChaveForm = ({ open, onOpenChange, editingKey, onSuccess }: Props) => {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty);
  const { properties, clients } = useOptions(open, { properties: true, clients: true });
  const owners = clients.filter((c) => c.tipo === 'proprietario');

  useEffect(() => {
    if (!open) return;
    setForm(
      editingKey
        ? {
            numero: editingKey.numero || '', imovel_id: editingKey.imovel_id || '',
            proprietario_id: editingKey.proprietario_id || '', etiqueta: editingKey.etiqueta || 'bolsa',
            entregue: !!editingKey.entregue, observacoes: editingKey.observacoes || '',
          }
        : empty,
    );
  }, [open, editingKey]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero.trim()) return toast.error('Informe o número da chave');
    if (!form.imovel_id) return toast.error('Selecione o imóvel');
    setLoading(true);
    const payload = {
      numero: form.numero.trim().slice(0, 50),
      imovel_id: form.imovel_id,
      proprietario_id: form.proprietario_id || null,
      etiqueta: form.etiqueta,
      entregue: form.entregue,
      observacoes: form.observacoes.trim() || null,
    };
    const { error } = editingKey
      ? await supabase.from('keys').update(payload).eq('id', editingKey.id)
      : await supabase.from('keys').insert(payload);
    setLoading(false);
    if (error) return toast.error(friendlyError(error, editingKey ? 'Erro ao atualizar chave' : 'Erro ao cadastrar chave'));
    toast.success(editingKey ? 'Chave atualizada com sucesso!' : 'Chave cadastrada com sucesso!');
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingKey ? 'Editar Chave' : 'Cadastrar Nova Chave'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numero">Nº da Chave *</Label>
              <Input id="numero" value={form.numero} maxLength={50} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="Ex: 01, 02, 03..." required />
            </div>
            <div>
              <Label>Etiqueta *</Label>
              <Select value={form.etiqueta} onValueChange={(v: Etiqueta) => setForm({ ...form, etiqueta: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bolsa">Bolsa</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="reserva">Reserva</SelectItem>
                  <SelectItem value="devolucao">Devolução</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Imóvel (Local) *</Label>
            <Select value={form.imovel_id} onValueChange={(v) => setForm({ ...form, imovel_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o imóvel" /></SelectTrigger>
              <SelectContent>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} - {p.endereco}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Proprietário</Label>
            <Select value={form.proprietario_id || 'none'} onValueChange={(v) => setForm({ ...form, proprietario_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o proprietário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(owners.length ? owners : clients).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Informações adicionais..." />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="entregue" checked={form.entregue} onCheckedChange={(c) => setForm({ ...form, entregue: c === true })} />
            <Label htmlFor="entregue" className="cursor-pointer">Chave já foi entregue ao inquilino/proprietário</Label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : editingKey ? 'Atualizar Chave' : 'Cadastrar Chave'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
