import type { Request, Response } from "express";
import * as svc from "../services/base.service";
import { getActor } from "../lib/actor";

export async function list(req: Request, res: Response) {
  const { branchId, driverId, from, to } = req.query as Record<string, string>;
  res.json(await svc.listBases(branchId, driverId, from, to));
}

export async function give(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json(await svc.giveBase(req.params.driverId, { ...req.body, createdBy: actor.id, createdByName: actor.name, deviceId: actor.deviceId, deviceName: actor.deviceName }));
}

export async function pay(req: Request, res: Response) {
  const actor = getActor(req);
  res.status(201).json(await svc.payBase(req.params.driverId, { ...req.body, createdBy: actor.id, createdByName: actor.name, deviceId: actor.deviceId, deviceName: actor.deviceName }));
}

export async function remove(req: Request, res: Response) {
  res.json(await svc.removeBase(req.params.id));
}

export async function edit(req: Request, res: Response) {
  res.json(await svc.editBase(req.params.id, req.body));
}

export async function summary(req: Request, res: Response) {
  res.json(await svc.getBaseSummary(req.params.driverId));
}
