import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Aset GLB dari asset pipeline disajikan apa adanya: /tier2/<id>.glb, /tools/<id>.glb.
export default defineConfig({
  plugins: [react()],
  publicDir: "../../packages/content/assets",
});
