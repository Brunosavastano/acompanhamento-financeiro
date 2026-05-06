# Deploy e acesso

Este app nao e Streamlit. Ele e um app Next.js com APIs, Auth.js, Prisma e Postgres. Em producao, ele deve ficar em uma URL HTTPS e usar um banco Postgres hospedado.

## Modelo recomendado

- App: Vercel, Render, Railway, Fly.io ou VPS.
- Banco: Neon, Supabase, Railway, Prisma Postgres ou outro Postgres gerenciado.
- URL: dominio proprio como `https://financeiro.seudominio.com`, ou a URL padrao do provedor.
- Acesso: login obrigatorio; nenhuma tela operacional deve ficar publica.

## Variaveis de ambiente

Configure no provedor:

```text
DATABASE_URL=postgresql://...
AUTH_SECRET=uma-string-longa-e-secreta
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://financeiro.seudominio.com
SEED_EMAIL=bruno@example.com
SEED_PASSWORD=<senha forte com 12+ caracteres>
DEFAULT_EXCEL_PATH=
```

Em producao, prefira importar a planilha por upload na tela Relatorios. Caminhos locais como `G:/Meu Drive/...` so fazem sentido no seu computador.

## Primeiro deploy

1. Criar o banco Postgres no provedor escolhido.
2. Configurar `DATABASE_URL` e demais variaveis.
3. Rodar `npm install`.
4. Rodar `npm run prod:check`.
5. Rodar `npm run prisma:generate`.
6. Rodar `npm run prisma:migrate:deploy`.
7. Rodar `NODE_ENV=production npm run prisma:seed` uma vez, se quiser criar o usuario inicial por seed. No PowerShell: `$env:NODE_ENV='production'; npm run prisma:seed`.
8. Rodar `npm run build`.
9. Publicar o app e acessar `/api/health`.

## Operacao

- `/api/health` deve responder `status: ok` quando app e banco estiverem saudaveis.
- Backups JSON ficam em `/api/backup/export`, com autenticacao.
- Backups CSV ficam em `/api/backup/export?format=csv&dataset=positions`, trocando `dataset` pelo conjunto desejado.
- Importacao Excel fica em Relatorios.
- Depois de trocar dominio, atualize `NEXTAUTH_URL` para a URL HTTPS final.

## Desenvolvimento local

Use:

```bash
npm run dev:local
```

Esse comando sobe o Postgres embutido, aplica migrations pendentes, cria seed apenas quando o banco esta vazio e inicia `http://localhost:3001/dashboard`.
