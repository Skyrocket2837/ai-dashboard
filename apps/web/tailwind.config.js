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
      },
    },
  },
  plugins: [],
};
