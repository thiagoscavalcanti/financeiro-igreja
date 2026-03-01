import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  email: string;
  password: string;
  full_name?: string | null;
  role?: "admin" | "viewer";
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: "Missing server env vars (SUPABASE_SERVICE_ROLE_KEY / SUPABASE URL/KEY)" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();
    const fullName = (body.full_name || "").trim() || null;
    const role: "admin" | "viewer" = body.role === "admin" ? "admin" : "viewer";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios." },
        { status: 400 }
      );
    }

    // Client ANON para validar token do usuário logado (quem está chamando)
    const supaAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supaAnon.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requesterId = userData.user.id;

    // Client SERVICE para checar role e criar usuário
    const supaService = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: requesterProfile, error: profErr } = await supaService
      .from("profiles")
      .select("role")
      .eq("user_id", requesterId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    if (!requesterProfile || requesterProfile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Cria usuário no Auth
    const { data: created, error: createErr } =
      await supaService.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message || "Falha ao criar usuário." },
        { status: 400 }
      );
    }

    const newUserId = created.user.id;

    // Garante profile
    const { error: upsertErr } = await supaService.from("profiles").upsert(
      {
        user_id: newUserId,
        full_name: fullName,
        role,
      },
      { onConflict: "user_id" }
    );

    if (upsertErr) {
      return NextResponse.json(
        { error: "Usuário criado no Auth, mas falhou ao salvar profile: " + upsertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ user_id: newUserId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro inesperado." },
      { status: 500 }
    );
  }
}