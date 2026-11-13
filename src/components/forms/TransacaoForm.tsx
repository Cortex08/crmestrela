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
import { friendlyError, toNumber } from '@/lib/utils';

export const CATEGORIAS_TRANSACAO = {
  receita: ['Aluguel', 'Venda', 'Comissão', 'Taxa Administrativa', 'Outros'],
  despesa: ['Salários', 'Aluguel Escritório', 'Energia', 'Água', 'Internet', 'Marketing', 'Manutenção', 'Material de Escritório', 'Impostos', 'Outros'],
};
export const STATUS_TRANSACAO: Record<string, string> = { pendente: 'Pendente', pago: 'Pago', atrasado: 'Atrasado' };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transacao?: any | null;
  onSuccess?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const empty = () => ({ tipo: 'receita' as 'receita' | 'despesa', categoria: '', subcategoria: '', valor: '', data_competencia: today(), data_recebimento: '', status: 'pendente', observacoes: '' });

export const TransacaoForm = ({ open, onOpenChange, transacao, onSuccess }: Props) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState(empty());

  useEffect(() => {
    if (!open) return;
    setF(transacao ? {
      tipo: transacao.tipo, categoria: transacao.categoria || '', subcategoria: transacao.subcategoria || '',
      valor: String(transacao.valor ?? ''), data_competencia: transacao.data_competencia || today(),
      data_recebimento: transacao.data_recebimento || '', status: transacao.status || 'pendente', observacoes: transacao.observacoes || '',
    } : empty());
  }, [open, transacao]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = toNumber(f.valor);
    if (!f.categoria || valor === null) return toast.error('Preencha os campos obrigatórios');
    if (valor <= 0) return toast.error('O valor deve ser maior que zero');
    setLoading(true);
    const payload: any = {
      tipo: f.tipo, categoria: f.categoria, valor, data_competencia: f.data_competencia,
      subcategoria: f.tipo === 'despesa' && f.subcategoria ? f.subcategoria : null,
      status: f.status,
      data_recebimento: f.status === 'pago' ? f.data_recebimento || today() : null,
      observacoes: f.observacoes.trim() || null,
    };
    const { error } = transacao
      ? await supabase.from('financial_transactions').update(payload).eq('id', transacao.id)
      : await supabase.from('financial_transactions').insert({ ...payload, responsavel_id: user?.id || null });
    setLoading(false);
    if (error) return toast.error(friendlyError(error, 'Erro ao salvar transação'));
    toast.success(transacao ? 'Transação atualizada!' : 'Transação registrada com sucesso!');
    onOpenChange(false);
    onSuccess?.();
  };

  const cats = CATEGORIAS_TRANSACAO[f.tipo];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{transacao ? 'Editar Transação' : 'Nova Transação'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={f.tipo} onValueChange={(v: any) => setF({ ...f, tipo: v, categoria: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="receita">Receita</SelectItem><SelectItem value="despesa">Despesa</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_TRANSACAO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={f.categoria} onValueChange={(v) => setF({ ...f, categoria: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
              <SelectContent>
                {[...cats, ...(f.categoria && !cats.includes(f.categoria) ? [f.categoria] : [])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {f.tipo === 'despesa' && (
            <div className="space-y-2">
              <Label>Natureza da despesa</Label>
              <Select value={f.subcategoria || 'none'} onValueChange={(v) => setF({ ...f, subcategoria: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Não informar</SelectItem><SelectItem value="fixa">Fixa</SelectItem><SelectItem value="variavel">Variável</SelectItem></SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valor">Valor (R$) *</Label>
              <Input id="valor" type="number" min="0.01" step="0.01" required placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_competencia">Data *</Label>
              <Input id="data_competencia" type="date" required value={f.data_competencia} onChange={(e) => setF({ ...f, data_competencia: e.target.value })} />
            </div>
          </div>
          {f.status === 'pago' && (
            <div className="space-y-2">
              <Label htmlFor="data_recebimento">Data do pagamento/recebimento</Label>
              <Input id="data_recebimento" type="date" value={f.data_recebimento || today()} onChange={(e) => setF({ ...f, data_recebimento: e.target.value })} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" rows={3} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
