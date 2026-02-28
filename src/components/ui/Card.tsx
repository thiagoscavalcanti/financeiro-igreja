// src/components/ui/Card.tsx
"use client";

import type React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "soft";
  hover?: boolean;
};

export default function Card({
  variant = "default",
  hover = false,
  className = "",
  ...props
}: Props) {
  const base =
    variant === "soft"
      ? "bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl"
      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl";

  const fx = "shadow-sm transition-all";
  const hoverFx = hover
    ? "hover:shadow-md hover:-translate-y-[1px] hover:border-slate-300 dark:hover:border-slate-700"
    : "";

  return (
    <div className={[base, fx, hoverFx, className].join(" ")} {...props} />
  );
}