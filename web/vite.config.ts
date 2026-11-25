import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The console imports the real routing core from ../src/core, so the browser runs the same code as the lab.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@core": fileURLToPath(new URL("../src/core", import.meta.url)) } },
  server: { fs: { allow: [".."] } },
});
