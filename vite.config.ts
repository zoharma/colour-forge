import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from a project page (https://<user>.github.io/<repo>/), so the base
// has to match the repo path. Override with BASE_PATH when deploying anywhere
// else — a user page, a custom domain, or a local static server all want "/".
const base = process.env.BASE_PATH ?? "/ux-dev-skills/";

export default defineConfig({
  base,
  plugins: [react()],
});
