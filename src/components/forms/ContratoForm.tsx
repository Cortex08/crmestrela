import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addMonths, format, parseISO } from 'date-fns';
import { uploadPrivateFile, openStoredFile } from '@/lib/storage';
import { friendlyError, formatDateBR, toInt, toNumber } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export type ContratoCategoria = 'inquilino' | 'proprietario' | 'funcionario' | 'parceria';

interface Props {
  onSuccess?: () => void;
  categoria: ContratoCategoria;
  contratoId?: string;
}

export const STATUS_CONTRATO_OPTIONS = [
  { value: 'renovar', label: 'Renovar' },
  { value: 'verificar', label: 'Verificar' },
  { value: 'em_contrato', label: 'Em Contrato' },
  { value: 'em_deposito', label: 'Em Depósito' },
  { value: 'vai_sair', label: 'Vai Sair' },
  { value: 'saiu_chave_devolvida', label: 'Saiu/Chave Devolvida' },
  { value: 'saiu_com_proprietario', label: 'Saiu/Saída com Proprietário' },
];

const NONE = '__none__';
const emptyForm = {
  cliente_id: NONE, funcionario_id: NONE, parceria_nome: '', endereco_imovel: '', numero_unidade: '', tipo: '', tipo_imovel: NONE,
  status: 'rascunho' as 'rascunho' | 'ativo' | 'encerrado', status_contrato: 'em_contrato', data_assinatura: '', data_inicio: '',
  prazo_meses: '12', data_pagamento_acordado: '', valor: '', arquivo_url: '', observacoes: '', responsavel_cadastro_id: NONE,
  contato_vinculado: '', proprietario_vinculado_id: NONE, inquilino_vinculado_id: NONE,
};

const orNull = (v: string) => (v && v !== NONE ? v : null);
const gerarCodigo = (categoria: string) =>
  `${categoria.substring(0, 3).toUpperCase()}-${format(new Date(), 'yyMMdd')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export function ContratoForm({ onSuccess, categoria, contratoId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [proprietarios, setProprietarios] = useState<any[]>([]);
  const [inquilinos, setInquilinos] = useState<any[]>([]);
  const [form, setForm] = useState({ ...emptyForm, responsavel_cadastro_id: user?.id || NONE });

  const set = (k: keyof typeof emptyForm, v: any) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      const [props, inqs, profs, funcs] = await Promise.all([
        supabase.from('clients').select('id, nome').eq('tipo', 'proprietario').order('nome').limit(2000),
        supabase.from('clients').select('id, nome').eq('tipo', 'inquilino').order('nome').limit(2000),
        supabase.from('profiles').select('id, nome').eq('status', 'ativo').order('nome'),
        categoria === 'funcionario'
          ? supabase.from('employees').select('id, nome').eq('status', 'ativo').order('nome')
          : Promise.resolve({ data: [] as any[] }),
      ]);
      setProprietarios(props.data || []);
      setInquilinos(inqs.data || []);
      setProfiles(profs.data || []);
      setFuncionarios(funcs.data || []);
      if (categoria === 'inquilino') setClientes(inqs.data || []);
      if (categoria === 'proprietario') setClientes(props.data || []);
    })();
  }, [categoria]);

  useEffect(() => {
    if (!contratoId) return;
    supabase.from('contracts').select('*').eq('id', contratoId).single().then(({ data, error }) => {
      if (error || !data) return toast.error('Erro ao carregar contrato');
      setForm({
        cliente_id: data.cliente_id || NONE, funcionario_id: data.funcionario_id || NONE, parceria_nome: data.parceria_nome || '',
        endereco_imovel: data.endereco_imovel || '', numero_unidade: data.numero_unidade || '', tipo: data.tipo || '',
        tipo_imovel: data.tipo_imovel || NONE, status: data.status || 'rascunho', status_contrato: data.status_contrato || 'em_contrato',
        data_assinatura: data.data_assinatura || '', data_inicio: data.data_inicio || '', prazo_meses: data.prazo_meses?.toString() || '12',
        data_pagamento_acordado: data.data_pagamento_acordado?.toString() || '', valor: data.valor?.toString() || '',
        arquivo_url: data.arquivo_url || '', observacoes: data.observacoes || '', responsavel_cadastro_id: data.responsavel_cadastro_id || NONE,
        contato_vinculado: data.contato_vinculado || '', proprietario_vinculado_id: data.proprietario_vinculado_id || NONE,
        inquilino_vinculado_id: data.inquilino_vinculado_id || NONE,
      });
    });
  }, [contratoId]);

  const dataFim = form.data_inicio && form.prazo_meses ? format(addMonths(parseISO(form.data_inicio), parseInt(form.prazo_meses)), 'yyyy-MM-dd') : '';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadPrivateFile(file, `contratos/${categoria}`);
      set('arquivo_url', path);
      toast.success('Arquivo enviado com sucesso!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tipo) return toast.error('Selecione o tipo de contrato');
    if ((categoria === 'inquilino' || categoria === 'proprietario') && form.cliente_id === NONE)
      return toast.error(`Selecione o ${categoria}. Se ainda não existir, cadastre em Clientes.`);
    if (categoria === 'funcionario' && form.funcionario_id === NONE) return toast.error('Selecione um funcionário');
    if (categoria === 'parceria' && !form.parceria_nome.trim()) return toast.error('Digite o nome da parceria');
    const dia = toInt(form.data_pagamento_acordado);
    if (dia !== null && (dia < 1 || dia > 31)) return toast.error('Dia do pagamento deve ser entre 1 e 31');

    setLoading(true);
    const payload: Record<string, any> = {
      categoria,
      tipo: form.tipo,
      tipo_imovel: orNull(form.tipo_imovel),
      status: form.status,
      status_contrato: form.status_contrato,
      endereco_imovel: form.endereco_imovel.trim() || null,
      numero_unidade: form.numero_unidade.trim() || null,
      data_assinatura: form.data_assinatura || null,
      data_inicio: form.data_inicio || null,
      data_fim: dataFim || null,
      prazo_meses: parseInt(form.prazo_meses) || 12,
      data_pagamento_acordado: dia,
      valor: toNumber(form.valor),
      arquivo_url: form.arquivo_url || null,
      observacoes: form.observacoes.trim() || null,
      responsavel_cadastro_id: orNull(form.responsavel_cadastro_id),
      contato_vinculado: form.contato_vinculado.trim() || null,
      proprietario_vinculado_id: categoria === 'inquilino' ? orNull(form.proprietario_vinculado_id) : null,
      inquilino_vinculado_id: categoria === 'proprietario' ? orNull(form.inquilino_vinculado_id) : null,
      cliente_id: categoria === 'inquilino' || categoria === 'proprietario' ? orNull(form.cliente_id) : null,
      funcionario_id: categoria === 'funcionario' ? orNull(form.funcionario_id) : null,
      parceria_nome: categoria === 'parceria' ? form.parceria_nome.trim() : null,
      pasta: categoria,
    };

    try {
      if (contratoId) {
        const { error } = await supabase.from('contracts').update(payload).eq('id', contratoId);
        if (error) throw error;
        toast.success('Contrato atualizado com sucesso!');
      } else {
        const codigo = gerarCodigo(categoria);
        const { data: novo, error } = await supabase.from('contracts').insert({ ...payload, codigo }).select('id').single();
        if (error) throw error;
        if (payload.arquivo_url && novo) {
          await supabase.from('documents').insert({
            nome: `Contrato ${codigo}`, tipo: 'contrato_assinado', categoria: 'contratos',
            status: form.status === 'ativo' ? 'ativo' : 'arquivado', pasta: 'contratos',
            cliente_id: payload.cliente_id, contrato_id: novo.id, endereco: payload.endereco_imovel, url: payload.arquivo_url,
          });
        }
        toast.success('Contrato cadastrado com sucesso!');
      }
      onSuccess?.();
    } catch (err) {
      toast.error(friendlyError(err, 'Erro ao salvar contrato'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="contato">Contato (Prop/Inquilino)</Label>
          <Input id="contato" placeholder="WhatsApp ou telefone" value={form.contato_vinculado} onChange={(e) => set('contato_vinculado', e.target.value)} />
        </div>

        {(categoria === 'inquilino' || categoria === 'proprietario') && (
          <div className="space-y-2">
            <Label>{categoria === 'inquilino' ? 'Inquilino *' : 'Proprietário *'}</Label>
            <Select value={form.cliente_id} onValueChange={(v) => set('cliente_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione...</SelectItem>
                {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {categoria === 'funcionario' && (
          <div className="space-y-2">
            <Label>Funcionário *</Label>
            <Select value={form.funcionario_id} onValueChange={(v) => set('funcionario_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione...</SelectItem>
                {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {categoria === 'parceria' && (
          <div className="space-y-2">
            <Label htmlFor="parceria">Nome da Parceria *</Label>
            <Input id="parceria" value={form.parceria_nome} onChange={(e) => set('parceria_nome', e.target.value)} />
          </div>
        )}
      </div>

      {categoria === 'inquilino' && (
        <div className="space-y-2">
          <Label>Proprietário Vinculado</Label>
          <Select value={form.proprietario_vinculado_id} onValueChange={(v) => set('proprietario_vinculado_id', v)}>
            <SelectTrigger><SelectValue placeholder="Vincular ao proprietário" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhum</SelectItem>
              {proprietarios.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {categoria === 'proprietario' && (
        <div className="space-y-2">
          <Label>Inquilino Vinculado</Label>
          <Select value={form.inquilino_vinculado_id} onValueChange={(v) => set('inquilino_vinculado_id', v)}>
            <SelectTrigger><SelectValue placeholder="Vincular ao inquilino" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhum</SelectItem>
              {inquilinos.map((i) => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="end">Endereço</Label>
          <Input id="end" value={form.endereco_imovel} onChange={(e) => set('endereco_imovel', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="un">Número / Unidade</Label>
          <Input id="un" value={form.numero_unidade} onChange={(e) => set('numero_unidade', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo de Contrato *</Label>
          <Select value={form.tipo} onValueChange={(v) => set('tipo', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="locacao">Locação</SelectItem>
              <SelectItem value="trabalho">Trabalho</SelectItem>
              <SelectItem value="prestacao_servicos">Prestação de Serviços</SelectItem>
              <SelectItem value="parceria">Parceria</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipo do Imóvel</Label>
          <Select value={form.tipo_imovel} onValueChange={(v) => set('tipo_imovel', v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Não informado</SelectItem>
              <SelectItem value="residencial">Residencial</SelectItem>
              <SelectItem value="comercial">Comercial</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
              <SelectItem value="rural">Rural</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status Geral *</Label>
          <Select value={form.status} onValueChange={(v) => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="encerrado">Encerrado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status do Contrato</Label>
          <Select value={form.status_contrato} onValueChange={(v) => set('status_contrato', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_CONTRATO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ass">Data de Assinatura</Label>
          <Input id="ass" type="date" value={form.data_assinatura} onChange={(e) => set('data_assinatura', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ini">Data de Início</Label>
          <Input id="ini" type="date" value={form.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Prazo (meses)</Label>
          <Select value={form.prazo_meses} onValueChange={(v) => set('prazo_meses', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
              <SelectItem value="24">24 meses</SelectItem>
              <SelectItem value="30">30 meses</SelectItem>
              <SelectItem value="36">36 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dia">Dia do Pagamento Acordado</Label>
          <Input id="dia" type="number" min="1" max="31" placeholder="Ex: 10" value={form.data_pagamento_acordado} onChange={(e) => set('data_pagamento_acordado', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input id="valor" type="number" step="0.01" min="0" value={form.valor} onChange={(e) => set('valor', e.target.value)} />
        </div>
      </div>

      {dataFim && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm"><strong>Data de Encerramento:</strong> {formatDateBR(dataFim)}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="arquivo">Arquivo do Contrato (PDF/Imagens/Word)</Label>
        <div className="flex items-center gap-2">
          <Input id="arquivo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={handleFileUpload} disabled={uploading} />
          {uploading && <span className="text-sm text-muted-foreground">Enviando...</span>}
        </div>
        {form.arquivo_url && (
          <button type="button" onClick={() => openStoredFile(form.arquivo_url)} className="text-sm text-primary hover:underline">
            Ver arquivo anexado
          </button>
        )}
      </div>

      <div className="space-y-2">
        <Label>Responsável pelo Cadastro</Label>
        <Select value={form.responsavel_cadastro_id} onValueChange={(v) => set('responsavel_cadastro_id', v)}>
          <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nenhum</SelectItem>
            {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="obs">Observações</Label>
        <Textarea id="obs" rows={3} maxLength={5000} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
      </div>

      <Button type="submit" disabled={loading || uploading} className="w-full">
        {loading ? 'Salvando...' : contratoId ? 'Atualizar Contrato' : 'Cadastrar Contrato'}
      </Button>
    </form>
  );
}
