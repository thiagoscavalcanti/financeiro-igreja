"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import type { Account, Category, TxKind } from "@/lib/types";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";
import { ui } from "@/lib/ui";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function addMonthsKeepDay(isoDate: string, months: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const target = new Date(base);
  target.setMonth(target.getMonth() + months);
  return target.toISOString().slice(0, 10);
}

export default function NovoLancamentoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<TxKind>("income");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("PIX");

  const [expenseStatus, setExpenseStatus] = useState<"executed" | "scheduled">(
    "executed"
  );

  const [isRecurring, setIsRecurring] = useState(false);
  const [recMonths, setRecMonths] = useState<number>(3);

  const [file, setFile] = useState<File | null>(null);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind]
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMsg(null);

      const [{ data: acc, error: accErr }, { data: cat, error: catErr }] =
        await Promise.all([
          supabase
            .from("accounts")
            .select("id, name")
            .eq("active", true)
            .order("name"),
          supabase
            .from("categories")
            .select("id, name, kind")
            .eq("active", true)
            .order("name"),
        ]);

      if (accErr) setMsg(accErr.message);
      if (catErr) setMsg(catErr.message);

      setAccounts((acc as any) ?? []);
      setCategories((cat as any) ?? []);

      const firstAcc = (acc as any)?.[0]?.id ?? "";
      setAccountId((prev) => prev || firstAcc);

      setLoading(false);
    }

    load();
  }, []);

  useEffect(() => {
    const first = filteredCategories[0]?.id ?? "";
    setCategoryId(first);
  }, [kind, filteredCategories]);

  useEffect(() => {
    if (kind === "income") {
      setExpenseStatus("executed");
      setIsRecurring(false);
      setFile(null);
    }
  }, [kind]);

  function validate() {
    const v = Number(amount);
    if (!date) return "Informe a data.";
    if (!categoryId) return "Escolha uma categoria.";
    if (!accountId) return "Escolha uma conta.";
    if (!description.trim()) return "Informe a descrição.";
    if (!Number.isFinite(v) || v <= 0) return "Informe um valor válido (> 0).";

    if (file && file.size > 5 * 1024 * 1024) {
      return "Arquivo muito grande. Limite: 5MB.";
    }

    if (kind === "expense" && isRecurring) {
      if (!Number.isFinite(recMonths) || recMonths < 2 || recMonths > 60) {
        return "Recorrência: informe entre 2 e 60 meses.";
      }
    }

    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const err = validate();
    if (err) {
      setMsg(err);
      return;
    }

    setSaving(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setSaving(false);
      setMsg("Sessão expirada. Faça login novamente.");
      router.replace("/login");
      return;
    }

    const amountNum = Number(amount);
    const rows: any[] = [];

    if (kind === "income") {
      rows.push({
        date,
        kind,
        category_id: categoryId,
        account_id: accountId,
        description: description.trim(),
        amount: amountNum,
        payment_method: paymentMethod?.trim() || null,
        created_by: user.id,
        expense_status: null,
        executed_at: null,
      });
    } else {
      const status = expenseStatus;
      const execAt = status === "executed" ? new Date().toISOString() : null;
      const total = isRecurring ? recMonths : 1;

      for (let i = 0; i < total; i++) {
        const d = addMonthsKeepDay(date, i);
        rows.push({
          date: d,
          kind,
          category_id: categoryId,
          account_id: accountId,
          description: isRecurring
            ? `${description.trim()} (recorrente ${i + 1}/${total})`
            : description.trim(),
          amount: amountNum,
          payment_method: paymentMethod?.trim() || null,
          created_by: user.id,
          expense_status: status,
          executed_at: execAt,
        });
      }
    }

    const { data: inserted, error: txErr } = await supabase
      .from("transactions")
      .insert(rows)
      .select("id");

    if (txErr) {
      setSaving(false);
      setMsg(txErr.message);
      return;
    }

    const firstTxId = (inserted as any)?.[0]?.id as string | undefined;

    if (file && firstTxId) {
      const safeName = file.name.replace(/[^\w.\-() ]/g, "_");
      const storagePath = `${user.id}/${firstTxId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("receipts")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (upErr) {
        setSaving(false);
        setMsg("Upload falhou: " + upErr.message);
        return;
      }

      const { error: attErr } = await supabase.from("attachments").insert({
        transaction_id: firstTxId,
        storage_path: storagePath,
        external_url: null,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        created_by: user.id,
      });

      if (attErr) {
        setSaving(false);
        setMsg(
          "Anexo salvo no storage, mas falhou ao registrar no banco: " +
            attErr.message
        );
        return;
      }
    }

    setSaving(false);
    router.replace("/lancamentos");
  }

  if (loading) {
    return (
      <AppShell>
        <div className={`text-sm ${ui.muted}`}>Carregando…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={ui.pageText}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Novo lançamento</h1>
            <p className={`text-sm ${ui.muted}`}>
              Para saídas: você pode programar (não executada) e marcar como
              executada depois.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          {msg && <Alert variant="danger">{msg}</Alert>}

          <Card className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Data</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-sm">Tipo</label>
                <select
                  className={`w-full mt-1 ${ui.input}`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as TxKind)}
                >
                  <option value="income">Entrada</option>
                  <option value="expense">Saída</option>
                </select>
              </div>

              <div>
                <label className="text-sm">Categoria</label>
                <select
                  className={`w-full mt-1 ${ui.input}`}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm">Conta</label>
                <select
                  className={`w-full mt-1 ${ui.input}`}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm">Descrição</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-sm">Valor</label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                  inputMode="decimal"
                  required
                />
                <div className={`mt-1 ${ui.hint}`}>
                  {Number.isFinite(Number(amount)) ? fmtBRL(Number(amount)) : "—"}
                </div>
              </div>

              <div>
                <label className="text-sm">Forma</label>
                <Input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
              </div>

              {kind === "expense" && (
                <div className="md:col-span-2">
                  <Card variant="soft" className="p-4">
                    <div className="font-semibold text-sm">Saída: execução</div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="text-sm">Status</label>
                        <select
                          className={`w-full mt-1 ${ui.input}`}
                          value={expenseStatus}
                          onChange={(e) =>
                            setExpenseStatus(e.target.value as any)
                          }
                        >
                          <option value="executed">Executada (debita agora)</option>
                          <option value="scheduled">
                            Programada (não debita)
                          </option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 mt-6 md:mt-0">
                        <input
                          id="rec"
                          type="checkbox"
                          checked={isRecurring}
                          onChange={(e) => setIsRecurring(e.target.checked)}
                        />
                        <label htmlFor="rec" className="text-sm">
                          Saída recorrente mensal
                        </label>
                      </div>

                      {isRecurring && (
                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm">
                              Por quantos meses? (inclui o primeiro)
                            </label>
                            <Input
                              type="number"
                              min={2}
                              max={60}
                              value={String(recMonths)}
                              onChange={(e) =>
                                setRecMonths(Number(e.target.value))
                              }
                            />
                          </div>

                          <div className={`text-xs mt-7 ${ui.muted}`}>
                            Dica: recorrências geralmente fazem sentido como{" "}
                            <b>Programadas</b>.
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="text-sm">
                  Anexo (PDF/JPG/PNG){" "}
                  <span className={ui.hint}>(limite 5MB recomendado)</span>
                </label>
                <input
                  className={`w-full mt-1 ${ui.input}`}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="primary" disabled={saving} type="submit">
                {saving ? "Salvando…" : "Salvar"}
              </Button>

              <Button
                variant="ghost"
                type="button"
                onClick={() => router.back()}
                disabled={saving}
              >
                Cancelar
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}