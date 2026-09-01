import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { resolveDevice } from "../services/device.service";

/**
 * Puerta de autorización de EQUIPOS. Corre después de `requireAuth`. Deja pasar solo a los PC
 * autorizados (o al PC servidor por loopback); a los pendientes/bloqueados los rechaza con 403
 * y un `code` para que el frontend muestre la pantalla de "esperando autorización"/"bloqueado".
 * También deja `req.device` disponible para estampar el PC en cada movimiento (ver getActor).
 */
export async function requireAuthorizedDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const { device, allowed, code } = await resolveDevice(req);
    if (device) req.device = { id: device.id, name: device.name };
    if (allowed) return next();
    const error =
      code === "DEVICE_BLOCKED"
        ? "Este equipo fue bloqueado por el administrador."
        : code === "DEVICE_REQUIRED"
          ? "Equipo no identificado."
          : "Este equipo está pendiente de autorización del administrador.";
    return res.status(403).json({ error, code });
  } catch (e) {
    next(e);
  }
}

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Bitácora: registra cada acción que CAMBIA datos (POST/PATCH/DELETE) con éxito, junto al PC y
 * usuario que la hizo. Se engancha al final de la respuesta para conocer el código de estado;
 * nunca rompe la petición (los errores del log se ignoran). Es la vista global de "qué hizo cada PC".
 */
export function logActivity(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING.has(req.method)) return next();
  const path = req.originalUrl.split("?")[0];
  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return; // solo lo que sí se aplicó
    prisma.activityLog
      .create({
        data: {
          deviceId: req.device?.id ?? null,
          deviceName: req.device?.name ?? null,
          userId: req.user?.sub ?? null,
          userName: req.user?.name ?? req.user?.email ?? null,
          method: req.method,
          path,
          statusCode: res.statusCode,
        },
      })
      .catch(() => {});
  });
  next();
}
