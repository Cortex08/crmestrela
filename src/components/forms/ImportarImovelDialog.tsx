import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Link2, Loader2, Sparkles, Star, Check, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { cn, formatCurrency, friendlyError } from '@/lib/utils';
import {
  ImovelFormFields, ImovelFormData, initialFormData, checkMissingImovelFields, imovelPayload,
} from './ImovelFormFields';

interface FotoImportada { url: string; path?: string; origem?: string }
interface Duplicado {
  id: string; codigo: string; titulo: string; endereco: string; numero?: string | null; bairro: string; cidade: string;
  quartos?: number | null; area_util?: number | null; valor_venda?: number | null; valor_aluguel?: number | null;
  fotos?: string[] | null; motivos: string[];
}
interface Resposta {
  ok: boolean; erro?: string; codigo?: string; url?: string; portal?: { id: string; nome: string }; usouIA?: boolean;
  dados?: any; fotos?: FotoImportada[]; aviso?: string[]; faltando?: string[]; duplicados?: Duplicado[];
}

const ROTULO: Record<string, string> = {
  titulo: 'título', valor_venda: 'preço de venda', valor_aluguel: 'valor do aluguel', endereco: 'rua', bairro: 'bairro',
  cidade: 'cidade', quartos: 'quartos', area_util: 'área',
};

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const codigoNovo = () => `IMP-${Math.floor(10000 + Math.random() * 90000)}`;

function paraFormulario(d: any): ImovelFormData {
  return {
    ...initialFormData,
    codigo: codigoNovo(),
    titulo: s(d.titulo).slice(0, 300),
    tipo: d.tipo === 'locacao' ? 'locacao' : 'venda',
    endereco: s(d.endereco), numero: s(d.numero), bairro: s(d.bairro), cidade: s(d.cidade), estado: s(d.estado).slice(0, 2), cep: s(d.cep),
    quartos: s(d.quartos), banheiros: s(d.banheiros), vagas: s(d.vagas),
    aceita_pets: d.aceita_pets === true, mobiliado: d.mobiliado === true,
    area_util: s(d.area_util), area_total: s(d.area_total),
    valor_venda: s(d.valor_venda), valor_aluguel: s(d.valor_aluguel), valor_condominio: s(d.valor_condominio), valor_iptu: s(d.valor_iptu),
    descricao: s(d.descricao).slice(0, 5000),
  };
}

/** Informações importadas que não têm campo próprio no cadastro vão para as observações (nada é descartado) */
function montarObservacoes(d: any, url: string, portal: string): string {
  const linhas: string[] = [];
  if (d.tipo_imovel) linhas.push(`Tipo: ${d.tipo_imovel}`);
  if (d.suites) linhas.push(`Suítes: ${d.suites}`);
  if (d.andares) linhas.push(`Andar: ${d.andares}`);
  if (d.condominio) linhas.push(`Condomínio/empreendimento: ${d.condominio}`);
  if (Array.isArray(d.caracteristicas) && d.caracteristicas.length) linhas.push(`Características: ${d.caracteristicas.join(', ')}`);
  linhas.push(`Importado de ${portal}: ${url}`);
  return linhas.join('\n');
}

const preco = (r: { valor_venda?: number | null; valor_aluguel?: number | null }) =>
  r.valor_venda ? formatCurrency(r.valor_venda) : r.valor_aluguel ? `${formatCurrency(r.valor_aluguel)}/mês` : '—';

export const ImportarImovelDialog = ({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (o: boolean) => void; onSuccess?: () => void }) => {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [fase, setFase] = useState<'link' | 'buscando' | 'revisao'>('link');
  const [erro, setErro] = useState<string | null>(null);
  const [resp, setResp] = useState<Resposta | null>(null);
  const [form, setForm] = useState<ImovelFormData>(initialFormData);
  const [todas, setTodas] = useState<FotoImportada[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [principal, setPrincipal] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [faltam, setFaltam] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [ciente, setCiente] = useState(false);
  const [comparar, setComparar] = useState<string | null>(null);
  const salvo = useRef(false);

  const fotosFinais = useMemo(() => {
    const marcadas = todas.map((f) => f.url).filter((u) => sel.has(u));
    const ordem = principal && marcadas.includes(principal) ? [principal, ...marcadas.filter((u) => u !== principal)] : marcadas;
    return [...ordem, ...extras];
  }, [todas, sel, principal, extras]);

  const limparFotosNaoUsadas = async (manter: string[]) => {
    const paths = todas.filter((f) => f.path && !manter.includes(f.url)).map((f) => f.path as string);
    if (paths.length) await supabase.functions.invoke('import-imovel', { body: { action: 'discard', paths } }).catch(() => undefined);
  };

  const reiniciar = () => {
    setUrl(''); setFase('link'); setErro(null); setResp(null); setForm(initialFormData); setTodas([]); setExtras([]);
    setSel(new Set()); setPrincipal(''); setFaltam([]); setDuplicados([]); setCiente(false); setComparar(null); salvo.current = false;
  };

  const fechar = async (o: boolean) => {
    if (o) { onOpenChange(true); return; }
    if (salvando || fase === 'buscando') return;
    // fotos baixadas que não foram salvas no cadastro são apagadas do armazenamento
    if (!salvo.current) await limparFotosNaoUsadas([]);
    onOpenChange(false);
    reiniciar();
  };

  const buscar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const link = url.trim();
    if (!link) { setErro('Cole o link do anúncio.'); return; }
    setErro(null); setFase('buscando');
    try {
      const { data, error } = await supabase.functions.invoke('import-imovel', { body: { action: 'extract', url: link } });
      let r = data as Resposta | null;
      if (error && !r) {
        // erros HTTP (401/403/500) trazem a mensagem no corpo da resposta
        try { r = await (error as any).context?.json?.(); } catch { /* ignora */ }
        if (!r) throw error;
      }
      if (!r?.ok) { setErro(r?.erro || 'Não foi possível importar este anúncio.'); setFase('link'); return; }
      const fotos = r.fotos || [];
      setResp(r); setTodas(fotos); setExtras([]);
      setSel(new Set(fotos.map((f) => f.url))); setPrincipal(fotos[0]?.url || '');
      setForm(paraFormulario(r.dados)); setDuplicados(r.duplicados || []); setCiente(false); setFaltam([]);
      setFase('revisao');
    } catch (err: any) {
      setErro(friendlyError(err, 'Não foi possível conectar ao importador. Tente novamente.'));
      setFase('link');
    }
  };

  const alternar = (u: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(u)) { n.delete(u); if (principal === u) setPrincipal([...n][0] || ''); }
      else { n.add(u); if (!principal) setPrincipal(u); }
      return n;
    });
  };

  // o formulário também remove/adiciona fotos: mantemos tudo sincronizado
  const setFotosDoForm: React.Dispatch<React.SetStateAction<string[]>> = (next) => {
    const novas = typeof next === 'function' ? next(fotosFinais) : next;
    const importadas = new Set(todas.map((f) => f.url));
    setSel(new Set(novas.filter((u) => importadas.has(u))));
    setExtras(novas.filter((u) => !importadas.has(u)));
    if (principal && !novas.includes(principal)) setPrincipal(novas.find((u) => importadas.has(u)) || '');
  };

  const salvar = async () => {
    const faltando = checkMissingImovelFields(form);
    if (faltando.length) { setFaltam(faltando); toast.error('Complete os campos destacados em vermelho'); return; }
    if (!resp?.dados) return;
    setSalvando(true);
    try {
      // confere duplicidade de novo com os dados já corrigidos pelo funcionário
      const chk = await supabase.functions.invoke('import-imovel', {
        body: {
          action: 'duplicates', url: resp.url, titulo: form.titulo, cep: form.cep, numero: form.numero, endereco: form.endereco, bairro: form.bairro,
          quartos: form.quartos ? Number(form.quartos) : null,
          valor_venda: form.valor_venda ? Number(String(form.valor_venda).replace(',', '.')) : null,
          valor_aluguel: form.valor_aluguel ? Number(String(form.valor_aluguel).replace(',', '.')) : null,
        },
      });
      const atuais: Duplicado[] = (chk.data as any)?.duplicados || [];
      const novosIds = atuais.map((x) => x.id).sort().join();
      const antigosIds = duplicados.map((x) => x.id).sort().join();
      if (atuais.length && (!ciente || novosIds !== antigosIds)) {
        setDuplicados(atuais); setCiente(false); setSalvando(false);
        toast.warning('Encontramos imóveis parecidos. Confira antes de salvar.');
        return;
      }
      const base = imovelPayload(form, fotosFinais);
      const { error } = await supabase.from('properties').insert({
        ...base,
        status: 'disponivel',
        observacoes: montarObservacoes(resp.dados, resp.url || url, resp.portal?.nome || 'link'),
        origem_url: resp.url || url.trim(),
        origem_marketplace: resp.portal?.nome || null,
        importado_em: new Date().toISOString(),
        importado_por: user?.id ?? null,
        dados_importados: { ...resp.dados, fotos_origem: todas.map((f) => f.origem).filter(Boolean), ia: !!resp.usouIA },
        status_importacao: 'importado',
      } as any);
      if (error) { toast.error(friendlyError(error, 'Erro ao salvar o imóvel')); setSalvando(false); return; }
      salvo.current = true;
      await limparFotosNaoUsadas(fotosFinais);
      toast.success('Imóvel importado e salvo com sucesso!');
      onSuccess?.();
      onOpenChange(false);
      reiniciar();
    } catch (err: any) {
      toast.error(friendlyError(err, 'Erro ao salvar o imóvel'));
    }
    setSalvando(false);
  };

  const dadosEdit = form;
  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" />Importar imóvel</DialogTitle>
          <DialogDescription>
            {fase === 'revisao' ? 'Revise e corrija o que for preciso. Nada foi salvo ainda.' : 'Cole o link do anúncio e o sistema traz as informações e as fotos.'}
          </DialogDescription>
        </DialogHeader>

        {fase !== 'revisao' && (
          <form onSubmit={buscar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="imp-url">Link do anúncio</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="imp-url" inputMode="url" autoFocus autoComplete="off" className="pl-9" placeholder="https://..."
                    value={url} onChange={(e) => { setUrl(e.target.value); setErro(null); }} disabled={fase === 'buscando'}
                  />
                </div>
                <Button type="submit" disabled={fase === 'buscando' || !url.trim()} className="sm:w-48">
                  {fase === 'buscando' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Buscando…</> : 'Buscar informações'}
                </Button>
              </div>
            </div>

            {fase === 'buscando' && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm" role="status" aria-live="polite">
                <div className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin text-primary" />Lendo o anúncio e baixando as fotos…</div>
                <p className="text-muted-foreground mt-1">Isso leva de 10 a 40 segundos, dependendo da quantidade de fotos. Não feche esta janela.</p>
              </div>
            )}

            {erro && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm flex gap-2" role="alert">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-destructive font-medium">{erro}</p>
                  <p className="text-muted-foreground mt-1">Se o site não permite a leitura automática, use <strong>Novo Imóvel</strong> para cadastrar manualmente.</p>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Funciona melhor com sites de imobiliárias e anúncios abertos ao público. Portais como OLX, Viva Real, ZAP, Imovelweb e QuintoAndar costumam bloquear leitura automática — quando isso acontece, o sistema avisa e nada é contornado.
            </p>
          </form>
        )}

        {fase === 'revisao' && resp && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 p-3 text-sm flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium">Informações encontradas em {resp.portal?.nome}</p>
                <p className="text-muted-foreground break-all text-xs">{resp.url}</p>
                {resp.usouIA && <p className="text-xs mt-1 flex items-center gap-1"><Sparkles className="h-3 w-3" />Dados organizados por IA, sem inventar informações.</p>}
              </div>
            </div>

            {(resp.aviso?.length || resp.faltando?.length) ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                {resp.aviso?.map((a) => <p key={a}>{a}</p>)}
                {!!resp.faltando?.length && <p>Não encontrado no anúncio (preencha se souber): {resp.faltando.map((f) => ROTULO[f] || f).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.</p>}
              </div>
            ) : null}

            {duplicados.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3" role="alert">
                <p className="font-medium text-sm flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />Possível imóvel duplicado — nada será apagado ou substituído
                </p>
                {duplicados.map((dp) => (
                  <div key={dp.id} className="rounded-md border bg-background p-2 text-sm">
                    <div className="flex gap-3">
                      {dp.fotos?.[0] ? <img src={dp.fotos[0]} alt="" className="w-20 h-16 object-cover rounded" /> : <div className="w-20 h-16 rounded bg-muted" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{dp.codigo} · {dp.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">{dp.endereco}{dp.numero ? `, ${dp.numero}` : ''} · {dp.bairro} · {preco(dp)}</p>
                        <div className="flex flex-wrap gap-1 mt-1">{dp.motivos.map((m) => <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>)}</div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setComparar(comparar === dp.id ? null : dp.id)}>
                        Comparar {comparar === dp.id ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                      </Button>
                    </div>
                    {comparar === dp.id && (
                      <table className="w-full text-xs mt-2 border-t">
                        <thead><tr className="text-left text-muted-foreground"><th className="py-1 w-1/4"></th><th>Importado agora</th><th>Já cadastrado</th></tr></thead>
                        <tbody>
                          {([
                            ['Título', dadosEdit.titulo, dp.titulo],
                            ['Endereço', [dadosEdit.endereco, dadosEdit.numero].filter(Boolean).join(', '), [dp.endereco, dp.numero].filter(Boolean).join(', ')],
                            ['Bairro/Cidade', [dadosEdit.bairro, dadosEdit.cidade].filter(Boolean).join(' / '), [dp.bairro, dp.cidade].filter(Boolean).join(' / ')],
                            ['Preço', preco({ valor_venda: Number(dadosEdit.valor_venda) || null, valor_aluguel: Number(dadosEdit.valor_aluguel) || null }), preco(dp)],
                            ['Quartos', dadosEdit.quartos, s(dp.quartos)],
                            ['Área útil (m²)', dadosEdit.area_util, s(dp.area_util)],
                          ] as [string, string, string][]).map(([k, a, b]) => (
                            <tr key={k} className="border-t">
                              <td className="py-1 text-muted-foreground">{k}</td>
                              <td className={cn('pr-2', a && b && a.trim().toLowerCase() === b.trim().toLowerCase() && 'font-medium text-destructive')}>{a || '—'}</td>
                              <td>{b || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
                  <span>Conferi e quero cadastrar mesmo assim, como um novo imóvel.</span>
                </label>
              </div>
            )}

            {todas.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Fotos do anúncio ({sel.size} de {todas.length} selecionadas)</Label>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSel(new Set(todas.map((f) => f.url))); if (!principal) setPrincipal(todas[0].url); }}>Todas</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSel(new Set()); setPrincipal(''); }}>Nenhuma</Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {todas.map((f, i) => {
                    const on = sel.has(f.url); const main = principal === f.url && on;
                    return (
                      <div key={f.url} className={cn('relative rounded-lg overflow-hidden border-2', on ? 'border-primary' : 'border-transparent opacity-50')}>
                        <button type="button" onClick={() => alternar(f.url)} className="block w-full" aria-label={`${on ? 'Desmarcar' : 'Selecionar'} foto ${i + 1}`} aria-pressed={on}>
                          <img src={f.url} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-24 object-cover" />
                        </button>
                        {on && <span className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-0.5"><Check className="h-3 w-3" /></span>}
                        {on && (
                          <button type="button" onClick={() => setPrincipal(f.url)} aria-label="Definir como foto principal"
                            className={cn('absolute bottom-1 right-1 rounded-full px-1.5 py-0.5 text-[10px] flex items-center gap-0.5', main ? 'bg-amber-400 text-black font-semibold' : 'bg-black/60 text-white')}>
                            <Star className={cn('h-3 w-3', main && 'fill-current')} />{main ? 'Principal' : 'Principal?'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {faltam.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive font-medium">Complete os campos destacados em vermelho para salvar</p>
              </div>
            )}

            <ImovelFormFields
              formData={form}
              setFormData={(next) => setForm((prev) => {
                const upd = typeof next === 'function' ? next(prev) : next;
                if (faltam.length) setFaltam(checkMissingImovelFields(upd));
                return upd;
              })}
              photos={fotosFinais}
              setPhotos={setFotosDoForm}
              uploadingPhotos={uploading}
              setUploadingPhotos={setUploading}
              missingFields={faltam}
            />

            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 sticky bottom-0 bg-background pt-3 pb-1 border-t">
              <Button type="button" variant="outline" disabled={salvando} onClick={async () => { await limparFotosNaoUsadas([]); reiniciar(); }}>Buscar outro link</Button>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" disabled={salvando} onClick={() => fechar(false)}>Cancelar</Button>
                <Button type="button" onClick={salvar} disabled={salvando || uploading || (duplicados.length > 0 && !ciente)}>
                  {salvando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : 'Salvar imóvel'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
