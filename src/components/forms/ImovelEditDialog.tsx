import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/utils';
import { ImovelFormFields, ImovelFormData, initialFormData, checkMissingImovelFields, imovelPayload } from './ImovelFormFields';

interface Props {
  property: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** imóvel aguardando dados: permite salvar aos poucos e continuar depois */
  rascunho?: boolean;
}

const str = (v: any) => (v === null || v === undefined ? '' : String(v));

export const ImovelEditDialog = ({ property, open, onOpenChange, onSuccess, rascunho = false }: Props) => {
  const [loading, setLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [formData, setFormData] = useState<ImovelFormData>(initialFormData);
  const [photos, setPhotos] = useState<string[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    if (!property) return;
    setFormData({
      codigo: str(property.codigo), titulo: str(property.titulo), tipo: property.tipo || 'venda', status: property.status || 'disponivel',
      endereco: str(property.endereco), numero: str(property.numero), complemento: str(property.complemento),
      bairro: str(property.bairro), cidade: str(property.cidade), estado: str(property.estado), cep: str(property.cep),
      quartos: str(property.quartos), banheiros: str(property.banheiros), vagas: str(property.vagas),
      aceita_pets: !!property.aceita_pets, mobiliado: !!property.mobiliado,
      area_util: str(property.area_util), area_total: str(property.area_total),
      valor_venda: str(property.valor_venda), valor_aluguel: str(property.valor_aluguel),
      valor_condominio: str(property.valor_condominio), valor_iptu: str(property.valor_iptu), descricao: str(property.descricao),
    });
    setPhotos(property.fotos || []);
    setMissingFields([]);
  }, [property]);

  /** parcial = salva o que já foi preenchido e mantém o imóvel em "Aguardando Dados" */
  const salvar = async (parcial: boolean) => {
    if (!property) return;
    const missing = checkMissingImovelFields(formData);
    // no rascunho só exige o que identifica o imóvel (já vem preenchido da prospecção)
    const essenciais = ['codigo', 'titulo', 'endereco', 'bairro', 'cidade', 'estado'];
    const faltando = parcial ? missing.filter((f) => essenciais.includes(f as string)) : missing;
    if (faltando.length) {
      setMissingFields(faltando);
      toast.error(parcial ? 'Preencha o endereço, bairro, cidade e estado para salvar' : 'Preencha todos os campos obrigatórios');
      return;
    }
    setLoading(true);
    const extra = rascunho && !parcial ? { aguardando_dados: false, dados_pendentes: [] } : {};
    const { error } = await supabase
      .from('properties')
      .update({ ...imovelPayload(formData, photos), status: formData.status || 'disponivel', ...extra })
      .eq('id', property.id);
    setLoading(false);
    if (error) {
      toast.error(friendlyError(error, 'Erro ao atualizar imóvel'));
      return;
    }
    toast.success(rascunho ? (parcial ? 'Dados salvos! Você pode continuar depois.' : 'Imóvel concluído!') : 'Imóvel atualizado com sucesso!');
    onOpenChange(false);
    onSuccess?.();
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); salvar(rascunho ? true : false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rascunho ? 'Completar dados do imóvel' : 'Editar Imóvel'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <ImovelFormFields
            formData={formData}
            setFormData={setFormData}
            photos={photos}
            setPhotos={setPhotos}
            uploadingPhotos={uploadingPhotos}
            setUploadingPhotos={setUploadingPhotos}
            isEditing
            missingFields={missingFields}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{rascunho ? 'Fechar' : 'Cancelar'}</Button>
            {rascunho ? (
              <>
                <Button type="button" variant="secondary" disabled={loading || uploadingPhotos} onClick={() => salvar(true)}>{loading ? 'Salvando...' : 'Salvar e continuar depois'}</Button>
                <Button type="button" disabled={loading || uploadingPhotos} onClick={() => salvar(false)} className="bg-green-600 hover:bg-green-700">Salvar e concluir</Button>
              </>
            ) : (
              <Button type="submit" disabled={loading || uploadingPhotos}>{loading ? 'Salvando...' : 'Salvar Alterações'}</Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
