import { getRequiredHouseholdId } from "@/lib/authz";
import { json } from "@/lib/api";
import { AiConfigError, aiUploadLimits, isAiEnabled } from "@/server/ai";
import { readInvoiceScreens } from "@/server/invoice-read";

export const runtime = "nodejs";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Lê prints de fatura do cartão e devolve as linhas extraídas para REVISÃO —
 * esta rota nunca grava nada; salvar é decisão humana via /api/debts/bulk.
 */
export async function POST(request: Request) {
  try {
    await getRequiredHouseholdId();
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

    const form = await request.formData();
    const files = [...form.getAll("images"), ...form.getAll("image")].filter((item): item is File => item instanceof File);
    if (files.length === 0) return json({ error: "Envie ao menos uma imagem no campo images." }, { status: 400 });

    if (files.length > limits.maxImages) {
      return json({ error: `Envie no máximo ${limits.maxImages} imagens por leitura.` }, { status: 400 });
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

    const rawBase = String(form.get("baseMonth") ?? "");
    const baseMonth = /^\d{4}-\d{2}(-01)?$/.test(rawBase) ? rawBase : new Date().toISOString().slice(0, 7);

    const result = await readInvoiceScreens({ images, baseMonth });
    return json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof AiConfigError) return json({ error: error.message }, { status: 503 });
    if (error instanceof Error && error.name === "TimeoutError") {
      return json({ error: "A leitura do print demorou demais e foi cancelada. Tente novamente." }, { status: 504 });
    }
    // Erros do provedor de IA carregam detalhes internos (fragmento de chave,
    // org, quota) — loga no servidor e devolve mensagem genérica ao cliente.
    console.error("[statement-read] falha na leitura do print:", error);
    return json({ error: "Não foi possível ler o print agora. Tente novamente em instantes." }, { status: 502 });
  }
}
