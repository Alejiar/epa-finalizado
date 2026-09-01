import type { CreateMovementRequest, Movement, UpdateMovementRequest } from "@cash-buddy/shared";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";
import { ensureDay } from "./day.service";
import { toMovement } from "./mappers";

function nowTime(): string {
  return new Date().toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
}

export async function addMovement(input: CreateMovementRequest): Promise<Movement> {
  await ensureDay(input.date);
  const row = await prisma.movement.create({
    data: {
      date: input.date,
      time: input.time ?? nowTime(),
      category: input.category,
      type: input.type,
      medium: input.medium,
      amount: input.amount,
      status: input.status ?? "confirmed",
      workerId: input.workerId ?? null,
      description: input.description ?? null,
      group: input.group ?? null,
      kind: input.kind ?? null,
      deliveryId: input.deliveryId ?? null,
      deliveryValue: input.deliveryValue ?? null,
      taxAmount: (input as unknown as { taxAmount?: number }).taxAmount ?? null,
      createdBy: (input as unknown as { createdBy?: string }).createdBy ?? null,
      createdByName: (input as unknown as { createdByName?: string }).createdByName ?? null,
      deviceId: (input as unknown as { deviceId?: string }).deviceId ?? null,
      deviceName: (input as unknown as { deviceName?: string }).deviceName ?? null,
    },
  });
  return toMovement(row);
}

export async function updateMovement(
  id: string,
  patch: UpdateMovementRequest,
): Promise<Movement> {
  const exists = await prisma.movement.findUnique({ where: { id } });
  if (!exists) throw notFound("Movimiento no encontrado");
  const row = await prisma.movement.update({ where: { id }, data: patch });
  return toMovement(row);
}

export async function deleteMovement(id: string): Promise<void> {
  const exists = await prisma.movement.findUnique({ where: { id } });
  if (!exists) throw notFound("Movimiento no encontrado");
  await prisma.movement.delete({ where: { id } });
}

export async function listMovements(date?: string): Promise<Movement[]> {
  const rows = await prisma.movement.findMany({
    where: date ? { date } : undefined,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toMovement);
}

// ── Aprobación de gastos ──────────────────────────────────────────────────────
export async function listPendingMovements() {
  const rows = await prisma.movement.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { worker: { select: { name: true } } },
  });
  return rows;
}

export async function approveMovement(id: string, approverId: string, approverName?: string | null) {
  const m = await prisma.movement.findUnique({ where: { id } });
  if (!m) throw notFound("Movimiento no encontrado");
  return prisma.movement.update({
    where: { id },
    data: { status: "confirmed", approvedBy: approverId, approvedByName: approverName ?? null, approvedAt: new Date() },
  });
}

export async function rejectMovement(id: string) {
  const m = await prisma.movement.findUnique({ where: { id } });
  if (!m) throw notFound("Movimiento no encontrado");
  await prisma.movement.delete({ where: { id } });
  return { ok: true };
}
