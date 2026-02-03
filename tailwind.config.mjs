/** @type {import('tailwindcss').Config} */
export default {
    content: {
        relative: true,
        files: [
            "./app/**/*.{js,ts,jsx,tsx,mdx}",
            "./components/**/*.{js,ts,jsx,tsx,mdx}",
            "./lib/**/*.{js,ts,jsx,tsx,mdx}",
            "!./.gemini/**/*"
        ],
    },
    theme: {
        extend: {},
    },
    plugins: [],
}
