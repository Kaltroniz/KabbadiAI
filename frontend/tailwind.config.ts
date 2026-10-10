import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Outfit", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "sans-serif"],
      },
      colors: {
        emerald: {
          glow: "#00e5a0",
          mid: "#10b981",
          dark: "#047857",
        },
        surface: "rgba(15,25,20,0.72)",
      },
      animation: {
        "fade-up": "fadeUp 0.45s cubic-bezier(.22,1,.36,1) forwards",
        "fade-in": "fadeUp 0.45s cubic-bezier(.22,1,.36,1) forwards",
        "scale-pop": "scalePop 0.5s cubic-bezier(.34,1.56,.64,1) forwards",
        "pulse-glow": "pulseGlow 2.5s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
        shimmer: "shimmer 1.8s ease-in-out infinite",
        spin: "spin 1s linear infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scalePop: {
          "0%": { opacity: "0", transform: "scale(0.7)" },
          "70%": { transform: "scale(1.05)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0,229,160,0.3)" },
          "50%": { boxShadow: "0 0 50px rgba(0,229,160,0.6), 0 0 80px rgba(0,229,160,0.2)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backdropBlur: {
        xs: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
