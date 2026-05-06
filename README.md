# Acompanhamento Financeiro Familiar

MVP web privado para substituir a planilha `Plan_Fin_melhorada_claudeV2.xlsx` por um app de fechamento financeiro mensal.

## Stack

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- Auth.js com credenciais
- Tailwind CSS
- Recharts
- Pacote de calculos financeiros testavel

## Primeiros passos

Modo local recomendado:

```bash
npm install
cp apps/web/.env.example apps/web/.env
npm run dev:local
```

Esse comando sobe o Postgres embutido, aplica migrations pendentes, roda seed apenas se o banco estiver vazio e inicia o Next.js em `http://localhost:3001`.

Health check local:

```bash
curl http://localhost:3001/api/health
```

Modo manual, util quando voce quiser controlar banco e app em terminais separados:

```bash
npm install
cp apps/web/.env.example apps/web/.env
npm run db:embedded
```

Mantenha esse comando rodando em um terminal. Em outro terminal, aplique schema, seed e inicie o app:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Se voce tiver Docker instalado e preferir usar o Postgres do compose, tambem pode usar:

```bash
docker compose up -d
```

Atalho equivalente para migration + seed com o banco ja no ar:

```bash
npm run db:setup
```

Login inicial do seed:

```text
bruno@example.com / admin123
```

O importador aceita upload da planilha ou um JSON com `filePath`, por exemplo:

```json
{
  "filePath": "G:/Meu Drive/Seagate/Pessoal/Documentos/Financeiro/Plan_Fin_melhorada_claudeV2.xlsx"
}
```

## Validacao e importacao

Validar a planilha sem depender do banco:

```bash
npm run excel:verify
```

Importar para o Postgres depois de rodar migration e seed:

```bash
npm run excel:import
```

Bootstrap completo depois que o Postgres estiver no ar:

```bash
npm run bootstrap
```

Checks principais:

```bash
npm run test --workspaces --if-present
npm run test:api
npm run test:e2e
npm run typecheck --workspaces --if-present
npm run build
npm run prod:check -- --env-file apps/web/.env.production.local
```

`npm run test:api` exige um Postgres ativo, por exemplo com `npm run db:embedded`.
`npm run test:e2e` reutiliza `http://localhost:3001` se o app ja estiver rodando; caso contrario, tenta subir `npm run dev:local`. A suite cria uma familia temporaria `e2e-app-*`, importa a planilha por upload e remove os dados ao final.

## Escopo implementado no MVP

- Dashboard autenticado com KPIs, graficos e indicadores recalculados pelo app.
- Fechamento mensal com rascunho, previa, fechamento imutavel e revisao versionada.
- Balancetes por posicao, com validacao de contas/pessoas do household.
- Dividas, orcamento e metas com criacao, edicao, exclusao e auditoria.
- Configuracoes com CRUD de pessoas e contas, incluindo ativacao/desativacao de contas.
- Relatorios com importacao Excel, reconciliacao, exportacao de backup JSON/CSV e auditoria recente.
- APIs cobertas por teste de fluxo com banco real para snapshot, dividas, orcamento, metas, pessoas, contas, auditoria e backup.

## Acesso final

Em desenvolvimento o endereco e `http://localhost:3001`, mas isso so funciona enquanto o computador e os processos locais estiverem ligados.

Em uso final, o app deve rodar em um provedor web com Postgres gerenciado. O caminho recomendado e:

- Hospedar o Next.js em Vercel, Render, Railway, Fly.io ou VPS.
- Hospedar o Postgres em Neon, Supabase, Railway, Prisma Postgres ou equivalente.
- Configurar `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `NEXTAUTH_URL`, `SEED_EMAIL` e `SEED_PASSWORD` forte no provedor.
- Rodar `npm run prod:check` antes de publicar.
- Rodar `npm run prisma:migrate:deploy` contra o banco de producao.
- Rodar `NODE_ENV=production npm run prisma:seed` uma vez para criar o usuario inicial, ou criar o usuario diretamente no banco.
- Acessar por uma URL publica protegida por login, por exemplo `https://financeiro.seudominio.com`.

Veja tambem [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
Antes de publicar, siga [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).
