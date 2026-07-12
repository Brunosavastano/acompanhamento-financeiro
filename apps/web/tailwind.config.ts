import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tokens do redesign (design_handoff_redesign_savastano/README.md)
        night: "#070C18",
        surface: { DEFAULT: "#0E1526", 2: "#0B1120" },
        sidebar: "#0A101F",
        elevated: "#141D33",
        edge: { DEFAULT: "#1F2A42", soft: "#182238", hair: "#121B2E" },
        gold: { DEFAULT: "#C9A96E", light: "#E3C98E" },
        snow: "#EEF2FA",
        body: "#C6CFDF",
        muted: "#8B96AD",
        faint: "#5C687F",
        positive: { DEFAULT: "#5BCB8D", text: "#6FD99A" },
        negative: { DEFAULT: "#E0688F", text: "#EC9FB9" },
        info: { DEFAULT: "#6E9BD8", text: "#9FBCE8" },
        steel: "#3A4A6B",
        // Tokens legados (telas ainda não redesenhadas)
        ink: "#050914",
        panel: "#0b1220",
        panel2: "#111a2d",
        line: "#22314b",
        cyan: "#35d8ff",
        green: "#58f28a",
        magenta: "#ff4f91",
        amber: "#ffb84d",
      },
      boxShadow: {
        glow: "0 30px 80px rgba(0, 0, 0, 0.5)",
      },
      fontFamily: {
        sans: ["var(--font-plex)", "IBM Plex Sans", "Segoe UI", "system-ui", "sans-serif"],
        display: ["var(--font-marcellus)", "Marcellus", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
