/**
 * CORRECCIÓN PUNTUAL (un domiciliario) — re-sincroniza pendingDebt/creditAmount de
 * Victor Perez con su LEDGER real. El campo se desfasó +100.000 por el bug de la base
 * (se registró una devolución de base que no debía, se borró y se re-entregó; el saldo
 * denormalizado no volvió a cuajar). Esto NO es un recalc masivo: es un solo domiciliario
 * cuyo descuadre ya está confirmado por el dueño.
 *
 * Ledger correcto (respeta la semántica bank-linked, NO cuenta doble):
 *   neto = comisión_pedidos + base_entregada
 *          − base_pago_manual − pago_manual − Σ debtApplied(bankTx)
 *
 * Uso: npx tsx scripts/fix-victor-debt.ts            (simula, muestra el ledger)
 *      npx tsx scripts/fix-victor-debt.ts --set 0     (fija pendingDebt=0)
 *      npx tsx scripts/fix-victor-debt.ts --apply     (fija al valor del ledger)
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const setArgIdx = process.argv.indexOf("--set");
  const setTo = setArgIdx >= 0 ? parseInt(process.argv[setArgIdx + 1] ?? "", 10) : null;
  const applyLedger = process.argv.includes("--apply");

  const driver = await prisma.driver.findFirst({ where: { name: { contains: "Victor Perez" } } });
  if (!driver) { console.log("Victor no encontrado"); return; }

  const [ordAgg, basesGiven, basePayManual, payManual, bankDebtApplied] = await Promise.all([
    prisma.shipdayOrder.aggregate({ where: { driverId: driver.id, status: { in: ["DELIVERED", "COMPLETED"] } }, _sum: { companyAmount: true } }),
    prisma.baseTransaction.aggregate({ where: { driverId: driver.id, type: "entrega" }, _sum: { amount: true } }),
    prisma.baseTransaction.aggregate({ where: { driverId: driver.id, type: "pago", bankTransactionId: null }, _sum: { amount: true } }),
    prisma.driverPayment.aggregate({ where: { driverId: driver.id, bankTransactionId: null }, _sum: { amount: true } }),
    prisma.bankTransaction.aggregate({ where: { driverId: driver.id }, _sum: { debtApplied: true } }),
  ]);

  const commission = ordAgg._sum.companyAmount ?? 0;
  const given = basesGiven._sum.amount ?? 0;
  const basePayM = basePayManual._sum.amount ?? 0;
  const payM = payManual._sum.amount ?? 0;
  const debtApplied = bankDebtApplied._sum.debtApplied ?? 0;

  const net = commission + given - basePayM - payM - debtApplied;

  console.log("=== Victor Perez — ledger ===");
  console.log(`  comisión pedidos        = ${commission.toLocaleString("es-CO")}`);
  console.log(`  base entregada          = ${given.toLocaleString("es-CO")}`);
  console.log(`  base pago manual        = ${basePayM.toLocaleString("es-CO")}`);
  console.log(`  pago manual             = ${payM.toLocaleString("es-CO")}`);
  console.log(`  Σ debtApplied (bank tx) = ${debtApplied.toLocaleString("es-CO")}`);
  console.log(`  → NETO ledger           = ${net.toLocaleString("es-CO")}`);
  console.log(`\n  pendingDebt ACTUAL      = ${driver.pendingDebt.toLocaleString("es-CO")}  (creditAmount=${driver.creditAmount})`);
  console.log(`  desfase actual          = ${(driver.pendingDebt - net).toLocaleString("es-CO")}`);

  const target = setTo != null ? setTo : (applyLedger ? Math.max(0, net) : null);
  if (target == null) {
    console.log("\n  (simulación — usa --set 0  o  --apply para escribir)");
  } else {
    await prisma.driver.update({
      where: { id: driver.id },
      data: { pendingDebt: Math.max(0, target), creditAmount: target < 0 ? -target : 0, creditMedium: null },
    });
    console.log(`\n  ✅ pendingDebt fijado en ${Math.max(0, target).toLocaleString("es-CO")}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
