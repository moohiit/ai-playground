/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      // All named text sizes scaled +20% ([fontSize, lineHeight]).
      fontSize: {
        xs: ["0.9rem", "1.2rem"],
        sm: ["1.05rem", "1.5rem"],
        base: ["1.2rem", "1.8rem"],
        lg: ["1.35rem", "2.1rem"],
        xl: ["1.5rem", "2.1rem"],
        "2xl": ["1.8rem", "2.4rem"],
        "3xl": ["2.25rem", "2.7rem"],
        "4xl": ["2.7rem", "3rem"],
        "5xl": ["3.6rem", "3.9rem"],
        "6xl": ["4.5rem", "4.8rem"],
        "7xl": ["5.4rem", "5.7rem"],
        "8xl": ["7.2rem", "7.5rem"],
        "9xl": ["9.6rem", "9.9rem"],
      },
    },
  },
  plugins: [],
};
