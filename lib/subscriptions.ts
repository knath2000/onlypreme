import { createSupabaseServerClient, isServerSupabaseConfigured } from "./supabase/server";

export type SubscriptionStatus = {
  active: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function isSupabaseConfigured() {
  return isServerSupabaseConfigured();
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("status,current_period_end")
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const currentPeriodEnd = data.current_period_end as string | null;
  const isCurrent = !currentPeriodEnd || new Date(currentPeriodEnd).getTime() > Date.now();
  const status = data.status as string | null;

  return {
    active: Boolean(status && ACTIVE_STATUSES.has(status) && isCurrent),
    status,
    currentPeriodEnd
  };
}
