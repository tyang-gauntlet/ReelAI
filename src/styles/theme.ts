type FontWeight = "400" | "500" | "600" | "700"

export const theme = {
    colors: {
        // Main backgrounds
        background: "#0A0F1C", // Deep blue-black for main background
        surface: "#1A2235", // Slightly lighter blue for cards/surfaces

        // Primary colors
        primary: "#6C5CE7", // Vibrant purple for main actions
        secondary: "#00B4D8", // Bright blue for secondary elements
        accent: "#00F5D4", // Cyan for highlights and accents

        // Functional colors
        success: "#0ACF83", // Green for success states
        error: "#FF4B6E", // Soft red for errors
        warning: "#FFBE0B", // Amber for warnings

        // Text colors
        text: {
            primary: "#FFFFFF",
            secondary: "#A0AEC0",
            inverse: "#0A0F1C",
            accent: "#00F5D4"
        },

        // UI elements
        border: "#2D3748",
        divider: "#2D3748",

        // Interactive states
        hover: "#2D3748",
        pressed: "#1A2235",

        // Social features
        like: "#FF4B6E",
        share: "#00B4D8",
        bookmark: "#FFBE0B"
    },

    // Typography
    typography: {
        sizes: {
            xs: 12,
            sm: 14,
            md: 16,
            lg: 20,
            xl: 24,
            xxl: 32
        },
        weights: {
            regular: "400" as FontWeight,
            medium: "500" as FontWeight,
            semibold: "600" as FontWeight,
            bold: "700" as FontWeight
        }
    },

    // Spacing
    spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48
    },

    // Border Radius
    borderRadius: {
        sm: 8,
        md: 12,
        lg: 16,
        full: 9999
    }
}
