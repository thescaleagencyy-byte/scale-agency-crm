import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptMessages } from "@/lib/crypto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conversation_id = searchParams.get("conversation_id");
  const conversation_ids = searchParams.get("conversation_ids");

  if (!conversation_id && !conversation_ids) {
    return NextResponse.json(
      { error: "conversation_id or conversation_ids required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let query = supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (conversation_id) {
    query = query.eq("conversation_id", conversation_id);
  } else {
    const ids = conversation_ids!.split(",").filter(Boolean);
    query = query.in("conversation_id", ids).not("content_text", "is", null).limit(20);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(decryptMessages(data ?? []));
}
