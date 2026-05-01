import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscriptionStatus, isSupabaseConfigured } from "@/lib/subscriptions";
import OnlyPremeApp from "./only-preme-app";
import droplist from "@/data/droplist.json";

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const subscription = data.user ? await getSubscriptionStatus(data.user.id) : null;

  return (
    <OnlyPremeApp
      droplist={droplist}
      auth={{
        isConfigured: isSupabaseConfigured(),
        isSignedIn: Boolean(data.user),
        email: data.user?.email ?? null,
        hasActiveSubscription: subscription?.active ?? false
      }}
    />
  );
}
