/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        state: {
          working: "#22c55e",
          waiting: "#eab308",
          idle: "#3b82f6",
          queued: "#a855f7",
          done: "#64748b",
          error: "#ef4444",
        },
        surface: {
          0: "#0b1220",
          1: "#0f172a",
          2: "#111c33",
          3: "#1a253f",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34, 197, 94, 0.18), 0 0 24px -8px rgba(34, 197, 94, 0.45)",
      },
    },
  },
  plugins: [],
};
