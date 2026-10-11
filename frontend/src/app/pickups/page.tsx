"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PickupsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/map");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
      <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-bold text-muted">Redirecting to Recycling Map…</p>
    </div>
  );
}
