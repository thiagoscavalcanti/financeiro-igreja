"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";
import { ui } from "@/lib/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // ✅ após login, ir para o Dashboard (Home)
    router.replace("/");
  }

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${ui.pageText}`}>
      <Card className="w-full max-w-md p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className={`text-sm mt-1 ${ui.muted}`}>
          Acesse o financeiro com seu usuário.
        </p>

        <form onSubmit={handleLogin} className="mt-5 space-y-3">
          <div>
            <label className="text-sm">E-mail</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm">Senha</label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
              className="mt-1"
            />
          </div>

          {msg && <Alert variant="danger">{msg}</Alert>}

          <Button
            variant="primary"
            className="w-full py-2"
            disabled={loading}
            type="submit"
          >
            {loading ? "Entrando…" : "Entrar"}
          </Button>

          <p className={ui.hint}>
            (Criação de usuários fica para a etapa “admin”, mas já dá pra criar
            manualmente no Supabase Auth.)
          </p>
        </form>
      </Card>
    </div>
  );
}