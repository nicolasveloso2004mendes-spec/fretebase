import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fretebase | Gestão de fretes", template: "%s | Fretebase" },
  description: "Simule o custo do frete, envie propostas e acompanhe viagens e recebimentos da sua transportadora.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#14301f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
