// src/app/relatorios/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Alert from "@/components/ui/Alert";
import { ui } from "@/lib/ui";

type TxRow = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "income" | "expense";
  amount: number;
  expense_status: "scheduled" | "executed" | null;
  category_id: string | null;
  account_id: string | null;
  description?: string | null;
  payment_method?: string | null;
  categories?: { name: string; kind: "income" | "expense" } | null;
  accounts?: { name: string } | null;
};

type CategoryRow = {
  id: string;
  name: string;
  kind: "income" | "expense";
  active: boolean;
};

type AccountRow = {
  id: string;
  name: string;
  active: boolean;
};

type AggRow = {
  kind: "income" | "expense";
  category_id: string;
  category_name: string;
  account_id: string;
  account_name: string;
  total: number;
  executed: number; // só para expense
  scheduled: number; // só para expense
};

type StatusFilter = "all" | "executed" | "scheduled";

function fmtBRL(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowBR() {
  // sem depender de timezone do servidor; o browser já está em -03 normalmente
  return new Date().toLocaleString("pt-BR");
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonthISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
}

function isExecutedExpenseLike(kind: "income" | "expense", expense_status: any) {
  if (kind !== "expense") return false;
  return (expense_status ?? "executed") === "executed";
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-() ]/g, "_");
}

function downloadBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function toCSV(rows: Array<Record<string, any>>) {
  const BOM = "\ufeff";

  // ✅ Correção TS: evitar Array.from em algo que o TS pode inferir como Record.
  // Monta colunas via Set explícito.
  const colSet = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) colSet.add(k);
  }
  const cols = Array.from(colSet);

  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    const needsQuote = /[",\n\r;]/.test(s);
    const s2 = s.replace(/"/g, '""');
    return needsQuote ? `"${s2}"` : s2;
  };

  const header = cols.map(esc).join(",");
  const lines = rows.map((r) => cols.map((c) => esc(r[c])).join(","));
  return BOM + [header, ...lines].join("\n");
}

function toExcelHTML(title: string, tableHTML: string) {
  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 12px 0; }
  .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; }
  th { background: #f3f4f6; text-align: left; }
  td.num { text-align: right; }
</style>
</head>
<body>
${tableHTML}
</body>
</html>
`.trim();
}

function openPrintWindow(title: string, bodyHTML: string) {
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #111; }
  .hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
  .brand { font-weight: 700; font-size: 16px; margin: 0; }
  .subtitle { font-size: 12px; color: #555; margin-top: 2px; }
  .metaBox { font-size: 11px; color:#333; text-align:right; white-space:nowrap; }
  .chip { display:inline-block; padding:2px 8px; border:1px solid #ddd; border-radius:999px; font-size:11px; color:#333; margin-left:6px; }
  hr { border:0; border-top:1px solid #ddd; margin: 12px 0 14px 0; }
  h1 { font-size: 16px; margin: 0 0 4px 0; }
  .meta { font-size: 12px; color: #555; margin: 0 0 14px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
  th { background: #f3f4f6; text-align: left; }
  td.num { text-align: right; }
  tfoot td { font-weight: 700; background: #fafafa; }
  .kpis { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; margin: 10px 0 14px 0; }
  .kpi { border:1px solid #ddd; border-radius:10px; padding:10px; }
  .kpi .lbl { font-size:11px; color:#555; }
  .kpi .val { font-size:14px; font-weight:700; margin-top:4px; }
  .sign { margin-top: 18px; display:grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .line { border-top: 1px solid #333; padding-top: 6px; font-size: 11px; color:#333; }
  .footer { margin-top: 18px; font-size: 10px; color:#666; display:flex; justify-content:space-between; }
  @page { margin: 12mm; }
  @media print {
    body { padding: 0; }
    .noPrint { display:none; }
  }
</style>
</head>
<body>
${bodyHTML}
<script>
  window.onload = function() { window.focus(); window.print(); };
</script>
</body>
</html>
`.trim();

  const w = window.open("", "_blank");
  if (!w) {
    alert("Pop-up bloqueado. Permita pop-ups para exportar PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function pillTextForStatus(s: StatusFilter) {
  if (s === "executed") return "Status: Executadas";
  if (s === "scheduled") return "Status: Programadas";
  return "Status: Todos";
}

export default function RelatoriosPage() {
  const [start, setStart] = useState(() => startOfMonthISO());
  const [end, setEnd] = useState(() => todayISO());
  const endExclusive = useMemo(() => addDaysISO(end, 1), [end]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [txs, setTxs] = useState<TxRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  // filtros
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // "" = todas
  const [accountFilter, setAccountFilter] = useState<string>(""); // "" = todas
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all"); // ✅ (1)
  const [paymentFilter, setPaymentFilter] = useState<string>(""); // ✅ (2) texto livre

  async function loadLookups() {
    const [catRes, accRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,kind,active")
        .eq("active", true)
        .order("kind")
        .order("name"),
      supabase.from("accounts").select("id,name,active").eq("active", true).order("name"),
    ]);

    if (!catRes.error) setCategories((catRes.data as any) ?? []);
    if (!accRes.error) setAccounts((accRes.data as any) ?? []);

    if (catRes.error) console.warn("Erro ao carregar categorias:", catRes.error.message);
    if (accRes.error) console.warn("Erro ao carregar contas:", accRes.error.message);
  }

  async function load() {
    setLoading(true);
    setError(null);

    let q = supabase
      .from("transactions")
      .select(
        `
        id, date, kind, amount, expense_status, category_id, account_id,
        description, payment_method,
        categories(name, kind),
        accounts(name)
      `
      )
      .gte("date", start)
      .lt("date", endExclusive)
      .order("date", { ascending: true });

    if (categoryFilter) q = q.eq("category_id", categoryFilter);
    if (accountFilter) q = q.eq("account_id", accountFilter);

    // ✅ filtro por forma (texto livre)
    if (paymentFilter.trim()) {
      q = q.ilike("payment_method", `%${paymentFilter.trim()}%`);
    }

    const { data, error } = await q;

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
    loadLookups();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-reload em filtros (UX)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, accountFilter, paymentFilter]);

  const categoryName = useMemo(() => {
    if (!categoryFilter) return "Todas";
    return categories.find((c) => c.id === categoryFilter)?.name ?? "Categoria";
  }, [categoryFilter, categories]);

  const accountName = useMemo(() => {
    if (!accountFilter) return "Todas";
    return accounts.find((a) => a.id === accountFilter)?.name ?? "Conta";
  }, [accountFilter, accounts]);

  // ✅ aplica filtro de STATUS em memória (não complica query)
  const txsFiltered = useMemo(() => {
    if (statusFilter === "all") return txs;

    // Regra:
    // - Entrada sempre aparece (status não se aplica)
    // - Saída: executada = expense_status null ou executed
    // - Saída: programada = expense_status scheduled
    return txs.filter((t) => {
      if (t.kind === "income") return true;
      const s = (t.expense_status ?? "executed") as "executed" | "scheduled";
      if (statusFilter === "executed") return s === "executed";
      return s === "scheduled";
    });
  }, [txs, statusFilter]);

  const summary = useMemo(() => {
    let income = 0;
    let expenseExecuted = 0;
    let expenseScheduled = 0;

    for (const t of txsFiltered) {
      if (t.kind === "income") income += Number(t.amount);
      else if (isExecutedExpenseLike(t.kind, t.expense_status)) expenseExecuted += Number(t.amount);
      else expenseScheduled += Number(t.amount);
    }

    const netExecuted = income - expenseExecuted;
    const netAll = income - (expenseExecuted + expenseScheduled);

    return { income, expenseExecuted, expenseScheduled, netExecuted, netAll };
  }, [txsFiltered]);

  // ✅ Consolidado: Categoria + Conta (se a conta estiver vazia, vira "Sem conta")
  const consolidated = useMemo<AggRow[]>(() => {
    const map = new Map<string, AggRow>();

    for (const t of txsFiltered) {
      const catId = t.category_id ?? "—";
      const catName = t.categories?.name ?? "Sem categoria";

      const accId = t.account_id ?? "—";
      const accName = t.accounts?.name ?? "Sem conta";

      const kind = t.kind;
      const key = `${kind}:${catId}:${accId}`;

      const cur =
        map.get(key) ??
        ({
          kind,
          category_id: catId,
          category_name: catName,
          account_id: accId,
          account_name: accName,
          total: 0,
          executed: 0,
          scheduled: 0,
        } as AggRow);

      if (kind === "income") {
        cur.total += Number(t.amount);
      } else {
        const executed = (t.expense_status ?? "executed") === "executed";
        if (executed) cur.executed += Number(t.amount);
        else cur.scheduled += Number(t.amount);
        cur.total = cur.executed + cur.scheduled;
      }

      map.set(key, cur);
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [txsFiltered]);

  const consolidatedTotals = useMemo(() => {
    let income = 0;
    let expenseExec = 0;
    let expenseProg = 0;
    for (const r of consolidated) {
      if (r.kind === "income") income += r.total;
      else {
        expenseExec += r.executed;
        expenseProg += r.scheduled;
      }
    }
    return { income, expenseExec, expenseProg, expenseTotal: expenseExec + expenseProg };
  }, [consolidated]);

  const txTable = useMemo(() => {
    return txsFiltered.map((t) => ({
      Data: t.date,
      Tipo: t.kind === "income" ? "Entrada" : "Saída",
      Status:
        t.kind === "expense"
          ? (t.expense_status ?? "executed") === "executed"
            ? "Executada"
            : "Programada"
          : "—",
      Descricao: t.description ?? "",
      Categoria: t.categories?.name ?? "—",
      Conta: t.accounts?.name ?? "—",
      Forma: t.payment_method ?? "",
      Valor: Number(t.amount ?? 0),
    }));
  }, [txsFiltered]);

  function quickThisMonth() {
    setStart(startOfMonthISO());
    setEnd(todayISO());
  }

  function quickLast30() {
    const e = todayISO();
    const s = addDaysISO(e, -29);
    setStart(s);
    setEnd(e);
  }

  function resetFilters() {
    setCategoryFilter("");
    setAccountFilter("");
    setStatusFilter("all");
    setPaymentFilter("");
  }

  // ---------- EXPORTS (Consolidado)
  function exportConsolidatedCSV() {
    const rows = consolidated.map((r) => ({
      Tipo: r.kind === "income" ? "Entrada" : "Saída",
      Categoria: r.category_name,
      Conta: r.account_name,
      Total: r.total,
      Executadas: r.kind === "expense" ? r.executed : "",
      Programadas: r.kind === "expense" ? r.scheduled : "",
      PeriodoInicio: start,
      PeriodoFim: end,
      FiltroCategoria: categoryName,
      FiltroConta: accountName,
      FiltroStatus: pillTextForStatus(statusFilter),
      FiltroForma: paymentFilter?.trim() || "Todas",
    }));

    const csv = toCSV(rows);
    const fname = safeFileName(
      `relatorio-consolidado_${start}_a_${end}_cat-${categoryName}_conta-${accountName}.csv`
    );
    downloadBlob(fname, "text/csv;charset=utf-8", csv);
  }

  function exportConsolidatedExcel() {
    const rows = consolidated
      .map(
        (r) => `
      <tr>
        <td>${r.kind === "income" ? "Entrada" : "Saída"}</td>
        <td>${r.category_name}</td>
        <td>${r.account_name}</td>
        <td class="num">${fmtBRL(r.total)}</td>
        <td class="num">${r.kind === "expense" ? fmtBRL(r.executed) : "—"}</td>
        <td class="num">${r.kind === "expense" ? fmtBRL(r.scheduled) : "—"}</td>
      </tr>
    `
      )
      .join("");

    const tableHTML = `
      <h1>Relatório consolidado (Categoria + Conta)</h1>
      <div class="meta">
        Período: ${start} até ${end} • Categoria: ${categoryName} • Conta: ${accountName} • ${pillTextForStatus(
      statusFilter
    )} • Forma: ${paymentFilter?.trim() || "Todas"}
      </div>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Categoria</th>
            <th>Conta</th>
            <th>Total</th>
            <th>Exec</th>
            <th>Prog</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">Totais</td>
            <td class="num">${fmtBRL(consolidatedTotals.income + consolidatedTotals.expenseTotal)}</td>
            <td class="num">${fmtBRL(consolidatedTotals.expenseExec)}</td>
            <td class="num">${fmtBRL(consolidatedTotals.expenseProg)}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const html = toExcelHTML("Relatório consolidado (Categoria + Conta)", tableHTML);
    const fname = safeFileName(
      `relatorio-consolidado_${start}_a_${end}_cat-${categoryName}_conta-${accountName}.xls`
    );
    downloadBlob(fname, "application/vnd.ms-excel;charset=utf-8", html);
  }

  // ✅ PDF com layout “relatório” (cabeçalho/rodapé/totais/assinatura)
  function exportConsolidatedPDF() {
    const rows = consolidated
      .map(
        (r) => `
      <tr>
        <td>${r.kind === "income" ? "Entrada" : "Saída"}</td>
        <td>${r.category_name}</td>
        <td>${r.account_name}</td>
        <td class="num">${fmtBRL(r.total)}</td>
        <td class="num">${r.kind === "expense" ? fmtBRL(r.executed) : "—"}</td>
        <td class="num">${r.kind === "expense" ? fmtBRL(r.scheduled) : "—"}</td>
      </tr>
    `
      )
      .join("");

    const bodyHTML = `
      <div class="hdr">
        <div>
          <div class="brand">Financeiro Igreja</div>
          <div class="subtitle">Relatório gerado em ${nowBR()}</div>
        </div>
        <div class="metaBox">
          <div><span class="chip">Período: ${start} → ${end}</span></div>
          <div style="margin-top:6px;">
            <span class="chip">Categoria: ${categoryName}</span>
            <span class="chip">Conta: ${accountName}</span>
          </div>
          <div style="margin-top:6px;">
            <span class="chip">${pillTextForStatus(statusFilter)}</span>
            <span class="chip">Forma: ${paymentFilter?.trim() || "Todas"}</span>
          </div>
        </div>
      </div>

      <hr />

      <h1>Consolidado (Categoria + Conta)</h1>
      <div class="meta">Resumo por categoria e conta com totais de entradas e saídas (exec/prog).</div>

      <div class="kpis">
        <div class="kpi"><div class="lbl">Entradas</div><div class="val">${fmtBRL(summary.income)}</div></div>
        <div class="kpi"><div class="lbl">Saídas executadas</div><div class="val">${fmtBRL(
          summary.expenseExecuted
        )}</div></div>
        <div class="kpi"><div class="lbl">Saídas programadas</div><div class="val">${fmtBRL(
          summary.expenseScheduled
        )}</div></div>
        <div class="kpi"><div class="lbl">Resultado (total)</div><div class="val">${fmtBRL(
          summary.netAll
        )}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Categoria</th>
            <th>Conta</th>
            <th>Total</th>
            <th>Exec</th>
            <th>Prog</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">Totais</td>
            <td class="num">${fmtBRL(consolidatedTotals.income + consolidatedTotals.expenseTotal)}</td>
            <td class="num">${fmtBRL(consolidatedTotals.expenseExec)}</td>
            <td class="num">${fmtBRL(consolidatedTotals.expenseProg)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="sign">
        <div class="line">Responsável (nome e assinatura)</div>
        <div class="line">Tesouraria / Conselho (nome e assinatura)</div>
      </div>

      <div class="footer">
        <div>Financeiro Igreja • Relatórios</div>
        <div>Página 1</div>
      </div>
    `;

    openPrintWindow("Relatório consolidado", bodyHTML);
  }

  // ---------- EXPORTS (Lançamentos filtrados)
  function exportTxCSV() {
    const rows = txTable.map((r) => ({
      ...r,
      PeriodoInicio: start,
      PeriodoFim: end,
      FiltroCategoria: categoryName,
      FiltroConta: accountName,
      FiltroStatus: pillTextForStatus(statusFilter),
      FiltroForma: paymentFilter?.trim() || "Todas",
    }));

    const csv = toCSV(rows);
    const fname = safeFileName(
      `relatorio-lancamentos_${start}_a_${end}_cat-${categoryName}_conta-${accountName}.csv`
    );
    downloadBlob(fname, "text/csv;charset=utf-8", csv);
  }

  function exportTxExcel() {
    const rows = txTable
      .map(
        (t) => `
      <tr>
        <td>${t.Data}</td>
        <td>${t.Tipo}</td>
        <td>${t.Status}</td>
        <td>${(t.Descricao ?? "").toString()}</td>
        <td>${t.Categoria}</td>
        <td>${t.Conta}</td>
        <td>${t.Forma}</td>
        <td class="num">${fmtBRL(Number(t.Valor))}</td>
      </tr>
    `
      )
      .join("");

    const tableHTML = `
      <h1>Relatório de lançamentos</h1>
      <div class="meta">
        Período: ${start} até ${end} • Categoria: ${categoryName} • Conta: ${accountName} • ${pillTextForStatus(
      statusFilter
    )} • Forma: ${paymentFilter?.trim() || "Todas"}
      </div>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Conta</th>
            <th>Forma</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    const html = toExcelHTML("Relatório de lançamentos", tableHTML);
    const fname = safeFileName(
      `relatorio-lancamentos_${start}_a_${end}_cat-${categoryName}_conta-${accountName}.xls`
    );
    downloadBlob(fname, "application/vnd.ms-excel;charset=utf-8", html);
  }

  // ✅ PDF com layout “relatório” + totais e assinatura
  function exportTxPDF() {
    const rows = txTable
      .map((t) => {
        const tipo = t.Tipo;
        const status = t.Status;
        return `
        <tr>
          <td>${t.Data}</td>
          <td>${tipo}</td>
          <td>${status}</td>
          <td>${(t.Descricao ?? "").toString()}</td>
          <td>${t.Categoria}</td>
          <td>${t.Conta}</td>
          <td>${t.Forma}</td>
          <td class="num">${fmtBRL(Number(t.Valor))}</td>
        </tr>
      `;
      })
      .join("");

    const totalValor = txTable.reduce((s, r) => s + Number(r.Valor || 0), 0);
    const entradas = summary.income;
    const saidas = summary.expenseExecuted + summary.expenseScheduled;

    const bodyHTML = `
      <div class="hdr">
        <div>
          <div class="brand">Financeiro Igreja</div>
          <div class="subtitle">Relatório gerado em ${nowBR()}</div>
        </div>
        <div class="metaBox">
          <div><span class="chip">Período: ${start} → ${end}</span></div>
          <div style="margin-top:6px;">
            <span class="chip">Categoria: ${categoryName}</span>
            <span class="chip">Conta: ${accountName}</span>
          </div>
          <div style="margin-top:6px;">
            <span class="chip">${pillTextForStatus(statusFilter)}</span>
            <span class="chip">Forma: ${paymentFilter?.trim() || "Todas"}</span>
          </div>
        </div>
      </div>

      <hr />

      <h1>Lançamentos (detalhe)</h1>
      <div class="meta">Lista de lançamentos conforme filtros aplicados.</div>

      <div class="kpis">
        <div class="kpi"><div class="lbl">Entradas</div><div class="val">${fmtBRL(entradas)}</div></div>
        <div class="kpi"><div class="lbl">Saídas (exec + prog)</div><div class="val">${fmtBRL(
          saidas
        )}</div></div>
        <div class="kpi"><div class="lbl">Resultado (total)</div><div class="val">${fmtBRL(
          summary.netAll
        )}</div></div>
        <div class="kpi"><div class="lbl">Soma dos lançamentos</div><div class="val">${fmtBRL(
          totalValor
        )}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Conta</th>
            <th>Forma</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="7">Total</td>
            <td class="num">${fmtBRL(totalValor)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="sign">
        <div class="line">Responsável (nome e assinatura)</div>
        <div class="line">Tesouraria / Conselho (nome e assinatura)</div>
      </div>

      <div class="footer">
        <div>Financeiro Igreja • Relatórios</div>
        <div>Página 1</div>
      </div>
    `;

    openPrintWindow("Relatório de lançamentos", bodyHTML);
  }

  return (
    <AppShell>
      <div className={ui.pageText}>
        {/* HEADER */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
            <p className={`text-sm ${ui.muted} mt-1`}>
              Consolidado (Categoria + Conta) + filtros avançados + exportação CSV/Excel/PDF.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/lancamentos">
              <Button variant="ghost" type="button">
                Ver lançamentos
              </Button>
            </Link>

            <Button variant="ghost" onClick={load} disabled={loading} type="button">
              {loading ? "Atualizando…" : "Atualizar"}
            </Button>
          </div>
        </div>

        {/* FILTROS */}
        <Card className="mt-4 p-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 lg:grid-cols-14 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="text-sm">Início</label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>

              <div className="lg:col-span-2">
                <label className="text-sm">Fim</label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>

              <div className="lg:col-span-4">
                <label className="text-sm">Categoria</label>
                <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="">Todas as categorias</option>
                  <optgroup label="Entradas">
                    {categories
                      .filter((c) => c.kind === "income")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Saídas">
                    {categories
                      .filter((c) => c.kind === "expense")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                </Select>
              </div>

              <div className="lg:col-span-3">
                <label className="text-sm">Conta</label>
                <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                  <option value="">Todas as contas</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>

              {/* ✅ Status */}
              <div className="lg:col-span-2">
                <label className="text-sm">Status (saídas)</label>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="all">Todos</option>
                  <option value="executed">Executadas</option>
                  <option value="scheduled">Programadas</option>
                </Select>
              </div>

              {/* ✅ Forma */}
              <div className="lg:col-span-1">
                <label className="text-sm">Forma</label>
                <Input
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  placeholder="PIX"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" onClick={quickThisMonth} type="button">
                Este mês
              </Button>
              <Button variant="ghost" onClick={quickLast30} type="button">
                Últimos 30 dias
              </Button>
              <Button
                variant="ghost"
                onClick={resetFilters}
                type="button"
                disabled={
                  loading ||
                  (!categoryFilter && !accountFilter && statusFilter === "all" && !paymentFilter.trim())
                }
              >
                Limpar filtros
              </Button>

              <div className={`ml-auto text-xs ${ui.muted}`}>
                Período: <b>{start}</b> até <b>{end}</b> • Categoria: <b>{categoryName}</b> • Conta:{" "}
                <b>{accountName}</b> • <b>{pillTextForStatus(statusFilter)}</b> • Forma:{" "}
                <b>{paymentFilter.trim() ? paymentFilter.trim() : "Todas"}</b>
              </div>
            </div>
          </div>
        </Card>

        {error && (
          <div className="mt-4">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3">
          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Entradas</div>
            <div className="text-xl font-semibold mt-1">{fmtBRL(summary.income)}</div>
          </Card>

          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Saídas executadas</div>
            <div className="text-xl font-semibold mt-1">{fmtBRL(summary.expenseExecuted)}</div>
          </Card>

          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Saídas programadas</div>
            <div className="text-xl font-semibold mt-1">{fmtBRL(summary.expenseScheduled)}</div>
          </Card>

          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Resultado (exec)</div>
            <div className="text-xl font-semibold mt-1">{fmtBRL(summary.netExecuted)}</div>
            <div className={ui.hint}>Entradas − saídas executadas</div>
          </Card>

          <Card className="p-4">
            <div className={`text-sm ${ui.muted}`}>Resultado (total)</div>
            <div className="text-xl font-semibold mt-1">{fmtBRL(summary.netAll)}</div>
            <div className={ui.hint}>Entradas − (exec + prog)</div>
          </Card>
        </div>

        {/* CONSOLIDADO + EXPORT */}
        <Card className="mt-4 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">Consolidado (Categoria + Conta)</div>
              <div className={`text-xs ${ui.muted} mt-1`}>
                Agora com filtro por <b>Status</b> (saídas) e por <b>Forma</b>.
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" onClick={exportConsolidatedCSV} type="button" disabled={loading}>
                Exportar CSV
              </Button>
              <Button variant="ghost" onClick={exportConsolidatedExcel} type="button" disabled={loading}>
                Exportar Excel
              </Button>
              <Button variant="ghost" onClick={exportConsolidatedPDF} type="button" disabled={loading}>
                Exportar PDF
              </Button>
            </div>
          </div>

          {loading ? (
            <div className={`mt-3 text-sm ${ui.muted}`}>Carregando…</div>
          ) : consolidated.length === 0 ? (
            <div className={`mt-3 text-sm ${ui.muted}`}>Sem dados no período.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-left border-b ${ui.separator}`}>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Categoria</th>
                    <th className="py-2 pr-3">Conta</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Exec</th>
                    <th className="py-2 pr-3 text-right">Prog</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidated.map((r) => (
                    <tr
                      key={`${r.kind}:${r.category_id}:${r.account_id}`}
                      className={`border-b ${ui.separator}`}
                    >
                      <td className="py-2 pr-3">
                        <span className={r.kind === "income" ? ui.pillSuccess : ui.pillWarn}>
                          {r.kind === "income" ? "Entrada" : "Saída"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{r.category_name}</td>
                      <td className="py-2 pr-3">{r.account_name}</td>
                      <td className="py-2 pr-3 text-right font-medium">{fmtBRL(r.total)}</td>
                      <td className="py-2 pr-3 text-right">
                        {r.kind === "expense" ? fmtBRL(r.executed) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {r.kind === "expense" ? fmtBRL(r.scheduled) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`border-t ${ui.separator}`}>
                    <td className="py-2 pr-3 font-semibold" colSpan={3}>
                      Totais
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">
                      {fmtBRL(consolidatedTotals.income + consolidatedTotals.expenseTotal)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtBRL(consolidatedTotals.expenseExec)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{fmtBRL(consolidatedTotals.expenseProg)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className={`mt-3 ${ui.hint}`}>
                PDF abre a janela de impressão — escolha “Salvar como PDF”.
              </div>
            </div>
          )}
        </Card>

        {/* LANÇAMENTOS (DETALHE) + EXPORT */}
        <Card className="mt-4 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">Lançamentos (detalhe)</div>
              <div className={`text-xs ${ui.muted} mt-1`}>Mesmos filtros aplicados • ideal para contabilidade.</div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" onClick={exportTxCSV} type="button" disabled={loading}>
                Exportar CSV
              </Button>
              <Button variant="ghost" onClick={exportTxExcel} type="button" disabled={loading}>
                Exportar Excel
              </Button>
              <Button variant="ghost" onClick={exportTxPDF} type="button" disabled={loading}>
                Exportar PDF
              </Button>
            </div>
          </div>

          {loading ? (
            <div className={`mt-3 text-sm ${ui.muted}`}>Carregando…</div>
          ) : txsFiltered.length === 0 ? (
            <div className={`mt-3 text-sm ${ui.muted}`}>Sem lançamentos no período.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-left border-b ${ui.separator}`}>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Descrição</th>
                    <th className="py-2 pr-3">Categoria</th>
                    <th className="py-2 pr-3">Conta</th>
                    <th className="py-2 pr-3">Forma</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {txsFiltered.map((t) => {
                    const status =
                      t.kind === "expense"
                        ? (t.expense_status ?? "executed") === "executed"
                          ? "Executada"
                          : "Programada"
                        : "—";

                    return (
                      <tr key={t.id} className={`border-b ${ui.separator}`}>
                        <td className="py-2 pr-3 whitespace-nowrap">{t.date}</td>
                        <td className="py-2 pr-3">
                          <span className={t.kind === "income" ? ui.pillSuccess : ui.pillWarn}>
                            {t.kind === "income" ? "Entrada" : "Saída"}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{status}</td>
                        <td className="py-2 pr-3">{t.description ?? ""}</td>
                        <td className="py-2 pr-3">{t.categories?.name ?? "—"}</td>
                        <td className="py-2 pr-3">{t.accounts?.name ?? "—"}</td>
                        <td className="py-2 pr-3">{t.payment_method ?? ""}</td>
                        <td className="py-2 pr-3 text-right font-medium">{fmtBRL(Number(t.amount))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}