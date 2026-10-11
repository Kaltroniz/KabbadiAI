"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.protocol === "https:"
    ) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            // Check for service worker updates
            reg.addEventListener("updatefound", () => {
              const installingWorker = reg.installing;
              if (installingWorker) {
                installingWorker.addEventListener("statechange", () => {
                  if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                    console.log("[PWA] New version ready.");
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn("[PWA] Service worker registration error:", err);
          });
      });
    }
  }, []);

  return null;
}
