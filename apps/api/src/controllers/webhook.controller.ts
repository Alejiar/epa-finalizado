import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { toBogotaDateStr } from "../lib/date-range";
import { applyDebtDelta } from "../services/driver.service";

// Eventos/estados que significan "entregado de verdad".
const DELIVERED_EVENTS = new Set(["ORDER_COMPLETED", "ORDER_DELIVERED"]);
const DELIVERED_STATES = new Set([
  "DELIVERED", "COMPLETED", "Delivered", "Completed", "ALREADY_DELIVERED",
]);

const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN ?? "";

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
/**
 * La hora de entrega de Shipday en el webhook viene en MILISEGUNDOS (epoch). En la
 * API de consulta viene como texto ISO. Aceptamos ambos; si no hay, usamos ahora.
 */
function parseDeliveredAt(v: unknown): Date {
  if (v == null || v === "") return new Date();
  if (typeof v === "number") return new Date(v);
  const s = String(v).trim();
  if (/^\d{10,}$/.test(s)) return new Date(Number(s)); // epoch en ms (o s de 10 díg.)
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Webhook de Shipday. A diferencia del polling (que solo puede filtrar por fecha de
 * CREACIÓN del pedido), esto dispara cuando el pedido se COMPLETA — así un domicilio
 * programado se carga el día que se entrega, sin importar cuándo se creó (incluso con
 * semanas de anticipación, que el polling ya no alcanza a ver por su ventana de fecha).
 *
 * Formato real de Shipday (docs "Order Status Update"):
 *   header `token`  → validación
 *   body raíz: { timestamp, event, order_status, order, carrier, delivery_details, ... }
 *   order: { id, order_number, delivery_fee, delivery_time(ms), ... }
 *   carrier (en la RAÍZ): { id, name, phone, status }
 *
 * Seguridad: como escribe en la base del dinero y queda expuesto a internet (Tailscale
 * Funnel), el token es OBLIGATORIO. Sin token válido → 401.
 */
export async function shipdayWebhook(req: Request, res: Response) {
  const { branchId } = req.params;

  // Token OBLIGATORIO. Shipday lo envía en el header `token`; aceptamos también
  // otras ubicaciones comunes por robustez.
  const h = req.headers;
  const candidates = [h["token"], h["x-shipday-token"], h["authorization"], req.query.token, asObj(req.body).token];
  const tokens = candidates
    .map((c) => (Array.isArray(c) ? c[0] : c))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const ok = !!WEBHOOK_TOKEN && tokens.some((t) => t === WEBHOOK_TOKEN || t === `Bearer ${WEBHOOK_TOKEN}`);
  if (!ok) {
    // Diagnóstico (sin exponer valores): qué headers llegaron, para depurar si Shipday
    // envía el token con otro nombre.
    console.warn("[webhook] 401 — headers presentes:", Object.keys(h).join(", "));
    return res.status(401).json({ error: "Token inválido o ausente" });
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return res.status(404).json({ error: "Sucursal no encontrada" });

  const body = req.body;
  const items: unknown[] = Array.isArray(body) ? body : [body];

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const commissionPercent = settings?.shipdayCommission ?? 30;

  let processed = 0;
  let ignored = 0;

  for (const item of items) {
    const root = asObj(item);
    const event = String(root.event ?? "");
    // El pedido puede venir en `root.order` (webhook) o ser el objeto mismo (compat).
    const order = asObj(root.order ?? root);
    // El carrier va en la RAÍZ del webhook; compat con formatos anidados.
    const carrier = asObj(root.carrier ?? order.carrier ?? order.assignedCarrier);
    // Datos del cliente: `delivery_details` (webhook) o `customer` (compat).
    const deliveryDetails = asObj(root.delivery_details ?? order.customer);

    // ID del pedido: webhook `order.id`; compat `orderId`/`id`.
    const orderId = str(order.id ?? order.orderId ?? root.orderId ?? root.id) ?? "";
    const statusStr = String(root.order_status ?? asObj(order.orderStatus).orderState ?? order.status ?? "");

    const isDelivered = DELIVERED_EVENTS.has(event) || DELIVERED_STATES.has(statusStr);
    if (!orderId || !isDelivered) { ignored++; continue; }

    // Idempotente: si ya existe, no duplicar.
    const existing = await prisma.shipdayOrder.findUnique({ where: { shipdayOrderId: orderId } });
    if (existing) { ignored++; continue; }

    // Lápida: si un admin eliminó este pedido (vía EditRequest), no recrearlo aunque
    // Shipday reenvíe el evento de entrega. Ver modelo DeletedShipdayOrder.
    const tombstoned = await prisma.deletedShipdayOrder.findUnique({ where: { shipdayOrderId: orderId } });
    if (tombstoned) { ignored++; continue; }

    // Valor del domicilio: webhook `delivery_fee`; compat `costing.deliveryFee`/etc.
    const costing = asObj(order.costing);
    const deliveryValue = Math.round(num(
      order.delivery_fee ?? root.delivery_fee ?? costing.deliveryFee ?? costing.totalCost ?? order.deliveryFee ?? order.orderTotal,
    ));
    const companyAmount = Math.round(deliveryValue * (commissionPercent / 100));

    // Fecha de ENTREGA (la que importa): webhook `delivery_time` (ms); compat ISO.
    const deliveredAt = parseDeliveredAt(
      order.delivery_time ?? root.delivery_time ?? asObj(order.activityLog).deliveryTime ?? order.deliveryTime,
    );

    // Respetar el día de arranque de la sucursal (no cargar entregas anteriores).
    if (branch.ordersSince && deliveredAt < branch.ordersSince) { ignored++; continue; }

    // Domiciliario asignado (carrier.id en la raíz; compat con otras ubicaciones).
    let driverId: string | null = null;
    const carrierId = carrier.id ?? order.assignedCarrierId ?? asObj(order.assignedCarrier).id;
    if (carrierId != null && String(carrierId)) {
      const driver = await prisma.driver.findUnique({
        where: { shipdayDriverId_branchId: { shipdayDriverId: String(carrierId), branchId } },
      });
      driverId = driver?.id ?? null;
    }

    const customerName = str(deliveryDetails.name ?? asObj(order.customer).name ?? order.customerName);
    const customerAddress = str(deliveryDetails.address ?? asObj(order.customer).address ?? order.customerAddress);
    const orderNumber = str(order.order_number ?? order.orderNumber ?? root.order_number);

    // Todo en una transacción: crear el pedido y aplicar deuda/stats consistentes.
    await prisma.$transaction(async (tx) => {
      await tx.shipdayOrder.create({
        data: {
          shipdayOrderId: orderId,
          branchId,
          driverId,
          orderNumber,
          deliveryValue,
          companyAmount,
          customerName,
          customerAddress,
          status: "DELIVERED",
          deliveredAt,
          rawData: root as object,
        },
      });

      if (driverId && companyAmount > 0) {
        await applyDebtDelta(tx, driverId, companyAmount);
        const dateStr = toBogotaDateStr(deliveredAt);
        await tx.dailyDriverStat.upsert({
          where: { date_driverId: { date: dateStr, driverId } },
          create: { date: dateStr, branchId, driverId, orderCount: 1, totalValue: deliveryValue, companyTotal: companyAmount },
          update: { orderCount: { increment: 1 }, totalValue: { increment: deliveryValue }, companyTotal: { increment: companyAmount } },
        });
      }
    });

    console.log(`[webhook] pedido cargado: #${orderNumber ?? "?"} (${orderId}) valor=${deliveryValue} driver=${driverId ?? "sin asignar"} entregado=${toBogotaDateStr(deliveredAt)}`);
    processed++;
  }

  // Siempre 200 ante token válido: así Shipday no reintenta en bucle por eventos que a
  // propósito ignoramos (no entregados, duplicados, o anteriores al arranque).
  res.json({ ok: true, processed, ignored });
}
