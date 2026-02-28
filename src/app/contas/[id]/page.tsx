// src/app/contas/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";

import { supabase } from "@/lib/supabaseClient";
import { ui } from "@/lib/ui";
import type { Transaction } from "@/lib/types";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toMonthStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1); // primeiro dia do próximo mês
  return {
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
  };
}

// endExclusive = endInclusive + 1 dia
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isExecutedOrIncome(t: Transaction) {
  if (t.kind === "income") return true;
  if (t.kind !== "expense") return false;
  return (t.expense_status ?? "executed") === "executed";
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

export default function ContaPage() {
  const params = useParams<{ id: string }>();
  const accountId = params.id;

  const defaultMonth = toMonthStr(new Date());
  const { startStr: mStart, endStr: mEndExclusive } = monthRange(defaultMonth);

  // filtro: de/até (até é inclusivo na UI)
  const [startDate, setStartDate] = useState<string>(mStart);
  const [endDate, setEndDate] = useState<string>(addDaysISO(mEndExclusive, -1)); // último dia do mês

  const [accountName, setAccountName] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ✅ saldo anterior ao período (carry-in)
  const [carryIn, setCarryIn] = useState<number>(0);

  async function load() {
    setLoading(true);
    setError(null);

    if (!startDate || !endDate) {
      setError("Informe o intervalo de datas.");
      setLoading(false);
      return;
    }
    if (startDate > endDate) {
      setError('Intervalo inválido: "De" não pode ser maior que "Até".');
      setLoading(false);
      return;
    }

    // end inclusive -> converte pra exclusivo
    const endExclusive = addDaysISO(endDate, 1);

    const [accRes, txRes, carryRes] = await Promise.all([
      supabase.from("accounts").select("id,name").eq("id", accountId).single(),

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
        .eq("account_id", accountId)
        .gte("date", startDate)
        .lt("date", endExclusive)
        .order("date", { ascending: true }),

      // ✅ carry: tudo antes do startDate (acumulado anterior)
      supabase
        .from("transactions")
        .select("kind, amount, expense_status")
        .eq("account_id", accountId)
        .lt("date", startDate),
    ]);

    if (accRes.error) {
      setError(accRes.error.message);
      setLoading(false);
      return;
    }
    setAccountName(accRes.data?.name ?? "");

    if (txRes.error) {
      setError(txRes.error.message);
      setTxs([]);
      setLoading(false);
      return;
    }

    if (carryRes.error) {
      setError(carryRes.error.message);
      setLoading(false);
      return;
    }

    // ✅ regra do usuário: mostrar somente executadas (e incomes)
    const onlyExecuted = (((txRes.data as any) ?? []) as Transaction[]).filter(
      isExecutedOrIncome
    );
    setTxs(onlyExecuted);

    // ✅ calcula saldo anterior (carry-in) considerando: income soma, expense só se executed
    const carryRows = ((carryRes.data as any) ?? []) as Array<{
      kind: "income" | "expense";
      amount: number;
      expense_status: "scheduled" | "executed" | null;
    }>;

    let carry = 0;
    for (const r of carryRows) {
      if (r.kind === "income") carry += Number(r.amount);
      else {
        const executed = (r.expense_status ?? "executed") === "executed";
        if (executed) carry -= Number(r.amount);
      }
    }
    setCarryIn(carry);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const { map, dates } = useMemo(() => groupByDate(txs), [txs]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const t of txs) {
      if (t.kind === "income") income += Number(t.amount);
      else expense += Number(t.amount); // aqui só chegam executadas
    }

    const balancePeriod = income - expense;
    const balanceAccum = carryIn + balancePeriod;

    return {
      income,
      expenseExecuted: expense,
      balancePeriod,
      balanceAccum,
    };
  }, [txs, carryIn]);

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

  return (
    <AppShell>
      <div className={ui.pageText}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className={`text-sm ${ui.muted}`}>
              <Link href="/lancamentos" className="underline underline-offset-4">
                ← Voltar
              </Link>
            </div>
            <h1 className="text-xl font-semibold">
              Conta: {accountName || "(carregando…)"}
            </h1>
            <p className={`text-sm ${ui.muted}`}>
              Mostrando somente <b>Entradas</b> e <b>Saídas Executadas</b>.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className={`text-xs ${ui.muted}`}>De</div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div>
              <div className={`text-xs ${ui.muted}`}>Até</div>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[160px]"
              />
            </div>

            <Button
              variant="ghost"
              type="button"
              onClick={load}
              disabled={loading || !startDate || !endDate}
            >
              {loading ? "Atualizando…" : "Aplicar filtro"}
            </Button>

            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                const m = toMonthStr(new Date());
                const r = monthRange(m);
                setStartDate(r.startStr);
                setEndDate(addDaysISO(r.endStr, -1));
                // opcional: já aplicar
                setTimeout(load, 0);
              }}
            >
              Mês atual
            </Button>

            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                const t = todayISO();
                setStartDate(t);
                setEndDate(t);
                setTimeout(load, 0);
              }}
            >
              Hoje
            </Button>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Entradas (período)</div>
            <div className="text-xl font-semibold">{fmtBRL(summary.income)}</div>
          </Card>

          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Saídas executadas (período)</div>
            <div className="text-xl font-semibold">
              {fmtBRL(summary.expenseExecuted)}
            </div>
          </Card>

          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Saldo (período)</div>
            <div className="text-xl font-semibold">{fmtBRL(summary.balancePeriod)}</div>
            <div className={ui.hint}>
              Antes do período: {fmtBRL(carryIn)}
            </div>
          </Card>

          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Saldo (acumulado)</div>
            <div className="text-xl font-semibold">{fmtBRL(summary.balanceAccum)}</div>
            <div className={ui.hint}>
              Acumulado = anterior + período
            </div>
          </Card>
        </div>

        {error && (
          <div className="mt-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        {loading ? (
          <div className={`mt-6 text-sm ${ui.muted}`}>Carregando…</div>
        ) : dates.length === 0 ? (
          <div className={`mt-6 text-sm ${ui.muted}`}>
            Nenhum lançamento executado/entrada no período.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {dates.map((d) => {
              const list = map.get(d) ?? [];
              const incomes = list.filter((t) => t.kind === "income");
              const expenses = list.filter((t) => t.kind === "expense"); // aqui só executadas

              return (
                <Card key={d} className="p-0">
                  <div
                    className={[
                      "px-4 py-3 border-b flex items-center justify-between gap-2",
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
                    <div className={`text-xs ${ui.muted}`}>
                      {incomes.length} entrada(s) • {expenses.length} saída(s) executada(s)
                    </div>
                  </div>

                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`md:border-r ${ui.separator} md:pr-4`}>
                      <div className="font-semibold mb-2">Entradas</div>
                      {incomes.length === 0 ? (
                        <div className={`text-sm ${ui.muted}`}>—</div>
                      ) : (
                        <div className="space-y-2">
                          {incomes.map((t) => (
                            <Card key={t.id} variant="soft" className="p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {t.description}
                                  </div>
                                  <div className={`text-xs ${ui.muted}`}>
                                    {t.categories?.name ?? "—"}
                                    {t.payment_method ? ` • ${t.payment_method}` : ""}
                                  </div>
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

                    <div className="md:pl-4">
                      <div className="font-semibold mb-2">Saídas (executadas)</div>
                      {expenses.length === 0 ? (
                        <div className={`text-sm ${ui.muted}`}>—</div>
                      ) : (
                        <div className="space-y-2">
                          {expenses.map((t) => {
                            const atts = t.attachments ?? [];
                            return (
                              <Card key={t.id} variant="soft" className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                      {t.description}
                                    </div>
                                    <div className={`text-xs ${ui.muted}`}>
                                      {t.categories?.name ?? "—"}
                                      {t.payment_method ? ` • ${t.payment_method}` : ""}
                                      {" • "}
                                      <span className={ui.pillSuccess}>EXECUTADA</span>
                                    </div>

                                    {atts.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
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
                                                onClick={() => openAttachment(a.storage_path!)}
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