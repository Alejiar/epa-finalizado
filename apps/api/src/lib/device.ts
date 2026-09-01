import type { Request } from "express";

// Header con el que cada navegador manda su identificador de equipo (UUID guardado en
// localStorage del PC). Es la identidad "por navegador" del sistema de autorización de PCs.
export const DEVICE_HEADER = "x-device-id";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Equipo resuelto por el middleware `requireAuthorizedDevice` (id + nombre actual).
      device?: { id: string; name: string | null };
    }
  }
}

/** IP del cliente (respeta trust proxy si estuviera activo; si no, la del socket). */
export function clientIp(req: Request): string | null {
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * ¿La petición viene del MISMO PC donde corre el sistema (loopback)? Ese es el PC servidor,
 * donde está el admin; se auto-autoriza para que NUNCA quede bloqueado, pase lo que pase con
 * la lista de equipos. Cubre IPv4, IPv6 y IPv4 mapeada a IPv6.
 */
export function isLoopbackReq(req: Request): boolean {
  const ip = clientIp(req);
  if (!ip) return false;
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip === "localhost" ||
    ip.startsWith("127.")
  );
}

/**
 * Lee y valida el identificador de equipo del header. Devuelve null si falta o es basura
 * (evita que un valor arbitrario ensucie la tabla de equipos o se use para inyección).
 */
export function getDeviceIdFromReq(req: Request): string | null {
  const raw = req.headers[DEVICE_HEADER];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const s = String(v).trim();
  if (s.length < 8 || s.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}
