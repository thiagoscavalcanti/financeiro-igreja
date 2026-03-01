"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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

    router.replace("/");
  }

  return (
    <div className={`min-h-screen ${ui.pageText} relative overflow-hidden`}>
      {/* Fundo “premium” */}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900" />
      <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />

      <div className="relative min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Cabeçalho */}
          <div className="text-center mb-6">
            <div className="mx-auto w-fit rounded-2xl bg-white/5 border border-white/10 px-5 py-4">
              <Image
                src="/brand/ipra-logo.png"
                alt="IPRA"
                width={220}
                height={80}
                priority
                className="h-10 w-auto mx-auto"
              />
            </div>

            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
              Tesouraria IPRA
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Acesso ao sistema financeiro interno
            </p>
          </div>

          <Card className="p-6 shadow-lg border border-white/10 bg-white/5 backdrop-blur">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Entrar</h2>
              <p className="text-sm text-white/70 mt-1">
                Use seu e-mail e senha para continuar.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-sm text-white/80">E-mail</label>
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
                <label className="text-sm text-white/80">Senha</label>
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

              <div className="pt-2 text-center text-xs text-white/50">
                © {new Date().getFullYear()} IPRA · Tesouraria
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}