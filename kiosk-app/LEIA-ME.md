# Ponto Estrela de Davi — app do quiosque (funciona sem internet)

Aplicativo para o **celular fixo da imobiliária**. Os funcionários batem o ponto pelo rosto.
Sem internet, a marcação fica guardada no aparelho e é enviada ao CRM sozinha quando a conexão voltar.

## Como funciona
1. **Configuração (uma vez, com internet):** abra o app, entre com o usuário de ponto (o mesmo do quiosque do CRM). O app baixa os rostos cadastrados.
2. **Uso diário:** o funcionário toca em "Bater ponto" e olha para a câmera. O rosto é comparado **no próprio aparelho** (a imagem nunca é gravada nem enviada).
3. **Sem internet:** aparece "salvo no aparelho". A pílula do topo mostra quantas marcações aguardam envio.
4. **Internet volta:** o app envia tudo sozinho (a cada 30 s ou assim que a rede volta) e atualiza os rostos. Cada marcação tem um código único, então nunca duplica.
5. **Configurações:** segure o título "Ponto · Estrela de Davi" por 2 segundos (sincronizar agora, ver marcações recusadas, entrar de novo, sair do aparelho).

## Gerar o APK (escolha um caminho)

### A) Pelo GitHub (não precisa instalar nada)
1. Crie um repositório **privado** no GitHub e envie o conteúdo desta pasta.
2. Abra a aba **Actions → "Gerar APK do Ponto" → Run workflow**.
3. Em ~5 minutos, baixe o arquivo **ponto-estrela-apk** (contém `app-debug.apk`) no fim da página da execução.

### B) No computador, com Android Studio
```
npm install
npm run build
npx cap sync android
npx cap open android      # Build > Build APK(s)
```
O APK sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

## Instalar no celular
Envie o `app-debug.apk` ao celular (WhatsApp, cabo ou Drive), abra o arquivo e permita "instalar de fontes desconhecidas". Na primeira abertura, **permita a câmera**.
Dica: nas configurações do Android, desative a economia de bateria para o app e deixe o celular carregando.

## Versão instalável pelo Chrome (sem APK)
Também existe em `https://crm-estrela-de-davi.vercel.app/kiosk/` — abra no Chrome do celular e use "Instalar app / Adicionar à tela inicial". Funciona offline depois da primeira abertura.

## Limites que você precisa saber
- **Relógio do aparelho:** sem internet, a hora vem do relógio do celular (corrigido pela diferença conhecida com o servidor). Se alguém alterar a data/hora do celular enquanto está offline, a marcação sairá com horário errado. Por isso toda marcação offline é identificada no CRM (`offline: true`, com o relógio do aparelho) e o servidor recusa horários no futuro ou com mais de 30 dias. Mantenha o ajuste de data/hora **automático** bloqueado para o funcionário (celular com bloqueio de tela/modo quiosque).
- **Rostos novos:** só chegam ao aparelho quando ele sincroniza. Um funcionário cadastrado agora só bate offline depois da próxima sincronização.
- **Segurança:** os rostos (números, não fotos) ficam guardados no aparelho. Use bloqueio de tela e não deixe o app instalado em celulares pessoais.
- **Marcação recusada:** se o servidor recusar (ex.: duplicada), ela aparece nas Configurações do app para avisar o RH.
