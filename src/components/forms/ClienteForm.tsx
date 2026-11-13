import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { friendlyError, toInt, toNumber } from '@/lib/utils';

const emptyForm = {
  nome: '', tipo: 'interessado' as 'inquilino' | 'proprietario' | 'interessado',
  whatsapp: '', email: '', telefone: '', cpf_cnpj: '', endereco: '', interesse: '', observacoes: '',
  tipo_imovel: '' as 'residencial' | 'comercial' | '', doc_completo: false, valor_aluguel: '', endereco_imovel: '',
  dia_pgto_aluguel: '', vencimento_anual: '', vencimento_contrato: '',
  status_contrato: '' as 'em_contrato' | 'finalizado' | 'em_atraso' | '', anotacoes_inquilino: '', data_saida: '',
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const ClienteForm = ({ onSuccess, clienteId, embedMode }: { onSuccess?: () => void; clienteId?: string; embedMode?: boolean }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    if (!clienteId) return;
    supabase.from('clients').select('*').eq('id', clienteId).single().then(({ data }) => {
      if (!data) return;
      setFormData({
        nome: data.nome || '', tipo: data.tipo || 'interessado', whatsapp: data.whatsapp || '', email: data.email || '',
        telefone: data.telefone || '', cpf_cnpj: data.cpf_cnpj || '', endereco: data.endereco || '', interesse: data.interesse || '',
        observacoes: data.observacoes || '', tipo_imovel: data.tipo_imovel || '', doc_completo: !!data.doc_completo,
        valor_aluguel: data.valor_aluguel?.toString() || '', endereco_imovel: data.endereco_imovel || '',
        dia_pgto_aluguel: data.dia_pgto_aluguel?.toString() || '', vencimento_anual: data.vencimento_anual || '',
        vencimento_contrato: data.vencimento_contrato || '', status_contrato: data.status_contrato || '',
        anotacoes_inquilino: data.anotacoes_inquilino || '', data_saida: data.data_saida || '',
      });
    });
  }, [clienteId]);

  const set = (k: keyof typeof emptyForm, v: any) => setFormData((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) return toast.error('Informe o nome');
    if (formData.whatsapp.replace(/\D/g, '').length < 10) return toast.error('Informe um WhatsApp válido com DDD');
    if (formData.email && !EMAIL_RE.test(formData.email.trim())) return toast.error('E-mail inválido');
    const dia = toInt(formData.dia_pgto_aluguel);
    if (dia !== null && (dia < 1 || dia > 31)) return toast.error('Dia do pagamento deve ser entre 1 e 31');

    const payload: Record<string, any> = {
      nome: formData.nome.trim(),
      tipo: formData.tipo,
      whatsapp: formData.whatsapp.trim(),
      email: formData.email.trim() || null,
      telefone: formData.telefone.trim() || null,
      cpf_cnpj: formData.cpf_cnpj.trim() || null,
      endereco: formData.endereco.trim() || null,
      interesse: formData.interesse.trim() || null,
      observacoes: formData.observacoes.trim() || null,
    };
    if (formData.tipo === 'inquilino') {
      Object.assign(payload, {
        tipo_imovel: formData.tipo_imovel || null,
        doc_completo: formData.doc_completo,
        valor_aluguel: toNumber(formData.valor_aluguel),
        endereco_imovel: formData.endereco_imovel.trim() || null,
        dia_pgto_aluguel: dia,
        vencimento_anual: formData.vencimento_anual || null,
        vencimento_contrato: formData.vencimento_contrato || null,
        status_contrato: formData.status_contrato || null,
        anotacoes_inquilino: formData.anotacoes_inquilino.trim() || null,
        data_saida: formData.data_saida || null,
      });
    }

    setLoading(true);
    const { error } = clienteId
      ? await supabase.from('clients').update(payload).eq('id', clienteId)
      : await supabase.from('clients').insert(payload);
    setLoading(false);

    if (error) return toast.error(friendlyError(error, 'Erro ao salvar cliente'));
    toast.success(clienteId ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!');
    if (!embedMode) setOpen(false);
    if (!clienteId) setFormData(emptyForm);
    onSuccess?.();
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome Completo *</Label>
        <Input id="nome" maxLength={200} value={formData.nome} onChange={(e) => set('nome', e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Tipo *</Label>
        <Select value={formData.tipo} onValueChange={(v) => set('tipo', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="interessado">Interessado</SelectItem>
            <SelectItem value="inquilino">Inquilino</SelectItem>
            <SelectItem value="proprietario">Proprietário</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp *</Label>
          <Input id="whatsapp" maxLength={30} placeholder="(00) 00000-0000" inputMode="tel" value={formData.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" maxLength={30} placeholder="(00) 0000-0000" inputMode="tel" value={formData.telefone} onChange={(e) => set('telefone', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" maxLength={200} value={formData.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
          <Input id="cpf_cnpj" maxLength={20} value={formData.cpf_cnpj} onChange={(e) => set('cpf_cnpj', e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="endereco">Endereço</Label>
        <Input id="endereco" value={formData.endereco} onChange={(e) => set('endereco', e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="interesse">Interesse</Label>
        <Input id="interesse" placeholder="Ex: Apartamento 2 quartos na Zona Sul" value={formData.interesse} onChange={(e) => set('interesse', e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" rows={3} maxLength={5000} value={formData.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
      </div>

      {formData.tipo === 'inquilino' && (
        <div className="border-t pt-4 mt-4">
          <h3 className="font-semibold mb-4">Informações do Inquilino</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Tipo de Imóvel</Label>
              <Select value={formData.tipo_imovel} onValueChange={(v) => set('tipo_imovel', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residencial">Residencial</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status do Contrato</Label>
              <Select value={formData.status_contrato} onValueChange={(v) => set('status_contrato', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_contrato">Em Contrato</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                  <SelectItem value="em_atraso">Em Atraso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2 mb-4">
            <Checkbox id="doc_completo" checked={formData.doc_completo} onCheckedChange={(c) => set('doc_completo', c === true)} />
            <Label htmlFor="doc_completo" className="cursor-pointer">DOC Completo (Documentação completa)</Label>
          </div>

          <div className="space-y-2 mb-4">
            <Label htmlFor="endereco_imovel">Endereço do Imóvel</Label>
            <Input id="endereco_imovel" value={formData.endereco_imovel} onChange={(e) => set('endereco_imovel', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="valor_aluguel">Valor do Aluguel (R$)</Label>
              <Input id="valor_aluguel" type="number" step="0.01" min="0" placeholder="0,00" value={formData.valor_aluguel} onChange={(e) => set('valor_aluguel', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dia_pgto_aluguel">Dia do Pagamento (1-31)</Label>
              <Input id="dia_pgto_aluguel" type="number" min="1" max="31" placeholder="Ex: 5" value={formData.dia_pgto_aluguel} onChange={(e) => set('dia_pgto_aluguel', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="vencimento_contrato">Vencimento do Contrato</Label>
              <Input id="vencimento_contrato" type="date" value={formData.vencimento_contrato} onChange={(e) => set('vencimento_contrato', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vencimento_anual">Vencimento Anual (12m)</Label>
              <Input id="vencimento_anual" type="date" value={formData.vencimento_anual} onChange={(e) => set('vencimento_anual', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <Label htmlFor="data_saida">Data de Saída (se aplicável)</Label>
            <Input id="data_saida" type="date" value={formData.data_saida} onChange={(e) => set('data_saida', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="anotacoes_inquilino">Anotações do Inquilino</Label>
            <Textarea id="anotacoes_inquilino" rows={3} maxLength={5000} value={formData.anotacoes_inquilino} onChange={(e) => set('anotacoes_inquilino', e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-2">
        {!embedMode && <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>}
        <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : clienteId ? 'Salvar' : 'Cadastrar'}</Button>
      </div>
    </form>
  );

  if (embedMode) return formContent;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clienteId ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
};
