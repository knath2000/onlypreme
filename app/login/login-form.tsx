"use client";

import { createSupabaseBrowserClient, isBrowserSupabaseConfigured } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isConfigured = isBrowserSupabaseConfigured();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase environment variables are not configured yet.");
      setIsSubmitting(false);
      return;
    }

    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/api/auth/callback`
      }
    });

    setMessage(error ? error.message : "Check your email for a magic sign-in link.");
    setIsSubmitting(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">OnlyPreme</p>
        <h1>Sign in</h1>
        <p className="detail-text">Protected predictions require an account and an active subscription.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <button type="submit" disabled={isSubmitting || !isConfigured}>
            {isSubmitting ? "Sending..." : "Send magic link"}
          </button>
        </form>
        {message ? <p className="auth-message">{message}</p> : null}
        {!isConfigured ? <p className="auth-message">Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable login.</p> : null}
        <Link href="/">Back to droplist</Link>
      </section>
    </main>
  );
}
