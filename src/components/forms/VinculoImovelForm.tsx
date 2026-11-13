import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Building2, Users, FileText, Loader2 } from 'lucide-react';
import { friendlyError, toNumber, toInt } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const empty = () => ({
  tipo: 'aluguel', imovel_id: '', proprietario_id: '', cliente_id: '', valor: '',
  data_inicio: new Date().toISOString().slice(0, 10), prazo_meses: '12', comissao: '10', observacoes: '',
});

export function VinculoImovelForm({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty());
  const set = (k: keyof ReturnType<typeof empty>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { if (open) setForm(empty()); }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['vinculo-options'],
    enabled: open,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const [p, c] = await Promise.all([
        supabase.from('properties').select('id, codigo, titulo, endereco, bairro, tipo, status, proprietario_id, valor_aluguel, valor_venda').in('status', ['disponivel', 'reservado']).order('codigo'),
        supabase.from('clients').select('id, nome, tipo, whatsapp, cpf_cnpj').order('nome').limit(3000),
      ]);
      return { properties: p.data || [], clients: c.data || [] };
    },
  });
  const properties = data?.properties || [];
  const proprietarios = useMemo(() => (data?.clients || []).filter((c: any) => c.tipo === 'proprietario'), [data]);
  const inquilinos = useMemo(() => (data?.clients || []).filter((c: any) => c.tipo !== 'proprietario'), [data]);

  // Ao escolher o imóvel, já preenche proprietário e valor
  const pickImovel = (id: string) => {
    const p: any = properties.find((x: any) => x.id === id);
    setForm((f) => ({
      ...f,
      imovel_id: id,
      proprietario_id: p?.proprietario_id || f.proprietario_id,
      valor: f.valor || String((f.tipo === 'aluguel' ? p?.valor_aluguel : p?.valor_venda) || ''),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.imovel_id) return toast.error('Selecione um imóvel');
    if (!form.proprietario_id) return toast.error('Selecione o proprietário');
    if (!form.cliente_id) return toast.error(`Selecione o ${form.tipo === 'aluguel' ? 'inquilino' : 'comprador'}`);
    const valor = toNumber(form.valor);
    if (!valor || valor <= 0) return toast.error('Informe o valor');
    setLoading(true);
    const { error } = await supabase.rpc('criar_vinculo_imovel', {
      _imovel_id: form.imovel_id,
      _tipo: form.tipo,
      _proprietario_id: form.proprietario_id,
      _cliente_id: form.cliente_id,
      _valor: valor,
      _data_inicio: form.data_inicio,
      _prazo_meses: form.tipo === 'aluguel' ? toInt(form.prazo_meses) : null,
      _observacoes: form.observacoes || null,
      _percentual_comissao: toNumber(form.comissao) ?? 10,
    });
    setLoading(false);
    if (error) {
      // Mensagens de validação vindas do banco são claras; as demais viram mensagem amigável
      return toast.error(error.code === 'P0001' ? error.message : friendlyError(error, 'Erro ao criar vínculo'));
    }
    toast.success(form.tipo === 'aluguel' ? 'Vínculo de aluguel criado com sucesso!' : 'Vínculo de venda criado com sucesso!');
    onOpenChange(false);
    onSuccess();
  };

  const aluguel = form.tipo === 'aluguel';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Criar Vínculo de Imóvel</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-2">
              <Label>Tipo de Vínculo</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aluguel">Aluguel</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2"><Building2 className="h-4 w-4" /> Imóvel</h4>
              <div className="space-y-2">
                <Label>Selecionar Imóvel</Label>
                <Select value={form.imovel_id} onValueChange={pickImovel}>
                  <SelectTrigger><SelectValue placeholder="Selecione um imóvel disponível" /></SelectTrigger>
                  <SelectContent>
                    {properties.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">Nenhum imóvel disponível</div>
                    ) : (
                      properties.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.codigo} - {p.titulo || p.endereco} ({p.bairro})</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Pessoas Vinculadas</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Proprietário</Label>
                  <Select value={form.proprietario_id} onValueChange={(v) => set('proprietario_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o proprietário" /></SelectTrigger>
                    <SelectContent>
                      {proprietarios.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.cpf_cnpj ? ` — ${c.cpf_cnpj}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{aluguel ? 'Inquilino' : 'Comprador'}</Label>
                  <Select value={form.cliente_id} onValueChange={(v) => set('cliente_id', v)}>
                    <SelectTrigger><SelectValue placeholder={`Selecione o ${aluguel ? 'inquilino' : 'comprador'}`} /></SelectTrigger>
                    <SelectContent>
                      {inquilinos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.cpf_cnpj ? ` — ${c.cpf_cnpj}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Busca em clientes do tipo inquilino ou lead</p>
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" /> Dados do Contrato</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{aluguel ? 'Valor do Aluguel' : 'Valor da Venda'}</Label>
                  <Input type="number" min="0.01" step="0.01" placeholder="0,00" value={form.valor} onChange={(e) => set('valor', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Início</Label>
                  <Input type="date" value={form.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} required />
                </div>
                {aluguel && (
                  <>
                    <div className="space-y-2">
                      <Label>Prazo (meses)</Label>
                      <Input type="number" min="1" placeholder="12" value={form.prazo_meses} onChange={(e) => set('prazo_meses', e.target.value)} />
                      <p className="text-xs text-muted-foreground">Prazo padrão: 12 meses</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Comissão da administração (%)</Label>
                      <Input type="number" min="0" max="100" step="0.1" value={form.comissao} onChange={(e) => set('comissao', e.target.value)} />
                      <p className="text-xs text-muted-foreground">Usada para calcular o repasse ao proprietário</p>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Observações adicionais sobre o contrato..." value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar Vínculo</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
