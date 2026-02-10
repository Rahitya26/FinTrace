/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    light: '#3b82f6', // blue-500
                    DEFAULT: '#2563eb', // blue-600
                    dark: '#1d4ed8', // blue-700
                },
                secondary: {
                    light: '#10b981', // emerald-500
                    DEFAULT: '#059669', // emerald-600
                    dark: '#047857', // emerald-700
                },
                accent: {
                    light: '#a855f7', // purple-500
                    DEFAULT: '#9333ea', // purple-600
                    dark: '#7e22ce', // purple-700
                }
            }
        },
    },
    plugins: [],
}
