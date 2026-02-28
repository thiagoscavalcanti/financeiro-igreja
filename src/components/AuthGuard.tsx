"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const isAuthed = !!data.session;

      if (!isAuthed && pathname !== "/login") {
        router.replace("/login");
        return;
      }
      if (mounted) setReady(true);
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== "/login") router.replace("/login");
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (!ready) return <div className="p-6 text-sm opacity-70">Carregando…</div>;
  return <>{children}</>;
}