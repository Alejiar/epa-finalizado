/**
 * FUENTE ÚNICA para "cuánta base debe un domiciliario".
 *
 * El saldo del libro de base (`Σ BaseTransaction.entrega − Σ pago`) es un registro
 * PARALELO que puede quedar POR ENCIMA de la deuda neta real del domiciliario: los
 * pagos se reparten entre base y comisión y la deuda tiene piso en 0, así que un
 * domiciliario ya saldado (deuda neta 0) puede conservar un residuo en ese libro.
 * Ese residuo es DERIVA, no base realmente prestada.
 *
 * La verdad única del sistema es la posición neta (`Driver.pendingDebt`). Por eso la
 * base pendiente que se MUESTRA en cualquier módulo (Bases, Reportes, Excel, estado de
 * cuenta) debe ser `min(saldoLibro, deudaNeta)` acotado a ≥ 0: quien no debe nada NO
 * debe base. Todos los módulos usan ESTA función para no volver a desincronizarse.
 *
 * El clamp solo puede REDUCIR la base mostrada, nunca inflarla: entregar base sube la
 * deuda neta al instante (applyDebtDelta), así que la deuda neta siempre cubre la base
 * realmente prestada.
 */
export function reconcileBasePending(ledgerBase: number, pendingDebt: number): number {
  return Math.max(0, Math.min(ledgerBase, pendingDebt));
}
