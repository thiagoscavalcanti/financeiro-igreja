// src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  TooltipProps,
} from "recharts";

import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useIsAdmin } from "@/lib/useIsAdmin";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import Select from "@/components/ui/Select";
import { ui } from "@/lib/ui";

type TxRow = {
  date: string;
  kind: "income" | "expense";
  amount: number;
  expense_status: "scheduled" | "executed" | null;
};

type MonthlyRow = { label: string; income: number; expense: number; net: number };

function fmtBRL(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtBRLCompact(v: number) {
  const n = Number(v ?? 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  const fmt1 = (x: number) =>
    x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  if (abs >= 1_000_000) return `${sign}R$ ${fmt1(abs / 1_000_000)}mi`;
  if (abs >= 1_000) return `${sign}R$ ${fmt1(abs / 1_000)}k`;
  return `${sign}R$ ${abs.toLocaleString("pt-BR")}`;
}

function toMonthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function pctChange(current: number, previous: number): number | null {
  const prev = Number(previous ?? 0);
  const cur = Number(current ?? 0);
  if (!Number.isFinite(prev) || !Number.isFinite(cur)) return null;
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function fmtPct(p: number | null) {
  if (p === null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function arrow(p: number | null) {
  if (p === null || !Number.isFinite(p)) return "•";
  if (p > 0.05) return "↑";
  if (p < -0.05) return "↓";
  return "→";
}

/**
 * DeltaPill:
 * - "goodWhenUp": true => subida é bom (Entradas, Resultado)
 * - "goodWhenUp": false => subida é ruim (Saídas)
 */
function DeltaPill({
  value,
  goodWhenUp,
}: {
  value: number | null;
  goodWhenUp: boolean;
}) {
  const txt = fmtPct(value);
  const a = arrow(value);

  let cls = ui.pill; // neutro
  if (value !== null) {
    const improving = goodWhenUp ? value > 0.05 : value < -0.05;
    const worsening = goodWhenUp ? value < -0.05 : value > 0.05;

    if (improving) cls = ui.pillSuccess;
    else if (worsening) cls = ui.pillWarn;
    else cls = ui.pill;
  }

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs border",
        cls,
      ].join(" ")}
      title="Variação vs período anterior"
    >
      <span className="font-semibold">{a}</span>
      <span>{txt}</span>
    </span>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  colors,
}: TooltipProps<number, string> & {
  colors: { income: string; expense: string; net: string };
}) {
  if (!active || !payload || payload.length === 0) return null;

  const get = (key: "income" | "expense" | "net") => {
    const item = payload.find((p) => p.dataKey === key);
    return Number(item?.value ?? 0);
  };

  const income = get("income");
  const expense = get("expense");
  const net = get("net");

  return (
    <div
      className={[
        "rounded-xl border shadow-sm px-3 py-2 text-sm",
        "bg-white border-slate-200",
        "dark:bg-slate-950 dark:border-slate-800",
      ].join(" ")}
    >
      <div className="font-semibold">{label}</div>

      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded"
              style={{ background: colors.income }}
            />
            <span className={ui.muted}>Entradas</span>
          </div>
          <div className="font-medium">{fmtBRL(income)}</div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded"
              style={{ background: colors.expense }}
            />
            <span className={ui.muted}>Saídas</span>
          </div>
          <div className="font-medium">{fmtBRL(expense)}</div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-200 dark:border-slate-800">
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-6 rounded"
              style={{ background: colors.net }}
            />
            <span className={ui.muted}>Resultado</span>
          </div>
          <div className="font-semibold">{fmtBRL(net)}</div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isAdmin } = useIsAdmin();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [monthsBack, setMonthsBack] = useState(12);

  // detectar dark mode (AppShell alterna a classe "dark" no <html>)
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const el = document.documentElement;

    const sync = () => setIsDark(el.classList.contains("dark"));
    sync();

    const obs = new MutationObserver(() => sync());
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });

    return () => obs.disconnect();
  }, []);

  const COLORS = useMemo(() => {
    return isDark
      ? {
          income: "#60A5FA", // blue-400
          expense: "#F87171", // red-400
          net: "#E2E8F0", // slate-200
        }
      : {
          income: "#2563EB", // blue-600
          expense: "#DC2626", // red-600
          net: "#0F172A", // slate-900
        };
  }, [isDark]);

  async function load() {
    setLoading(true);
    setError(null);

    const today = new Date();
    const totalMonths = monthsBack * 2;

    const startMonth = new Date(
      today.getFullYear(),
      today.getMonth() - (totalMonths - 1),
      1
    );
    const startISO = startMonth.toISOString().slice(0, 10);
    const endISO = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      .toISOString()
      .slice(0, 10);

    const { data, error } = await supabase
      .from("transactions")
      .select("date,kind,amount,expense_status")
      .gte("date", startISO)
      .lt("date", endISO)
      .order("date", { ascending: true });

    if (error) {
      setError(error.message);
      setTxs([]);
      setLoading(false);
      return;
    }

    setTxs((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack]);

  const allMonthly = useMemo<MonthlyRow[]>(() => {
    const now = new Date();
    const totalMonths = monthsBack * 2;

    const keys: { key: string; date: Date }[] = [];
    for (let i = totalMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push({ key: toMonthKey(d), date: d });
    }

    const map = new Map<string, MonthlyRow>();
    for (const k of keys) {
      map.set(k.key, {
        label: monthLabel(k.date),
        income: 0,
        expense: 0,
        net: 0,
      });
    }

    for (const t of txs) {
      const d = new Date(t.date + "T00:00:00");
      const k = toMonthKey(new Date(d.getFullYear(), d.getMonth(), 1));
      const row = map.get(k);
      if (!row) continue;

      if (t.kind === "income") row.income += Number(t.amount);
      else row.expense += Number(t.amount); // ✅ executadas + programadas

      row.net = row.income - row.expense;
      map.set(k, row);
    }

    return keys.map((k) => map.get(k.key)!);
  }, [txs, monthsBack]);

  const prevMonthly = useMemo(() => allMonthly.slice(0, monthsBack), [allMonthly, monthsBack]);
  const currMonthly = useMemo(() => allMonthly.slice(monthsBack), [allMonthly, monthsBack]);

  const totals = useMemo(() => {
    const sum = (arr: MonthlyRow[]) => ({
      income: arr.reduce((s, m) => s + m.income, 0),
      expense: arr.reduce((s, m) => s + m.expense, 0),
      net: arr.reduce((s, m) => s + m.net, 0),
    });

    const prev = sum(prevMonthly);
    const cur = sum(currMonthly);

    return {
      prev,
      cur,
      delta: {
        income: pctChange(cur.income, prev.income),
        expense: pctChange(cur.expense, prev.expense),
        net: pctChange(cur.net, prev.net),
      },
    };
  }, [prevMonthly, currMonthly]);

  const compareLabel = `vs período anterior (${monthsBack} ${
    monthsBack === 1 ? "mês" : "meses"
  })`;

  return (
    <AppShell>
      <div className={ui.pageText}>
        <div className="flex flex-col gap-4">
          {/* HEADER */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className={`text-sm ${ui.muted}`}>
                Fluxo mensal (Entradas vs Saídas) • {compareLabel}.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={String(monthsBack)}
                onChange={(e) => setMonthsBack(Number(e.target.value))}
              >
                <option value="6">Últimos 6 meses</option>
                <option value="12">Últimos 12 meses</option>
                <option value="24">Últimos 24 meses</option>
              </Select>

              {isAdmin && (
                <Link href="/importar">
                  <Button variant="ghost" className="font-medium">
                    Importar
                  </Button>
                </Link>
              )}

              <Button variant="ghost" onClick={load} type="button" disabled={loading}>
                {loading ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          {/* KPIs + DELTAS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className={`text-sm ${ui.muted}`}>Entradas (período)</div>
                <DeltaPill value={totals.delta.income} goodWhenUp />
              </div>
              <div className="text-xl font-semibold mt-1">{fmtBRL(totals.cur.income)}</div>
              <div className={`mt-1 ${ui.hint}`}>
                {compareLabel}: {fmtBRL(totals.prev.income)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className={`text-sm ${ui.muted}`}>Saídas (período)</div>
                <DeltaPill value={totals.delta.expense} goodWhenUp={false} />
              </div>
              <div className="text-xl font-semibold mt-1">{fmtBRL(totals.cur.expense)}</div>
              <div className={`mt-1 ${ui.hint}`}>
                {compareLabel}: {fmtBRL(totals.prev.expense)}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className={`text-sm ${ui.muted}`}>Resultado (período)</div>
                <DeltaPill value={totals.delta.net} goodWhenUp />
              </div>
              <div className="text-xl font-semibold mt-1">{fmtBRL(totals.cur.net)}</div>
              <div className={`mt-1 ${ui.hint}`}>
                {compareLabel}: {fmtBRL(totals.prev.net)}
              </div>
            </Card>
          </div>

          {/* GRÁFICO (somente período atual) */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold">Fluxo mensal (período atual)</div>

              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded"
                    style={{ background: COLORS.income }}
                  />
                  Entradas
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded"
                    style={{ background: COLORS.expense }}
                  />
                  Saídas
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-0.5 w-6 rounded"
                    style={{ background: COLORS.net }}
                  />
                  Resultado
                </span>
              </div>
            </div>

            {loading ? (
              <div className={`mt-4 text-sm ${ui.muted}`}>Carregando gráfico…</div>
            ) : (
              <div className="mt-4" style={{ width: "100%", height: 360 }}>
                <ResponsiveContainer>
                  <BarChart data={currMonthly} barCategoryGap={18} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => fmtBRLCompact(Number(v))} />
                    <Tooltip
                      content={(p) => <CustomTooltip {...p} colors={COLORS} />}
                    />

                    <Bar
                      dataKey="income"
                      name="Entradas"
                      fill={COLORS.income}
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="expense"
                      name="Saídas"
                      fill={COLORS.expense}
                      radius={[6, 6, 0, 0]}
                    />

                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Resultado"
                      stroke={COLORS.net}
                      strokeWidth={2}
                      dot={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}