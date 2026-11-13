import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, MessageCircle, Instagram, Facebook } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useSiteConfig } from './api';
import { linkWhatsApp } from './format';
import './site.css';

/** Define título e permite indexação enquanto o visitante está no site público. */
export function usePagina(titulo: string, descricao?: string) {
  useEffect(() => {
    const antes = document.title;
    const robots = document.querySelector('meta[name="robots"]');
    const robotsAntes = robots?.getAttribute('content') ?? null;
    const desc = document.querySelector('meta[name="description"]');
    const descAntes = desc?.getAttribute('content') ?? null;
    document.title = titulo;
    robots?.setAttribute('content', 'index, follow');
    if (descricao) desc?.setAttribute('content', descricao);
    return () => {
      document.title = antes;
      if (robots && robotsAntes !== null) robots.setAttribute('content', robotsAntes);
      if (desc && descAntes !== null) desc.setAttribute('content', descAntes);
    };
  }, [titulo, descricao]);
}

const itens: [string, string][] = [
  ['/site', 'Início'],
  ['/site/imoveis?finalidade=venda', 'Comprar'],
  ['/site/imoveis?finalidade=locacao', 'Alugar'],
  ['/site/anunciar', 'Anunciar imóvel'],
  ['/site/contato', 'Contato'],
];

export function SiteLayout({ children }: { children: ReactNode }) {
  const { data: cfg } = useSiteConfig();
  const [aberto, setAberto] = useState(false);
  const { pathname, search } = useLocation();

  useEffect(() => { setAberto(false); window.scrollTo(0, 0); }, [pathname, search]);

  const zap = cfg?.whatsapp ? linkWhatsApp(cfg.whatsapp, 'Olá! Vim pelo site e gostaria de atendimento.') : '';
  const nome = cfg?.nome || 'Grupo Estrela de Davi';

  return (
    <div className="site">
      <header className="s-head">
        <div className="s-wrap">
          <Link to="/site" className="s-marca" aria-label={`${nome} - início`}>
            <Logo className="w-10 h-10" />
            <span>{nome}</span>
          </Link>
          <nav className="s-nav" aria-label="Principal">
            {itens.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/site'} className={() => ''}
                aria-current={pathname === to ? 'page' : undefined}>
                {label}
              </NavLink>
            ))}
          </nav>
          <button className="s-menu-btn" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
            {aberto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {aberto && (
          <nav className="s-nav-mobile" aria-label="Principal">
            {itens.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
          </nav>
        )}
      </header>

      <main>{children}</main>

      <footer className="s-rodape">
        <div className="s-wrap">
          <div className="s-rodape-grade">
            <div>
              <h4>{nome}</h4>
              <p style={{ maxWidth: '40ch' }}>{cfg?.slogan || 'Compra, venda e locação de imóveis com atendimento próximo e transparente.'}</p>
              {cfg?.creci && <p style={{ marginTop: 12 }}>CRECI {cfg.creci}</p>}
            </div>
            <div>
              <h4>Fale conosco</h4>
              <ul>
                {cfg?.telefone && <li><a href={`tel:${cfg.telefone.replace(/\D/g, '')}`}>{cfg.telefone}</a></li>}
                {cfg?.whatsapp && <li><a href={zap} target="_blank" rel="noopener noreferrer">WhatsApp: {cfg.whatsapp}</a></li>}
                {cfg?.email && <li><a href={`mailto:${cfg.email}`}>{cfg.email}</a></li>}
                {cfg?.endereco && <li>{cfg.endereco}</li>}
                {!cfg?.telefone && !cfg?.whatsapp && !cfg?.email && <li>Envie uma mensagem pelo formulário de qualquer imóvel.</li>}
              </ul>
            </div>
            <div>
              <h4>Navegue</h4>
              <ul>
                <li><Link to="/site/imoveis?finalidade=venda">Imóveis à venda</Link></li>
                <li><Link to="/site/imoveis?finalidade=locacao">Imóveis para alugar</Link></li>
                <li><Link to="/site/anunciar">Anunciar meu imóvel</Link></li>
                {cfg?.instagram && <li><a href={cfg.instagram} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Instagram size={16} /> Instagram</a></li>}
                {cfg?.facebook && <li><a href={cfg.facebook} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Facebook size={16} /> Facebook</a></li>}
              </ul>
            </div>
          </div>
          <div className="s-rodape-fim">
            <span>© {new Date().getFullYear()} {nome}. Todos os direitos reservados.</span>
            <Link to="/portal">Área do cliente</Link> · <Link to="/login">Área do corretor</Link>
          </div>
        </div>
      </footer>

      {zap && (
        <a className="s-zap-flutuante" href={zap} target="_blank" rel="noopener noreferrer" aria-label="Conversar no WhatsApp">
          <MessageCircle size={26} />
        </a>
      )}
    </div>
  );
}
