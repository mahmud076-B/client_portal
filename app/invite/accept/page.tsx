"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Badge, BrandMark, Button, Field, Input } from "@/components/ui";
import "@/app/login/login-glass.css";

export default function InviteAcceptancePage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login?error=Invalid+or+expired+invitation+link");
      } else {
        setUserEmail(session.user.email || null);
        setSessionChecked(true);
      }
    });
  }, [supabase, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setError("Failed to set password. Please try again or contact support.");
      setLoading(false);
    } else {
      // Force refresh of the session to ensure claims are fully propagated before redirect
      await supabase.auth.refreshSession();
      router.push("/dashboard");
      router.refresh(); 
    }
  };

  if (!sessionChecked) {
    return (
      <div className="lgx-main" aria-busy="true">
        <span className="gx-spinner" style={{ width: 28, height: 28, color: 'var(--mk-orange)' }} aria-label="Checking invitation" />
      </div>
    );
  }

  return (
    <main className="lgx-main">
      <div className="lgx-mobile-brand" style={{ display: 'block' }}><BrandMark /></div>
      <div className="gx-card lgx-card" data-reveal="">
        <Badge tone="brand" live>Invitation</Badge>
        <div className="lgx-card__head">
          <h2>Accept your invitation</h2>
          <p>
            Create a secure password to activate your account for <strong style={{ color: 'var(--mk-ink)' }}>{userEmail}</strong> and open your dashboard.
          </p>
        </div>

        {error && <Alert>{error}</Alert>}

        <form onSubmit={handleUpdate} noValidate className="lgx-form">
          <Field label="New password" htmlFor="password" hint="At least 6 characters.">
            <Input type="password" id="password" name="password" required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword">
            <Input type="password" id="confirmPassword" name="confirmPassword" required autoComplete="new-password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={loading}>
            {loading ? 'Activating…' : (
              <>
                Activate &amp; continue
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </>
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
