import type { Request } from "express";

export interface Actor {
  id: string | null;
  name: string | null;
  // Equipo (PC) desde el que se hace la acción. Se estampa en los registros de dinero para
  // poder mostrar "desde qué PC se hizo cada movimiento". Lo llena `requireAuthorizedDevice`.
  deviceId: string | null;
  deviceName: string | null;
}

/** Extrae el usuario autenticado y el equipo del request para trazabilidad. */
export function getActor(req: Request): Actor {
  const u = req.user;
  return {
    id: u?.sub ?? null,
    name: u?.name ?? u?.email ?? null,
    deviceId: req.device?.id ?? null,
    deviceName: req.device?.name ?? null,
  };
}
