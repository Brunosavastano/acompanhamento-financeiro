import type { Metadata } from "next";
import { IBM_Plex_Sans, Marcellus } from "next/font/google";
import "./globals.css";

const marcellus = Marcellus({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marcellus",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Acompanhamento Financeiro",
  description: "Fechamento financeiro familiar mensal",
  icons: {
    icon: "/savastano-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${marcellus.variable} ${plexSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
