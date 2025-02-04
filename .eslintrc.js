module.exports = {
    root: true,
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:react/recommended",
        "plugin:react-hooks/recommended",
        "plugin:react-native/all",
        "plugin:prettier/recommended"
    ],
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint", "react", "react-native", "prettier"],
    parserOptions: {
        ecmaFeatures: {
            jsx: true
        },
        ecmaVersion: 2021,
        sourceType: "module"
    },
    env: {
        "react-native/react-native": true
    },
    rules: {
        "react/prop-types": "off", // Since we use TypeScript
        "react/react-in-jsx-scope": "off", // Not needed with React 17+
        "react-native/no-inline-styles": "warn",
        "react-native/no-color-literals": "warn",
        "react-native/no-raw-text": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-unused-vars": [
            "warn",
            { argsIgnorePattern: "^_" }
        ],
        "prettier/prettier": "warn"
    },
    settings: {
        react: {
            version: "detect"
        }
    }
}
