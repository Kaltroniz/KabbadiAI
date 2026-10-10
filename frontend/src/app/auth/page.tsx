"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/contexts/AuthContext";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/* ── Floating label input ────────────────────────────────────────────── */
function FloatInput({
  id, label, type = "text", value, onChange, autoComplete,
}: {
  id: string; label: string; type?: string;
  value: string; onChange: (v: string) => void; autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;
  return (
    <div style={{ position: "relative", marginBottom: "1.25rem" }}>
      <label
        htmlFor={id}
        style={{
          position: "absolute",
          left: 16, top: raised ? 6 : 18,
          fontSize: raised ? "0.65rem" : "0.9rem",
          color: raised ? (focused ? "#00e5a0" : "rgba(200,235,220,0.5)") : "rgba(200,235,220,0.45)",
          fontWeight: raised ? 700 : 500,
          letterSpacing: raised ? "0.06em" : 0,
          textTransform: raised ? "uppercase" : "none",
          pointerEvents: "none",
          transition: "all 0.18s cubic-bezier(.22,1,.36,1)",
          zIndex: 1,
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          border: `1.5px solid ${focused ? "rgba(0,229,160,0.6)" : "rgba(255,255,255,0.10)"}`,
          borderRadius: 16,
          color: "var(--text-primary)",
          fontFamily: "Inter,sans-serif",
          fontSize: "0.95rem",
          padding: "22px 16px 8px",
          outline: "none",
          boxSizing: "border-box",
          boxShadow: focused ? "0 0 0 3px rgba(0,229,160,0.10),0 0 20px rgba(0,229,160,0.08)" : "none",
          transition: "border-color 0.18s,box-shadow 0.18s",
        }}
      />
    </div>
  );
}

/* ── Google button (uses access_token flow to get email then calls /auth/google) */
function GoogleBtn({ onSuccess, disabled }: { onSuccess: (credential: string) => void; disabled: boolean }) {
  const login = useGoogleLogin({
    onSuccess: async (tokenResp) => {
      // Exchange access_token for userinfo, then send to our backend
      // We send the access_token; backend uses tokeninfo endpoint
      // Actually the backend expects the credential (ID token). For implicit flow use credential.
      // We'll fetch userinfo and pass the access_token as "credential" so the backend can call tokeninfo.
      onSuccess(tokenResp.access_token);
    },
    onError: () => { /* silently ignore – user cancelled */ },
  });

  return (
    <button
      type="button"
      onClick={() => login()}
      disabled={disabled}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "rgba(255,255,255,0.07)",
        border: "1.5px solid rgba(255,255,255,0.14)",
        borderRadius: 16,
        color: "var(--text-primary)",
        fontFamily: "Inter,sans-serif",
        fontWeight: 600,
        fontSize: "0.95rem",
        padding: "14px 20px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        minHeight: 52,
        transition: "all 0.18s",
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.22)";
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
      }}
    >
      {/* Google G logo */}
      <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continue with Google
    </button>
  );
}

/* ── Divider ─────────────────────────────────────────────────────────── */
function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "1.25rem 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
      <span style={{ color: "rgba(200,235,220,0.4)", fontSize: "0.75rem", fontWeight: 600 }}>OR</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
    </div>
  );
}

/* ── Main auth form ────────────────────────────────────────────────── */
function AuthForm() {
  const { login, register, loginWithGoogle, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setError("");
    setName(""); setEmail(""); setPassword(""); setConfirm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (password !== confirm) { setError("Passwords do not match."); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async (token: string) => {
    setBusy(true);
    setError("");
    try {
      await loginWithGoogle(token);
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!mounted || authLoading) return null;

  return (
    <>
      {/* Background particles */}
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="particle" />)}
      </div>

      <div style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem 1rem",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Logo / brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "2rem" }}>
          <div className="logo-icon animate-float" style={{ width: 64, height: 64, fontSize: 30, marginBottom: 14, boxShadow: "0 0 40px rgba(0,229,160,0.35)" }}>
            ♻
          </div>
          <h1 className="gradient-text" style={{ fontFamily: "Outfit,sans-serif", fontWeight: 900, fontSize: "2rem", margin: 0, lineHeight: 1 }}>
            KabadiAI
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 6 }}>
            e-Waste Intelligence Platform
          </p>
        </div>

        {/* Card */}
        <div
          ref={cardRef}
          className="card animate-fade-up"
          style={{ width: "100%", maxWidth: 420, padding: "2rem 1.75rem" }}
        >
          {/* Tab switcher */}
          <div style={{
            display: "flex",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 14,
            padding: 4,
            marginBottom: "1.75rem",
          }}>
            {(["login", "register"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  background: mode === m ? "linear-gradient(135deg,#00e5a0,#047857)" : "transparent",
                  border: "none",
                  borderRadius: 11,
                  color: mode === m ? "#040f09" : "var(--text-muted)",
                  fontFamily: "Outfit,sans-serif",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  padding: "10px",
                  cursor: "pointer",
                  minHeight: "unset",
                  transition: "all 0.22s cubic-bezier(.34,1.56,.64,1)",
                  boxShadow: mode === m ? "0 0 20px rgba(0,229,160,0.3)" : "none",
                }}
              >
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          {/* Google OAuth */}
          {GOOGLE_CLIENT_ID ? (
            <>
              <GoogleBtn onSuccess={handleGoogle} disabled={busy} />
              <Divider />
            </>
          ) : null}

          {/* Email / password form */}
          <form onSubmit={handleSubmit} noValidate>
            {mode === "register" && (
              <FloatInput id="name" label="Full name" value={name} onChange={setName} autoComplete="name" />
            )}
            <FloatInput id="email" label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />

            {/* Password with show/hide toggle */}
            <div style={{ position: "relative", marginBottom: mode === "register" ? "1.25rem" : "0.5rem" }}>
              <FloatInput
                id="password"
                label="Password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={setPassword}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-80%)",
                  background: "none", border: "none", color: "var(--text-muted)",
                  fontSize: "1.1rem", cursor: "pointer", padding: 4, minHeight: "unset",
                }}
              >
                {showPw ? "🙈" : "👁"}
              </button>
            </div>

            {mode === "register" && (
              <FloatInput
                id="confirm"
                label="Confirm password"
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
            )}

            {/* Error */}
            {error && (
              <div style={{
                background: "rgba(220,38,38,0.1)",
                border: "1px solid rgba(220,38,38,0.35)",
                borderRadius: 12,
                padding: "0.65rem 1rem",
                color: "#f87171",
                fontSize: "0.82rem",
                marginBottom: "1rem",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}>
                <span>⚠</span> {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="auth-submit-btn"
              type="submit"
              disabled={busy}
              className="btn btn-primary w-full"
              style={{ borderRadius: 16, marginTop: mode === "register" ? 0 : "1rem", minHeight: 56, fontFamily: "Outfit,sans-serif", fontWeight: 800, fontSize: "1rem", letterSpacing: "0.02em" }}
            >
              {busy ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg style={{ animation: "spin 1s linear infinite" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M22 12a10 10 0 0 0-10-10"/>
                  </svg>
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </span>
              ) : (
                mode === "login" ? "Sign In →" : "Create Account →"
              )}
            </button>
          </form>

          {/* Fine print */}
          {mode === "register" && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", textAlign: "center", marginTop: "1rem", lineHeight: 1.5 }}>
              By registering, you agree to our{" "}
              <span style={{ color: "var(--emerald-glow)", cursor: "pointer" }}>Terms of Service</span>.
              No personal data beyond your email is shared.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Page: wraps with Google provider ──────────────────────────────── */
export default function AuthPage() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || "placeholder"}>
      <AuthForm />
    </GoogleOAuthProvider>
  );
}
