"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Wrap any protected page with <AuthGuard> to redirect unauthenticated users to /auth/.
 * Includes a safety timeout so it never hangs in static export or during network delays.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if ((!loading || timedOut) && !user) {
      if (typeof window !== "undefined") {
        window.location.replace("/auth/");
      }
    }
  }, [loading, user, timedOut]);

  if (loading && !timedOut) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <div style={{ position: "relative", width: 52, height: 52 }}>
          <div className="orbit-dot" />
          <div className="orbit-dot" />
          <div className="orbit-dot" />
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading KabadiAI…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
          Please sign in to access this page.
        </p>
        <a
          href="/auth/"
          className="btn btn-primary"
          style={{ padding: "10px 22px", textDecoration: "none", borderRadius: 14 }}
        >
          Sign In Now →
        </a>
      </div>
    );
  }

  return <>{children}</>;
}

