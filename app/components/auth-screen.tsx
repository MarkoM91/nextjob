"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "./shared";

type AuthMode = "sign-in" | "sign-up" | "forgot-password";
export type CredentialMode = "sign-in" | "sign-up";
type ProviderSummary = { id: string; name: string };
type SessionPayload = { signedIn: boolean; user: { email: string; displayName: string; provider: string } | null; providers: ProviderSummary[]; passwordEnabled: boolean; chatgptEnabled: boolean };

const PASSWORD_MIN_LENGTH = 12;

/** Brand marks drawn inline so the buttons need no third-party asset or tracker. */
function ProviderMark({ id }: { id: string }) {
  if (id === "google") {
    return <svg viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#4285f4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.5 6.6-16.1z" />
      <path fill="#34a853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z" />
      <path fill="#fbbc05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.5 2 24s.8 6.9 2.3 9.8l7.4-5.7z" />
      <path fill="#ea4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.4 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" />
    </svg>;
  }
  if (id === "linkedin") {
    return <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path fill="#0a66c2" d="M20.4 20.4h-3.6v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9v5.7H9.2V9h3.4v1.6h.1c.5-.9 1.7-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.4H3.5V9h3.6v11.4zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7c0-.9-.8-1.7-1.8-1.7z" /></svg>;
  }
  if (id === "github") {
    return <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path fill="#1b1f23" d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" /></svg>;
  }
  if (id === "microsoft") {
    return <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path fill="#f25022" d="M2 2h9.3v9.3H2z" /><path fill="#7fba00" d="M12.7 2H22v9.3h-9.3z" /><path fill="#00a4ef" d="M2 12.7h9.3V22H2z" /><path fill="#ffb900" d="M12.7 12.7H22V22h-9.3z" /></svg>;
  }
  if (id === "facebook") {
    return <svg viewBox="0 0 24 24" aria-hidden focusable="false"><path fill="#1877f2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z" /></svg>;
  }
  return null;
}

/** The query string, read without a synchronous setState during hydration. */
function useSearch(): string {
  return useSyncExternalStore(() => () => undefined, () => window.location.search, () => "");
}

export function useAuthSession(): SessionPayload | null {
  const [session, setSession] = useState<SessionPayload | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? (response.json() as Promise<SessionPayload>) : null))
      .then((payload) => { if (active && payload) setSession(payload); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return session;
}

/**
 * The sign-in surface itself: social providers, hosted ChatGPT, and email/password.
 * Used both by the dedicated sign-in page and inline wherever an action needs an
 * account, so a person never has to leave what they were doing to authenticate.
 *
 * `onSignedIn` keeps the caller in place after an email/password sign-in. Social
 * sign-in always leaves the page, so it returns to `returnTo`.
 */
export function SignInPanel({ mode, onModeChange, returnTo, onSignedIn }: {
  mode: CredentialMode;
  onModeChange?: (mode: CredentialMode) => void;
  returnTo?: string | null;
  onSignedIn?: () => void;
}) {
  const session = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const providers = session?.providers ?? [];
  const chatgptEnabled = session?.chatgptEnabled ?? false;
  // Only draw the divider when something actually sits above it.
  const hasOneClickOption = providers.length > 0 || chatgptEnabled;
  const socialQuery = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ intent: mode, email, password, fullName: fullName || undefined, returnTo: returnTo ?? undefined }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; redirectTo?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setFormError(payload?.error ?? "Sign-in could not be completed. Please try again.");
        return;
      }
      if (onSignedIn) onSignedIn();
      else window.location.assign(payload.redirectTo ?? "/dashboard");
    } catch {
      setFormError("The server could not be reached. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    {providers.length > 0 && <div className="social-buttons">
      {providers.map((provider) => (
        <a key={provider.id} className="social-button" href={`/api/auth/${provider.id}/start${socialQuery}`}>
          <ProviderMark id={provider.id} />
          <span>{mode === "sign-up" ? `Sign up with ${provider.name}` : `Continue with ${provider.name}`}</span>
        </a>
      ))}
    </div>}

    {chatgptEnabled && <Link href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo ?? "/dashboard")}`} className="chatgpt-button"><Sparkles /> Continue securely with ChatGPT</Link>}

    {hasOneClickOption && <div className="auth-divider"><span>or use email</span></div>}

    <form className="auth-credentials" onSubmit={submitCredentials}>
      {mode === "sign-up" && <label>Full name<input type="text" autoComplete="name" placeholder="Your name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>}
      <label>Email address<input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>Password{mode === "sign-in" && <Link href="/forgot-password">Forgot password?</Link>}</span>
        <input type="password" required minLength={mode === "sign-up" ? PASSWORD_MIN_LENGTH : undefined} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} placeholder={mode === "sign-up" ? `At least ${PASSWORD_MIN_LENGTH} characters` : "Your password"} value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {formError && <p className="auth-alert" role="alert">{formError}</p>}
      <button className="button full" type="submit" disabled={submitting}>
        {submitting ? <><Loader2 className="spin" /> {mode === "sign-up" ? "Creating your account…" : "Signing in…"}</> : <>{mode === "sign-up" ? "Create account" : "Sign in"}<ArrowRight /></>}
      </button>
    </form>

    {onModeChange && <p className="auth-switch">
      {mode === "sign-in"
        ? <>New to NextJOB? <button type="button" className="link-button" onClick={() => onModeChange("sign-up")}>Create an account</button></>
        : <>Already have an account? <button type="button" className="link-button" onClick={() => onModeChange("sign-in")}>Sign in</button></>}
    </p>}
  </>;
}

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const search = useSearch();
  const query = new URLSearchParams(search);
  // A failed or cancelled provider round-trip comes back with a readable reason.
  const notice = query.get("error");
  const requestedReturn = query.get("return_to");
  const returnTo = requestedReturn && requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : null;

  const title = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your NextJOB account" : "Reset your password";
  const subtitle = mode === "forgot-password"
    ? "Password resets need an email provider, which this workspace has not enabled yet."
    : mode === "sign-in"
      ? "Continue to your private job-search workspace."
      : "Start with a social account or an email address. Your first CV stays private.";

  return <main className="auth-page">
    <div className="auth-brand">
      <Logo />
      <div>
        <p className="eyebrow light">Your search, in focus</p>
        <h1>One verified profile.<br />A world of <em>relevant</em> roles.</h1>
        <p>Private by default. Factual by design. You stay in control of every application.</p>
      </div>
      <span><ShieldCheck /> Nothing is ever submitted automatically.</span>
    </div>

    <div className="auth-form">
      <Link href="/" className="back-link"><ArrowLeft /> Back home</Link>
      <div><h1>{title}</h1><p>{subtitle}</p></div>

      {notice && <p className="auth-alert" role="alert">{notice}</p>}

      {mode !== "forgot-password" && <SignInPanel mode={mode} returnTo={returnTo} />}

      {mode === "forgot-password" && <div className="auth-credentials">
        <p className="auth-hint">Use the social provider you signed up with, or ask an administrator to enable the email adapter so reset links can be delivered. NextJOB will not pretend to send an email it cannot send.</p>
        <Link className="button full" href="/sign-in">Return to sign in<ArrowRight /></Link>
      </div>}

      <p className="auth-switch">
        {mode === "sign-in" ? <>New to NextJOB? <Link href="/sign-up">Create an account</Link></>
          : mode === "sign-up" ? <>Already have an account? <Link href="/sign-in">Sign in</Link></>
            : <Link href="/sign-in">Return to sign in</Link>}
      </p>
      <small className="auth-note">Social sign-in shares only your name, email address, and picture. NextJOB never posts on your behalf and never stores a provider password.</small>
    </div>
  </main>;
}
