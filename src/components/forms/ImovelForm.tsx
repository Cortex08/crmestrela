import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { History, Plus } from 'lucide-react';
import { friendlyError } from '@/lib/utils';
import { ImovelFormFields, ImovelFormData, initialFormData, checkMissingImovelFields, imovelPayload } from './ImovelFormFields';
import { AvisoRascunho } from './AvisoRascunho';
import { apagarRascunho, lerRascunho, useSalvarRascunho, useTemRascunho } from '@/hooks/useRascunhoImovel';

const CHAVE = 'novo';

export const ImovelForm = ({ onSuccess }: { onSuccess?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [formData, setFormData] = useState<ImovelFormData>(initialFormData);
  const [photos, setPhotos] = useState<string[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [recuperadoEm, setRecuperadoEm] = useState<number | null>(null);
  const temRascunho = useTemRascunho(CHAVE);

  // rascunho automático: se a janela fechar sem cadastrar, o que foi preenchido volta ao reabrir
  const alterado = useMemo(
    () => photos.length > 0 || JSON.stringify(formData) !== JSON.stringify(initialFormData),
    [formData, photos],
  );
  const gravarRascunho = useSalvarRascunho(CHAVE, open, alterado, formData, photos);

  const reset = () => {
    setFormData(initialFormData);
    setPhotos([]);
    setMissingFields([]);
    setRecuperadoEm(null);
  };

  const abrir = (o: boolean) => {
    if (o) {
      const r = lerRascunho(CHAVE);
      if (r) {
        setFormData({ ...initialFormData, ...r.formData });
        setPhotos(r.photos || []);
        setRecuperadoEm(r.salvoEm);
      }
      setOpen(true);
    } else {
      gravarRascunho(); // guarda o que estiver preenchido antes de fechar
      setOpen(false);
      reset();
    }
  };

  const descartar = () => { apagarRascunho(CHAVE); reset(); };

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
    apagarRascunho(CHAVE);
    setOpen(false);
    reset();
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button title={temRascunho ? 'Você tem um cadastro de imóvel não terminado' : undefined}>
          {temRascunho ? <History className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {temRascunho ? 'Continuar cadastro' : 'Novo Imóvel'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Imóvel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {recuperadoEm && (
            <AvisoRascunho salvoEm={recuperadoEm} texto="Continuando o cadastro que não foi terminado." onDescartar={descartar} />
          )}
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
            <Button type="button" variant="outline" onClick={() => abrir(false)}>Fechar</Button>
            <Button type="submit" disabled={loading || uploadingPhotos}>{loading ? 'Cadastrando...' : 'Cadastrar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
