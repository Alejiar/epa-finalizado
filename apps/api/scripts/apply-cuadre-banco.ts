/**
 * CUADRE DE BANCO AUTORIZADO POR EL DUEÑO (27-jul-2026):
 * Fija el esperado de BANCO en el saldo real verificado por el dueño ($11.457.026),
 * registrando un ajuste por la diferencia contra el esperado actual del sistema.
 * Rotulado para que quede rastro auditable. A partir de aquí el banco cuadra.
 *
 * Uso: npx tsx scripts/apply-cuadre-banco.ts --apply
 */
import { prisma } from "../src/lib/prisma";
import { getExpectedBalancesForDate } from "../src/services/shipday-dashboard.service";
import { getCurrentOperatingDate } from "../src/services/shift-close.service";

const TARGET = 11_457_026;
const APPLY = process.argv.includes("--apply");

async function main() {
  const day = await getCurrentOperatingDate();
  const before = await getExpectedBalancesForDate(day);
  const delta = TARGET - before.bank; // negativo = registrar egreso; positivo = ingreso

  console.log(`Esperado banco ANTES = ${before.bank.toLocaleString("es-CO")}`);
  console.log(`Objetivo             = ${TARGET.toLocaleString("es-CO")}`);
  console.log(`Ajuste a registrar   = ${delta.toLocaleString("es-CO")}  (${delta < 0 ? "egreso" : "ingreso"} banco)`);

  if (!APPLY) { console.log("\n(simulación — usar --apply)"); await prisma.$disconnect(); return; }
  if (delta === 0) { console.log("\nYa está en el objetivo, nada que hacer."); await prisma.$disconnect(); return; }

  await prisma.bankTransaction.create({
    data: {
      type: delta < 0 ? "egreso" : "ingreso",
      medium: "bank",
      amount: Math.abs(delta),
      description: `Ajuste de cuadre de banco — saldo real verificado: $${TARGET.toLocaleString("es-CO")}.`,
      noCounterpart: true,
      createdByName: "Ajuste (cuadre de banco)",
      date: new Date(),
    },
  });

  const after = await getExpectedBalancesForDate(day);
  console.log(`\n✅ Esperado banco DESPUÉS = ${after.bank.toLocaleString("es-CO")}  (debe ser ${TARGET.toLocaleString("es-CO")})`);
  console.log(`   Esperado efectivo         = ${after.cash.toLocaleString("es-CO")}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
