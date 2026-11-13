# Publicar o CRM (Vercel + GitHub)

1. Crie um repositório **privado** no GitHub e envie todo o conteúdo desta pasta.
2. Na Vercel: Add New → Project → escolha o repositório.
   - Framework: **Vite** · Build Command: `npm run build` · Output Directory: `dist` · Node 22.
   - (Já existe o projeto crm-estrela-de-davi: em Settings → Git, conecte o repositório e faça o deploy.)
3. Variáveis (opcionais, já há valores padrão no código): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. O build copia sozinho os modelos de rosto e publica o app do ponto offline em `/kiosk/`.

Já aplicado no banco (Supabase): funções `agora_servidor`, `ponto_quiosque_rostos` e `registrar_ponto_quiosque_lote` + tabela `ponto_offline_recebidos`.
