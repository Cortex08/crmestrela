import { Link } from 'react-router-dom';
import { BedDouble, Bath, Car, Ruler, Building2 } from 'lucide-react';
import type { SiteImovel } from './api';
import { precoDe, moeda, finalidadeTexto, local } from './format';

export function PropertyCard({ i }: { i: SiteImovel }) {
  const foto = i.fotos?.[0];
  const preco = precoDe(i);
  const area = i.area_util || i.area_total;
  return (
    <Link to={`/site/imovel/${encodeURIComponent(i.codigo)}`} className="s-card">
      <div className="s-card-foto">
        {foto ? <img src={foto} alt={i.titulo} loading="lazy" decoding="async" /> : <div className="s-sem-foto"><Building2 size={44} /></div>}
        <span className="s-tag">{finalidadeTexto(i.tipo)}</span>
      </div>
      <div className="s-card-corpo">
        <div className="s-preco">
          {preco ? moeda(preco) : 'Consulte o valor'}
          {preco && i.tipo === 'locacao' ? <small>/mês</small> : null}
        </div>
        <h3>{i.titulo}</h3>
        <p className="s-local">{local(i)}</p>
        <div className="s-dados">
          {!!i.quartos && <span title="Quartos"><BedDouble size={16} />{i.quartos}</span>}
          {!!i.banheiros && <span title="Banheiros"><Bath size={16} />{i.banheiros}</span>}
          {!!i.vagas && <span title="Vagas"><Car size={16} />{i.vagas}</span>}
          {!!area && <span title="Área"><Ruler size={16} />{Number(area)} m²</span>}
        </div>
      </div>
    </Link>
  );
}

export function GradeImoveis({ itens }: { itens: SiteImovel[] }) {
  return <div className="s-grade">{itens.map((i) => <PropertyCard key={i.codigo} i={i} />)}</div>;
}
