import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "#e5e7eb",
        surface: "#ffffff",
        muted: "#f4f5f7",
        ink: "#151821",
        primary: "#6157ff"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(16, 24, 40, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
