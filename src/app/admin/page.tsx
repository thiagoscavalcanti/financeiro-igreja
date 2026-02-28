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

type Account = { id: string; name: string; active: boolean };
type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  active: boolean;
};
type Profile = {
  user_id: string;
  full_name: string | null;
  role: "admin" | "viewer";
  created_at: string;
};

export default function AdminPage() {
  const { isAdmin, loading: loadingRole } = useIsAdmin();

  const [tab, setTab] = useState<"accounts" | "categories" | "users">(
    "accounts"
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [newAccount, setNewAccount] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatKind, setNewCatKind] = useState<"income" | "expense">("income");

  async function loadAll() {
    setMsg(null);

    const [acc, cat, prof] = await Promise.all([
      supabase.from("accounts").select("id,name,active").order("name"),
      supabase
        .from("categories")
        .select("id,name,kind,active")
        .order("kind")
        .order("name"),
      supabase
        .from("profiles")
        .select("user_id,full_name,role,created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (acc.error) setMsg(acc.error.message);
    if (cat.error) setMsg(cat.error.message);
    if (prof.error) setMsg(prof.error.message);

    setAccounts((acc.data as any) ?? []);
    setCategories((cat.data as any) ?? []);
    setProfiles((prof.data as any) ?? []);
  }

  useEffect(() => {
    if (!loadingRole && isAdmin) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRole, isAdmin]);

  const disabled = loadingRole || !isAdmin;

  async function addAccount() {
    setMsg(null);
    if (!newAccount.trim()) return;
    setBusy(true);

    const { error } = await supabase
      .from("accounts")
      .insert({ name: newAccount.trim() });

    setBusy(false);
    if (error) return setMsg(error.message);
    setNewAccount("");
    loadAll();
  }

  async function toggleAccount(a: Account) {
    setMsg(null);
    setBusy(true);
    const { error } = await supabase
      .from("accounts")
      .update({ active: !a.active })
      .eq("id", a.id);
    setBusy(false);
    if (error) return setMsg(error.message);
    loadAll();
  }

  async function deleteAccount(a: Account) {
    setMsg(null);

    const ok = confirm(
      `Excluir a conta "${a.name}"? Isso não poderá ser desfeito.`
    );
    if (!ok) return;

    setBusy(true);
    const { error } = await supabase.from("accounts").delete().eq("id", a.id);
    setBusy(false);

    if (error) {
      setMsg(
        `Não foi possível excluir "${a.name}". Provavelmente ela já está sendo usada em lançamentos. ` +
          `Nesse caso, use "Desativar". Detalhe: ${error.message}`
      );
      return;
    }

    loadAll();
  }

  async function addCategory() {
    setMsg(null);
    if (!newCatName.trim()) return;
    setBusy(true);

    const { error } = await supabase.from("categories").insert({
      name: newCatName.trim(),
      kind: newCatKind,
    });

    setBusy(false);
    if (error) return setMsg(error.message);
    setNewCatName("");
    loadAll();
  }

  async function toggleCategory(c: Category) {
    setMsg(null);
    setBusy(true);
    const { error } = await supabase
      .from("categories")
      .update({ active: !c.active })
      .eq("id", c.id);
    setBusy(false);
    if (error) return setMsg(error.message);
    loadAll();
  }

  async function deleteCategory(c: Category) {
    setMsg(null);

    const ok = confirm(
      `Excluir a categoria "${c.name}" (${
        c.kind === "income" ? "Entrada" : "Saída"
      })? Isso não poderá ser desfeito.`
    );
    if (!ok) return;

    setBusy(true);
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    setBusy(false);

    if (error) {
      setMsg(
        `Não foi possível excluir "${c.name}". Provavelmente ela já está sendo usada em lançamentos. ` +
          `Nesse caso, use "Desativar". Detalhe: ${error.message}`
      );
      return;
    }

    loadAll();
  }

  async function setUserRole(p: Profile, role: "admin" | "viewer") {
    setMsg(null);
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("user_id", p.user_id);
    setBusy(false);
    if (error) return setMsg(error.message);
    loadAll();
  }

  const catsIncome = useMemo(
    () => categories.filter((c) => c.kind === "income"),
    [categories]
  );
  const catsExpense = useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories]
  );

  return (
    <AppShell>
      <div className={ui.pageText}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Admin</h1>
            <p className={`text-sm ${ui.muted}`}>
              Gerencie contas, categorias e permissões.
            </p>
          </div>
        </div>

        {disabled ? (
          <div className="mt-6">
            <Alert variant="warn">
              Você precisa ser <b>admin</b> para acessar esta tela.
            </Alert>
          </div>
        ) : (
          <>
            {msg && (
              <div className="mt-4">
                <Alert variant="danger">{msg}</Alert>
              </div>
            )}

            <div className="mt-6 flex gap-2 flex-wrap">
              <Button
                variant={tab === "accounts" ? "primary" : "ghost"}
                onClick={() => setTab("accounts")}
                type="button"
              >
                Contas
              </Button>
              <Button
                variant={tab === "categories" ? "primary" : "ghost"}
                onClick={() => setTab("categories")}
                type="button"
              >
                Categorias
              </Button>
              <Button
                variant={tab === "users" ? "primary" : "ghost"}
                onClick={() => setTab("users")}
                type="button"
              >
                Usuários
              </Button>
            </div>

            {/* CONTAS */}
            {tab === "accounts" && (
              <Card className="mt-4 p-4">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                  <div className="font-semibold">Contas</div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={newAccount}
                      onChange={(e) => setNewAccount(e.target.value)}
                      placeholder="Nova conta (ex: Caixa)"
                    />
                    <Button
                      variant="primary"
                      onClick={addAccount}
                      disabled={busy}
                      type="button"
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {accounts.map((a) => (
                    <Card
                      key={a.id}
                      variant="soft"
                      className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className={`text-xs ${ui.muted}`}>
                          {a.active ? "Ativa" : "Inativa"}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          onClick={() => toggleAccount(a)}
                          disabled={busy}
                          type="button"
                        >
                          {a.active ? "Desativar" : "Ativar"}
                        </Button>

                        <Button
                          variant="danger"
                          onClick={() => deleteAccount(a)}
                          disabled={busy}
                          type="button"
                        >
                          Excluir
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            )}

            {/* CATEGORIAS */}
            {tab === "categories" && (
              <Card className="mt-4 p-4">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                  <div className="font-semibold">Categorias</div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select
                      value={newCatKind}
                      onChange={(e) =>
                        setNewCatKind(e.target.value as "income" | "expense")
                      }
                    >
                      <option value="income">Entrada</option>
                      <option value="expense">Saída</option>
                    </Select>

                    <Input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="Nova categoria"
                    />

                    <Button
                      variant="primary"
                      onClick={addCategory}
                      disabled={busy}
                      type="button"
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="font-semibold mb-2">Entradas</div>
                    <div className="space-y-2">
                      {catsIncome.map((c) => (
                        <Card
                          key={c.id}
                          variant="soft"
                          className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-medium">{c.name}</div>
                            <div className={`text-xs ${ui.muted}`}>
                              {c.active ? "Ativa" : "Inativa"}
                            </div>
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="ghost"
                              onClick={() => toggleCategory(c)}
                              disabled={busy}
                              type="button"
                            >
                              {c.active ? "Desativar" : "Ativar"}
                            </Button>

                            <Button
                              variant="danger"
                              onClick={() => deleteCategory(c)}
                              disabled={busy}
                              type="button"
                            >
                              Excluir
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold mb-2">Saídas</div>
                    <div className="space-y-2">
                      {catsExpense.map((c) => (
                        <Card
                          key={c.id}
                          variant="soft"
                          className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div>
                            <div className="text-sm font-medium">{c.name}</div>
                            <div className={`text-xs ${ui.muted}`}>
                              {c.active ? "Ativa" : "Inativa"}
                            </div>
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="ghost"
                              onClick={() => toggleCategory(c)}
                              disabled={busy}
                              type="button"
                            >
                              {c.active ? "Desativar" : "Ativar"}
                            </Button>

                            <Button
                              variant="danger"
                              onClick={() => deleteCategory(c)}
                              disabled={busy}
                              type="button"
                            >
                              Excluir
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>

                <p className={`mt-4 ${ui.hint}`}>
                  Dica: se uma categoria estiver em uso em algum lançamento, o
                  banco vai bloquear a exclusão. Nesse caso, use{" "}
                  <b>Desativar</b>.
                </p>
              </Card>
            )}

            {/* USUÁRIOS */}
            {tab === "users" && (
              <Card className="mt-4 p-4">
                <div className="font-semibold">Usuários</div>
                <div className={`text-sm mt-1 ${ui.muted}`}>
                  Aqui você promove/rebaixa permissões com base no cadastro em{" "}
                  <b>profiles</b>.
                </div>

                <div className="mt-4 space-y-2">
                  {profiles.map((p) => (
                    <Card
                      key={p.user_id}
                      variant="soft"
                      className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {p.full_name || "(sem nome)"}
                        </div>
                        <div className={`text-xs ${ui.muted} truncate`}>
                          {p.user_id} • {p.role.toUpperCase()}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          onClick={() => setUserRole(p, "viewer")}
                          disabled={busy}
                          type="button"
                        >
                          Viewer
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => setUserRole(p, "admin")}
                          disabled={busy}
                          type="button"
                        >
                          Admin
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}