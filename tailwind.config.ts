import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 40px rgba(255, 162, 0, 0.22)"
      },
      backgroundImage: {
        noise:
          "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 18%), radial-gradient(circle at 80% 10%, rgba(255,214,170,0.1), transparent 15%), radial-gradient(circle at 80% 80%, rgba(115,47,24,0.15), transparent 20%)"
      }
    }
  },
  plugins: []
};

export default config;
