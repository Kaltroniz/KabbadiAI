"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Wrap any page with <AuthGuard> to redirect unauthenticated users to /auth.
 * Shows a full-screen loader while the session is rehydrating from localStorage.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [loading, user, router]);

  if (loading) {
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

  if (!user) return null;
  return <>{children}</>;
}
