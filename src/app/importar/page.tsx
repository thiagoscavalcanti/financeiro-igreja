"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useIsAdmin } from "@/lib/useIsAdmin";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Alert from "@/components/ui/Alert";
import { ui } from "@/lib/ui";

/* ================= TYPES ================= */

type TxKind = "income" | "expense";
type ExpenseStatus = "scheduled" | "executed";

type AccountRow = { id: string; name: string; active: boolean };
type CategoryRow = { id: string; name: string; kind: TxKind; active: boolean };

type ParsedRow = {
  rowId: string;
  raw: string;

  date: string | null; // YYYY-MM-DD
  kind: TxKind | null;
  description: string;
  amount: number | null;

  ok: boolean;
  error?: string;

  include: boolean;
  account_id: string;
  category_id: string;
  expense_status: ExpenseStatus;
};

/* ================= HELPERS ================= */

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeText(s: string) {
  return (s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseDateBR(s: string): string | null {
  const t = (s ?? "").trim();
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseBRNumber(s: string): number | null {
  let t = (s ?? "").trim();
  if (!t) return null;

  t = t.replace(/\s/g, "").replace(/^r\$\s*/i, "");

  let negative = false;
  if (t.startsWith("(") && t.endsWith(")")) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negative = true;
    t = t.slice(1);
  }

  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n)) return null;

  return negative ? -Math.abs(n) : n;
}

function mapKind(tipoTransacao: string): TxKind | null {
  const x = normalizeText(tipoTransacao);

  if (x.includes("credito") || x.includes("entrada") || x.includes("receb"))
    return "income";

  if (x.includes("debito") || x.includes("saida") || x.includes("pag"))
    return "expense";

  return null;
}

function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const comma = (firstLine.match(/,/g) ?? []).length;
  const semi = (firstLine.match(/;/g) ?? []).length;
  return semi > comma ? ";" : ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((s) => s.trim());
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ================= COMPONENT ================= */

export default function ImportarPage() {
  const { isAdmin, loading: loadingRole } = useIsAdmin();

  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>("");

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const [defaultAccountId, setDefaultAccountId] = useState<string>("");
  const [defaultIncomeCategoryId, setDefaultIncomeCategoryId] = useState<string>("");
  const [defaultExpenseCategoryId, setDefaultExpenseCategoryId] = useState<string>("");
  const [defaultExpenseStatus, setDefaultExpenseStatus] =
    useState<ExpenseStatus>("executed");

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // paginação de preview
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const disabled = loadingRole || !isAdmin;

  const incomeCats = useMemo(
    () => categories.filter((c) => c.active && c.kind === "income"),
    [categories]
  );
  const expenseCats = useMemo(
    () => categories.filter((c) => c.active && c.kind === "expense"),
    [categories]
  );
  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.active),
    [accounts]
  );

  useEffect(() => {
    if (disabled) return;

    async function loadMeta() {
      setMsg(null);

      const [accRes, catRes] = await Promise.all([
        supabase.from("accounts").select("id,name,active").order("name"),
        supabase
          .from("categories")
          .select("id,name,kind,active")
          .order("kind")
          .order("name"),
      ]);

      if (accRes.error) setMsg(accRes.error.message);
      if (catRes.error) setMsg(catRes.error.message);

      const acc = ((accRes.data as any) ?? []) as AccountRow[];
      const cat = ((catRes.data as any) ?? []) as CategoryRow[];

      setAccounts(acc);
      setCategories(cat);

      const firstAcc = acc.find((a) => a.active)?.id ?? acc[0]?.id ?? "";
      const firstIncome = cat.find((c) => c.active && c.kind === "income")?.id ?? "";
      const firstExpense = cat.find((c) => c.active && c.kind === "expense")?.id ?? "";

      setDefaultAccountId((prev) => prev || firstAcc);
      setDefaultIncomeCategoryId((prev) => prev || firstIncome);
      setDefaultExpenseCategoryId((prev) => prev || firstExpense);
    }

    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    if (!file) {
      setRawText("");
      setRows([]);
      setPage(1);
      return;
    }

    setMsg(null);

    const reader = new FileReader();
    reader.onload = () => setRawText(String(reader.result ?? ""));
    reader.onerror = () => setMsg("Falha ao ler o arquivo.");
    reader.readAsText(file);
  }, [file]);

  useEffect(() => {
    if (!rawText) {
      setRows([]);
      setPage(1);
      return;
    }

    const delimiter = detectDelimiter(rawText);
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      setRows([]);
      setMsg("CSV parece vazio (precisa ter header + linhas).");
      return;
    }

    const header = splitCsvLine(lines[0], delimiter).map(normalizeText);

    const idxData = header.findIndex((h) => h === "data");
    const idxTransacao = header.findIndex((h) => h === "transacao");
    const idxTipo = header.findIndex((h) => h === "tipo transacao");
    const idxIdent = header.findIndex((h) => h === "identificacao");
    const idxValor = header.findIndex((h) => h === "valor");

    const missing: string[] = [];
    if (idxData < 0) missing.push("Data");
    if (idxTransacao < 0) missing.push("Transação");
    if (idxTipo < 0) missing.push("Tipo Transação");
    if (idxIdent < 0) missing.push("Identificação");
    if (idxValor < 0) missing.push("Valor");

    if (missing.length) {
      setRows([]);
      setMsg(
        `Header do CSV não bate. Esperado: Data, Transação, Tipo Transação, Identificação, Valor. Faltando: ${missing.join(
          ", "
        )}`
      );
      return;
    }

    // ✅ SEM LIMITE: processa todas as linhas (preview paginado evita travar a tela)
    const parsed: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i], delimiter);

      const dataStr = cols[idxData] ?? "";
      const transacao = cols[idxTransacao] ?? "";
      const tipo = cols[idxTipo] ?? "";
      const ident = cols[idxIdent] ?? "";
      const valorStr = cols[idxValor] ?? "";

      const date = parseDateBR(dataStr);
      const kind = mapKind(tipo);

      const parsedAmount = parseBRNumber(valorStr);
      const amountAbs =
        parsedAmount === null ? null : round2(Math.abs(parsedAmount));
      const description = ident
        ? `${transacao} - ${ident}`.trim()
        : transacao.trim();

      let ok = true;
      let error = "";

      if (!date) {
        ok = false;
        error = "Data inválida (dd/mm/aaaa)";
      } else if (!kind) {
        ok = false;
        error = "Tipo não reconhecido (CRÉDITO/DÉBITO)";
      } else if (amountAbs === null) {
        ok = false;
        error = "Valor inválido";
      } else if (amountAbs <= 0) {
        ok = false;
        error = "Valor deve ser maior que 0";
      } else if (!description) {
        ok = false;
        error = "Descrição vazia";
      }

      const account_id = defaultAccountId;
      const category_id =
        kind === "expense" ? defaultExpenseCategoryId : defaultIncomeCategoryId;

      parsed.push({
        rowId: uid(),
        raw: lines[i],
        date,
        kind,
        description,
        amount: amountAbs,
        ok,
        error: ok ? undefined : error,
        include: ok,
        account_id: account_id || "",
        category_id: category_id || "",
        expense_status: defaultExpenseStatus,
      });
    }

    setMsg(null);
    setRows(parsed);
    setPage(1);
  }, [
    rawText,
    defaultAccountId,
    defaultIncomeCategoryId,
    defaultExpenseCategoryId,
    defaultExpenseStatus,
  ]);

  const validIncludedRows = useMemo(
    () => rows.filter((r) => r.ok && r.include),
    [rows]
  );
  const invalidRows = useMemo(() => rows.filter((r) => !r.ok), [rows]);

  // ✅ corrigido: a variável que o botão usa
  const hasValidRows = validIncludedRows.length > 0;

  function setRow(rowId: string, patch: Partial<ParsedRow>) {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r))
    );
  }

  function applyDefaultsToAll() {
    setRows((prev) =>
      prev.map((r) => {
        if (!r.ok) return r;
        const catId =
          r.kind === "expense"
            ? defaultExpenseCategoryId
            : defaultIncomeCategoryId;
        return {
          ...r,
          account_id: defaultAccountId || r.account_id,
          category_id: catId || r.category_id,
          expense_status: defaultExpenseStatus,
        };
      })
    );
  }

  async function importar() {
    setMsg(null);

    if (!file) return setMsg("Selecione um CSV.");
    if (validIncludedRows.length === 0)
      return setMsg("Nenhuma linha válida marcada para importar.");

    const missing = validIncludedRows.find(
      (r) => !r.account_id || !r.category_id
    );
    if (missing) {
      return setMsg(
        "Tem linha marcada sem Conta/Categoria. Complete antes de importar."
      );
    }

    const ok = confirm(`Importar ${validIncludedRows.length} linha(s)?`);
    if (!ok) return;

    setBusy(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setBusy(false);
      setMsg("Sessão expirada. Faça login novamente.");
      return;
    }

    const payload = validIncludedRows.map((r) => {
      const isExpense = r.kind === "expense";
      return {
        date: r.date!,
        kind: r.kind!,
        description: r.description,
        amount: r.amount!,
        payment_method: "Importado CSV",
        account_id: r.account_id,
        category_id: r.category_id,
        created_by: user.id,
        expense_status: isExpense ? r.expense_status : null,
        executed_at:
          isExpense && r.expense_status === "executed"
            ? new Date().toISOString()
            : null,
      };
    });

    // ✅ insere em lotes para não estourar payload / timeout
    const batches = chunk(payload, 200);

    for (let i = 0; i < batches.length; i++) {
      const { error } = await supabase.from("transactions").insert(batches[i]);
      if (error) {
        setBusy(false);
        setMsg(`Erro ao importar (lote ${i + 1}/${batches.length}): ${error.message}`);
        return;
      }
    }

    setBusy(false);
    setMsg(`Importação concluída: ${validIncludedRows.length} lançamento(s).`);
    setFile(null);
    setRawText("");
    setRows([]);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

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
          Você precisa ser <b>admin</b> para importar CSV.
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={ui.pageText}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Importar CSV</h1>
            <p className={`text-sm ${ui.muted}`}>
              Classifique <b>linha por linha</b>. Valores negativos viram positivos
              automaticamente.
            </p>
          </div>
        </div>

        {msg && (
          <div className="mt-4">
            {/* msg pode ser sucesso/erro — por simplicidade, usamos info */}
            <Alert variant="info">{msg}</Alert>
          </div>
        )}

        <Card className="mt-6 p-4 space-y-4">
          <div>
            <label className="text-sm">Arquivo CSV</label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1"
            />
            <div className={ui.hint}>Suporta separador , ou ;</div>
          </div>

          <Card variant="soft" className="p-3">
            <div className="font-semibold text-sm">Defaults (atalho)</div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-sm">Conta padrão</label>
                <Select
                  className="mt-1"
                  value={defaultAccountId}
                  onChange={(e) => setDefaultAccountId(e.target.value)}
                >
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-sm">Categoria padrão (Entradas)</label>
                <Select
                  className="mt-1"
                  value={defaultIncomeCategoryId}
                  onChange={(e) => setDefaultIncomeCategoryId(e.target.value)}
                >
                  {incomeCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-sm">Categoria padrão (Saídas)</label>
                <Select
                  className="mt-1"
                  value={defaultExpenseCategoryId}
                  onChange={(e) => setDefaultExpenseCategoryId(e.target.value)}
                >
                  {expenseCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-sm">Status padrão (Saídas)</label>
                <Select
                  className="mt-1"
                  value={defaultExpenseStatus}
                  onChange={(e) =>
                    setDefaultExpenseStatus(e.target.value as ExpenseStatus)
                  }
                >
                  <option value="executed">Executada</option>
                  <option value="scheduled">Programada</option>
                </Select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                onClick={applyDefaultsToAll}
                disabled={rows.length === 0}
                type="button"
              >
                Aplicar defaults em todas as linhas válidas
              </Button>

              <div className={`text-sm ${ui.muted}`}>
                Total lidas: <b className={ui.pageText}>{rows.length}</b> •
                Selecionadas:{" "}
                <b className={ui.pageText}>{validIncludedRows.length}</b>
                {invalidRows.length > 0 && (
                  <>
                    {" "}
                    • inválidas:{" "}
                    <b className={ui.pageText}>{invalidRows.length}</b>
                  </>
                )}
              </div>

              {/* ✅ botão corrigido + chamando importar() */}
              <Button
                variant="primary"
                className="min-w-[140px]"
                disabled={!hasValidRows || busy}
                onClick={importar}
                type="button"
              >
                {busy ? "Importando…" : "Importar CSV"}
              </Button>
            </div>

            <div className={`mt-2 ${ui.hint}`}>
              Preview paginado: {PAGE_SIZE} linhas por página. CSV completo é processado.
            </div>
          </Card>
        </Card>

        {rows.length > 0 && (
          <Card className="mt-6 p-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              <div>
                <div className="font-semibold">Prévia</div>
                <div className={`text-sm mt-1 ${ui.muted}`}>
                  Mostrando {PAGE_SIZE} por página. Linhas inválidas não serão importadas.
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  type="button"
                >
                  ←
                </Button>
                <div className={`text-sm ${ui.muted}`}>
                  Página <b className={ui.pageText}>{page}</b> de{" "}
                  <b className={ui.pageText}>{totalPages}</b>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  type="button"
                >
                  →
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={`text-left border-b ${ui.separator}`}>
                    <th className="py-2 pr-3">Importar</th>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Descrição</th>
                    <th className="py-2 pr-3">Valor</th>
                    <th className="py-2 pr-3">Conta</th>
                    <th className="py-2 pr-3">Categoria</th>
                    <th className="py-2 pr-3">Status (saída)</th>
                    <th className="py-2 pr-3">Erro</th>
                  </tr>
                </thead>

                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.rowId} className={`border-b ${ui.separator} align-top`}>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={!r.ok}
                          onChange={(e) =>
                            setRow(r.rowId, { include: e.target.checked })
                          }
                        />
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">{r.date ?? "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{r.kind ?? "—"}</td>

                      <td className="py-2 pr-3 max-w-[420px]">
                        <div className="truncate" title={r.description}>
                          {r.description}
                        </div>
                      </td>

                      <td className="py-2 pr-3 whitespace-nowrap">
                        {r.amount !== null ? fmtBRL(r.amount) : "—"}
                      </td>

                      <td className="py-2 pr-3">
                        <select
                          className={ui.selectSm}
                          value={r.account_id}
                          disabled={!r.ok}
                          onChange={(e) =>
                            setRow(r.rowId, { account_id: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {activeAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-2 pr-3">
                        <select
                          className={ui.selectSm}
                          value={r.category_id}
                          disabled={!r.ok || !r.kind}
                          onChange={(e) =>
                            setRow(r.rowId, { category_id: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {(r.kind === "expense" ? expenseCats : incomeCats).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-2 pr-3">
                        {r.kind === "expense" ? (
                          <select
                            className={ui.selectSm}
                            value={r.expense_status}
                            disabled={!r.ok}
                            onChange={(e) =>
                              setRow(r.rowId, {
                                expense_status: e.target.value as ExpenseStatus,
                              })
                            }
                          >
                            <option value="executed">Executada</option>
                            <option value="scheduled">Programada</option>
                          </select>
                        ) : (
                          <span className={ui.hint}>—</span>
                        )}
                      </td>

                      <td className={`py-2 pr-3 text-xs text-red-700 dark:text-red-300`}>
                        {r.ok ? "" : r.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}