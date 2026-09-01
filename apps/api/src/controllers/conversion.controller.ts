import type { Request, Response } from "express";
import * as svc from "../services/conversion.service";
import { getActor } from "../lib/actor";

export async function list(req: Request, res: Response) {
  const { branchId, from, to } = req.query as Record<string, string>;
  res.json(await svc.listConversions(branchId, from, to));
}

export async function create(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json(await svc.createConversion({ ...req.body, userId: actor.id ?? undefined, userName: actor.name ?? undefined, deviceId: actor.deviceId, deviceName: actor.deviceName }));
}

export async function remove(req: Request, res: Response) {
  await svc.deleteConversion(req.params.id);
  res.status(204).end();
}
