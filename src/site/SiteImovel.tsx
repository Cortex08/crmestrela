import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X, Building2, MessageCircle } from 'lucide-react';
import { SiteLayout, usePagina } from './SiteLayout';
import { GradeImoveis } from './PropertyCard';
import { ContactForm } from './ContactForm';
import { buscarImovel, buscarImoveis, useSiteConfig } from './api';
import { precoDe, moeda, finalidadeTexto, local, linkWhatsApp } from './format';

function Lightbox({ fotos, inicio, onClose }: { fotos: string[]; inicio: number; onClose: () => void }) {
  const [i, setI] = useState(inicio);
  const ant = useCallback(() => setI((v) => (v - 1 + fotos.length) % fotos.length), [fotos.length]);
  const prox = useCallback(() => setI((v) => (v + 1) % fotos.length), [fotos.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') ant(); if (e.key === 'ArrowRight') prox(); };
    document.addEventListener('keydown', h);
    const o = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = o; };
  }, [ant, prox, onClose]);
  return (
    <div className="s-luz" role="dialog" aria-modal="true" aria-label="Galeria de fotos">
      <img src={fotos[i]} alt={`Foto ${i + 1} de ${fotos.length}`} />
      <button className="fechar" onClick={onClose} aria-label="Fechar"><X size={22} /></button>
      {fotos.length > 1 && <>
        <button className="ant" onClick={ant} aria-label="Foto anterior"><ChevronLeft size={24} /></button>
        <button className="prox" onClick={prox} aria-label="Próxima foto"><ChevronRight size={24} /></button>
      </>}
      <div className="cont">{i + 1} / {fotos.length}</div>
    </div>
  );
}

export default function SiteImovel() {
  const { codigo = '' } = useParams();
  const { data: cfg } = useSiteConfig();
  const [luz, setLuz] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);

  const { data: im, isLoading } = useQuery({ queryKey: ['site-imovel', codigo], queryFn: () => buscarImovel(codigo), staleTime: 60_000 });
  const { data: parecidos } = useQuery({
    queryKey: ['site-parecidos', im?.codigo],
    enabled: !!im,
    queryFn: async () => (await buscarImoveis({ finalidade: im!.tipo, cidade: im!.cidade || undefined, limite: 4 })).itens.filter((x) => x.codigo !== im!.codigo).slice(0, 3),
  });

  usePagina(im ? `${im.titulo} | ${cfg?.nome || 'Estrela de Davi'}` : 'Imóvel | Estrela de Davi', im ? `${finalidadeTexto(im.tipo)} - ${local(im)}` : undefined);

  if (isLoading) return <SiteLayout><div className="s-wrap" style={{ padding: '80px 20px' }}>Carregando imóvel…</div></SiteLayout>;
  if (!im) return (
    <SiteLayout>
      <div className="s-wrap" style={{ padding: '72px 20px' }}>
        <div className="s-vazio">
          <h3>Imóvel indisponível</h3>
          <p>Este anúncio não está mais disponível. Veja outras opções do nosso catálogo.</p>
          <Link className="s-btn s-btn-escuro" to="/site/imoveis">Ver imóveis</Link>
        </div>
      </div>
    </SiteLayout>
  );

  const fotos = im.fotos || [];
  const preco = precoDe(im);
  const area = im.area_util || im.area_total;
  const texto = `Olá! Tenho interesse no imóvel ${im.codigo} - ${im.titulo}.`;
  const zap = cfg?.whatsapp ? linkWhatsApp(cfg.whatsapp, texto) : '';

  async function compartilhar() {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: im!.titulo, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopiado(true); setTimeout(() => setCopiado(false), 2500);
    } catch { /* cancelado */ }
  }

  return (
    <SiteLayout>
      <div className="s-wrap">
        <nav className="s-trilha" aria-label="Trilha">
          <Link to="/site">Início</Link> / <Link to={`/site/imoveis?finalidade=${im.tipo}`}>{im.tipo === 'venda' ? 'Comprar' : 'Alugar'}</Link> / {im.codigo}
        </nav>

        {fotos.length > 0 ? (
          <div className="s-galeria">
            {fotos.slice(0, 3).map((f, idx) => (
              <button key={f} className={idx === 0 ? 'principal' : ''} onClick={() => setLuz(idx)} aria-label={`Ampliar foto ${idx + 1}`}>
                <img src={f} alt={idx === 0 ? im.titulo : `Foto ${idx + 1} de ${im.titulo}`} loading={idx === 0 ? 'eager' : 'lazy'} />
                {idx === Math.min(2, fotos.length - 1) && fotos.length > 1 && <span className="s-mais-fotos">Ver as {fotos.length} fotos</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="s-card-foto" style={{ aspectRatio: '16 / 6' }}><div className="s-sem-foto"><Building2 size={64} /></div></div>
        )}

        <div className="s-imovel-grade">
          <div>
            <p className="s-local">{finalidadeTexto(im.tipo)} · Código {im.codigo}</p>
            <h1 style={{ marginTop: 8 }}>{im.titulo}</h1>
            <p className="s-local" style={{ marginTop: 10, fontSize: 17 }}>{local(im)}</p>

            <div className="s-fatos">
              {!!im.quartos && <div><b>{im.quartos}</b><span>{im.quartos === 1 ? 'Quarto' : 'Quartos'}</span></div>}
              {!!im.banheiros && <div><b>{im.banheiros}</b><span>{im.banheiros === 1 ? 'Banheiro' : 'Banheiros'}</span></div>}
              {!!im.vagas && <div><b>{im.vagas}</b><span>{im.vagas === 1 ? 'Vaga' : 'Vagas'}</span></div>}
              {!!area && <div><b>{Number(area)}</b><span>m² {im.area_util ? 'úteis' : 'totais'}</span></div>}
            </div>

            {im.descricao && (<><h2 style={{ fontSize: 30, marginBottom: 12 }}>Sobre o imóvel</h2><p className="s-texto">{im.descricao}</p></>)}

            {(im.aceita_pets || im.mobiliado) && (
              <p className="s-texto" style={{ marginTop: 20 }}>
                {[im.mobiliado && 'Mobiliado', im.aceita_pets && 'Aceita animais de estimação'].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <aside className="s-lateral" aria-label="Valores e contato">
            <div className="s-preco">{preco ? moeda(preco) : 'Consulte o valor'}{preco && im.tipo === 'locacao' ? <small>/mês</small> : null}</div>
            {(!!im.valor_condominio || !!im.valor_iptu) && (
              <div className="s-linhas">
                {!!im.valor_condominio && <div><span>Condomínio</span><span>{moeda(im.valor_condominio)}</span></div>}
                {!!im.valor_iptu && <div><span>IPTU</span><span>{moeda(im.valor_iptu)}</span></div>}
              </div>
            )}
            {zap && <a className="s-btn s-btn-zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Conversar no WhatsApp</a>}
            <h3 style={{ fontSize: 26, marginTop: 6 }}>Receber contato</h3>
            <ContactForm origem="contato" codigo={im.codigo} mensagemInicial={texto} rotulo="Quero ser contatado" />
            <button className="s-compartilhar" onClick={compartilhar}>{copiado ? 'Link copiado' : 'Compartilhar este imóvel'}</button>
          </aside>
        </div>

        {parecidos && parecidos.length > 0 && (
          <section style={{ paddingBottom: 80 }}>
            <h2 style={{ fontSize: 36, marginBottom: 28 }}>Imóveis parecidos</h2>
            <GradeImoveis itens={parecidos} />
          </section>
        )}
      </div>
      {luz !== null && <Lightbox fotos={fotos} inicio={luz} onClose={() => setLuz(null)} />}
    </SiteLayout>
  );
}
