import type { PositionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

let aiExtractedReady = false;

/**
 * Proveniência gravada no PUT de posições. "ai_extracted" (saldo lido de print
 * e salvo pelo botão humano sem mudar o valor) só existe no banco depois da
 * migration 0003 — e migrations não rodam sozinhas no deploy da Vercel. Se o
 * código chegar antes da migration, gravar esse valor derrubaria o "Salvar e
 * revisar"; então, sem o valor no enum do banco, o saldo vai como "manual":
 * perde-se só a etiqueta, nunca o saldo. O "sim" fica em cache; o "não" é
 * conferido de novo a cada gravação, até a migration ser aplicada.
 */
export async function positionSourceForWrite(requested: "manual" | "ai_extracted" | undefined): Promise<PositionSource> {
  if (requested !== "ai_extracted") return "manual";
  if (aiExtractedReady) return "ai_extracted";
  try {
    const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'PositionSource' AND e.enumlabel = 'ai_extracted'
      ) AS ready`;
    aiExtractedReady = rows[0]?.ready === true;
  } catch {
    aiExtractedReady = false;
  }
  if (!aiExtractedReady) {
    console.warn("[positions] migration 0003_position_source_ai_extracted pendente: saldo lido de print gravado como manual.");
  }
  return aiExtractedReady ? "ai_extracted" : "manual";
}
