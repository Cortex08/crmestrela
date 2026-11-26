import React, { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FotosOrdenaveis } from './FotosOrdenaveis';
import { toast } from 'sonner';
import { cn, toInt, toNumber } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { uploadPropertyPhoto, FotoPequenaError } from '@/lib/storage';

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

/** Dois ou mais botões lado a lado, um selecionado (mais rápido que abrir uma lista) */
const Escolha = ({ valor, onChange, opcoes, ...rest }: { valor: string; onChange: (v: string) => void; opcoes: { v: string; t: string }[]; 'aria-labelledby'?: string }) => (
  <div role="radiogroup" {...rest} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border bg-muted/40 p-1">
    {opcoes.map((o) => (
      <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} onClick={() => onChange(o.v)}
        className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          valor === o.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
        {o.t}
      </button>
    ))}
  </div>
);

export interface ImovelFormData {
  codigo: string; titulo: string; tipo: 'venda' | 'locacao'; uso: 'residencial' | 'comercial';
  endereco: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string; cep: string;
  quartos: string; banheiros: string; vagas: string; aceita_pets: boolean; mobiliado: boolean;
  area_util: string; area_total: string; valor_venda: string; valor_aluguel: string; valor_condominio: string; valor_iptu: string;
  descricao: string; status?: string;
}

// A imobiliária trabalha em São Paulo/SP — por isso cidade e UF não aparecem no formulário;
// eles continuam preenchidos sozinhos.
export const CIDADE_PADRAO = 'São Paulo';
export const ESTADO_PADRAO = 'SP';

export const initialFormData: ImovelFormData = {
  codigo: '', titulo: '', tipo: 'locacao', uso: 'residencial', endereco: '', numero: '', complemento: '', bairro: '', cidade: CIDADE_PADRAO, estado: ESTADO_PADRAO, cep: '',
  quartos: '', banheiros: '', vagas: '', aceita_pets: false, mobiliado: false, area_util: '', area_total: '',
  valor_venda: '', valor_aluguel: '', valor_condominio: '', valor_iptu: '', descricao: '',
};

export const requiredImovelFields: (keyof ImovelFormData)[] = ['codigo', 'titulo', 'endereco', 'bairro'];

export const checkMissingImovelFields = (d: ImovelFormData) =>
  requiredImovelFields.filter((f) => !String(d[f] ?? '').trim());

/** Converte o formulário para o formato do banco, com validação */
export const imovelPayload = (d: ImovelFormData, photos: string[]) => ({
  codigo: d.codigo.trim(),
  titulo: d.titulo.trim(),
  tipo: d.tipo,
  uso: d.uso === 'comercial' ? 'comercial' : 'residencial',
  endereco: d.endereco.trim(),
  numero: d.numero.trim() || null,
  complemento: d.complemento.trim() || null,
  bairro: d.bairro.trim(),
  cidade: d.cidade.trim() || CIDADE_PADRAO,
  estado: (d.estado.trim() || ESTADO_PADRAO).toUpperCase().slice(0, 2),
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
  /** id do imóvel sendo editado (para o aviso de duplicado não acusar ele mesmo) */
  imovelId?: string | null;
}

export const ImovelFormFields = ({
  formData, setFormData, photos, setPhotos, uploadingPhotos, setUploadingPhotos, isEditing = false, missingFields = [], imovelId = null,
}: Props) => {
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);

  // Aviso de imóvel possivelmente duplicado: compara a legenda, o endereço + número e o valor
  // com os imóveis já cadastrados (função imoveis_parecidos no banco).
  const legenda = useDebounce(formData.descricao, 700);
  const endDeb = useDebounce(`${formData.endereco}|${formData.numero}`, 700);
  const valorAtual = formData.tipo === 'venda' ? formData.valor_venda : formData.valor_aluguel;
  const valorDeb = useDebounce(valorAtual, 700);
  const [parecidos, setParecidos] = useState<{ id: string; codigo: string; titulo: string; status: string; motivo: string; semelhanca: number }[]>([]);
  useEffect(() => {
    const [end, num] = endDeb.split('|');
    if (legenda.trim().length < 40 && !(end.trim() && num.trim())) { setParecidos([]); return; }
    let vivo = true;
    supabase.rpc('imoveis_parecidos' as any, {
      _descricao: legenda || null, _endereco: end || null, _numero: num || null,
      _valor: toNumber(valorDeb), _ignorar: imovelId,
    }).then(({ data, error }) => { if (vivo) setParecidos(error ? [] : ((data as any[]) || [])); });
    return () => { vivo = false; };
  }, [legenda, endDeb, valorDeb, imovelId]);
  const [searchingCep, setSearchingCep] = useState(false);
  const [cepFound, setCepFound] = useState(false);
  const debouncedCep = useDebounce(formData.cep, 500);

  const set = <K extends keyof ImovelFormData>(k: K, v: ImovelFormData[K]) => setFormData((prev) => ({ ...prev, [k]: v }));

  // Cidade e UF não aparecem mais no formulário (por enquanto só trabalhamos em São Paulo/SP),
  // mas um imóvel importado antigo pode ter vindo sem esses dados — preenche sozinho se faltar.
  useEffect(() => {
    if (!formData.cidade.trim() || !formData.estado.trim()) {
      setFormData((prev) => ({ ...prev, cidade: prev.cidade.trim() || CIDADE_PADRAO, estado: prev.estado.trim() || ESTADO_PADRAO }));
    }
  }, [formData.cidade, formData.estado, setFormData]);

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
    await receberArquivos(files);
  };

  const receberArquivos = async (files: File[]) => {
    if (files.length === 0) return;
    if (photos.length + files.length > 40) {
      toast.error('Máximo de 40 fotos por imóvel');
      return;
    }
    await enviarFotos(files, false);
  };

  const [baixas, setBaixas] = useState<FotoPequenaError[]>([]);
  // aceitarBaixa: a pessoa já foi avisada e escolheu "Enviar mesmo assim"
  const enviarFotos = async (files: File[], aceitarBaixa: boolean) => {
    setUploadingPhotos(true);
    const urls: string[] = [];
    const pequenas: FotoPequenaError[] = [];
    try {
      for (const file of files) {
        try {
          urls.push(await uploadPropertyPhoto(file, { aceitarBaixa }));
        } catch (err) {
          // foto pequena não trava as outras: avisamos no final e deixamos a pessoa decidir
          if (err instanceof FotoPequenaError) pequenas.push(err); else throw err;
        }
      }
      // fotos pequenas ficam esperando a decisão da pessoa, num aviso dentro do próprio formulário
      if (pequenas.length) setBaixas((prev) => [...prev, ...pequenas]);
      if (urls.length) toast.success(urls.length === 1 ? 'Foto enviada' : `${urls.length} fotos enviadas`);
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
      <div className="space-y-2">
        <Label htmlFor="codigo" className={labelCls('codigo')}>Código * {req('codigo')}</Label>
        <Input id="codigo" maxLength={50} value={formData.codigo} onChange={(e) => set('codigo', e.target.value)} className={inputCls('codigo')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label id="lbl-tipo">Aluguel ou venda</Label>
          <Escolha aria-labelledby="lbl-tipo" valor={formData.tipo} onChange={(v) => set('tipo', v as ImovelFormData['tipo'])}
            opcoes={[{ v: 'locacao', t: 'Aluguel' }, { v: 'venda', t: 'Venda' }]} />
        </div>
        <div className="space-y-2">
          <Label id="lbl-uso">Uso</Label>
          <Escolha aria-labelledby="lbl-uso" valor={formData.uso} onChange={(v) => set('uso', v as ImovelFormData['uso'])}
            opcoes={[{ v: 'residencial', t: 'Residencial' }, { v: 'comercial', t: 'Comercial' }]} />
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

      {formData.tipo === 'venda' ? (
        <div className="space-y-2">
          <Label htmlFor="valor_venda">Valor de venda (R$)</Label>
          <Input id="valor_venda" type="number" step="0.01" min="0" value={formData.valor_venda} onChange={(e) => set('valor_venda', e.target.value)} />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="valor_aluguel">Valor do aluguel (R$ por mês)</Label>
          <Input id="valor_aluguel" type="number" step="0.01" min="0" value={formData.valor_aluguel} onChange={(e) => set('valor_aluguel', e.target.value)} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" rows={3} maxLength={5000} value={formData.descricao} onChange={(e) => set('descricao', e.target.value)} />
      </div>

      {parecidos.length > 0 && (
        <div role="status" className={cn('rounded-lg border p-3 text-sm',
          parecidos.some((x) => x.motivo !== 'endereco')
            ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
            : 'bg-muted/40')}>
          <p className="flex items-center gap-2 font-semibold">
            <Copy className="h-4 w-4 shrink-0" />
            {parecidos.some((x) => x.motivo !== 'endereco') ? 'Esse imóvel pode já estar cadastrado' : 'Já tem imóvel cadastrado nesse endereço'}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {parecidos.map((x) => (
              <li key={x.id}>
                <b>{x.codigo}</b> · {x.titulo}
                <span className="opacity-80"> — {x.motivo === 'legenda' ? `legenda ${x.semelhanca}% igual` : x.motivo === 'endereco_valor' ? 'mesmo endereço e mesmo valor' : 'mesmo endereço, valor diferente (pode ser outra unidade)'}</span>
                {x.status && x.status !== 'disponivel' ? <span className="opacity-80"> · {x.status}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Label>Fotos do Imóvel</Label>
        <label
          htmlFor="photo-upload" className="block cursor-pointer"
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastandoArquivo(true); } }}
          onDragLeave={() => setArrastandoArquivo(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files?.length) return;
            e.preventDefault(); setArrastandoArquivo(false);
            if (uploadingPhotos) return;
            const arquivos = Array.from(e.dataTransfer.files).filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type));
            if (arquivos.length === 0) { toast.error('Solte fotos PNG, JPG ou WEBP'); return; }
            void receberArquivos(arquivos);
          }}
        >
          <div className={cn('border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors',
            arrastandoArquivo && 'border-primary bg-primary/5')}>
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {uploadingPhotos ? 'Enviando fotos...' : arrastandoArquivo ? 'Solte as fotos aqui' : 'Clique ou arraste as fotos para cá (PNG, JPG, WEBP)'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">As fotos entram na ordem em que você escolher. Depois é só arrastar para mudar.</p>
          </div>
          <input id="photo-upload" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhotos} />
        </label>

        {baixas.length > 0 && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {baixas.length === 1 ? 'Essa foto está em baixa qualidade e vai ficar borrada no site' : `${baixas.length} fotos estão em baixa qualidade e vão ficar borradas no site`}
            </p>
            <p className="mt-1 break-words text-xs opacity-80">{baixas.slice(0, 4).map((b) => b.message).join(', ')}{baixas.length > 4 ? '…' : ''}</p>
            <p className="mt-2 text-xs">
              Se a foto é do Facebook, abra ela em tela cheia e use <b>⋯ &gt; Baixar</b> (no celular: <b>⋯ &gt; Salvar foto</b>) para pegar a versão grande. Print de tela e foto salva do WhatsApp ficam pequenos.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={uploadingPhotos}
                onClick={() => { const arquivos = baixas.map((b) => b.arquivo); setBaixas([]); void enviarFotos(arquivos, true); }}>
                Enviar mesmo assim
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setBaixas([])}>Não enviar</Button>
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <>
            <FotosOrdenaveis fotos={photos} onChange={setPhotos} />
            <p className="text-xs text-muted-foreground">
              Arraste as fotos para mudar a ordem (no celular, segure a foto um instante e arraste). A primeira é a capa no site.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
