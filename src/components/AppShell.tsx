"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useIsAdmin } from "@/lib/useIsAdmin";

import Button from "@/components/ui/Button";
import { ui } from "@/lib/ui";

type ThemeMode = "system" | "light" | "dark";
const THEME_KEY = "fi_theme_mode";

function getSystemPrefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = useIsAdmin();

  const [themeMode, setThemeMode] = useState<ThemeMode>("dark"); // default escuro

  function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;
    const effectiveDark =
      mode === "dark" ? true : mode === "light" ? false : getSystemPrefersDark();
    root.classList.toggle("dark", effectiveDark);
  }

  useEffect(() => {
    try {
      const saved = (localStorage.getItem(THEME_KEY) as ThemeMode) || "dark";
      const mode: ThemeMode =
        saved === "light" || saved === "dark" || saved === "system"
          ? saved
          : "dark";

      setThemeMode(mode);
      applyTheme(mode);

      if (!localStorage.getItem(THEME_KEY)) {
        localStorage.setItem(THEME_KEY, mode);
      }
    } catch {
      setThemeMode("dark");
      applyTheme("dark");
    }

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;

    const handler = () => {
      if ((localStorage.getItem(THEME_KEY) as ThemeMode) === "system") {
        applyTheme("system");
      }
    };

    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  function setMode(mode: ThemeMode) {
    setThemeMode(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {}
    applyTheme(mode);
  }

  const themeLabel = useMemo(() => {
    if (themeMode === "system") return "Tema: Sistema";
    if (themeMode === "light") return "Tema: Claro";
    return "Tema: Escuro";
  }, [themeMode]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active =
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(href + "/");

    return (
      <Link
        href={href}
        className={[
          "px-3 py-2 rounded-xl text-sm border transition-colors",
          active
            ? "bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200 " +
              "dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
            : "bg-transparent text-slate-700 border-transparent hover:bg-slate-100 hover:border-slate-200 " +
              "dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:border-slate-800",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  const ThemeButton = ({ value, label }: { value: ThemeMode; label: string }) => {
    const active = themeMode === value;

    return (
      <button
        type="button"
        onClick={() => setMode(value)}
        className={[
          "px-2.5 py-1.5 text-xs rounded-lg border transition-colors",
          active
            ? "bg-slate-100 text-slate-900 border-slate-200 " +
              "dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
            : "bg-transparent text-slate-700 border-transparent hover:bg-slate-100 hover:border-slate-200 " +
              "dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:border-slate-800",
        ].join(" ")}
        aria-label={`Tema: ${label}`}
        title={`Tema: ${label}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200 dark:bg-slate-950/80 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Branding (cruz sutil + IPRA) */}
          <Link href="/" className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
              <div className="relative w-4 h-4">
                {/* Cruz vertical */}
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[2px] h-full bg-white dark:bg-slate-200 rounded-sm" />
                {/* Cruz horizontal (um pouco acima do meio) */}
                <div className="absolute top-1/3 left-0 w-full h-[2px] bg-white dark:bg-slate-200 rounded-sm" />
              </div>
            </div>

            <div className="leading-tight">
              <div className="font-semibold tracking-wide">IPRA</div>
              <div className={`text-xs ${ui.muted}`}>Tesouraria</div>
            </div>
          </Link>

          <nav className="flex items-center gap-2 flex-wrap">
            <NavLink href="/" label="Início" />
            <NavLink href="/lancamentos" label="Lançamentos" />
            {isAdmin && <NavLink href="/lancamentos/novo" label="Novo" />}
            <NavLink href="/relatorios" label="Relatórios" />
            {isAdmin && <NavLink href="/admin" label="Admin" />}

            {/* Tema */}
            <div
              className={[
                "flex items-center gap-1 p-1 rounded-xl border",
                "bg-white/70 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800",
              ].join(" ")}
              aria-label="Seletor de tema"
              title={themeLabel}
            >
              <ThemeButton value="system" label="Auto" />
              <ThemeButton value="light" label="Claro" />
              <ThemeButton value="dark" label="Escuro" />
            </div>

            <Button variant="danger" onClick={logout} type="button">
              Sair
            </Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}