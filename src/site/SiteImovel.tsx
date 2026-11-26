import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X, Building2 } from 'lucide-react';
import { IconeWhatsApp } from './IconeWhatsApp';
import { SiteLayout, usePagina } from './SiteLayout';
import { GradeImoveis } from './PropertyCard';
import { ContactForm } from './ContactForm';
import { buscarImovel, buscarImoveis, useSiteConfig } from './api';
import { precoDe, moeda, finalidadeTexto, local, linkInteresse } from './format';

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
  // arrastar o dedo para o lado troca a foto (no celular)
  const toque = useRef<number | null>(null);
  return (
    <div
      className="s-luz" role="dialog" aria-modal="true" aria-label="Galeria de fotos"
      onTouchStart={(e) => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (toque.current === null || fotos.length < 2) return;
        const dx = e.changedTouches[0].clientX - toque.current;
        toque.current = null;
        if (dx > 50) ant(); else if (dx < -50) prox();
      }}
    >
      <img src={fotos[i]} alt={`Foto ${i + 1} de ${fotos.length}`} draggable={false} />
      <button className="fechar" onClick={onClose} aria-label="Fechar"><X size={22} /></button>
      {fotos.length > 1 && <>
        <button className="ant" onClick={ant} aria-label="Foto anterior"><ChevronLeft size={24} /></button>
        <button className="prox" onClick={prox} aria-label="Próxima foto"><ChevronRight size={24} /></button>
      </>}
      <div className="cont">{i + 1} / {fotos.length}</div>
    </div>
  );
}

/**
 * Foto principal que desliza com o dedo (uma por vez) + fileira de miniaturas embaixo.
 * Tocar na foto principal abre a foto ampliada.
 */
function Galeria({ fotos, titulo, onAmpliar }: { fotos: string[]; titulo: string; onAmpliar: (i: number) => void }) {
  const [atual, setAtual] = useState(0);
  const trilho = useRef<HTMLDivElement>(null);
  const miniaturas = useRef<HTMLDivElement>(null);

  // volta para a primeira foto quando troca de imóvel
  useEffect(() => { setAtual(0); trilho.current?.scrollTo({ left: 0 }); }, [fotos]);

  // mantém a miniatura da foto atual visível na fileira
  useEffect(() => {
    const m = miniaturas.current?.children[atual] as HTMLElement | undefined;
    const box = miniaturas.current;
    if (!m || !box) return;
    const alvo = m.offsetLeft - (box.clientWidth - m.clientWidth) / 2;
    box.scrollTo({ left: Math.max(0, alvo), behavior: 'smooth' });
  }, [atual]);

  const irPara = (i: number) => {
    const t = trilho.current;
    if (!t) return;
    t.scrollTo({ left: i * t.clientWidth, behavior: 'smooth' });
    setAtual(i);
  };

  const aoRolar = () => {
    const t = trilho.current;
    if (!t || !t.clientWidth) return;
    const i = Math.round(t.scrollLeft / t.clientWidth);
    if (i !== atual && i >= 0 && i < fotos.length) setAtual(i);
  };

  return (
    <div className="s-galeria">
      <div className="s-palco">
        <div className="s-trilho" ref={trilho} onScroll={aoRolar}>
          {fotos.map((f, idx) => (
            <button key={f + idx} className="s-slide" onClick={() => onAmpliar(idx)} aria-label={`Ampliar foto ${idx + 1} de ${fotos.length}`}>
              <img src={f} alt={idx === 0 ? titulo : `Foto ${idx + 1} de ${titulo}`} loading={idx < 2 ? 'eager' : 'lazy'} draggable={false} />
            </button>
          ))}
        </div>
        {fotos.length > 1 && (
          <>
            <button className="s-seta ant" onClick={() => irPara((atual - 1 + fotos.length) % fotos.length)} aria-label="Foto anterior"><ChevronLeft size={22} /></button>
            <button className="s-seta prox" onClick={() => irPara((atual + 1) % fotos.length)} aria-label="Próxima foto"><ChevronRight size={22} /></button>
            <span className="s-contador">{atual + 1} / {fotos.length}</span>
          </>
        )}
      </div>
      {fotos.length > 1 && (
        <div className="s-miniaturas" ref={miniaturas} aria-label="Todas as fotos">
          {fotos.map((f, idx) => (
            <button
              key={f + idx}
              className={idx === atual ? 'ativa' : ''}
              onClick={() => irPara(idx)}
              aria-label={`Ver foto ${idx + 1} de ${fotos.length}`}
              aria-current={idx === atual}
            >
              <img src={f} alt="" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
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
  // "Quero esse imóvel": abre o WhatsApp da imobiliária com a mensagem pronta; a pessoa só aperta enviar
  const zap = linkInteresse(cfg?.whatsapp, im);

  async function compartilhar() {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: im!.titulo, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopiado(true); setTimeout(() => setCopiado(false), 2500);
    } catch { /* cancelado */ }
  }

  return (
    <SiteLayout semZapFlutuante={!!zap}>
      <div className={zap ? 's-wrap s-com-barra' : 's-wrap'}>
        <nav className="s-trilha" aria-label="Trilha">
          <Link to="/site">Início</Link> / <Link to={`/site/imoveis?finalidade=${im.tipo}`}>{im.tipo === 'venda' ? 'Comprar' : 'Alugar'}</Link> / {im.codigo}
        </nav>

        {fotos.length > 0 ? (
          <Galeria fotos={fotos} titulo={im.titulo} onAmpliar={setLuz} />
        ) : (
          <div className="s-card-foto" style={{ aspectRatio: '16 / 6' }}><div className="s-sem-foto"><Building2 size={64} /></div></div>
        )}

        <div className="s-imovel-grade">
          <div>
            <p className="s-local">{finalidadeTexto(im.tipo)}{im.uso === 'comercial' ? ' · Comercial' : ''} · Código {im.codigo}</p>
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
            {zap ? (
              <>
                <a className="s-btn s-btn-zap s-btn-zap-grande" href={zap} target="_blank" rel="noopener noreferrer"><IconeWhatsApp size={22} /> Quero esse imóvel</a>
                <p className="s-pequeno">Abre o WhatsApp com a mensagem pronta. É só enviar que a nossa equipe já te atende.</p>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 26, marginTop: 6 }}>Receber contato</h3>
                <ContactForm origem="contato" codigo={im.codigo} mensagemInicial={texto} rotulo="Quero ser contatado" />
              </>
            )}
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
      {zap && (
        <div className="s-barra-zap" role="region" aria-label="Falar sobre este imóvel">
          <div className="s-barra-preco">
            <b>{preco ? moeda(preco) : 'Consulte'}</b>
            <span>{preco && im.tipo === 'locacao' ? 'por mês' : `Código ${im.codigo}`}</span>
          </div>
          <a className="s-btn s-btn-zap" href={zap} target="_blank" rel="noopener noreferrer"><IconeWhatsApp size={22} /> Quero esse imóvel</a>
        </div>
      )}
      {luz !== null && <Lightbox fotos={fotos} inicio={luz} onClose={() => setLuz(null)} />}
    </SiteLayout>
  );
}
