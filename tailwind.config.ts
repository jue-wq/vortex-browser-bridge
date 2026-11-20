import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        vortex: {
          950: "#050b1c",
          900: "#08142d",
          800: "#0d2042",
          700: "#12376c",
          500: "#1769ff",
          400: "#28a5ff",
          300: "#53d8ff",
          100: "#e8f6ff"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      fontVariantNumeric: {
        tabular: "tabular-nums"
      }
    }
  },
  plugins: []
} satisfies Config;
