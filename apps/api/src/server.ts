import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/error";

export interface CreateServerOptions {
  // Carpeta del frontend estático (build export de Next). Si se indica, se sirve.
  webDir?: string;
}

export function createServer(options: CreateServerOptions = {}): Express {
  const app = express();

  app.use(
    helmet({
      // Permite servir el frontend embebido y llamadas a la API en la misma red.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev"));

  // API
  app.use("/api", apiRouter);

  // Frontend estático (modelo host: un solo puerto sirve API + UI)
  const webDir = options.webDir;
  if (webDir && fs.existsSync(webDir)) {
    // Salvaguarda de navegación (export estático de Next App Router):
    // Next sirve el estado de cada ruta como un payload RSC en un archivo ".txt" que el
    // router pide por fetch para navegar sin recargar. En redes con latencia (p. ej.
    // acceso remoto por Tailscale) ese fetch a veces falla y el router cae en una
    // navegación DURA del documento hacia el ".txt"; como se entrega text/plain, el
    // navegador muestra el payload como "código" crudo (bug reportado, ago-2026).
    // Si detectamos una navegación de documento (Sec-Fetch-Dest: document, o sin ese
    // header pero pidiendo text/html) hacia un ".txt", redirigimos a la ruta HTML real.
    // Los fetch del router (Sec-Fetch-Dest: empty) NO se tocan y siguen recibiendo el RSC.
    app.get(/\.txt$/i, (req, res, next) => {
      const dest = req.get("sec-fetch-dest");
      const accept = req.get("accept") ?? "";
      const isDocNav = dest === "document" || (!dest && accept.includes("text/html"));
      if (!isDocNav) return next();
      const clean = req.path.replace(/\.txt$/i, "");
      return res.redirect(302, clean === "" || clean === "/index" ? "/" : clean);
    });

    // extensions:["html"] → una petición a /banco sirve banco.html automáticamente
    app.use(express.static(webDir, { extensions: ["html"] }));
    // Fallback para rutas no-API: intenta servir el .html específico de la ruta
    // (deep links como /banco o /shipday/pedidos) y solo si no existe, index.html.
    app.get(/^(?!\/api).*/, (req, res, next) => {
      // Normaliza la ruta y previene path traversal
      const cleanPath = decodeURIComponent(req.path).replace(/\.+/g, ".").replace(/^\/+/, "");
      const candidate = path.join(webDir, `${cleanPath}.html`);
      if (cleanPath && candidate.startsWith(webDir) && fs.existsSync(candidate)) {
        return res.sendFile(candidate);
      }
      const indexHtml = path.join(webDir, "index.html");
      if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
      next();
    });
  }

  // 404 para rutas /api no encontradas y manejo de errores
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
