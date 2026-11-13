import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { friendlyError, toNumber } from '@/lib/utils';

export const ETAPAS = [
  { value: 'novo_lead', label: 'Novo Lead', cor: 'bg-blue-500' },
  { value: 'qualificando', label: 'Qualificando', cor: 'bg-purple-500' },
  { value: 'visita_agendada', label: 'Visita Agendada', cor: 'bg-yellow-500' },
  { value: 'proposta', label: 'Proposta', cor: 'bg-orange-500' },
  { value: 'negociacao', label: 'Negociação', cor: 'bg-indigo-500' },
  { value: 'fechado_ganho', label: 'Fechado (Ganho)', cor: 'bg-green-500' },
  { value: 'fechado_perdido', label: 'Fechado (Perdido)', cor: 'bg-red-500' },
];

const NONE = '__none__';
const empty = { titulo: '', cliente_id: '', imovel_id: NONE, etapa: 'novo_lead', valor_estimado: '', proxima_acao: '', observacoes: '', motivo_perda: '' };

interface DealFormProps {
  onSuccess?: () => void;
  /** Quando informado, o formulário edita esta negociação */
  dealId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const DealForm = ({ onSuccess, dealId, open: controlledOpen, onOpenChange }: DealFormProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from('clients').select('id, nome, tipo').order('nome').limit(1000),
      supabase.from('properties').select('id, codigo, titulo, endereco').order('codigo').limit(1000),
    ]).then(([c, p]) => {
      setClients(c.data || []);
      setProperties(p.data || []);
    });
    if (dealId) {
      supabase.from('deals').select('*').eq('id', dealId).single().then(({ data }) => {
        if (data)
          setForm({
            titulo: data.titulo || '', cliente_id: data.cliente_id || '', imovel_id: data.imovel_id || NONE, etapa: data.etapa,
            valor_estimado: data.valor_estimado?.toString() || '', proxima_acao: data.proxima_acao || '',
            observacoes: data.observacoes || '', motivo_perda: data.motivo_perda || '',
          });
      });
    } else {
      setForm(empty);
    }
  }, [open, dealId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) return toast.error('Informe o título');
    if (!form.cliente_id) return toast.error('Selecione um cliente');
    setLoading(true);
    const payload = {
      titulo: form.titulo.trim(),
      cliente_id: form.cliente_id,
      imovel_id: form.imovel_id === NONE ? null : form.imovel_id,
      etapa: form.etapa,
      valor_estimado: toNumber(form.valor_estimado),
      proxima_acao: form.proxima_acao.trim() || null,
      observacoes: form.observacoes.trim() || null,
      motivo_perda: form.etapa === 'fechado_perdido' ? form.motivo_perda.trim() || null : null,
      ultima_interacao: new Date().toISOString(),
    };
    const { data: auth } = await supabase.auth.getUser();
    const { error } = dealId
      ? await supabase.from('deals').update(payload).eq('id', dealId)
      : await supabase.from('deals').insert({ ...payload, corretor_id: auth.user?.id });
    setLoading(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao salvar oportunidade'));
    toast.success(dealId ? 'Oportunidade atualizada!' : 'Oportunidade criada com sucesso!');
    setOpen(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!dealId && controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nova Oportunidade
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dealId ? 'Editar Oportunidade' : 'Nova Oportunidade'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input id="titulo" maxLength={300} placeholder="Ex: Venda apartamento Centro" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome} ({c.tipo})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Imóvel</Label>
            <Select value={form.imovel_id} onValueChange={(v) => setForm({ ...form, imovel_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione um imóvel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} - {p.titulo || p.endereco}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Etapa *</Label>
              <Select value={form.etapa} onValueChange={(v) => setForm({ ...form, etapa: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ETAPAS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor">Valor Estimado (R$)</Label>
              <Input id="valor" type="number" step="0.01" min="0" placeholder="0,00" value={form.valor_estimado} onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })} />
            </div>
          </div>
          {form.etapa === 'fechado_perdido' && (
            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo da Perda</Label>
              <Input id="motivo" value={form.motivo_perda} onChange={(e) => setForm({ ...form, motivo_perda: e.target.value })} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="acao">Próxima Ação</Label>
            <Input id="acao" placeholder="Ex: Ligar segunda-feira" value={form.proxima_acao} onChange={(e) => setForm({ ...form, proxima_acao: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" rows={3} maxLength={5000} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : dealId ? 'Salvar' : 'Criar Oportunidade'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
