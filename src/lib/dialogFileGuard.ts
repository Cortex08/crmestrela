/**
 * Evita um bug comum do Radix Dialog: ao clicar num <input type="file"> dentro de um modal,
 * o seletor de arquivos do sistema operacional abre; quando ele fecha (com ou sem arquivo
 * escolhido), o navegador devolve o foco à página de um jeito que o Radix interpreta como
 * "clique fora do modal" e fecha o diálogo sozinho — apagando tudo que a pessoa já preencheu.
 *
 * Aqui marcamos que um seletor de arquivos acabou de ser aberto (no clique do input) e,
 * por alguns instantes, ignoramos esse "fechar automático" nos componentes de Dialog.
 */
let aberto = false;
let limite = 0;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (e) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest('input[type="file"]')) {
        aberto = true;
        // janelas do SO (como a de escolher arquivo) podem levar alguns segundos para fechar
        limite = Date.now() + 4000;
      }
    },
    true,
  );
  window.addEventListener('focus', () => {
    // o foco volta para a janela assim que o seletor de arquivos fecha
    setTimeout(() => { aberto = false; }, 300);
  });
}

export const seletorDeArquivoAberto = () => aberto && Date.now() < limite;
