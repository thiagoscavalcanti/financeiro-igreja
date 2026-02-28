import "./globals.css";
import AuthGuard from "@/components/AuthGuard";

export const metadata = {
  title: "Financeiro Igreja",
};

const THEME_KEY = "fi_theme_mode";

function ThemeInitScript() {
  // roda antes do React/hydration, evita "flash"
  const code = `
  (function () {
    try {
      var mode = localStorage.getItem("${THEME_KEY}") || "system";
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var isDark = mode === "dark" ? true : mode === "light" ? false : prefersDark;
      var root = document.documentElement;
      if (isDark) root.classList.add("dark");
      else root.classList.remove("dark");
    } catch (e) {}
  })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}