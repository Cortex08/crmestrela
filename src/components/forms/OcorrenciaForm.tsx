import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, X, Paperclip } from 'lucide-react';
import { uploadPrivateFile, openStoredFile } from '@/lib/storage';
import { friendlyError, toNumber } from '@/lib/utils';
import { useOptions } from '@/hooks/useOptions';

export const TIPOS_OCORRENCIA: Record<string, string> = {
  agua: 'Água', eletrica: 'Elétrica', reclamacao_interna: 'Reclamação Interna',
  estrutura: 'Estrutura', financeiro: 'Financeiro', outros: 'Outros',
};
export const STATUS_OCORRENCIA: Record<string, string> = { em_aberto: 'Em Aberto', em_andamento: 'Em Andamento', resolvido: 'Resolvido' };
export const PRIORIDADE_OCORRENCIA: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };

type FileKind = 'anexos' | 'fotos_servico' | 'comprovantes';

interface Props {
  ocorrencia?: any;
  readOnly?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const FileBox = ({
  label, hint, accept, kind, files, existing, readOnly, onAdd, onRemove,
}: {
  label: string; hint: string; accept: string; kind: FileKind; files: File[]; existing: string[]; readOnly?: boolean;
  onAdd: (k: FileKind, f: FileList | null) => void; onRemove: (k: FileKind, i: number) => void;
}) => (
  <div>
    <Label>{label}</Label>
    {existing.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {existing.map((p, i) => (
          <Button key={p} type="button" variant="outline" size="sm" onClick={() => openStoredFile(p)}>
            <Paperclip className="mr-1 h-3 w-3" /> Arquivo {i + 1}
          </Button>
        ))}
      </div>
    )}
    {!readOnly && (
      <div className="mt-2">
        <label className="flex items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
          <div className="text-center">
            <Upload className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
          </div>
          <input type="file" multiple accept={accept} className="hidden" onChange={(e) => { onAdd(kind, e.target.files); e.target.value = ''; }} />
        </label>
        {files.length > 0 && (
          <div className="mt-2 space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-sm truncate">{f.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(kind, i)}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);

export default function OcorrenciaForm({ ocorrencia, readOnly, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState({
    inquilino_id: '', imovel_id: '', tipo: 'outros', data_reclamacao: todayISO(), status: 'em_aberto',
    prioridade: 'media', tecnico_responsavel_id: '', custo: '', descricao: '', o_que_foi_feito: '',
    data_agendada: '', data_resolucao: '',
  });
  const [files, setFiles] = useState<Record<FileKind, File[]>>({ anexos: [], fotos_servico: [], comprovantes: [] });
  const [loading, setLoading] = useState(false);
  const { clients, properties, profiles } = useOptions(true, { clients: true, properties: true, profiles: true });
  const inquilinos = clients.filter((c) => c.tipo === 'inquilino');

  useEffect(() => {
    if (!ocorrencia) return;
    setForm({
      inquilino_id: ocorrencia.inquilino_id || '', imovel_id: ocorrencia.imovel_id || '',
      tipo: ocorrencia.tipo || 'outros', data_reclamacao: ocorrencia.data_reclamacao || todayISO(),
      status: ocorrencia.status || 'em_aberto', prioridade: ocorrencia.prioridade || 'media',
      tecnico_responsavel_id: ocorrencia.tecnico_responsavel_id || '', custo: ocorrencia.custo?.toString() || '',
      descricao: ocorrencia.descricao || '', o_que_foi_feito: ocorrencia.o_que_foi_feito || '',
      data_agendada: ocorrencia.data_agendada || '', data_resolucao: ocorrencia.data_resolucao || '',
    });
  }, [ocorrencia]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const addFiles = (k: FileKind, list: FileList | null) => list && setFiles((f) => ({ ...f, [k]: [...f[k], ...Array.from(list)] }));
  const removeFile = (k: FileKind, i: number) => setFiles((f) => ({ ...f, [k]: f[k].filter((_, j) => j !== i) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.inquilino_id) return toast.error('Selecione o inquilino');
    if (!form.imovel_id) return toast.error('Selecione o imóvel');
    const custo = toNumber(form.custo);
    if (custo !== null && custo < 0) return toast.error('O custo não pode ser negativo');
    setLoading(true);
    try {
      const uploaded: Record<FileKind, string[]> = { anexos: [], fotos_servico: [], comprovantes: [] };
      for (const k of Object.keys(files) as FileKind[]) {
        for (const f of files[k]) uploaded[k].push(await uploadPrivateFile(f, `ocorrencias/${k}`));
      }
      const merge = (k: FileKind) => {
        const all = [...(ocorrencia?.[k] || []), ...uploaded[k]];
        return all.length ? all : null;
      };
      const payload = {
        inquilino_id: form.inquilino_id, imovel_id: form.imovel_id, tipo: form.tipo,
        data_reclamacao: form.data_reclamacao || todayISO(), status: form.status, prioridade: form.prioridade,
        tecnico_responsavel_id: form.tecnico_responsavel_id || null, custo,
        descricao: form.descricao.trim() || null, o_que_foi_feito: form.o_que_foi_feito.trim() || null,
        data_agendada: form.data_agendada || null,
        data_resolucao: form.data_resolucao || (form.status === 'resolvido' && !ocorrencia?.data_resolucao ? todayISO() : null),
        anexos: merge('anexos'), fotos_servico: merge('fotos_servico'), comprovantes: merge('comprovantes'),
      };
      const { error } = ocorrencia
        ? await supabase.from('property_incidents').update(payload).eq('id', ocorrencia.id)
        : await supabase.from('property_incidents').insert(payload as any);
      if (error) throw error;
      toast.success(ocorrencia ? 'Ocorrência atualizada com sucesso!' : 'Ocorrência registrada com sucesso!');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message?.startsWith('Tipo') || err?.message?.startsWith('Arquivo') ? err.message : friendlyError(err, 'Erro ao salvar ocorrência'));
    } finally {
      setLoading(false);
    }
  };

  const sel = (k: keyof typeof form, opts: [string, string][], placeholder?: string, allowNone = false) => (
    <Select value={form[k] || (allowNone ? 'none' : '')} onValueChange={(v) => set(k, v === 'none' ? '' : v)} disabled={readOnly}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="none">Não atribuído</SelectItem>}
        {opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{ocorrencia ? (readOnly ? 'Detalhes da Ocorrência' : 'Editar Ocorrência') : 'Nova Ocorrência'}</h2>
        <p className="text-sm text-muted-foreground">{ocorrencia ? `Ocorrência #${ocorrencia.numero}` : 'Registre uma nova ocorrência imobiliária'}</p>
      </div>

      <fieldset disabled={readOnly} className="space-y-4">
        <h3 className="font-semibold text-lg">Informações Gerais</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Inquilino *</Label>{sel('inquilino_id', (inquilinos.length ? inquilinos : clients).map((c) => [c.id, c.nome || ''] as [string, string]), 'Selecione o inquilino')}</div>
          <div><Label>Imóvel *</Label>{sel('imovel_id', properties.map((p) => [p.id, `${p.codigo} - ${p.endereco}`] as [string, string]), 'Selecione o imóvel')}</div>
          <div><Label>Tipo de Ocorrência *</Label>{sel('tipo', Object.entries(TIPOS_OCORRENCIA))}</div>
          <div><Label htmlFor="data_reclamacao">Data da Reclamação *</Label><Input id="data_reclamacao" type="date" value={form.data_reclamacao} onChange={(e) => set('data_reclamacao', e.target.value)} required /></div>
          <div><Label>Prioridade *</Label>{sel('prioridade', Object.entries(PRIORIDADE_OCORRENCIA))}</div>
          <div><Label>Status *</Label>{sel('status', Object.entries(STATUS_OCORRENCIA))}</div>
        </div>
        <div>
          <Label htmlFor="descricao">Descrição Detalhada do Problema</Label>
          <Textarea id="descricao" rows={4} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Descreva detalhadamente o problema relatado..." />
        </div>
      </fieldset>
      <FileBox label="Imagens/Documentos Enviados pelo Inquilino" hint="Clique para selecionar arquivos (imagem ou PDF)" accept="image/*,.pdf" kind="anexos" files={files.anexos} existing={ocorrencia?.anexos || []} readOnly={readOnly} onAdd={addFiles} onRemove={removeFile} />

      <fieldset disabled={readOnly} className="space-y-4">
        <h3 className="font-semibold text-lg">Acompanhamento / Manutenção</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Técnico Responsável</Label>{sel('tecnico_responsavel_id', profiles.map((p) => [p.id, p.nome || ''] as [string, string]), 'Selecione o técnico', true)}</div>
          <div><Label htmlFor="data_agendada">Data Agendada para Visita</Label><Input id="data_agendada" type="date" value={form.data_agendada} onChange={(e) => set('data_agendada', e.target.value)} /></div>
          <div><Label htmlFor="custo">Custo do Serviço (R$)</Label><Input id="custo" type="number" min="0" step="0.01" value={form.custo} onChange={(e) => set('custo', e.target.value)} placeholder="0,00" /></div>
          <div><Label htmlFor="data_resolucao">Data da Resolução</Label><Input id="data_resolucao" type="date" value={form.data_resolucao} onChange={(e) => set('data_resolucao', e.target.value)} /></div>
        </div>
        <div>
          <Label htmlFor="o_que_foi_feito">O Que Foi Feito</Label>
          <Textarea id="o_que_foi_feito" rows={4} value={form.o_que_foi_feito} onChange={(e) => set('o_que_foi_feito', e.target.value)} placeholder="Descreva o serviço realizado..." />
        </div>
      </fieldset>
      <FileBox label="Fotos do Serviço Realizado" hint="Clique para adicionar fotos" accept="image/*" kind="fotos_servico" files={files.fotos_servico} existing={ocorrencia?.fotos_servico || []} readOnly={readOnly} onAdd={addFiles} onRemove={removeFile} />
      <FileBox label="Recibos / Comprovantes" hint="Clique para adicionar comprovantes" accept="image/*,.pdf" kind="comprovantes" files={files.comprovantes} existing={ocorrencia?.comprovantes || []} readOnly={readOnly} onAdd={addFiles} onRemove={removeFile} />

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
        {!readOnly && <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : ocorrencia ? 'Atualizar Ocorrência' : 'Registrar Ocorrência'}</Button>}
      </div>
    </form>
  );
}
