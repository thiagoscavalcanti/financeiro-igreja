"use client";

type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "info" | "warn" | "danger";
};

export default function Alert({ variant = "info", className = "", ...props }: AlertProps) {
  const variants: Record<string, string> = {
    info: "bg-blue-50 text-blue-800 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/60",
    warn: "bg-yellow-50 text-yellow-900 border border-yellow-100 dark:bg-yellow-950/30 dark:text-yellow-200 dark:border-yellow-900/60",
    danger: "bg-red-50 text-red-700 border border-red-100 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/60",
  };

  return (
    <div className={`rounded-xl p-3 text-sm ${variants[variant]} ${className}`} {...props} />
  );
}