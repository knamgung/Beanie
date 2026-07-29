import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // host: true exposes the dev server on your LAN so friends on the same
  // Wi-Fi can reach http://<your-ip>:5173.
  server: { host: true, port: 5173 },
});
