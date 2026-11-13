import React, { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Upload, X, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, toInt, toNumber } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { uploadPropertyPhoto } from '@/lib/storage';

const fetchCepData = async (cep: string) => {
  const limpo = cep.replace(/\D/g, '');
  if (limpo.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.erro ? null : data;
  } catch {
    return null;
  }
};

const searchCepByAddress = async (endereco: string, cidade: string, estado: string) => {
  const rua = endereco.replace(/^(rua|avenida|av\.|r\.|travessa|trav\.|alameda|al\.)\s*/i, '').replace(/,.*$/, '').trim();
  if (rua.length < 3 || !cidade.trim() || estado.trim().length !== 2) return null;
  try {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(estado.trim().toUpperCase())}/${encodeURIComponent(cidade.trim())}/${encodeURIComponent(rua)}/json/`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
};

export interface ImovelFormData {
  codigo: string; titulo: string; tipo: 'venda' | 'locacao';
  endereco: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string; cep: string;
  quartos: string; banheiros: string; vagas: string; aceita_pets: boolean; mobiliado: boolean;
  area_util: string; area_total: string; valor_venda: string; valor_aluguel: string; valor_condominio: string; valor_iptu: string;
  descricao: string; status?: string;
}

export const initialFormData: ImovelFormData = {
  codigo: '', titulo: '', tipo: 'venda', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '',
  quartos: '', banheiros: '', vagas: '', aceita_pets: false, mobiliado: false, area_util: '', area_total: '',
  valor_venda: '', valor_aluguel: '', valor_condominio: '', valor_iptu: '', descricao: '',
};

export const requiredImovelFields: (keyof ImovelFormData)[] = ['codigo', 'titulo', 'endereco', 'bairro', 'cidade', 'estado'];

export const checkMissingImovelFields = (d: ImovelFormData) =>
  requiredImovelFields.filter((f) => !String(d[f] ?? '').trim());

/** Converte o formulário para o formato do banco, com validação */
export const imovelPayload = (d: ImovelFormData, photos: string[]) => ({
  codigo: d.codigo.trim(),
  titulo: d.titulo.trim(),
  tipo: d.tipo,
  endereco: d.endereco.trim(),
  numero: d.numero.trim() || null,
  complemento: d.complemento.trim() || null,
  bairro: d.bairro.trim(),
  cidade: d.cidade.trim(),
  estado: d.estado.trim().toUpperCase().slice(0, 2),
  cep: d.cep.trim() || null,
  quartos: toInt(d.quartos),
  banheiros: toInt(d.banheiros),
  vagas: toInt(d.vagas),
  aceita_pets: d.aceita_pets,
  mobiliado: d.mobiliado,
  area_util: toNumber(d.area_util),
  area_total: toNumber(d.area_total),
  valor_venda: toNumber(d.valor_venda),
  valor_aluguel: toNumber(d.valor_aluguel),
  valor_condominio: toNumber(d.valor_condominio),
  valor_iptu: toNumber(d.valor_iptu),
  descricao: d.descricao.trim() || null,
  fotos: photos,
});

interface Props {
  formData: ImovelFormData;
  setFormData: React.Dispatch<React.SetStateAction<ImovelFormData>>;
  photos: string[];
  setPhotos: React.Dispatch<React.SetStateAction<string[]>>;
  uploadingPhotos: boolean;
  setUploadingPhotos: React.Dispatch<React.SetStateAction<boolean>>;
  isEditing?: boolean;
  missingFields?: string[];
}

export const ImovelFormFields = ({
  formData, setFormData, photos, setPhotos, uploadingPhotos, setUploadingPhotos, isEditing = false, missingFields = [],
}: Props) => {
  const [searchingCep, setSearchingCep] = useState(false);
  const [cepFound, setCepFound] = useState(false);
  const debouncedCep = useDebounce(formData.cep, 500);

  const set = <K extends keyof ImovelFormData>(k: K, v: ImovelFormData[K]) => setFormData((prev) => ({ ...prev, [k]: v }));

  const handleCepSearch = useCallback(async (cep: string) => {
    if (cep.replace(/\D/g, '').length !== 8) {
      setCepFound(false);
      return;
    }
    setSearchingCep(true);
    const data = await fetchCepData(cep);
    if (data) {
      setFormData((prev) => ({
        ...prev,
        endereco: data.logradouro || prev.endereco,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado,
      }));
      setCepFound(true);
    }
    setSearchingCep(false);
  }, [setFormData]);

  useEffect(() => {
    if (debouncedCep) handleCepSearch(debouncedCep);
  }, [debouncedCep, handleCepSearch]);

  const handleSearchCepByAddress = async () => {
    setSearchingCep(true);
    const data = await searchCepByAddress(formData.endereco, formData.cidade, formData.estado);
    if (data?.cep) {
      setFormData((prev) => ({ ...prev, cep: data.cep, endereco: data.logradouro || prev.endereco, bairro: data.bairro || prev.bairro }));
      setCepFound(true);
      toast.success('CEP encontrado e preenchido!');
    } else {
      toast.error('CEP não encontrado para este endereço');
    }
    setSearchingCep(false);
  };

  const canSearchByAddress = !!(formData.endereco && formData.cidade && formData.estado && !formData.cep);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (photos.length + files.length > 40) {
      toast.error('Máximo de 40 fotos por imóvel');
      return;
    }
    setUploadingPhotos(true);
    const urls: string[] = [];
    try {
      for (const file of files) urls.push(await uploadPropertyPhoto(file));
      toast.success('Fotos enviadas com sucesso!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao fazer upload das fotos');
    } finally {
      if (urls.length) setPhotos((prev) => [...prev, ...urls]);
      setUploadingPhotos(false);
    }
  };

  const isMissing = (f: string) => missingFields.includes(f);
  const inputCls = (f: string) => cn(isMissing(f) && 'border-destructive ring-destructive/20 ring-2 bg-destructive/5');
  const labelCls = (f: string) => cn(isMissing(f) && 'text-destructive');
  const req = (f: string) => isMissing(f) && <span className="text-xs">(obrigatório)</span>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="codigo" className={labelCls('codigo')}>Código * {req('codigo')}</Label>
          <Input id="codigo" maxLength={50} value={formData.codigo} onChange={(e) => set('codigo', e.target.value)} className={inputCls('codigo')} />
        </div>
        <div className="space-y-2">
          <Label>Tipo *</Label>
          <Select value={formData.tipo} onValueChange={(v: 'venda' | 'locacao') => set('tipo', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="locacao">Locação</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isEditing && (
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formData.status || 'disponivel'} onValueChange={(v) => set('status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="disponivel">Disponível</SelectItem>
              <SelectItem value="reservado">Reservado</SelectItem>
              <SelectItem value="alugado">Alugado</SelectItem>
              <SelectItem value="vendido">Vendido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="titulo" className={labelCls('titulo')}>Título * {req('titulo')}</Label>
        <Input id="titulo" maxLength={300} value={formData.titulo} onChange={(e) => set('titulo', e.target.value)} className={inputCls('titulo')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cep" className="flex items-center gap-2">
          CEP
          {searchingCep && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Buscando...</span>
          )}
          {cepFound && !searchingCep && (
            <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />CEP encontrado</span>
          )}
        </Label>
        <div className="flex gap-2">
          <Input
            id="cep"
            placeholder="00000-000"
            maxLength={9}
            inputMode="numeric"
            value={formData.cep}
            onChange={(e) => {
              let v = e.target.value.replace(/\D/g, '');
              if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5, 8)}`;
              set('cep', v);
              setCepFound(false);
            }}
            className="flex-1"
          />
          {canSearchByAddress && (
            <Button type="button" variant="outline" size="sm" onClick={handleSearchCepByAddress} disabled={searchingCep} className="whitespace-nowrap h-10">
              {searchingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar CEP'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {canSearchByAddress ? 'Clique em "Buscar CEP" para encontrar o CEP pelo endereço' : 'Digite o CEP para preencher o endereço automaticamente'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="endereco" className={labelCls('endereco')}>Endereço * {req('endereco')}</Label>
          <Input id="endereco" value={formData.endereco} onChange={(e) => set('endereco', e.target.value)} className={inputCls('endereco')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numero">Número</Label>
          <Input id="numero" value={formData.numero} onChange={(e) => set('numero', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="complemento">Complemento</Label>
          <Input id="complemento" value={formData.complemento} onChange={(e) => set('complemento', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bairro" className={labelCls('bairro')}>Bairro * {req('bairro')}</Label>
          <Input id="bairro" value={formData.bairro} onChange={(e) => set('bairro', e.target.value)} className={inputCls('bairro')} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="cidade" className={labelCls('cidade')}>Cidade * {req('cidade')}</Label>
          <Input id="cidade" value={formData.cidade} onChange={(e) => set('cidade', e.target.value)} className={inputCls('cidade')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="estado" className={labelCls('estado')}>UF * {req('estado')}</Label>
          <Input id="estado" maxLength={2} value={formData.estado} onChange={(e) => set('estado', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} className={inputCls('estado')} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(['quartos', 'banheiros', 'vagas'] as const).map((f) => (
          <div key={f} className="space-y-2">
            <Label htmlFor={f} className="capitalize">{f}</Label>
            <Input id={f} type="number" min="0" max="99" value={formData[f]} onChange={(e) => set(f, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center space-x-2">
          <Switch id="aceita_pets" checked={formData.aceita_pets} onCheckedChange={(c) => set('aceita_pets', c)} />
          <Label htmlFor="aceita_pets">Aceita Pets</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch id="mobiliado" checked={formData.mobiliado} onCheckedChange={(c) => set('mobiliado', c)} />
          <Label htmlFor="mobiliado">Mobiliado</Label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="area_util">Área Útil (m²)</Label>
          <Input id="area_util" type="number" step="0.01" min="0" value={formData.area_util} onChange={(e) => set('area_util', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="area_total">Área Total (m²)</Label>
          <Input id="area_total" type="number" step="0.01" min="0" value={formData.area_total} onChange={(e) => set('area_total', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="valor_venda">Valor Venda (R$)</Label>
          <Input id="valor_venda" type="number" step="0.01" min="0" value={formData.valor_venda} onChange={(e) => set('valor_venda', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="valor_aluguel">Valor Aluguel (R$)</Label>
          <Input id="valor_aluguel" type="number" step="0.01" min="0" value={formData.valor_aluguel} onChange={(e) => set('valor_aluguel', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="valor_condominio">Condomínio (R$)</Label>
          <Input id="valor_condominio" type="number" step="0.01" min="0" value={formData.valor_condominio} onChange={(e) => set('valor_condominio', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="valor_iptu">IPTU (R$)</Label>
          <Input id="valor_iptu" type="number" step="0.01" min="0" value={formData.valor_iptu} onChange={(e) => set('valor_iptu', e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" rows={3} maxLength={5000} value={formData.descricao} onChange={(e) => set('descricao', e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Fotos do Imóvel</Label>
        <label htmlFor="photo-upload" className="block cursor-pointer">
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{uploadingPhotos ? 'Enviando fotos...' : 'Clique para adicionar fotos (PNG, JPG, WEBP)'}</p>
            <p className="text-xs text-muted-foreground mt-1">Mínimo 10 fotos recomendado</p>
          </div>
          <input id="photo-upload" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhotos} />
        </label>

        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
            {photos.map((photo, i) => (
              <div key={`${photo}-${i}`} className="relative group">
                <img src={photo} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-24 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remover foto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
