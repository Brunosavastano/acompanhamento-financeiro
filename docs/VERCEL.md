# Deploy na Vercel

Este projeto deve ser importado na Vercel a partir do GitHub:

```text
Brunosavastano/acompanhamento-financeiro
```

## Configuracao do projeto

Na tela de importacao da Vercel:

```text
Framework Preset: Next.js
Root Directory: apps/web
Build Command: npm run build
Install Command: npm ci
Output Directory: deixar padrao
Node.js: 22.x, se houver selecao
```

O script `apps/web/package.json` ja executa `prisma generate` antes do `next build`, porque o ambiente limpo da Vercel nao tera o Prisma Client gerado previamente.

## Banco Postgres

Crie um Postgres gerenciado, preferencialmente Neon ou Supabase. Depois copie a connection string para a variavel:

```text
DATABASE_URL=postgresql://...
```

Em producao, a URL nao pode apontar para `localhost`.

## Variaveis de ambiente

Configure estas variaveis em Production, Preview e Development, exceto quando voce quiser separar bancos:

```text
DATABASE_URL=postgresql://...
AUTH_SECRET=<string aleatoria com 32+ caracteres>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://<dominio-ou-url-vercel>
SEED_EMAIL=<email real>
SEED_PASSWORD=<senha forte com 12+ caracteres>
DEFAULT_EXCEL_PATH=
```

Use `DEFAULT_EXCEL_PATH` vazio na Vercel. A importacao da planilha deve ser por upload na tela Relatorios.

## Primeiro banco de producao

Depois de criar o banco e configurar `DATABASE_URL`, aplique migrations e seed uma vez:

```bash
npm run prisma:migrate:deploy
NODE_ENV=production npm run prisma:seed
```

No PowerShell:

```powershell
$env:NODE_ENV='production'
npm run prisma:seed
```

Esses comandos precisam rodar com a `DATABASE_URL` de producao no ambiente atual. Nao rode seed em producao usando `admin123`.

## Validacao

Antes de publicar:

```bash
npm run prod:check
npm run build
```

Depois do deploy:

```text
https://<app>/api/health
```

Deve responder `status: ok`.
