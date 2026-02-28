"use client";

import * as React from "react";
import { ui } from "@/lib/ui";

type Variant = "primary" | "ghost" | "danger";
type Size = "sm" | "md";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export default function Button({
  variant = "ghost",
  size = "md",
  className = "",
  disabled,
  type = "button",
  ...props
}: Props) {
  const sizeCls =
    size === "sm"
      ? "px-2.5 py-1.5 rounded-lg text-xs"
      : "px-3 py-2 rounded-xl text-sm";

  // Base: foco + borda + transição
  // ✅ Força ícones SVG a seguirem a cor do texto do botão (evita ícone invisível)
  const base =
    "inline-flex items-center justify-center gap-2 border transition-colors " +
    "focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 " +
    "[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 " +
    "[&>svg]:!text-current [&>svg]:!stroke-current";

  // Variants (estado normal)
  // ✅ Usa !important na cor do texto para não ser sobrescrita por CSS global
  const variants: Record<Variant, string> = {
    ghost:
      "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 " +
      "text-slate-900 dark:text-slate-100 " +
      "hover:bg-slate-50 dark:hover:bg-slate-800",
    primary:
      "border-transparent bg-slate-900 !text-white hover:bg-slate-800 " +
      "dark:bg-slate-100 dark:!text-slate-900 dark:hover:bg-white",
    danger:
      "border-transparent bg-red-600 !text-white hover:bg-red-700 " +
      "dark:bg-red-500 dark:!text-white dark:hover:bg-red-400",
  };

  // ✅ Disabled com contraste bom (sem opacity)
  const disabledCls =
    "cursor-not-allowed " +
    "bg-slate-200 text-slate-600 border-slate-200 " +
    "dark:bg-slate-800 dark:text-slate-300 dark:border-slate-800 " +
    "hover:bg-slate-200 dark:hover:bg-slate-800";

  const cls = [
    base,
    sizeCls,
    disabled ? disabledCls : variants[variant],
    className,
  ].join(" ");

  return <button type={type} disabled={disabled} className={cls} {...props} />;
}