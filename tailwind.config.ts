import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        hospital: {
          ink: "#1f2937",
          line: "#d7dee8",
          panel: "#f7f9fc",
          green: "#0f766e",
          blue: "#2563eb",
          amber: "#b45309",
          red: "#b91c1c"
        }
      },
      boxShadow: {
        table: "0 1px 2px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
