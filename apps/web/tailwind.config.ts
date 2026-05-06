import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
        glow: "0 18px 60px rgba(53, 216, 255, 0.12)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
