import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
  // node:sqlite is a newer Node built-in that bundlers may not know by name.
  ssr: { external: ["node:sqlite"] },
});
