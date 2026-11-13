import { SiteLayout, usePagina } from './SiteLayout';
import { ContactForm } from './ContactForm';

export function SiteAnunciar() {
  usePagina('Anunciar meu imóvel | Estrela de Davi', 'Venda ou alugue seu imóvel com a Estrela de Davi.');
  return (
    <SiteLayout>
      <div className="s-topo-pagina"><div className="s-wrap">
        <h1>Anuncie seu imóvel conosco</h1>
        <p className="s-texto" style={{ marginTop: 14 }}>Conte o básico sobre o imóvel. Retornamos pelo WhatsApp para combinar a avaliação e a divulgação.</p>
      </div></div>
      <div className="s-wrap s-secao">
        <div className="s-form-pagina">
          <ContactForm origem="anunciar" rotulo="Enviar dados do imóvel"
            mensagemInicial="Tipo do imóvel, endereço e se é para vender ou alugar: "
            sucesso="Recebemos os dados do seu imóvel. Um corretor vai falar com você em breve pelo WhatsApp." />
        </div>
      </div>
    </SiteLayout>
  );
}

export function SiteContato() {
  usePagina('Fale conosco | Estrela de Davi', 'Fale com a equipe da Estrela de Davi.');
  return (
    <SiteLayout>
      <div className="s-topo-pagina"><div className="s-wrap">
        <h1>Fale com a nossa equipe</h1>
        <p className="s-texto" style={{ marginTop: 14 }}>Diga o que você procura: região, tipo de imóvel e faixa de valor. Avisamos quando surgir uma boa opção.</p>
      </div></div>
      <div className="s-wrap s-secao">
        <div className="s-form-pagina">
          <ContactForm origem="contato" rotulo="Enviar mensagem" />
        </div>
      </div>
    </SiteLayout>
  );
}
