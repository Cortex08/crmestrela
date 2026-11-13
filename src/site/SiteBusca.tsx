import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { SiteLayout, usePagina } from './SiteLayout';
import { GradeImoveis } from './PropertyCard';
import { buscarImoveis, useSiteFiltros } from './api';
import { num } from './format';

const POR_PAGINA = 12;

export default function SiteBusca() {
  const [sp, setSp] = useSearchParams();
  const finalidade = sp.get('finalidade') || '';
  const cidade = sp.get('cidade') || '';
  const bairro = sp.get('bairro') || '';
  const q = sp.get('q') || '';
  const quartos = num(sp.get('quartos'));
  const min = num(sp.get('min'));
  const max = num(sp.get('max'));
  const ordem = sp.get('ordem') || 'recentes';
  const pagina = Math.max(1, Number(sp.get('pagina')) || 1);

  const titulo = finalidade === 'venda' ? 'Imóveis à venda' : finalidade === 'locacao' ? 'Imóveis para alugar' : 'Todos os imóveis';
  usePagina(`${titulo} | Estrela de Davi`, 'Pesquise casas e apartamentos por bairro, valor e número de quartos.');

  const { data: filtros } = useSiteFiltros();
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['site-busca', finalidade, cidade, bairro, q, quartos, min, max, ordem, pagina],
    queryFn: () => buscarImoveis({ finalidade, cidade, bairro, q, quartos, min, max, ordem, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  function set(chave: string, valor: string) {
    const n = new URLSearchParams(sp);
    if (valor) n.set(chave, valor); else n.delete(chave);
    if (chave !== 'pagina') n.delete('pagina');
    setSp(n, { replace: true });
  }
  const irParaPagina = (p: number) => { set('pagina', p > 1 ? String(p) : ''); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const bairros = (filtros?.bairros || []).filter((b) => !cidade || b.cidade?.toLowerCase() === cidade.toLowerCase());
  const temFiltro = !!(cidade || bairro || q || quartos || min || max);

  return (
    <SiteLayout>
      <div className="s-topo-pagina">
        <div className="s-wrap">
          <h1>{titulo}</h1>
          <div className="s-filtros">
            <label className="s-campo s-q">Bairro, cidade ou código
              <input className="s-input" defaultValue={q} key={q} maxLength={60}
                onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value.trim()); }}
                onBlur={(e) => { if (e.target.value.trim() !== q) set('q', e.target.value.trim()); }} placeholder="Ex.: Centro" />
            </label>
            <label className="s-campo">Finalidade
              <select className="s-select" value={finalidade} onChange={(e) => set('finalidade', e.target.value)}>
                <option value="">Comprar ou alugar</option>
                <option value="venda">Comprar</option>
                <option value="locacao">Alugar</option>
              </select>
            </label>
            <label className="s-campo">Cidade
              <select className="s-select" value={cidade} onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set('cidade', e.target.value); else n.delete('cidade'); n.delete('bairro'); n.delete('pagina'); setSp(n, { replace: true }); }}>
                <option value="">Todas</option>
                {(filtros?.cidades || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="s-campo">Bairro
              <select className="s-select" value={bairro} onChange={(e) => set('bairro', e.target.value)}>
                <option value="">Todos</option>
                {[...new Set(bairros.map((b) => b.bairro))].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="s-campo">Quartos
              <select className="s-select" value={quartos ? String(quartos) : ''} onChange={(e) => set('quartos', e.target.value)}>
                <option value="">Qualquer</option>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}
              </select>
            </label>
            <label className="s-campo">Valor máximo (R$)
              <input className="s-input" inputMode="numeric" defaultValue={max ?? ''} key={`max${max ?? ''}`} placeholder="Sem limite"
                onBlur={(e) => { const v = e.target.value.replace(/\D/g, ''); if (v !== String(max ?? '')) set('max', v); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            </label>
          </div>
        </div>
      </div>

      <section className="s-wrap" style={{ paddingBottom: 72 }}>
        <div className="s-resultado-topo">
          <span aria-live="polite">{isLoading ? 'Buscando…' : `${total} ${total === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}`}</span>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {temFiltro && <button className="s-compartilhar" onClick={() => setSp(finalidade ? { finalidade } : {}, { replace: true })}>Limpar filtros</button>}
            <label className="s-campo" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>Ordenar
              <select className="s-select" style={{ minHeight: 40, width: 'auto' }} value={ordem} onChange={(e) => set('ordem', e.target.value === 'recentes' ? '' : e.target.value)}>
                <option value="recentes">Mais recentes</option>
                <option value="menor_preco">Menor valor</option>
                <option value="maior_preco">Maior valor</option>
              </select>
            </label>
          </div>
        </div>

        {isError ? (
          <div className="s-vazio"><h3>Não foi possível carregar os imóveis</h3><p>Verifique sua conexão e tente novamente.</p></div>
        ) : data && data.itens.length > 0 ? (
          <div style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}><GradeImoveis itens={data.itens} /></div>
        ) : !isLoading ? (
          <div className="s-vazio">
            <h3>Nenhum imóvel com esses filtros</h3>
            <p>Tente ampliar a busca ou conte o que você procura que avisamos quando surgir.</p>
            <Link className="s-btn s-btn-escuro" to="/site/anunciar">Falar com a equipe</Link>
          </div>
        ) : null}

        {paginas > 1 && (
          <nav className="s-pag" aria-label="Paginação">
            <button className="s-btn s-btn-linha" disabled={pagina <= 1} onClick={() => irParaPagina(pagina - 1)}>Anterior</button>
            <span>Página {pagina} de {paginas}</span>
            <button className="s-btn s-btn-linha" disabled={pagina >= paginas} onClick={() => irParaPagina(pagina + 1)}>Próxima</button>
          </nav>
        )}
      </section>
    </SiteLayout>
  );
}
