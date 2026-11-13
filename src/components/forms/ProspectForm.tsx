import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Upload, X } from 'lucide-react';
import { uploadProspectPhoto } from '@/lib/storage';
import { friendlyError } from '@/lib/utils';
import { TIPO_CAPTACAO, TIPO_IMOVEL_PROSPECT, PROXIMA_ACAO, STATUS_PROSPECT } from '@/lib/prospeccao';
import { cn } from '@/lib/utils';

interface Props {
  prospect?: any;
  profiles: { id: string; nome?: string }[];
  onSuccess: () => void;
}

export default function ProspectForm({ prospect, profiles, onSuccess }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<{ url: string; legenda: string }[]>(Array.isArray(prospect?.fotos) ? prospect.fotos : []);
  const [f, setF] = useState({
    tipo_captacao: prospect?.tipo_captacao || 'aluguel',
    tipo_imovel: prospect?.tipo_imovel || 'casa',
    endereco: prospect?.endereco || '',
    numero: prospect?.numero || '',
    bairro: prospect?.bairro || '',
    cidade: prospect?.cidade || 'Belo Horizonte',
    estado: prospect?.estado || 'MG',
    ponto_referencia: prospect?.ponto_referencia || '',
    status: prospect?.status || 'novo',
    observacoes: prospect?.observacoes || '',
    proprietario_nome: prospect?.proprietario_nome || '',
    proprietario_telefone: prospect?.proprietario_telefone || '',
    proprietario_telefone2: prospect?.proprietario_telefone2 || '',
    proprietario_whatsapp: !!prospect?.proprietario_whatsapp,
    proprietario_melhor_horario: prospect?.proprietario_melhor_horario || '',
    proprietario_observacoes: prospect?.proprietario_observacoes || '',
    responsavel_prospeccao_id: prospect?.responsavel_prospeccao_id || user?.id || '',
    responsavel_contato_id: prospect?.responsavel_contato_id || '',
    proxima_acao: prospect?.proxima_acao || '',
    data_proxima_acao: prospect?.data_proxima_acao || '',
  });
  const set = (k: keyof typeof f, v: any) => setF((s) => ({ ...s, [k]: v }));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadProspectPhoto(file);
        setPhotos((p) => [...p, { url, legenda: '' }]);
      }
      toast.success('Foto(s) enviada(s) com sucesso!');
    } catch (e: any) {
      toast.error(e?.message?.startsWith('Use') || e?.message?.startsWith('Foto') ? e.message : friendlyError(e, 'Erro ao enviar foto'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.endereco.trim() || !f.bairro.trim() || !f.cidade.trim() || !f.estado.trim()) {
      return toast.error('Preencha endereço, bairro, cidade e estado');
    }
    setLoading(true);
    try {
      const phones = [f.proprietario_telefone, f.proprietario_telefone2].filter((p) => p && p.replace(/\D/g, ''));
      if (phones.length) {
        const { data: dup, error } = await supabase.rpc('prospect_phones_existentes', { _phones: phones, _ignorar: prospect?.id || null });
        if (error) throw error;
        if (dup && dup.length) {
          const which = phones.find((p) => dup.includes(p.replace(/\D/g, '')));
          toast.error(`O número ${which} já existe em outra prospecção`);
          return;
        }
      }
      const t = (v: string) => v.trim() || null;
      const payload = {
        tipo_captacao: f.tipo_captacao, tipo_imovel: f.tipo_imovel, endereco: f.endereco.trim(), numero: t(f.numero),
        bairro: f.bairro.trim(), cidade: f.cidade.trim(), estado: f.estado.trim().toUpperCase().slice(0, 2),
        ponto_referencia: t(f.ponto_referencia), status: f.status, observacoes: t(f.observacoes),
        proprietario_nome: t(f.proprietario_nome), proprietario_telefone: t(f.proprietario_telefone),
        proprietario_telefone2: t(f.proprietario_telefone2), proprietario_whatsapp: f.proprietario_whatsapp,
        proprietario_melhor_horario: t(f.proprietario_melhor_horario), proprietario_observacoes: t(f.proprietario_observacoes),
        proprietario_origem: prospect?.proprietario_origem || 'placa_rua', fotos: photos,
        responsavel_prospeccao_id: f.responsavel_prospeccao_id || null, responsavel_contato_id: f.responsavel_contato_id || null,
        proxima_acao: f.proxima_acao || null, data_proxima_acao: f.data_proxima_acao || null,
      };
      const { error } = prospect
        ? await supabase.from('property_prospects').update(payload).eq('id', prospect.id)
        : await supabase.from('property_prospects').insert(payload);
      if (error) throw error;
      toast.success(prospect ? 'Prospecção atualizada!' : 'Prospecção cadastrada!');
      onSuccess();
    } catch (err) {
      toast.error(friendlyError(err, 'Erro ao salvar prospecção'));
    } finally {
      setLoading(false);
    }
  };

  const people = (k: 'responsavel_prospeccao_id' | 'responsavel_contato_id') => (
    <Select value={f[k] || 'none'} onValueChange={(v) => set(k, v === 'none' ? '' : v)}>
      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Ninguém</SelectItem>
        {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Tipo de Captação</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(TIPO_CAPTACAO).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => set('tipo_captacao', v)}
              className={cn('px-4 py-2 rounded-md border text-sm transition-colors', f.tipo_captacao === v ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
            >
              {l}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Dados do Imóvel</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Imóvel</Label>
              <Select value={f.tipo_imovel} onValueChange={(v) => set('tipo_imovel', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPO_IMOVEL_PROSPECT).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {prospect && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={f.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_PROSPECT).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Rua/Endereço *</Label><Input placeholder="Nome da rua" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} required /></div>
            <div className="space-y-2"><Label>Número</Label><Input placeholder="123" value={f.numero} onChange={(e) => set('numero', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Bairro *</Label><Input placeholder="Nome do bairro" value={f.bairro} onChange={(e) => set('bairro', e.target.value)} required /></div>
            <div className="space-y-2"><Label>Cidade *</Label><Input placeholder="Cidade" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} required /></div>
            <div className="space-y-2"><Label>Estado *</Label><Input placeholder="UF" maxLength={2} value={f.estado} onChange={(e) => set('estado', e.target.value.toUpperCase())} required /></div>
          </div>
          <div className="space-y-2"><Label>Ponto de Referência</Label><Input placeholder="Ex: Próximo ao mercado..." value={f.ponto_referencia} onChange={(e) => set('ponto_referencia', e.target.value)} /></div>
          <div className="space-y-2"><Label>Observações Gerais</Label><Textarea placeholder="Observações sobre o imóvel..." value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Dados do Proprietário</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nome do Proprietário</Label><Input placeholder="Nome completo" value={f.proprietario_nome} onChange={(e) => set('proprietario_nome', e.target.value)} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Telefone Principal</Label><Input inputMode="tel" placeholder="(31) 99999-9999" value={f.proprietario_telefone} onChange={(e) => set('proprietario_telefone', e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone Secundário</Label><Input inputMode="tel" placeholder="(31) 99999-9999" value={f.proprietario_telefone2} onChange={(e) => set('proprietario_telefone2', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Tem WhatsApp?</Label>
              <Switch checked={f.proprietario_whatsapp} onCheckedChange={(v) => set('proprietario_whatsapp', v)} />
            </div>
            <div className="space-y-2"><Label>Melhor Horário para Contato</Label><Input placeholder="Ex: Manhã, após 14h..." value={f.proprietario_melhor_horario} onChange={(e) => set('proprietario_melhor_horario', e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Observações sobre o Proprietário</Label><Textarea placeholder="Ex: Resistente, aberto à conversa, pediu retorno..." value={f.proprietario_observacoes} onChange={(e) => set('proprietario_observacoes', e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Fotos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className={cn('flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md cursor-pointer hover:bg-primary/90 text-sm', uploading && 'opacity-60 pointer-events-none')}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload de Fotos
              <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            </label>
            <p className="text-sm text-muted-foreground">Fotos da fachada e placa</p>
          </div>
          {photos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photos.map((ph, i) => (
                <div key={ph.url} className="relative group">
                  <img src={ph.url} alt={`Foto ${i + 1}`} className="w-full h-32 object-cover rounded-md" />
                  <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </Button>
                  <Input placeholder="Legenda..." value={ph.legenda} onChange={(e) => setPhotos((p) => p.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))} className="mt-1 text-xs" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Responsáveis e Próxima Ação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Responsável pela Prospecção</Label>{people('responsavel_prospeccao_id')}</div>
            <div className="space-y-2"><Label>Responsável pelo Contato</Label>{people('responsavel_contato_id')}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Próxima Ação</Label>
              <Select value={f.proxima_acao || 'none'} onValueChange={(v) => set('proxima_acao', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {Object.entries(PROXIMA_ACAO).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Data da Próxima Ação</Label><Input type="date" value={f.data_proxima_acao} onChange={(e) => set('data_proxima_acao', e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={loading || uploading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {prospect ? 'Salvar Alterações' : 'Cadastrar Prospecção'}
        </Button>
      </div>
    </form>
  );
}
