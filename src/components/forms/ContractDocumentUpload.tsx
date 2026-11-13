import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, FileText, Eye, Trash2, Plus, FolderOpen } from 'lucide-react';
import { uploadPrivateFile, openStoredFile, removePrivateFile } from '@/lib/storage';
import { friendlyError, formatDateBR } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const tipoLabels: Record<string, string> = {
  contrato: 'Contrato', contrato_assinado: 'Contrato Assinado', rg: 'RG', cpf: 'CPF', cnh: 'CNH', comprovante: 'Comprovante',
  recibo: 'Recibo', boleto: 'Boleto', doc_imovel: 'Doc. Imóvel', foto_vistoria: 'Vistoria',
};

interface Props {
  contratoId: string;
  clienteId?: string | null;
  endereco?: string;
  canEdit: boolean;
  onDocumentChange?: () => void;
}

export const ContractDocumentUpload = ({ contratoId, clienteId, endereco, canEdit, onDocumentChange }: Props) => {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ nome: '', tipo: 'contrato', observacoes: '' });
  const [toDelete, setToDelete] = useState<any>(null);

  const fetchDocuments = useCallback(async () => {
    const { data } = await supabase.from('documents').select('*').eq('contrato_id', contratoId).order('created_at', { ascending: false });
    setDocuments(data || []);
    setLoading(false);
  }, [contratoId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error('Selecione um arquivo');
    setUploading(true);
    let path = '';
    try {
      path = await uploadPrivateFile(file, `contratos/${contratoId}`);
      const { error } = await supabase.from('documents').insert({
        nome: form.nome.trim() || file.name, tipo: form.tipo, categoria: 'contratos', status: 'ativo', pasta: 'contratos',
        contrato_id: contratoId, cliente_id: clienteId || null, endereco: endereco || null,
        observacoes: form.observacoes.trim() || null, enviado_por: profile?.nome || null, url: path,
      });
      if (error) throw error;
      toast.success('Documento vinculado ao contrato!');
      setDialogOpen(false);
      setForm({ nome: '', tipo: 'contrato', observacoes: '' });
      setFile(null);
      fetchDocuments();
      onDocumentChange?.();
    } catch (err: any) {
      if (path) await removePrivateFile(path);
      toast.error(err?.message?.startsWith('Tipo') || err?.message?.startsWith('Arquivo') ? err.message : friendlyError(err, 'Erro ao enviar documento'));
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('documents').delete().eq('id', toDelete.id);
    if (error) toast.error(friendlyError(error, 'Erro ao excluir documento'));
    else {
      await removePrivateFile(toDelete.url);
      toast.success('Documento excluído!');
      fetchDocuments();
      onDocumentChange?.();
    }
    setToDelete(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Documentos do Contrato ({documents.length})
        </CardTitle>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Documento ao Contrato</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Arquivo *</Label>
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Documento</Label>
                  <Input maxLength={200} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Contrato Assinado" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(tipoLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea rows={2} maxLength={2000} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={uploading}><Upload className="h-4 w-4 mr-1" />{uploading ? 'Enviando...' : 'Enviar'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento vinculado</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{doc.nome}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{tipoLabels[doc.tipo] || doc.tipo || 'Documento'}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateBR(doc.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openStoredFile(doc.url)} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => setToDelete(doc)} className="text-destructive hover:text-destructive" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir documento"
        description={`Excluir "${toDelete?.nome}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
      />
    </Card>
  );
};
