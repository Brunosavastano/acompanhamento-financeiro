import { ZodError } from "zod";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof Response) return error;
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: error.issues[0]?.message ?? "Payload invalido.",
        issues: error.issues,
      },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : "Erro inesperado";
  return Response.json({ error: message }, { status: 500 });
}
