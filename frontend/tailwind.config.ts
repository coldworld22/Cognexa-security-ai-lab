import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        sand: "#f6f1e8",
        ember: "#d96c32",
        pine: "#25443b",
        mist: "#d8dfd5"
      },
      boxShadow: {
        panel: "0 20px 60px rgba(16, 20, 24, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
