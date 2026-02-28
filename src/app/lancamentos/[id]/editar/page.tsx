"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useIsAdmin } from "@/lib/useIsAdmin";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";
import { ui } from "@/lib/ui";

type TxKind = "income" | "expense";
type ExpenseStatus = "scheduled" | "executed";

type Account = { id: string; name: string; active: boolean };
type Category = { id: string; name: string; kind: TxKind; active: boolean };

export default function EditarLancamentoPage() {
  const { isAdmin, loading: loadingRole } = useIsAdmin();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [date, setDate] = useState("");
  const [kind, setKind] = useState<TxKind>("income");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("");

  const [expenseStatus, setExpenseStatus] = useState<ExpenseStatus>("executed");

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.kind === kind && c.active),
    [categories, kind]
  );

  useEffect(() => {
    if (loadingRole) return;
    if (!isAdmin) return;

    async function load() {
      setLoading(true);
      setMsg(null);

      const [acc, cat, tx] = await Promise.all([
        supabase.from("accounts").select("id,name,active").order("name"),
        supabase
          .from("categories")
          .select("id,name,kind,active")
          .order("kind")
          .order("name"),
        supabase
          .from("transactions")
          .select(
            "date,kind,category_id,account_id,description,amount,payment_method,expense_status,executed_at"
          )
          .eq("id", id)
          .single(),
      ]);

      if (acc.error) setMsg(acc.error.message);
      if (cat.error) setMsg(cat.error.message);
      if (tx.error) setMsg(tx.error.message);

      setAccounts((acc.data as any) ?? []);
      setCategories((cat.data as any) ?? []);

      if (tx.data) {
        setDate(tx.data.date);
        setKind(tx.data.kind);
        setCategoryId(tx.data.category_id);
        setAccountId(tx.data.account_id);
        setDescription(tx.data.description);
        setAmount(String(tx.data.amount));
        setPaymentMethod(tx.data.payment_method ?? "");

        const status: ExpenseStatus =
          tx.data.kind === "expense"
            ? (tx.data.expense_status ?? "executed")
            : "executed";
        setExpenseStatus(status);
      }

      setLoading(false);
    }

    load();
  }, [loadingRole, isAdmin, id]);

  useEffect(() => {
    if (!categoryId) return;
    const ok = categories.some((c) => c.id === categoryId && c.kind === kind);
    if (!ok) setCategoryId(filteredCategories[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    if (kind === "income") setExpenseStatus("executed");
  }, [kind]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const v = Number(amount);

    if (
      !date ||
      !description.trim() ||
      !categoryId ||
      !accountId ||
      !Number.isFinite(v) ||
      v <= 0
    ) {
      setMsg("Preencha os campos corretamente.");
      return;
    }

    const payload: any = {
      date,
      kind,
      category_id: categoryId,
      account_id: accountId,
      description: description.trim(),
      amount: v,
      payment_method: paymentMethod.trim() || null,
    };

    if (kind === "income") {
      payload.expense_status = null;
      payload.executed_at = null;
    } else {
      payload.expense_status = expenseStatus;
      payload.executed_at =
        expenseStatus === "executed" ? new Date().toISOString() : null;
    }

    setSaving(true);
    const { error } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", id);
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    router.replace("/lancamentos");
  }

  if (loadingRole) {
    return (
      <AppShell>
        <div className={`text-sm ${ui.muted}`}>Carregando…</div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <Alert variant="warn">
          Você precisa ser <b>admin</b> para editar lançamentos.
        </Alert>
      </AppShell>
    );
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
        <h1 className="text-xl font-semibold">Editar lançamento</h1>

        {msg && (
          <div className="mt-4">
            <Alert variant="danger">{msg}</Alert>
          </div>
        )}

        <form onSubmit={save} className="mt-6 space-y-4">
          <Card className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Data</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
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

              {kind === "expense" && (
                <div className="md:col-span-2">
                  <Card variant="soft" className="p-4">
                    <div className="font-semibold text-sm">Saída: execução</div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm">Status</label>
                        <select
                          className={`w-full mt-1 ${ui.input}`}
                          value={expenseStatus}
                          onChange={(e) =>
                            setExpenseStatus(e.target.value as ExpenseStatus)
                          }
                        >
                          <option value="executed">
                            Executada (debita no saldo)
                          </option>
                          <option value="scheduled">
                            Programada (não debita)
                          </option>
                        </select>
                        <div className={`mt-1 ${ui.hint}`}>
                          Programada aparece na lista e você pode marcar como
                          executada depois.
                        </div>
                      </div>

                      <div className={`text-xs ${ui.muted} mt-6 md:mt-7`}>
                        Ao salvar como <b>Executada</b>, registramos a data/hora
                        de execução automaticamente.
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              <div>
                <label className="text-sm">Categoria</label>
                <select
                  className={`w-full mt-1 ${ui.input}`}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
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
                >
                  {accounts
                    .filter((a) => a.active)
                    .map((a) => (
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
                />
              </div>

              <div>
                <label className="text-sm">Valor</label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                  inputMode="decimal"
                />
              </div>

              <div>
                <label className="text-sm">Forma</label>
                <Input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
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