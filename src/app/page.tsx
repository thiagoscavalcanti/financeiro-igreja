// src/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useIsAdmin } from "@/lib/useIsAdmin";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import { ui } from "@/lib/ui";

// Recharts
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type AccountRow = { id: string; name: string; active: boolean };

type TxRow = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "income" | "expense";
  amount: number;
  expense_status: "scheduled" | "executed" | null;
  account_id: string | null;
};

type AccountBalance = { account_id: string; name: string; balance: number };

type MonthRow = {
  key: string; // YYYY-MM
  label: string; // "fev/26"
  income: number;
  expenseExecuted: number;
  expenseScheduled: number;
  // para o dashboard: saídas = exec + prog (você pediu)
  expenseAll: number;
  net: number; // income - exec (saldo “contábil”)
};

function fmtBRL(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function isExecutedExpenseLike(kind: "income" | "expense", expense_status: any) {
  if (kind !== "expense") return false;
  return (expense_status ?? "executed") === "executed";
}

function toMonthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function monthStartISO(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toISOString().slice(0, 10);
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

/**
 * Tooltip do Recharts: tipagem muda entre versões.
 * Para evitar quebra no build, tipamos manualmente com um tipo seguro.
 */
type TooltipItem = {
  name?: string;
  value?: number | string;
  dataKey?: string;
  color?: string;
};
type CustomTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: TooltipItem[];
  colors: { income: string; expense: string };
};

function CustomTooltip({ active, payload, label, colors }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const getVal = (key: string) => {
    const it = payload.find((p) => p.dataKey === key);
    const v = it?.value;
    const n = typeof v === "string" ? Number(v) : Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const inc = getVal("income");
  const exp = getVal("expenseAll");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="font-semibold">{label}</div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded"
              style={{ background: colors.income }}
            />
            <span className={ui.muted}>Entradas</span>
          </div>
          <span className="font-medium">{fmtBRL(inc)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded"
              style={{ background: colors.expense }}
            />
            <span className={ui.muted}>Saídas</span>
          </div>
          <span className="font-medium">{fmtBRL(exp)}</span>
        </div>

        <div className={`pt-2 mt-2 border-t ${ui.separator}`}>
          <div className="flex items-center justify-between gap-3">
            <span className={ui.muted}>Resultado</span>
            <span className="font-semibold">{fmtBRL(inc - exp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isAdmin } = useIsAdmin();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);

  // período do gráfico (meses)
  const [monthsBack, setMonthsBack] = useState<number>(12);

  const colors = useMemo(
    () => ({
      income: "#2563eb", // azul
      expense: "#dc2626", // vermelho
    }),
    []
  );

  async function loadAll() {
    setLoading(true);
    setError(null);

    const today = new Date();
    const startMonth = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1);
    const startISO = startMonth.toISOString().slice(0, 10);
    const endISO = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10);

    const [accRes, txRes, txAllRes] = await Promise.all([
      supabase.from("accounts").select("id,name,active").order("name"),
      supabase
        .from("transactions")
        .select("id,date,kind,amount,expense_status,account_id")
        .gte("date", startISO)
        .lt("date", endISO)
        .order("date", { ascending: true }),
      supabase
        .from("transactions")
        .select("account_id,kind,amount,expense_status")
        .lt("date", endISO),
    ]);

    if (accRes.error) {
      setError(accRes.error.message);
      setAccounts([]);
      setTxs([]);
      setAccountBalances([]);
      setLoading(false);
      return;
    }
    if (txRes.error) {
      setError(txRes.error.message);
      setAccounts((accRes.data as any) ?? []);
      setTxs([]);
      setAccountBalances([]);
      setLoading(false);
      return;
    }
    if (txAllRes.error) {
      setError(txAllRes.error.message);
      setAccounts((accRes.data as any) ?? []);
      setTxs((txRes.data as any) ?? []);
      setAccountBalances([]);
      setLoading(false);
      return;
    }

    const accRows = ((accRes.data as any) ?? []) as AccountRow[];
    const txRows = ((txRes.data as any) ?? []) as TxRow[];

    const allUntilEnd = ((txAllRes.data as any) ?? []) as Array<{
      account_id: string;
      kind: "income" | "expense";
      amount: number;
      expense_status: "scheduled" | "executed" | null;
    }>;

    const map = new Map<string, number>();
    for (const a of accRows) map.set(a.id, 0);

    for (const t of allUntilEnd) {
      const current = map.get(t.account_id) ?? 0;

      if (t.kind === "income") {
        map.set(t.account_id, current + Number(t.amount));
      } else {
        const executed = (t.expense_status ?? "executed") === "executed";
        if (executed) map.set(t.account_id, current - Number(t.amount));
      }
    }

    const balances: AccountBalance[] = accRows.map((a) => ({
      account_id: a.id,
      name: a.name,
      balance: map.get(a.id) ?? 0,
    }));

    balances.sort((a, b) => a.name.localeCompare(b.name));

    setAccounts(accRows);
    setTxs(txRows);
    setAccountBalances(balances);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack]);

  const monthly = useMemo<MonthRow[]>(() => {
    const now = new Date();
    const keys: { key: string; date: Date }[] = [];

    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -i);
      keys.push({ key: toMonthKey(d), date: d });
    }

    const map = new Map<string, MonthRow>();
    for (const k of keys) {
      map.set(k.key, {
        key: k.key,
        label: monthLabel(k.date),
        income: 0,
        expenseExecuted: 0,
        expenseScheduled: 0,
        expenseAll: 0,
        net: 0,
      });
    }

    for (const t of txs) {
      const d = new Date(t.date + "T00:00:00");
      if (isNaN(d.getTime())) continue;

      const k = toMonthKey(new Date(d.getFullYear(), d.getMonth(), 1));
      const row = map.get(k);
      if (!row) continue;

      if (t.kind === "income") {
        row.income += Number(t.amount);
      } else {
        const executed = (t.expense_status ?? "executed") === "executed";
        if (executed) row.expenseExecuted += Number(t.amount);
        else row.expenseScheduled += Number(t.amount);
      }

      row.expenseAll = row.expenseExecuted + row.expenseScheduled;
      row.net = row.income - row.expenseExecuted;
      map.set(k, row);
    }

    return keys.map((k) => map.get(k.key)!).map((r) => ({
      ...r,
      expenseAll: r.expenseExecuted + r.expenseScheduled,
      net: r.income - r.expenseExecuted,
    }));
  }, [txs, monthsBack]);

  const kpis = useMemo(() => {
    const last = monthly.at(-1);
    const totalBalance = accountBalances.reduce((s, a) => s + Number(a.balance), 0);

    return {
      totalBalance,
      incomeMonth: last?.income ?? 0,
      expenseMonthAll: last?.expenseAll ?? 0,
      netMonthAll: (last?.income ?? 0) - (last?.expenseAll ?? 0),
    };
  }, [monthly, accountBalances]);

  const chartData = useMemo(() => {
    return monthly.map((m) => ({
      label: m.label,
      income: m.income,
      expenseAll: m.expenseAll,
    }));
  }, [monthly]);

  return (
    <AppShell>
      <div className={ui.pageText}>
        {/* HEADER */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className={`text-sm ${ui.muted} mt-1`}>
                Visão geral com saldos por conta e fluxo mensal (Entradas vs Saídas).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${ui.muted}`}>Período:</span>
                <select
                  className={`w-[150px] ${ui.input}`}
                  value={String(monthsBack)}
                  onChange={(e) => setMonthsBack(Number(e.target.value))}
                >
                  <option value="6">6 meses</option>
                  <option value="12">12 meses</option>
                  <option value="18">18 meses</option>
                  <option value="24">24 meses</option>
                </select>
              </div>

              {isAdmin && (
                <Link href="/importar">
                  <Button variant="ghost" className="font-medium">
                    Importar
                  </Button>
                </Link>
              )}

              <Button variant="ghost" onClick={loadAll} type="button">
                Atualizar
              </Button>
            </div>
          </div>

          {error && (
            <div>
              <Alert variant="danger">{error}</Alert>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>Saldo total</div>
              <div className="text-xl font-semibold mt-1">{fmtBRL(kpis.totalBalance)}</div>
              <div className={`mt-1 ${ui.hint}`}>Soma de todas as contas</div>
            </Card>

            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>Entradas (mês)</div>
              <div className="text-xl font-semibold mt-1">{fmtBRL(kpis.incomeMonth)}</div>
              <div className={`mt-1 ${ui.hint}`}>No mês atual</div>
            </Card>

            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>Saídas (mês)</div>
              <div className="text-xl font-semibold mt-1">{fmtBRL(kpis.expenseMonthAll)}</div>
              <div className={`mt-1 ${ui.hint}`}>Executadas + Programadas</div>
            </Card>

            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>Resultado (mês)</div>
              <div className="text-xl font-semibold mt-1">{fmtBRL(kpis.netMonthAll)}</div>
              <div className={`mt-1 ${ui.hint}`}>Entradas − (exec + prog)</div>
            </Card>
          </div>

          {/* GRÁFICO (Recharts) */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold">Fluxo mensal</div>
                <div className={`text-xs ${ui.muted} mt-1`}>
                  Últimos {monthsBack} meses • Entradas (azul) • Saídas (vermelho)
                </div>
              </div>

              <div className={`text-xs ${ui.muted}`}>
                Referência início: <b>{monthStartISO(monthly[0]?.key ?? toMonthKey(new Date()))}</b>
              </div>
            </div>

            {loading ? (
              <div className={`mt-3 text-sm ${ui.muted}`}>Carregando…</div>
            ) : (
              <div className="mt-4 h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => (Number(v) === 0 ? "0" : "")} />
                    <Tooltip
                      content={
                        <CustomTooltip
                          colors={colors}
                        />
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="income"
                      name="Entradas"
                      stroke={colors.income}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expenseAll"
                      name="Saídas"
                      stroke={colors.expense}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* SALDOS POR CONTA */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold">Saldo por conta</div>
                <div className={`text-xs ${ui.muted} mt-1`}>
                  Acumulado (entradas − saídas executadas)
                </div>
              </div>

              <Button variant="ghost" onClick={loadAll} disabled={loading} type="button">
                {loading ? "Atualizando…" : "Atualizar saldos"}
              </Button>
            </div>

            {loading ? (
              <div className={`mt-3 text-sm ${ui.muted}`}>Calculando saldos…</div>
            ) : accountBalances.length === 0 ? (
              <div className={`mt-3 text-sm ${ui.muted}`}>Nenhuma conta encontrada.</div>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {accountBalances.map((b) => (
                  <Link key={b.account_id} href={`/contas/${b.account_id}`} className="block">
                    <Card
                      variant="soft"
                      hover
                      className="p-4 cursor-pointer"
                      role="link"
                      aria-label={`Ver lançamentos da conta ${b.name}`}
                    >
                      <div className={`text-sm ${ui.muted}`}>{b.name}</div>
                      <div className="text-lg font-semibold mt-1">{fmtBRL(b.balance)}</div>
                      <div className={`mt-1 ${ui.hint}`}>Abrir detalhes da conta</div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}