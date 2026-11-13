import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { friendlyError } from '@/lib/utils';
import { ImovelFormFields, ImovelFormData, initialFormData, checkMissingImovelFields, imovelPayload } from './ImovelFormFields';

export const ImovelForm = ({ onSuccess }: { onSuccess?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [formData, setFormData] = useState<ImovelFormData>(initialFormData);
  const [photos, setPhotos] = useState<string[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const reset = () => {
    setFormData(initialFormData);
    setPhotos([]);
    setMissingFields([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = checkMissingImovelFields(formData);
    if (missing.length > 0) {
      setMissingFields(missing);
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('properties').insert({ ...imovelPayload(formData, photos), status: 'disponivel' });
    setLoading(false);
    if (error) {
      toast.error(friendlyError(error, 'Erro ao cadastrar imóvel'));
      return;
    }
    toast.success('Imóvel cadastrado com sucesso!');
    setOpen(false);
    reset();
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Imóvel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Imóvel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {missingFields.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive font-medium">Complete os campos destacados em vermelho para finalizar o cadastro</p>
            </div>
          )}
          <ImovelFormFields
            formData={formData}
            setFormData={(next) => {
              setFormData((prev) => {
                const updated = typeof next === 'function' ? next(prev) : next;
                if (missingFields.length) setMissingFields(checkMissingImovelFields(updated));
                return updated;
              });
            }}
            photos={photos}
            setPhotos={setPhotos}
            uploadingPhotos={uploadingPhotos}
            setUploadingPhotos={setUploadingPhotos}
            missingFields={missingFields}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading || uploadingPhotos}>{loading ? 'Cadastrando...' : 'Cadastrar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
