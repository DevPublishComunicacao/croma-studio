import type { Metadata } from "next";
import { GlobalLoadingProvider } from "@/components/GlobalLoadingProvider";
import { HeaderNav } from "@/components/HeaderNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Croma Studio — Análise de Cores Gráficas",
  description:
    "Analise as cores predominantes de artes gráficas, com conversão CMYK por perfil ICC, exportação em PDF, CSV, JSON e paleta PNG. Processamento 100% local no navegador.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        suppressHydrationWarning
        className="flex min-h-dvh flex-col bg-slate-100 text-slate-900 antialiased"
      >
        <GlobalLoadingProvider>
          <HeaderNav />

          {children}

          <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-center text-xs text-slate-400 sm:flex-row sm:px-6 sm:text-left lg:px-8">
            <p>
               Croma Studio · Ferramenta para gráficas e designers. A análise acontece no seu
               navegador; os registros podem ser salvos no PostgreSQL configurado.
            </p>
            <p>
              Cores para impressão devem ser validadas com o perfil ICC indicado pela gráfica.
            </p>
          </div>
          </footer>
        </GlobalLoadingProvider>
      </body>
    </html>
  );
}
