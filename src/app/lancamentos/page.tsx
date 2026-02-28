// src/app/lancamentos/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import type { Transaction } from "@/lib/types";
import { useIsAdmin } from "@/lib/useIsAdmin";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";
import { ui } from "@/lib/ui";

type ViewMode = "today" | "next5" | "last5" | "month" | "range";

type AccountRow = { id: string; name: string; active: boolean };
type AccountBalance = { account_id: string; name: string; balance: number };

function toMonthStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return {
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthFromISO(iso: string) {
  return iso.slice(0, 7);
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateBR(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function groupByDate(txs: Transaction[]) {
  const map = new Map<string, Transaction[]>();
  for (const t of txs) {
    const arr = map.get(t.date) ?? [];
    arr.push(t);
    map.set(t.date, arr);
  }
  const dates = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  return { map, dates };
}

function isExecutedExpenseLike(kind: "income" | "expense", expense_status: any) {
  if (kind !== "expense") return false;
  return (expense_status ?? "executed") === "executed";
}

function isExecutedExpense(t: Transaction) {
  if (t.kind !== "expense") return false;
  return (t.expense_status ?? "executed") === "executed";
}

function isScheduledExpense(t: Transaction) {
  if (t.kind !== "expense") return false;
  return t.expense_status === "scheduled";
}

function Pill({
  variant,
  children,
}: {
  variant: "success" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    variant === "success"
      ? ui.pillSuccess
      : variant === "warn"
      ? ui.pillWarn
      : ui.pill;

  return (
    <span
      className={[
        "inline-flex items-center rounded-lg px-2 py-0.5 text-xs border",
        cls,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function SegmentedGroup({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const items: Array<{ v: ViewMode; label: string }> = [
    { v: "today", label: "Hoje" },
    { v: "next5", label: "Próx. 5 dias" },
    { v: "last5", label: "Últ. 5 dias" },
    { v: "month", label: "Mês" },
    { v: "range", label: "Intervalo" },
  ];

  return (
    <div
      className={[
        "inline-flex items-center rounded-xl border overflow-hidden",
        "border-slate-200 dark:border-slate-800",
        "bg-white dark:bg-slate-900",
      ].join(" ")}
    >
      {items.map((it) => {
        const active = value === it.v;
        return (
          <button
            key={it.v}
            type="button"
            onClick={() => onChange(it.v)}
            className={[
              "px-3 py-2 text-sm transition-colors",
              active
                ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                : "bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800",
            ].join(" ")}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LancamentosPage() {
  const { isAdmin } = useIsAdmin();

  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [month, setMonth] = useState(toMonthStr());

  // Range (draft vs applied) — UX: só aplica quando clicar "Aplicar"
  const [rangeStartDraft, setRangeStartDraft] = useState(() =>
    addDaysISO(todayStr(), -4)
  );
  const [rangeEndDraft, setRangeEndDraft] = useState(() => todayStr());

  const [rangeStart, setRangeStart] = useState(() => addDaysISO(todayStr(), -4));
  const [rangeEnd, setRangeEnd] = useState(() => todayStr());

  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [carryIn, setCarryIn] = useState<number>(0);

  const [balancesLoading, setBalancesLoading] = useState(false);
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const periodLabel = useMemo(() => {
    if (viewMode === "today") {
      const t = todayStr();
      return `${fmtDateBR(t)} → ${fmtDateBR(t)}`;
    }
    if (viewMode === "next5") {
      const s = todayStr();
      const e = addDaysISO(s, 5);
      return `${fmtDateBR(s)} → ${fmtDateBR(e)}`;
    }
    if (viewMode === "last5") {
      const e = todayStr();
      const s = addDaysISO(e, -4);
      return `${fmtDateBR(s)} → ${fmtDateBR(e)}`;
    }
    if (viewMode === "month") {
      const r = monthRange(month);
      const endIncl = addDaysISO(r.endStr, -1);
      return `${fmtDateBR(r.startStr)} → ${fmtDateBR(endIncl)}`;
    }
    // range
    const s = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const e = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    return `${fmtDateBR(s)} → ${fmtDateBR(e)}`;
  }, [viewMode, month, rangeStart, rangeEnd]);

  const balancesMonth = useMemo(() => {
    if (viewMode === "month") return month;
    if (viewMode === "range") return monthFromISO(rangeEnd || todayStr());
    if (viewMode === "last5") return monthFromISO(todayStr());
    return toMonthStr(new Date());
  }, [viewMode, month, rangeEnd]);

  async function load() {
    setLoading(true);
    setError(null);

    let startStr = "";
    let endStr = ""; // exclusivo

    if (viewMode === "month") {
      const r = monthRange(month);
      startStr = r.startStr;
      endStr = r.endStr;
    } else if (viewMode === "today") {
      startStr = todayStr();
      endStr = addDaysISO(startStr, 1);
    } else if (viewMode === "next5") {
      startStr = todayStr();
      endStr = addDaysISO(startStr, 6);
    } else if (viewMode === "last5") {
      const endInclusive = todayStr();
      startStr = addDaysISO(endInclusive, -4);
      endStr = addDaysISO(endInclusive, 1);
    } else {
      const s = rangeStart || todayStr();
      const e = rangeEnd || s;
      const start = s <= e ? s : e;
      const end = s <= e ? e : s;
      startStr = start;
      endStr = addDaysISO(end, 1);
    }

    const [periodRes, carryRes] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          `
          id, date, kind, description, amount, payment_method,
          expense_status, executed_at,
          category_id, account_id,
          categories(name, kind),
          accounts(name),
          attachments(id, transaction_id, storage_path, external_url, original_name, mime_type, size_bytes)
        `
        )
        .gte("date", startStr)
        .lt("date", endStr)
        .order("date", { ascending: true }),

      supabase
        .from("transactions")
        .select("kind, amount, expense_status")
        .lt("date", startStr),
    ]);

    if (periodRes.error) {
      setError(periodRes.error.message);
      setTxs([]);
      setCarryIn(0);
      setLoading(false);
      return;
    }
    if (carryRes.error) {
      setError(carryRes.error.message);
      setTxs([]);
      setCarryIn(0);
      setLoading(false);
      return;
    }

    const carryRows = ((carryRes.data as any) ?? []) as Array<{
      kind: "income" | "expense";
      amount: number;
      expense_status: "scheduled" | "executed" | null;
    }>;

    let carry = 0;
    for (const r of carryRows) {
      if (r.kind === "income") carry += Number(r.amount);
      else if (isExecutedExpenseLike(r.kind, r.expense_status))
        carry -= Number(r.amount);
    }

    setCarryIn(carry);
    setTxs((periodRes.data as any) ?? []);
    setLoading(false);
  }

  async function loadAccountBalances() {
    setBalancesLoading(true);
    setBalancesError(null);

    const { endStr } = monthRange(balancesMonth);

    const [accRes, txRes] = await Promise.all([
      supabase.from("accounts").select("id,name,active").order("name"),
      supabase
        .from("transactions")
        .select("account_id, kind, amount, expense_status")
        .lt("date", endStr),
    ]);

    if (accRes.error) {
      setBalancesError(accRes.error.message);
      setBalancesLoading(false);
      return;
    }
    if (txRes.error) {
      setBalancesError(txRes.error.message);
      setBalancesLoading(false);
      return;
    }

    const accounts = ((accRes.data as any) ?? []) as AccountRow[];
    const allUntilEnd = ((txRes.data as any) ?? []) as Array<{
      account_id: string;
      kind: "income" | "expense";
      amount: number;
      expense_status: "scheduled" | "executed" | null;
    }>;

    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, 0);

    for (const t of allUntilEnd) {
      const current = map.get(t.account_id) ?? 0;

      if (t.kind === "income") {
        map.set(t.account_id, current + Number(t.amount));
      } else {
        const executed = (t.expense_status ?? "executed") === "executed";
        if (executed) map.set(t.account_id, current - Number(t.amount));
      }
    }

    const rows: AccountBalance[] = accounts.map((a) => ({
      account_id: a.id,
      name: a.name,
      balance: map.get(a.id) ?? 0,
    }));

    rows.sort((a, b) => a.name.localeCompare(b.name));
    setAccountBalances(rows);
    setBalancesLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, month, rangeStart, rangeEnd]);

  useEffect(() => {
    loadAccountBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balancesMonth]);

  const { map, dates } = useMemo(() => groupByDate(txs), [txs]);

  const summary = useMemo(() => {
    let income = 0;
    let expenseExecuted = 0;
    let expenseScheduled = 0;

    for (const t of txs) {
      if (t.kind === "income") income += Number(t.amount);
      else if (isExecutedExpense(t)) expenseExecuted += Number(t.amount);
      else expenseScheduled += Number(t.amount);
    }

    return {
      income,
      expenseExecuted,
      expenseScheduled,
      balance: carryIn + income - expenseExecuted,
    };
  }, [txs, carryIn]);

  const dailyTotals = useMemo(() => {
    const totals: Record<
      string,
      { inc: number; exp: number; prog: number; bal: number }
    > = {};
    let running = carryIn;

    for (const d of dates) {
      const list = map.get(d) ?? [];
      let inc = 0;
      let exp = 0;
      let prog = 0;

      for (const t of list) {
        if (t.kind === "income") inc += Number(t.amount);
        else if (isExecutedExpense(t)) exp += Number(t.amount);
        else prog += Number(t.amount);
      }

      running += inc - exp;
      totals[d] = { inc, exp, prog, bal: running };
    }

    return totals;
  }, [dates, map, carryIn]);

  async function openAttachment(storagePath: string) {
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(storagePath, 60 * 10);

    if (error) {
      alert("Erro ao gerar link do anexo: " + error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(id: string) {
    if (!isAdmin) return;
    const ok = confirm("Tem certeza que deseja excluir este lançamento?");
    if (!ok) return;

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    load();
    loadAccountBalances();
  }

  async function markExecuted(t: Transaction) {
    if (!isAdmin) return;
    if (t.kind !== "expense") return;

    const ok = confirm(
      `Marcar como EXECUTADA a saída:\n"${t.description}"\nValor: ${fmtBRL(
        Number(t.amount)
      )}?`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("transactions")
      .update({
        expense_status: "executed",
        executed_at: new Date().toISOString(),
      })
      .eq("id", t.id);

    if (error) {
      alert("Erro ao marcar como executada: " + error.message);
      return;
    }
    load();
    loadAccountBalances();
  }

  function applyRange() {
    // normaliza caso invertido
    const s = rangeStartDraft || todayStr();
    const e = rangeEndDraft || s;
    const start = s <= e ? s : e;
    const end = s <= e ? e : s;

    setRangeStart(start);
    setRangeEnd(end);
  }

  function resetRangeToDefault() {
    const end = todayStr();
    const start = addDaysISO(end, -4);
    setRangeStartDraft(start);
    setRangeEndDraft(end);
    setRangeStart(start);
    setRangeEnd(end);
  }

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([load(), loadAccountBalances()]);
    setRefreshing(false);
  }

  return (
    <AppShell>
      <div className={ui.pageText}>
        {/* HEADER */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                Lançamentos
              </h1>
              <p className={`text-sm ${ui.muted} mt-1`}>
                Período: <b className={ui.pageText}>{periodLabel}</b>. Saídas
                programadas só entram no saldo quando executadas.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <SegmentedGroup value={viewMode} onChange={setViewMode} />

              {viewMode === "month" && (
                <div className="flex items-center gap-2">
                  <label className={`text-sm ${ui.muted}`}>Mês:</label>
                  <Input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-[160px]"
                  />
                </div>
              )}

              {viewMode === "range" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className={`text-sm ${ui.muted}`}>De:</label>
                    <Input
                      type="date"
                      value={rangeStartDraft}
                      onChange={(e) => setRangeStartDraft(e.target.value)}
                      className="w-[160px]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className={`text-sm ${ui.muted}`}>Até:</label>
                    <Input
                      type="date"
                      value={rangeEndDraft}
                      onChange={(e) => setRangeEndDraft(e.target.value)}
                      className="w-[160px]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      type="button"
                      onClick={applyRange}
                      disabled={loading || refreshing}
                    >
                      Aplicar
                    </Button>

                    <Button
                      variant="ghost"
                      type="button"
                      onClick={resetRangeToDefault}
                      disabled={loading || refreshing}
                    >
                      Limpar
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        const t = todayStr();
                        setRangeStartDraft(t);
                        setRangeEndDraft(t);
                      }}
                    >
                      Hoje
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        const end = todayStr();
                        const start = addDaysISO(end, -29);
                        setRangeStartDraft(start);
                        setRangeEndDraft(end);
                      }}
                    >
                      Últ. 30 dias
                    </Button>
                  </div>
                </div>
              )}

              {isAdmin && (
                <Link href="/importar">
                  <Button variant="ghost" className="font-medium">
                    Importar
                  </Button>
                </Link>
              )}

              <Button
                variant="ghost"
                onClick={refreshAll}
                type="button"
                disabled={loading || refreshing}
              >
                {refreshing ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>Entradas (período)</div>
              <div className="text-xl font-semibold mt-1">
                {fmtBRL(summary.income)}
              </div>
            </Card>

            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>
                Saídas executadas (período)
              </div>
              <div className="text-xl font-semibold mt-1">
                {fmtBRL(summary.expenseExecuted)}
              </div>
            </Card>

            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>Saídas programadas</div>
              <div className="text-xl font-semibold mt-1">
                {fmtBRL(summary.expenseScheduled)}
              </div>
            </Card>

            <Card className="p-4">
              <div className={`text-sm ${ui.muted}`}>Saldo (acumulado)</div>
              <div className="text-xl font-semibold mt-1">
                {fmtBRL(summary.balance)}
              </div>
              <div className={`mt-1 ${ui.hint}`}>
                Inclui saldo anterior: {fmtBRL(carryIn)}
              </div>
            </Card>
          </div>

          {/* BALANCES */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold">Saldo por conta</div>
                <div className={`text-xs ${ui.muted} mt-1`}>
                  Acumulado até: <b>{balancesMonth}</b> (entradas − saídas
                  executadas)
                </div>
              </div>

              <Button
                variant="ghost"
                onClick={loadAccountBalances}
                disabled={balancesLoading}
                type="button"
              >
                {balancesLoading ? "Atualizando…" : "Atualizar saldos"}
              </Button>
            </div>

            {balancesError && (
              <div className="mt-3">
                <Alert variant="danger">{balancesError}</Alert>
              </div>
            )}

            {balancesLoading ? (
              <div className={`mt-3 text-sm ${ui.muted}`}>Calculando saldos…</div>
            ) : accountBalances.length === 0 ? (
              <div className={`mt-3 text-sm ${ui.muted}`}>
                Nenhuma conta encontrada.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {accountBalances.map((b) => (
                  <Link
                    key={b.account_id}
                    href={`/contas/${b.account_id}`}
                    className="block"
                  >
                    <Card
                      variant="soft"
                      hover
                      className="p-4 cursor-pointer"
                      role="link"
                      aria-label={`Ver lançamentos da conta ${b.name}`}
                    >
                      <div className={`text-sm ${ui.muted}`}>{b.name}</div>
                      <div className="text-lg font-semibold mt-1">
                        {fmtBRL(b.balance)}
                      </div>
                      <div className={`mt-1 ${ui.hint}`}>
                        Ver lançamentos executados
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* CONTENT */}
        {error && (
          <div className="mt-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        {loading ? (
          <div className={`mt-6 text-sm ${ui.muted}`}>
            Carregando lançamentos…
          </div>
        ) : dates.length === 0 ? (
          <div className={`mt-6 text-sm ${ui.muted}`}>
            Nenhum lançamento no período.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {dates.map((d) => {
              const list = map.get(d) ?? [];
              const incomes = list.filter((t) => t.kind === "income");
              const expenses = list.filter((t) => t.kind === "expense");
              const totals = dailyTotals[d];

              return (
                <Card key={d} className="p-0">
                  <div
                    className={[
                      "px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2",
                      ui.separator,
                    ].join(" ")}
                  >
                    <div className="font-semibold">
                      {new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>

                    <div className="text-sm flex flex-wrap gap-3">
                      <span className={ui.muted}>
                        Entradas:{" "}
                        <b className={ui.pageText}>{fmtBRL(totals?.inc ?? 0)}</b>
                      </span>
                      <span className={ui.muted}>
                        Saídas (exec):{" "}
                        <b className={ui.pageText}>{fmtBRL(totals?.exp ?? 0)}</b>
                      </span>
                      <span className={ui.muted}>
                        Programadas:{" "}
                        <b className={ui.pageText}>{fmtBRL(totals?.prog ?? 0)}</b>
                      </span>
                      <span className={ui.muted}>
                        Saldo (acum):{" "}
                        <b className={ui.pageText}>
                          {fmtBRL(totals?.bal ?? carryIn)}
                        </b>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-4 p-4">
                    {/* ENTRADAS */}
                    <div className={`md:border-r ${ui.separator} md:pr-4`}>
                      <div className="font-semibold mb-2">Entradas</div>

                      {incomes.length === 0 ? (
                        <div className={`text-sm ${ui.muted}`}>Sem entradas.</div>
                      ) : (
                        <div className="space-y-2">
                          {incomes.map((t) => (
                            <Card key={t.id} variant="soft" className="p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {t.description}
                                  </div>
                                  <div className={`text-xs ${ui.muted} mt-1`}>
                                    {t.categories?.name ?? "—"} •{" "}
                                    {t.accounts?.name ?? "—"}
                                    {t.payment_method ? ` • ${t.payment_method}` : ""}
                                  </div>

                                  {isAdmin && (
                                    <div className="mt-3 flex gap-2 flex-wrap">
                                      <a href={`/lancamentos/${t.id}/editar`}>
                                        <Button size="sm" variant="ghost" type="button">
                                          Editar
                                        </Button>
                                      </a>
                                      <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => handleDelete(t.id)}
                                        type="button"
                                      >
                                        Excluir
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                <div className="text-sm font-semibold whitespace-nowrap">
                                  {fmtBRL(Number(t.amount))}
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* SAÍDAS */}
                    <div className="md:pl-4 mt-4 md:mt-0">
                      <div className="font-semibold mb-2">Saídas</div>

                      {expenses.length === 0 ? (
                        <div className={`text-sm ${ui.muted}`}>Sem saídas.</div>
                      ) : (
                        <div className="space-y-2">
                          {expenses.map((t) => {
                            const atts = t.attachments ?? [];
                            const scheduled = isScheduledExpense(t);

                            return (
                              <Card key={t.id} variant="soft" className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                      {t.description}
                                    </div>

                                    <div
                                      className={[
                                        "text-xs mt-1 flex flex-wrap items-center gap-2",
                                        ui.muted,
                                      ].join(" ")}
                                    >
                                      <span>
                                        {t.categories?.name ?? "—"} •{" "}
                                        {t.accounts?.name ?? "—"}
                                        {t.payment_method ? ` • ${t.payment_method}` : ""}
                                      </span>

                                      {scheduled ? (
                                        <Pill variant="warn">PROGRAMADA</Pill>
                                      ) : (
                                        <Pill variant="success">EXECUTADA</Pill>
                                      )}
                                    </div>

                                    {atts.length > 0 && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {atts.map((a) => {
                                          if (a.external_url) {
                                            return (
                                              <a
                                                key={a.id}
                                                href={a.external_url}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                <Button size="sm" variant="ghost" type="button">
                                                  {a.original_name}
                                                </Button>
                                              </a>
                                            );
                                          }
                                          if (a.storage_path) {
                                            return (
                                              <Button
                                                key={a.id}
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                  openAttachment(a.storage_path!)
                                                }
                                                type="button"
                                              >
                                                Ver: {a.original_name}
                                              </Button>
                                            );
                                          }
                                          return null;
                                        })}
                                      </div>
                                    )}

                                    {isAdmin && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <a href={`/lancamentos/${t.id}/editar`}>
                                          <Button size="sm" variant="ghost" type="button">
                                            Editar
                                          </Button>
                                        </a>

                                        <Button
                                          size="sm"
                                          variant="danger"
                                          onClick={() => handleDelete(t.id)}
                                          type="button"
                                        >
                                          Excluir
                                        </Button>

                                        {scheduled && (
                                          <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => markExecuted(t)}
                                            type="button"
                                          >
                                            Marcar como executada
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-sm font-semibold whitespace-nowrap">
                                    {fmtBRL(Number(t.amount))}
                                  </div>
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}