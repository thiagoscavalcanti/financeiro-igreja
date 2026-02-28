"use client";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export default function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={[
        "w-full border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2",
        "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100",
        "outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700",
        className,
      ].join(" ")}
      {...props}
    />
  );
}