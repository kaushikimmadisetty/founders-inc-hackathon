import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0b0d12", panel: "#141822", line: "#242a38", acc: "#3b82f6", ok: "#22c55e", bad: "#ef4444", warn: "#f59e0b" },
    },
  },
  plugins: [],
} satisfies Config;
