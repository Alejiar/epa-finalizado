/**
 * CUADRE AUTORIZADO POR EL DUEÑO (27-jul-2026):
 *  1) Victor Perez → pendingDebt = 0 (el 100.000 era fantasma del bug de la base;
 *     su ledger real ya estaba prácticamente saldado).
 *  2) Ajuste de EFECTIVO: el esperado del sistema quedó 101.000 por ENCIMA del físico
 *     real (925.000 esperado vs 824.000 contado) por el mismo bug. Se registra un
 *     egreso de efectivo de 101.000 rotulado como ajuste de cuadre, para que el esperado
 *     baje a 824.000 y la caja quede cuadrada DESDE ESTE MOMENTO. Los cierres viejos
 *     quedan con su −101.000 histórico (rastro de auditoría del bug); esto no los altera.
 *
 * Uso: npx tsx scripts/apply-cuadre.ts           (simulación)
 *      npx tsx scripts/apply-cuadre.ts --apply    (escribe)
 */
import { prisma } from "../src/lib/prisma";
import { getExpectedBalancesForDate } from "../src/services/shipday-dashboard.service";
import { getCurrentOperatingDate } from "../src/services/shift-close.service";

const APPLY = process.argv.includes("--apply");
const CASH_ADJUST = 101_000; // 925.000 esperado − 824.000 físico

async function main() {
  const day = await getCurrentOperatingDate();
  const before = await getExpectedBalancesForDate(day);
  const victor = await prisma.driver.findFirst({ where: { name: { contains: "Victor Perez" } } });

  console.log("=== ANTES ===");
  console.log(`  Victor pendingDebt = ${victor?.pendingDebt.toLocaleString("es-CO")}`);
  console.log(`  esperado efectivo (${day}) = ${before.cash.toLocaleString("es-CO")}   (físico real = 824.000)`);
  console.log(`  esperado banco    (${day}) = ${before.bank.toLocaleString("es-CO")}`);

  if (!APPLY) {
    console.log(`\n  (simulación) Se haría:`);
    console.log(`   - Victor pendingDebt → 0`);
    console.log(`   - egreso efectivo de ${CASH_ADJUST.toLocaleString("es-CO")} → esperado efectivo quedaría en ${(before.cash - CASH_ADJUST).toLocaleString("es-CO")}`);
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (victor) {
      await tx.driver.update({ where: { id: victor.id }, data: { pendingDebt: 0, creditAmount: 0, creditMedium: null } });
    }
    await tx.bankTransaction.create({
      data: {
        type: "egreso",
        medium: "cash",
        amount: CASH_ADJUST,
        description: "Ajuste de cuadre de caja — descuadre de $101.000 por bug de devolución de base (Victor Perez). Efectivo físico verificado: $824.000.",
        noCounterpart: true,
        createdByName: "Ajuste (corrección de bug)",
        date: new Date(),
      },
    });
  });

  const after = await getExpectedBalancesForDate(day);
  const victorAfter = await prisma.driver.findFirst({ where: { name: { contains: "Victor Perez" } }, select: { pendingDebt: true } });
  console.log("\n=== DESPUÉS ===");
  console.log(`  ✅ Victor pendingDebt = ${victorAfter?.pendingDebt.toLocaleString("es-CO")}`);
  console.log(`  ✅ esperado efectivo (${day}) = ${after.cash.toLocaleString("es-CO")}   (debe ser 824.000)`);
  console.log(`     esperado banco    (${day}) = ${after.bank.toLocaleString("es-CO")}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
