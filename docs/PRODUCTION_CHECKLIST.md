# Checklist de producao

Use este checklist antes de publicar o app fora da maquina local.

## Variaveis obrigatorias

Configure no provedor de deploy, nunca em arquivo versionado:

```text
DATABASE_URL=postgresql://...
AUTH_SECRET=<string aleatoria com 32+ caracteres>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://financeiro.seudominio.com
SEED_EMAIL=<email real do usuario inicial>
SEED_PASSWORD=<senha forte, 12+ caracteres>
DEFAULT_EXCEL_PATH=
```

Em producao, deixe `DEFAULT_EXCEL_PATH` vazio e importe a planilha por upload em Relatorios.

## Validacao automatica

Depois de configurar as variaveis no ambiente de producao, rode:

```bash
npm run prod:check
```

Para testar contra um arquivo local nao versionado:

```bash
npm run prod:check -- --env-file apps/web/.env.production.local
```

O comando falha se encontrar `localhost`, senha seed padrao, `AUTH_SECRET` fraco ou `NEXTAUTH_URL` sem HTTPS.

## Primeiro deploy

1. Criar Postgres gerenciado.
2. Configurar variaveis de ambiente.
3. Rodar `npm run prod:check`.
4. Rodar `npm run prisma:generate`.
5. Rodar `npm run prisma:migrate:deploy`.
6. Rodar `NODE_ENV=production npm run prisma:seed` uma vez, se quiser criar o usuario inicial por seed. No PowerShell: `$env:NODE_ENV='production'; npm run prisma:seed`.
7. Rodar `npm run build`.
8. Acessar `/api/health`.
9. Importar a planilha por upload em Relatorios.
10. Exportar um backup JSON e guardar fora do provedor.

## Operacao recorrente

- Confirmar `/api/health` apos deploys.
- Exportar backup JSON antes de alteracoes grandes.
- Configurar backup automatico do Postgres no provedor escolhido.
- Trocar `SEED_PASSWORD` depois do primeiro acesso ou criar o usuario diretamente no banco.
