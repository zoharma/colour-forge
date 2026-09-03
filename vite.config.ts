import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Defaults to "/" so local dev, `vite preview` and any host that serves from a
// domain root all work untouched. A GitHub project page serves from
// /<repo>/ instead, so the Pages workflow passes BASE_PATH derived from the
// repository name — which means the app can be moved to a differently-named
// repo without editing anything here.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
});
