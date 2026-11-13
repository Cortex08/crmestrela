import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Plus } from 'lucide-react';
import { uploadPrivateFile, removePrivateFile } from '@/lib/storage';
import { friendlyError } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  clienteId?: string;
  endereco?: string;
  showTrigger?: boolean;
}

const tipos = [
  ['rg', 'RG'], ['cpf', 'CPF'], ['cnh', 'CNH'], ['contrato', 'Contrato'], ['contrato_assinado', 'Contrato Assinado'],
  ['comprovante', 'Comprovante'], ['boleto', 'Boleto'], ['recibo', 'Recibo'], ['doc_imovel', 'Documentação do Imóvel'],
  ['foto_vistoria', 'Foto de Vistoria'], ['arquivo_interno', 'Arquivo Interno'],
];
const categorias = [
  ['contratos', 'Contratos'], ['documentos_pessoais', 'Documentos Pessoais'], ['financeiro', 'Financeiro'],
  ['juridico', 'Jurídico'], ['administrativo', 'Administrativo'], ['arquivo_morto', 'Arquivo Morto'],
];

export const DocumentUploadDialog = ({ open, onOpenChange, onSuccess, clienteId, endereco, showTrigger = true }: Props) => {
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ nome: '', tipo: 'arquivo_interno', categoria: 'documentos_pessoais', observacoes: '', endereco: endereco || '' });

  useEffect(() => {
    if (!open) {
      setFile(null);
      setForm({ nome: '', tipo: 'arquivo_interno', categoria: 'documentos_pessoais', observacoes: '', endereco: endereco || '' });
    }
  }, [open, endereco]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error('Selecione um arquivo');
    setUploading(true);
    let path = '';
    try {
      path = await uploadPrivateFile(file, clienteId ? `clientes/${clienteId}` : 'documentos');
      const { error } = await supabase.from('documents').insert({
        nome: form.nome.trim() || file.name,
        tipo: form.tipo,
        categoria: form.categoria,
        status: 'ativo',
        pasta: form.categoria,
        cliente_id: clienteId || null,
        endereco: form.endereco.trim() || null,
        enviado_por: profile?.nome || null,
        observacoes: form.observacoes.trim() || null,
        url: path,
      });
      if (error) throw error;
      toast.success('Documento enviado com sucesso!');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      if (path) await removePrivateFile(path);
      toast.error(err?.message?.startsWith('Tipo') || err?.message?.startsWith('Arquivo') ? err.message : friendlyError(err, 'Erro ao enviar documento'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Documento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo * (PDF, imagem ou Word, até 20 MB)</Label>
            <Input id="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Documento</Label>
            <Input id="nome" maxLength={200} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: RG do inquilino" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Documento *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{tipos.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categorias.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço Relacionado</Label>
            <Input id="endereco" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" rows={3} maxLength={2000} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? 'Enviando...' : 'Enviar Documento'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
