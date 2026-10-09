import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const docs = path.resolve(fileURLToPath(new URL("./docs/", import.meta.url)));
export default defineConfig({
  root: "web",
  base: "/report/",
  plugins: [
    {
      name: "synthetic-cases-in-development",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          let relative;
          try {
            relative = decodeURIComponent(
              new URL(req.url, "http://localhost").pathname,
            ).replace(/^\/report\//, "");
          } catch {
            return next();
          }
          if (
            !relative.startsWith("cases/") &&
            !relative.startsWith("evidence/")
          )
            return next();
          const target = path.resolve(docs, relative);
          if (!target.startsWith(docs + path.sep)) return next();
          fs.readFile(target, (error, data) => {
            if (error) return next();
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(data);
          });
        });
      },
    },
  ],
  build: { outDir: "../site-dist", emptyOutDir: true },
});
