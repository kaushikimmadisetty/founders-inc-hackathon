import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-sans)", "sans-serif"], serif: ["var(--font-serif)", "Georgia", "serif"], mono: ["var(--font-mono)", "ui-monospace", "monospace"] },
      colors: { ink: "#f7f8fa", panel: "#ffffff", line: "#e6e8ee", acc: "#3b82f6", ok: "#15803d", bad: "#c24140", warn: "#a16207" },
    },
  },
  plugins: [],
} satisfies Config;
