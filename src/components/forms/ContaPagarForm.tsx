import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Paperclip, Upload } from 'lucide-react';
import { addMonths, format } from 'date-fns';
import { useOptions } from '@/hooks/useOptions';
import { uploadPrivateFile, openStoredFile } from '@/lib/storage';
import { friendlyError, toNumber, toInt } from '@/lib/utils';

export const CATEGORIA_CONTA: Record<string, string> = {
  consumo: 'Consumo (água/luz/internet)', assinaturas: 'Aplicativos / Assinaturas', servicos_internos: 'Serviços Internos',
  manutencao: 'Manutenção', impostos: 'Impostos e Taxas', outros: 'Outros',
};
export const FORMA_PAGAMENTO: Record<string, string> = {
  pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', debito_automatico: 'Débito Automático', transferencia: 'Transferência', dinheiro: 'Dinheiro',
};
export const RECORRENCIA: Record<string, string> = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', unica: 'Única' };
export const STATUS_CONTA: Record<string, string> = { pago: 'Pago', pendente: 'Pendente', agendado: 'Agendado', a_vencer: 'A Vencer' };

interface Props {
  bill?: any | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// Parse "yyyy-MM-dd" sem fuso horário
const parseLocal = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export function ContaPagarForm({ bill, onSuccess, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [parcelar, setParcelar] = useState(false);
  const [nParcelas, setNParcelas] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { profiles } = useOptions(true, { profiles: true });
  const editing = !!bill;
  const isParcela = bill?.grupo_parcela_id && bill?.total_parcelas > 1;

  const [f, setF] = useState({
    descricao: '', valor: '', data_vencimento: '', data_pagamento: '', categoria: '', forma_pagamento: '',
    recorrencia: '', observacoes: '', status: 'pendente', responsavel_id: '', valor_variavel: false,
  });
  useEffect(() => {
    if (!bill) return;
    setF({
      descricao: bill.descricao || '', valor: String(bill.valor ?? ''), data_vencimento: bill.data_vencimento || '',
      data_pagamento: bill.data_pagamento || '', categoria: bill.categoria || '', forma_pagamento: bill.forma_pagamento || '',
      recorrencia: bill.recorrencia || '', observacoes: bill.observacoes || '', status: bill.status || 'pendente',
      responsavel_id: bill.responsavel_id || '', valor_variavel: !!bill.valor_variavel,
    });
  }, [bill]);
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = toNumber(f.valor);
    if (!f.descricao.trim() || valor === null || !f.data_vencimento || !f.categoria) return toast.error('Preencha os campos obrigatórios');
    if (valor < 0) return toast.error('Valor inválido');
    const n = toInt(nParcelas) || 0;
    if (parcelar && (n < 2 || n > 120)) return toast.error('Informe de 2 a 120 parcelas');
    setLoading(true);
    try {
      let comprovante_url = bill?.comprovante_url || null;
      if (file) comprovante_url = await uploadPrivateFile(file, 'contas');
      const base = {
        descricao: f.descricao.trim().slice(0, 300), valor, data_vencimento: f.data_vencimento,
        data_pagamento: f.data_pagamento || null, categoria: f.categoria, forma_pagamento: f.forma_pagamento || null,
        comprovante_url, recorrencia: f.recorrencia || null, observacoes: f.observacoes.trim() || null,
        status: f.status, responsavel_id: f.responsavel_id || null, valor_variavel: f.valor_variavel,
      };
      if (editing) {
        const { error } = await supabase.from('bills').update(base).eq('id', bill.id);
        if (error) throw error;
        toast.success('Conta atualizada com sucesso!');
      } else if (parcelar) {
        const grupo = crypto.randomUUID();
        const start = parseLocal(f.data_vencimento);
        const rows = Array.from({ length: n }, (_, i) => ({
          ...base,
          descricao: `${base.descricao} (${i + 1}/${n})`,
          data_vencimento: format(addMonths(start, i), 'yyyy-MM-dd'),
          status: i === 0 ? base.status : 'pendente',
          data_pagamento: i === 0 ? base.data_pagamento : null,
          comprovante_url: i === 0 ? comprovante_url : null,
          parcela_atual: i + 1, total_parcelas: n, grupo_parcela_id: grupo,
        }));
        const { error } = await supabase.from('bills').insert(rows);
        if (error) throw error;
        toast.success(`${n} parcelas criadas com sucesso!`);
      } else {
        const { error } = await supabase.from('bills').insert(base);
        if (error) throw error;
        toast.success('Conta adicionada com sucesso!');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message?.startsWith('Tipo') || err?.message?.startsWith('Arquivo') ? err.message : friendlyError(err, 'Erro ao salvar conta'));
    } finally {
      setLoading(false);
    }
  };

  const sel = (k: 'categoria' | 'forma_pagamento' | 'recorrencia' | 'status', opts: Record<string, string>, ph: string) => (
    <Select value={(f[k] as string) || undefined} onValueChange={(v) => set(k, v)}>
      <SelectTrigger><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>{Object.entries(opts).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {isParcela && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
          <span className="text-sm text-yellow-700">Esta é a parcela {bill.parcela_atual} de {bill.total_parcelas}. Alterações afetam apenas esta parcela.</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Descrição da Conta *</Label><Input placeholder="Ex: SABESP, ENEL, INTERNET" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} required /></div>
        <div className="space-y-2"><Label>Valor (R$) *</Label><Input type="number" min="0" step="0.01" placeholder="0,00" value={f.valor} onChange={(e) => set('valor', e.target.value)} required /></div>
        <div className="space-y-2"><Label>Data de Vencimento *</Label><Input type="date" value={f.data_vencimento} onChange={(e) => set('data_vencimento', e.target.value)} required /></div>
        <div className="space-y-2"><Label>Agendamento / Pagamento</Label><Input type="date" value={f.data_pagamento} onChange={(e) => set('data_pagamento', e.target.value)} /></div>
        <div className="space-y-2"><Label>Categoria *</Label>{sel('categoria', CATEGORIA_CONTA, 'Selecione a categoria')}</div>
        <div className="space-y-2"><Label>Forma de Pagamento</Label>{sel('forma_pagamento', FORMA_PAGAMENTO, 'Selecione a forma')}</div>
        <div className="space-y-2"><Label>Recorrência</Label>{sel('recorrencia', RECORRENCIA, 'Selecione a recorrência')}</div>
        <div className="space-y-2"><Label>Status *</Label>{sel('status', STATUS_CONTA, 'Selecione o status')}</div>
        <div className="space-y-2">
          <Label>Responsável</Label>
          <Select value={f.responsavel_id || 'none'} onValueChange={(v) => set('responsavel_id', v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Ninguém</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Comprovante / Boleto</Label>
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 h-10 px-3 border rounded-md cursor-pointer text-sm text-muted-foreground hover:bg-muted/50 truncate">
              <Upload className="h-4 w-4 shrink-0" />{file ? file.name : 'Anexar PDF ou imagem'}
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {bill?.comprovante_url && <Button type="button" variant="outline" size="icon" onClick={() => openStoredFile(bill.comprovante_url)} title="Ver atual"><Paperclip className="h-4 w-4" /></Button>}
          </div>
        </div>
        {!editing && (
          <>
            <div className="flex items-center space-x-2">
              <Checkbox id="parcelar" checked={parcelar} onCheckedChange={(c) => setParcelar(c === true)} />
              <Label htmlFor="parcelar" className="cursor-pointer">Parcelar esta conta</Label>
            </div>
            {parcelar && (
              <div className="space-y-2">
                <Label>Número de Parcelas</Label>
                <Input type="number" min="2" max="120" placeholder="Ex: 5" value={nParcelas} onChange={(e) => setNParcelas(e.target.value)} />
                <p className="text-xs text-muted-foreground">Serão criadas {nParcelas || '?'} contas, uma para cada mês a partir do vencimento</p>
              </div>
            )}
          </>
        )}
        <div className="space-y-2 md:col-span-2"><Label>Observações</Label><Textarea rows={3} placeholder="Observações adicionais..." value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
        <div className="flex items-center space-x-2 md:col-span-2">
          <Checkbox id="valor_variavel" checked={f.valor_variavel} onCheckedChange={(c) => set('valor_variavel', c === true)} />
          <Label htmlFor="valor_variavel" className="cursor-pointer">Valor variável (ex: água, luz, gasolina)</Label>
        </div>
        <p className="text-xs text-muted-foreground md:col-span-2">O atraso é marcado automaticamente quando a conta passa do vencimento sem estar paga.</p>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? 'Salvar Alterações' : parcelar ? `Criar ${nParcelas || ''} Parcelas` : 'Adicionar Conta'}
        </Button>
      </div>
    </form>
  );
}
