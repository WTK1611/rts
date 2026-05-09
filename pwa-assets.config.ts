import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { fit: "cover", background: "#0d1a0d" },
    },
    maskable: {
      sizes: [512],
      padding: 0,
      resizeOptions: { fit: "cover", background: "#0d1a0d" },
    },
  },
  images: ["public/icon.png"],
});
