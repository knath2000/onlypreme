import { promises as fs } from "node:fs";
import path from "node:path";
import droplist from "@/data/droplist.json";
import { getSubscriptionStatus } from "@/lib/subscriptions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

type Item = {
  id: string;
  predictionFile?: string;
};

function predictionPathFor(itemId: string) {
  const item = (droplist.items as Item[]).find((entry) => entry.id === itemId);
  if (!item?.predictionFile) return null;
  const relativePath = item.predictionFile.replace(/^\.\//, "");
  if (!relativePath.startsWith("data/predictions/") || !relativePath.endsWith(".json")) return null;
  return path.join(process.cwd(), relativePath);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ error: "Sign in to view protected predictions." }, { status: 401 });
  }

  const subscription = await getSubscriptionStatus(data.user.id);
  if (!subscription?.active) {
    return NextResponse.json({ error: "An active subscription is required to view protected predictions." }, { status: 402 });
  }

  const { itemId } = await params;
  const predictionPath = predictionPathFor(itemId);
  if (!predictionPath) {
    return NextResponse.json({ error: "Prediction not found." }, { status: 404 });
  }

  try {
    const raw = await fs.readFile(predictionPath, "utf8");
    return new NextResponse(raw, {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Prediction not found." }, { status: 404 });
  }
}
