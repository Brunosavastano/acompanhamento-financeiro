"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError(result.error === "CredentialsSignin" ? "Credenciais inválidas." : "Falha ao autenticar. Verifique se o banco local está ativo.");
      return;
    }
    window.location.href = "/welcome";
  }

  const inputClassName =
    "mt-2 block w-full rounded-[10px] border border-edge bg-surface px-3.5 py-3 text-sm text-snow placeholder:text-faint focus:border-gold focus:outline-none";

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
      <label className="block text-xs font-semibold tracking-[0.06em] text-muted">
        E-MAIL
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClassName}
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          required
        />
      </label>
      <label className="block text-xs font-semibold tracking-[0.06em] text-muted">
        SENHA
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClassName}
          type="password"
          placeholder="Sua senha"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p className="text-[13px] text-negative-text">{error}</p> : null}
      <button
        disabled={loading}
        className="focus-ring mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-gold py-[13px] text-sm font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
