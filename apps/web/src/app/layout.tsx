import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acompanhamento Financeiro",
  description: "Fechamento financeiro familiar mensal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
