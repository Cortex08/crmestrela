import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Paperclip, Upload } from 'lucide-react';
import { useOptions } from '@/hooks/useOptions';
import { uploadPrivateFile, openStoredFile } from '@/lib/storage';
import { formatCurrency, friendlyError, toNumber } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payment?: any | null;
  defaultMonth: string; // yyyy-MM
  onSuccess: () => void;
}

const blank = (mes: string) => ({
  proprietario_id: '', inquilino_id: '', mes_referencia: `${mes}-01`, data_vencimento: '', valor_aluguel: '', percentual_comissao: '10',
  encargos_extras: '', valor_desconto: '', valor_multa: '', valor_juros: '', valor_repasse_manual: '', observacoes: '',
  inquilino_pagou: false, data_pagamento_inquilino: '', proprietario_recebeu: false, data_repasse_proprietario: '',
});

export const PagamentoForm = ({ open, onOpenChange, payment, defaultMonth, onSuccess }: Props) => {
  const { clients } = useOptions(open, { clients: true });
  const proprietarios = clients.filter((c) => c.tipo === 'proprietario');
  const inquilinos = clients.filter((c) => c.tipo !== 'proprietario');
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState(blank(defaultMonth));
  const [fileInq, setFileInq] = useState<File | null>(null);
  const [fileRep, setFileRep] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileInq(null); setFileRep(null);
    if (!payment) return setF(blank(defaultMonth));
    const s = (v: any) => (v === null || v === undefined ? '' : String(v));
    setF({
      proprietario_id: payment.proprietario_id, inquilino_id: s(payment.inquilino_id), mes_referencia: payment.mes_referencia,
      data_vencimento: s(payment.data_vencimento), valor_aluguel: s(payment.valor_aluguel), percentual_comissao: s(payment.percentual_comissao ?? 10),
      encargos_extras: s(payment.encargos_extras || ''), valor_desconto: s(payment.valor_desconto || ''), valor_multa: s(payment.valor_multa || ''),
      valor_juros: s(payment.valor_juros || ''), valor_repasse_manual: s(payment.valor_repasse_manual), observacoes: s(payment.observacoes),
      inquilino_pagou: !!payment.inquilino_pagou, data_pagamento_inquilino: s(payment.data_pagamento_inquilino),
      proprietario_recebeu: !!payment.proprietario_recebeu, data_repasse_proprietario: s(payment.data_repasse_proprietario),
    });
  }, [open, payment, defaultMonth]);
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));

  const aluguel = toNumber(f.valor_aluguel) || 0;
  const pct = toNumber(f.percentual_comissao) ?? 10;
  const repasseCalc = Math.round(aluguel * (1 - pct / 100) * 100) / 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.proprietario_id || !f.valor_aluguel) return toast.error('Preencha proprietário e valor do aluguel');
    if (aluguel < 0 || pct < 0 || pct > 100) return toast.error('Valores inválidos');
    setLoading(true);
    try {
      const upInq = fileInq ? await uploadPrivateFile(fileInq, 'pagamentos') : undefined;
      const upRep = fileRep ? await uploadPrivateFile(fileRep, 'pagamentos') : undefined;
      const payload: any = {
        proprietario_id: f.proprietario_id, inquilino_id: f.inquilino_id || null, mes_referencia: f.mes_referencia,
        data_vencimento: f.data_vencimento || null, valor_aluguel: aluguel, percentual_comissao: pct,
        encargos_extras: toNumber(f.encargos_extras) || 0, valor_desconto: toNumber(f.valor_desconto) || 0,
        valor_multa: toNumber(f.valor_multa) || 0, valor_juros: toNumber(f.valor_juros) || 0,
        valor_repasse_manual: toNumber(f.valor_repasse_manual), observacoes: f.observacoes.trim() || null,
        inquilino_pagou: f.inquilino_pagou, data_pagamento_inquilino: f.inquilino_pagou ? f.data_pagamento_inquilino || null : null,
        proprietario_recebeu: f.proprietario_recebeu, data_repasse_proprietario: f.proprietario_recebeu ? f.data_repasse_proprietario || null : null,
      };
      if (upInq) payload.comprovante_inquilino_url = upInq;
      if (upRep) payload.comprovante_repasse_url = upRep;
      const { error } = payment
        ? await supabase.from('owner_payments').update(payload).eq('id', payment.id)
        : await supabase.from('owner_payments').insert(payload);
      if (error) throw error;
      toast.success(payment ? 'Registro atualizado com sucesso!' : 'Pagamento registrado!');
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message?.startsWith('Tipo') || err?.message?.startsWith('Arquivo') ? err.message : friendlyError(err, 'Erro ao salvar registro'));
    } finally {
      setLoading(false);
    }
  };

  const num = (k: keyof typeof f, label: string, ph?: string) => (
    <div className="space-y-2"><Label>{label}</Label><Input type="number" min="0" step="0.01" placeholder={ph} value={f[k] as string} onChange={(e) => set(k, e.target.value)} /></div>
  );
  const fileBox = (label: string, file: File | null, setFile: (f: File | null) => void, current?: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <label className="flex-1 flex items-center gap-2 h-10 px-3 border rounded-md cursor-pointer text-sm text-muted-foreground hover:bg-muted/50 truncate">
          <Upload className="h-4 w-4 shrink-0" />{file ? file.name : 'Anexar'}
          <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        {current && <Button type="button" variant="outline" size="icon" onClick={() => openStoredFile(current)}><Paperclip className="h-4 w-4" /></Button>}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{payment ? 'Editar Registro de Pagamento' : 'Novo Registro de Pagamento'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Proprietário *</Label>
              <Select value={f.proprietario_id} onValueChange={(v) => set('proprietario_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{proprietarios.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Inquilino</Label>
              <Select value={f.inquilino_id || 'none'} onValueChange={(v) => set('inquilino_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Nenhum</SelectItem>{inquilinos.map((i) => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Mês Referência *</Label><Input type="month" value={f.mes_referencia.slice(0, 7)} onChange={(e) => set('mes_referencia', `${e.target.value}-01`)} required /></div>
            <div className="space-y-2"><Label>Data Vencimento</Label><Input type="date" value={f.data_vencimento} onChange={(e) => set('data_vencimento', e.target.value)} /></div>
            {num('valor_aluguel', 'Valor Aluguel *', '0,00')}
            <div className="space-y-2"><Label>Comissão (%)</Label><Input type="number" min="0" max="100" step="0.1" value={f.percentual_comissao} onChange={(e) => set('percentual_comissao', e.target.value)} /></div>
            {num('encargos_extras', 'ENEL/SABESP (encargos)', '0,00')}
            {num('valor_desconto', 'Desconto', '0,00')}
            {num('valor_multa', 'Multa', '0,00')}
            {num('valor_juros', 'Juros', '0,00')}
            <div className="space-y-2 sm:col-span-2">
              <Label>Repasse Manual</Label>
              <Input type="number" min="0" step="0.01" placeholder={`Calculado: ${formatCurrency(repasseCalc)}`} value={f.valor_repasse_manual} onChange={(e) => set('valor_repasse_manual', e.target.value)} />
              <p className="text-xs text-muted-foreground">Deixe vazio para usar o cálculo automático ({formatCurrency(repasseCalc)}; comissão {formatCurrency(aluguel - repasseCalc)}).</p>
            </div>
          </div>

          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2"><Checkbox id="pagou" checked={f.inquilino_pagou} onCheckedChange={(c) => set('inquilino_pagou', c === true)} /><Label htmlFor="pagou">Inquilino pagou</Label></div>
              {f.inquilino_pagou && <Input type="date" value={f.data_pagamento_inquilino} onChange={(e) => set('data_pagamento_inquilino', e.target.value)} />}
              {fileBox('Comprovante do inquilino', fileInq, setFileInq, payment?.comprovante_inquilino_url)}
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2"><Checkbox id="recebeu" checked={f.proprietario_recebeu} onCheckedChange={(c) => set('proprietario_recebeu', c === true)} /><Label htmlFor="recebeu">Proprietário recebeu repasse</Label></div>
              {f.proprietario_recebeu && <Input type="date" value={f.data_repasse_proprietario} onChange={(e) => set('data_repasse_proprietario', e.target.value)} />}
              {fileBox('Comprovante do repasse', fileRep, setFileRep, payment?.comprovante_repasse_url)}
            </div>
          </div>
          <div className="space-y-2"><Label>Observações</Label><Textarea rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{payment ? 'Salvar' : 'Registrar Pagamento'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
