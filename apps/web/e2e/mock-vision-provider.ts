import http from "node:http";

export type MockVisionCall = { model: unknown; imageCount: number; texts: string[] };

type InputPart = { type?: unknown; text?: unknown };

/**
 * Provedor de visão SIMULADO para o E2E: responde como a API Responses da
 * OpenAI (POST /v1/responses) com uma saída estruturada fixa. O app em teste
 * aponta para ele com OPENAI_BASE_URL, então o caminho real (rota → AI SDK →
 * HTTP → parser → casamento) roda inteiro, sem chave de verdade e sem internet.
 */
export async function startMockVisionProvider(port: number, output: unknown) {
  const calls: MockVisionCall[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.method !== "POST" || !request.url?.endsWith("/responses")) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Rota não simulada.", type: "invalid_request_error", code: "not_found" } }));
        return;
      }
      let body: { model?: unknown; input?: Array<{ content?: unknown }> } | null = null;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        body = null;
      }
      const parts = (body?.input ?? []).flatMap((message) => (Array.isArray(message?.content) ? (message.content as InputPart[]) : []));
      calls.push({
        model: body?.model,
        imageCount: parts.filter((part) => part.type === "input_image").length,
        texts: parts.filter((part) => part.type === "input_text").map((part) => String(part.text)),
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: `resp_e2e_${calls.length}`,
          created_at: Math.floor(Date.now() / 1000),
          model: typeof body?.model === "string" ? body.model : "e2e-vision",
          output: [
            {
              type: "message",
              role: "assistant",
              id: `msg_e2e_${calls.length}`,
              content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
