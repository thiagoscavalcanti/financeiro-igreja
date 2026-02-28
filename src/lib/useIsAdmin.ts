"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        if (mounted) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (!mounted) return;

      if (error) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(data?.role === "admin");
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  return { isAdmin, loading };
}