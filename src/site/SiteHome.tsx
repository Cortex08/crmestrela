import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SiteLayout, usePagina } from './SiteLayout';
import { GradeImoveis } from './PropertyCard';
import { buscarImoveis, useSiteConfig } from './api';
import { linkWhatsApp } from './format';

const servicos: [string, string, string, string][] = [
  ['Comprar', 'Imóveis selecionados, com documentação conferida antes da visita e acompanhamento até a escritura.', '/site/imoveis?finalidade=venda', 'Ver imóveis à venda'],
  ['Alugar', 'Opções para morar com segurança, com contrato claro e suporte durante toda a locação.', '/site/imoveis?finalidade=locacao', 'Ver imóveis para alugar'],
  ['Vender ou alugar o seu imóvel', 'Avaliamos, anunciamos e conduzimos as visitas e a negociação. Você acompanha cada etapa.', '/site/anunciar', 'Anunciar meu imóvel'],
];

export default function SiteHome() {
  const nav = useNavigate();
  const { data: cfg } = useSiteConfig();
  const [fin, setFin] = useState<'venda' | 'locacao'>('venda');
  const [q, setQ] = useState('');
  const [quartos, setQuartos] = useState('');
  usePagina(`${cfg?.nome || 'Grupo Estrela de Davi'} | Imóveis para comprar e alugar`, 'Encontre casas e apartamentos para comprar ou alugar com a Estrela de Davi.');

  const { data, isLoading } = useQuery({ queryKey: ['site-destaques'], queryFn: () => buscarImoveis({ limite: 6 }), staleTime: 60_000 });

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams({ finalidade: fin });
    if (q.trim()) p.set('q', q.trim());
    if (quartos) p.set('quartos', quartos);
    nav(`/site/imoveis?${p.toString()}`);
  }

  const zap = cfg?.whatsapp ? linkWhatsApp(cfg.whatsapp, 'Olá! Vim pelo site e gostaria de atendimento.') : '';

  return (
    <SiteLayout>
      <section className="s-hero">
        <div className="s-fachada" aria-hidden="true" />
        <div className="s-janela" aria-hidden="true" />
        <div className="s-wrap">
          <h1>O imóvel certo começa com uma conversa franca.</h1>
          <p className="s-sub">{cfg?.slogan || 'Compra, venda e locação com atendimento próximo, documentação em ordem e transparência em cada etapa.'}</p>
        </div>
      </section>

      <div className="s-wrap s-busca-wrap">
        <form className="s-busca" onSubmit={buscar} aria-label="Buscar imóveis">
          <div className="s-abas" role="group" aria-label="Finalidade">
            <button type="button" aria-pressed={fin === 'venda'} onClick={() => setFin('venda')}>Comprar</button>
            <button type="button" aria-pressed={fin === 'locacao'} onClick={() => setFin('locacao')}>Alugar</button>
          </div>
          <div className="s-campos">
            <label className="s-campo">Bairro, cidade ou código
              <input className="s-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Centro" maxLength={60} />
            </label>
            <label className="s-campo">Quartos
              <select className="s-select" value={quartos} onChange={(e) => setQuartos(e.target.value)}>
                <option value="">Qualquer</option>
                <option value="1">1 ou mais</option>
                <option value="2">2 ou mais</option>
                <option value="3">3 ou mais</option>
                <option value="4">4 ou mais</option>
              </select>
            </label>
            <span />
            <button className="s-btn s-btn-escuro" type="submit">Buscar imóveis</button>
          </div>
        </form>
      </div>

      <section className="s-secao">
        <div className="s-wrap">
          <div className="s-secao-topo">
            <div>
              <h2>Imóveis disponíveis</h2>
              <p>Os anúncios mais recentes, atualizados diretamente pela nossa equipe.</p>
            </div>
            <Link className="s-link" to="/site/imoveis">Ver todos os imóveis</Link>
          </div>
          {isLoading ? (
            <div className="s-vazio">Carregando imóveis…</div>
          ) : data && data.itens.length > 0 ? (
            <GradeImoveis itens={data.itens} />
          ) : (
            <div className="s-vazio">
              <h3>Novos imóveis chegando</h3>
              <p>Estamos atualizando o catálogo. Conte o que você procura e avisamos assim que surgir uma boa opção.</p>
              <Link className="s-btn s-btn-escuro" to="/site/contato">Falar com a equipe</Link>
            </div>
          )}
        </div>
      </section>

      <section className="s-secao pedra">
        <div className="s-wrap">
          <div className="s-secao-topo"><h2>Como podemos ajudar</h2></div>
          <div className="s-servicos">
            {servicos.map(([t, d, to, cta]) => (
              <div className="s-servico" key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
                <Link className="s-link" to={to}>{cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {cfg?.sobre && (
        <section className="s-secao">
          <div className="s-wrap s-duas">
            <h2>Sobre a {cfg.nome}</h2>
            <p className="s-texto">{cfg.sobre}</p>
          </div>
        </section>
      )}

      <section className="s-chamada">
        <div className="s-wrap">
          <div>
            <h2>Tem um imóvel para vender ou alugar?</h2>
            <p>Conte um pouco sobre ele e retornamos pelo WhatsApp com os próximos passos.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="s-btn s-btn-ouro" to="/site/anunciar">Anunciar meu imóvel</Link>
            {zap && <a className="s-btn s-btn-linha" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} href={zap} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>}
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
