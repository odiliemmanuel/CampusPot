/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins", "Inter", "system-ui", "sans-serif"],
        sora: ["Sora", "system-ui", "sans-serif"],
      },
      colors: {
        // Vivid royal blue — the shared CampusPot/LearnQuest product palette.
        primary: {
          50: "#EEF0FD",
          100: "#DCE0FB",
          200: "#B9C1F7",
          300: "#96A3F3",
          400: "#6B78F5",
          500: "#4453EA",
          600: "#2F3EE4",
          700: "#2531C4",
          800: "#1E279E",
          900: "#181F79",
          950: "#0F1450",
        },
        // Dashboard (admin) palette — royal-blue sidebar + vivid accents.
        brand: {
          50: "#EEF3FF",
          100: "#DCE6FF",
          200: "#BACCFE",
          300: "#8FAAF9",
          400: "#6086F5",
          500: "#4F7DF3", // sidebar active pill
          600: "#2F5BEA", // primary action blue
          700: "#2547B8", // sidebar gradient end
          800: "#1E3A8A", // sidebar gradient start
          900: "#182E6E",
          950: "#101F4D",
        },
        // Sidebar is near-black in both themes — only the content area switches.
        ink: {
          DEFAULT: "#0B0B14",
          light: "#171826",
        },
        // Light mode surfaces
        canvas: "#F4F6FB",
        panel: "#FFFFFF",
        // Dark mode surfaces — deep space navy.
        "panel-dark": "#111226",
      },
    },
  },
  plugins: [],
};
