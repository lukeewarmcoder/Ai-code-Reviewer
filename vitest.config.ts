import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.{spec,test}.ts"],
        exclude: ["node_modules", "dist", "tests/claude.test.ts"],
    },
});
