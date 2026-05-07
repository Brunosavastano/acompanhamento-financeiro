"use client";

import { useState } from "react";
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

  return (
    <form onSubmit={submit} className="w-full rounded-lg border border-line/80 bg-panel/70 p-6 text-left shadow-glow backdrop-blur">
      <h2 className="text-xl font-semibold text-white">Entrar</h2>
      <label className="mt-6 block text-sm font-medium text-slate-300">
        E-mail
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="focus-ring mt-2 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          required
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-slate-300">
        Senha
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="focus-ring mt-2 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
          type="password"
          placeholder="Sua senha"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p className="mt-4 text-sm text-magenta">{error}</p> : null}
      <button
        disabled={loading}
        className="focus-ring mt-6 w-full rounded-md bg-cyan px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
