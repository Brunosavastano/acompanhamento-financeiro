import { getRequiredHouseholdId } from "@/lib/authz";
import { json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { AiConfigError, aiUploadLimits, describeAiError, isAiEnabled, isAiTimeout } from "@/server/ai";
import { buildReadContext, readBalanceScreens } from "@/server/balance-read";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Lê prints dos apps dos bancos e devolve os saldos com a conta SUGERIDA de
 * cada um, para revisão no passo 2 do fechamento. Esta rota nunca grava nada:
 * os valores só preenchem campos no navegador, e salvar continua sendo o botão
 * humano "Salvar e revisar" (PUT das posições).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    if (!isAiEnabled()) {
      return json({ error: "As funções de IA estão desativadas (AI_FEATURES_ENABLED)." }, { status: 503 });
    }

    // Rejeita corpos gigantes ANTES de request.formData() materializar tudo em
    // memória. (Primeira linha de defesa; a Vercel ainda impõe o cap dela.)
    const limits = aiUploadLimits();
    const maxBodyBytes = limits.maxImages * limits.maxImageBytes + 1_000_000;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return json({ error: `Upload acima do limite total de ${(maxBodyBytes / 1_000_000).toFixed(0)} MB.` }, { status: 413 });
    }

    const { id } = await params;
    const snapshot = await prisma.monthlySnapshot.findFirst({
      where: { id, householdId },
      include: { positions: { include: { person: true, account: true } } },
    });
    if (!snapshot) return json({ error: "Fechamento não encontrado." }, { status: 404 });
    if (snapshot.status !== "draft") {
      return json({ error: "Só é possível ler prints para um rascunho. Crie uma revisão para alterar um fechamento." }, { status: 409 });
    }
    if (snapshot.positions.length === 0) {
      return json({ error: "Este rascunho não tem contas. Adicione as contas antes de ler os prints." }, { status: 409 });
    }

    const form = await request.formData();
    const files = [...form.getAll("images"), ...form.getAll("image")].filter((item): item is File => item instanceof File);
    if (files.length === 0) return json({ error: "Envie ao menos uma imagem no campo images." }, { status: 400 });
    if (files.length > limits.maxImages) {
      return json({ error: `Envie no máximo ${limits.maxImages} prints por leitura.` }, { status: 400 });
    }

    const images: { bytes: Uint8Array; mediaType: string }[] = [];
    for (const file of files) {
      if (!ACCEPTED_TYPES.has(file.type)) {
        return json({ error: `Formato não suportado (${file.type || "desconhecido"}). Use PNG, JPEG ou WebP.` }, { status: 400 });
      }
      if (file.size > limits.maxImageBytes) {
        return json({ error: `Imagem acima do limite de ${(limits.maxImageBytes / 1_000_000).toFixed(0)} MB.` }, { status: 400 });
      }
      images.push({ bytes: new Uint8Array(await file.arrayBuffer()), mediaType: file.type });
    }

    const people = await prisma.person.findMany({ where: { householdId }, select: { id: true, name: true } });
    const rawHint = String(form.get("personId") ?? "").trim();
    if (rawHint && !people.some((person) => person.id === rawHint)) {
      return json({ error: "Pessoa não pertence à família autenticada." }, { status: 400 });
    }

    // Último fechamento antes deste mês: base da conferência "muito diferente do mês anterior".
    const previous = await prisma.monthlySnapshot.findFirst({
      where: { householdId, periodMonth: { lt: snapshot.periodMonth }, status: { in: ["closed", "revised"] } },
      orderBy: [{ periodMonth: "desc" }, { revisionNumber: "desc" }],
      include: { positions: { select: { id: true, accountId: true, amount: true, createdAt: true } } },
    });

    const context = buildReadContext({ positions: snapshot.positions, previousPositions: previous?.positions ?? [] });
    const result = await readBalanceScreens({
      images,
      positions: context.positions,
      people,
      personHintId: rawHint || null,
      previousAmounts: context.previousAmounts,
    });
    return json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof AiConfigError) return json({ error: error.message }, { status: 503 });
    if (isAiTimeout(error)) {
      return json({ error: "A leitura dos prints demorou demais e foi cancelada. Tente com menos prints por vez." }, { status: 504 });
    }
    // Erros do provedor de IA carregam detalhes internos (fragmento de chave,
    // org, quota) e o corpo da requisição com os prints: loga só um resumo no
    // servidor e devolve mensagem genérica ao cliente.
    console.error("[balance-read] falha na leitura dos prints:", describeAiError(error));
    return json({ error: "Não foi possível ler os prints agora. Tente novamente em instantes." }, { status: 502 });
  }
}
