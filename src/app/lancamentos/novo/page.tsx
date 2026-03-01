"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsAdmin } from "@/lib/useIsAdmin";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import type { Account, Category, TxKind } from "@/lib/types";
import { todayLocalISO } from "@/lib/dates";

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
  const target = new Date(y, m - 1, d);
  target.setMonth(target.getMonth() + months);

  const yy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function monthRangeISO(isoDate: string) {
  const [y, m] = isoDate.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1); // 1º dia do mês seguinte

  const startISO = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate()
  ).padStart(2, "0")}`;

  const endISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(
    end.getDate()
  ).padStart(2, "0")}`;

  return { startISO, endISO };
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

export default function NovoLancamentoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [date, setDate] = useState(() => todayLocalISO());
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

  // ✅ NOVO: Nº do documento (somente para Saída)
  const [expenseDocNo, setExpenseDocNo] = useState<string>("");
  const [expenseDocAuto, setExpenseDocAuto] = useState(true); // se usuário editar, vira false
  const lastDocMonthRef = useRef<string>(""); // YYYY-MM

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

      // limpa doc quando volta pra entrada
      setExpenseDocNo("");
      setExpenseDocAuto(true);
      lastDocMonthRef.current = "";
    }
  }, [kind]);

  // ✅ busca próximo doc do mês (tipo 001, 002…)
  async function fetchNextExpenseDocNo(isoDate: string) {
    const { startISO, endISO } = monthRangeISO(isoDate);

    // pega o maior doc_no do mês (apenas despesas)
    const { data, error } = await supabase
      .from("transactions")
      .select("expense_doc_no")
      .eq("kind", "expense")
      .gte("date", startISO)
      .lt("date", endISO)
      .not("expense_doc_no", "is", null)
      .order("expense_doc_no", { ascending: false })
      .limit(1);

    if (error) throw error;

    const last = (data as any)?.[0]?.expense_doc_no as string | null | undefined;
    const lastNum = last ? Number(onlyDigits(last)) : 0;
    const nextNum = Number.isFinite(lastNum) ? lastNum + 1 : 1;

    return pad3(nextNum);
  }

  // ✅ auto-preencher doc quando for Saída e o mês mudar (se estiver em modo "auto")
  useEffect(() => {
    async function ensureDoc() {
      if (kind !== "expense") return;

      const ym = date.slice(0, 7); // YYYY-MM
      const monthChanged = lastDocMonthRef.current !== ym;

      if (!expenseDocAuto) return; // usuário editou manualmente

      // Se mês mudou ou ainda não tem doc, recalcula
      if (monthChanged || !expenseDocNo) {
        try {
          const next = await fetchNextExpenseDocNo(date);
          setExpenseDocNo(next);
          lastDocMonthRef.current = ym;
        } catch (e: any) {
          setMsg(e?.message ?? "Falha ao gerar Nº do documento.");
        }
      }
    }

    ensureDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, date, expenseDocAuto]);

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

    if (kind === "expense") {
      if (!expenseDocNo.trim()) return "Informe o Nº do documento.";
      // opcional: limitar a 3 dígitos
      if (onlyDigits(expenseDocNo).length > 6) return "Nº do documento inválido.";
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
        expense_doc_no: null,
      });
    } else {
      const status = expenseStatus;
      const execAt = status === "executed" ? new Date().toISOString() : null;
      const total = isRecurring ? recMonths : 1;

      // ✅ Para recorrência: precisamos gerar doc_no por mês
      //    Vamos cachear por mês para evitar múltiplas queries se repetisse o mesmo mês.
      const monthNextMap = new Map<string, number>();

      // Primeiro mês usa o valor do formulário (editável)
      const firstDocDigits = Number(onlyDigits(expenseDocNo)) || 1;

      for (let i = 0; i < total; i++) {
        const d = addMonthsKeepDay(date, i);
        const ym = d.slice(0, 7);

        let docNoForThisRow: string;

        if (i === 0) {
          docNoForThisRow = pad3(firstDocDigits);
        } else {
          // gera o próximo para o mês de "d"
          if (!monthNextMap.has(ym)) {
            // busca o próximo do mês e guarda como "próximo número disponível"
            const nextStr = await fetchNextExpenseDocNo(d);
            monthNextMap.set(ym, Number(onlyDigits(nextStr)) || 1);
          }

          const n = monthNextMap.get(ym)!;
          docNoForThisRow = pad3(n);
          monthNextMap.set(ym, n + 1);
        }

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
          expense_doc_no: docNoForThisRow,
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

              {/* ✅ NOVO: Nº do Documento (apenas Saída) */}
              {kind === "expense" && (
                <div>
                  <label className="text-sm">
                    Nº do documento <span className={ui.hint}>(zera todo mês)</span>
                  </label>
                  <Input
                    value={expenseDocNo}
                    onChange={(e) => {
                      setExpenseDocNo(e.target.value);
                      setExpenseDocAuto(false); // usuário assumiu controle
                    }}
                    onBlur={() => {
                      // normaliza pra 3 dígitos se for número
                      const n = Number(onlyDigits(expenseDocNo));
                      if (Number.isFinite(n) && n > 0) setExpenseDocNo(pad3(n));
                    }}
                    placeholder="001"
                    inputMode="numeric"
                    required
                  />
                  <div className={`mt-1 ${ui.hint}`}>
                    {expenseDocAuto ? "Automático (pode editar)" : "Editado manualmente"}
                    {expenseDocAuto === false && (
                      <>
                        {" "}
                        ·{" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={async () => {
                            try {
                              setExpenseDocAuto(true);
                              const next = await fetchNextExpenseDocNo(date);
                              setExpenseDocNo(next);
                              lastDocMonthRef.current = date.slice(0, 7);
                            } catch (e: any) {
                              setMsg(e?.message ?? "Falha ao gerar Nº do documento.");
                            }
                          }}
                        >
                          voltar para automático
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

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