/**
 * CORRECCIÓN DE DATOS (un solo uso) — re-fechar las CONTRAPARTES que quedaron en un
 * día distinto al del movimiento original.
 *
 * Bug: al registrar la contraparte de un movimiento de banco, se creaba con la fecha
 * de "hoy" en vez de la fecha del movimiento original. Como la vista de Banco filtra
 * por un solo día, el original y su contraparte nunca se veían juntos y AMBOS quedaban
 * pintados como "esperando contraparte" para siempre (caso reportado: pares de 75.000
 * y 100.000 cuadrados pero en días distintos).
 *
 * Este script busca cada par (mismo pairId) cuyas mitades caen en días Bogotá distintos,
 * toma como canónica la de menor createdAt (el movimiento ORIGINAL) y re-fecha las demás
 * mitades del par a la fecha del original. Es NEUTRO para los saldos (un par neta a cero
 * y el saldo esperado se ancla en el cierre mensual, no en el día). Hace backup JSON antes.
 *
 * Uso: npx tsx scripts/fix-crossday-pairs.ts          (simulación, no escribe)
 *      npx tsx scripts/fix-crossday-pairs.ts --apply   (aplica los cambios)
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../src/lib/prisma";
import { toBogotaDateStr } from "../src/lib/date-range";

const APPLY = process.argv.includes("--apply");

async function main() {
  const paired = await prisma.bankTransaction.findMany({
    where: { pairId: { not: null } },
    orderBy: [{ pairId: "asc" }, { createdAt: "asc" }],
  });

  // Agrupar por pairId.
  const groups = new Map<string, typeof paired>();
  for (const t of paired) {
    const g = groups.get(t.pairId!) ?? [];
    g.push(t);
    groups.set(t.pairId!, g);
  }

  // Backup de todo lo que tenga pairId antes de tocar nada.
  const backupDir = join(process.cwd(), "..", "..", "backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `bank-pairs-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify(paired, null, 2));
  console.log(`Backup de movimientos con pareja → ${backupPath}\n`);

  let fixedGroups = 0;
  let fixedRows = 0;

  let skippedGroups = 0;

  for (const [pairId, rows] of groups) {
    const days = new Set(rows.map((r) => toBogotaDateStr(r.date)));
    if (days.size <= 1) continue; // ya están en el mismo día → nada que hacer

    // Canónico = menor createdAt (el movimiento original que esperaba contraparte).
    const canonical = rows.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
    const targetDate = canonical.date;
    const targetDay = toBogotaDateStr(targetDate);

    console.log(`Par ${pairId}:`);
    for (const r of rows) {
      const day = toBogotaDateStr(r.date);
      const tag = r.id === canonical.id ? "ORIGINAL" : "contraparte";
      console.log(`  ${tag.padEnd(11)} ${r.type.padEnd(7)} $${r.amount.toLocaleString("es-CO").padStart(10)}  día=${day}  (${r.description})`);
    }

    // SEGURIDAD: solo se auto-repara un par LIMPIO = exactamente 2 patas, una ingreso y
    // una egreso del MISMO monto (neta a cero sin ambigüedad). Cualquier otra forma
    // (más patas, montos distintos, mixtos con groupId) se OMITE para revisión manual:
    // re-fechar a ciegas dinero de estructura desconocida podría distorsionar los días.
    const ingresos = rows.filter((r) => r.type === "ingreso");
    const egresos = rows.filter((r) => r.type === "egreso");
    const isCleanPair =
      rows.length === 2 &&
      ingresos.length === 1 &&
      egresos.length === 1 &&
      ingresos[0].amount === egresos[0].amount;

    if (!isCleanPair) {
      console.log(`  ⚠️  OMITIDO: no es un par simple (2 patas ingreso+egreso mismo monto). Revisar a mano.\n`);
      skippedGroups++;
      continue;
    }

    const toFix = rows.filter((r) => toBogotaDateStr(r.date) !== targetDay);
    console.log(`  → re-fechar ${toFix.length} mitad(es) al día del original: ${targetDay}`);

    if (APPLY) {
      for (const r of toFix) {
        await prisma.bankTransaction.update({ where: { id: r.id }, data: { date: targetDate } });
        fixedRows++;
      }
      console.log(`  ✅ Corregido.\n`);
    } else {
      console.log(`  (simulación — usar --apply para escribir)\n`);
      fixedRows += toFix.length;
    }
    fixedGroups++;
  }

  if (skippedGroups > 0) {
    console.log(`⚠️  ${skippedGroups} par(es) OMITIDO(s) por no ser pares simples — revisar manualmente.`);
  }

  if (fixedGroups === 0) {
    console.log("No hay pares en días distintos. Nada que corregir.");
  } else {
    console.log(`${APPLY ? "Corregidos" : "Se corregirían"} ${fixedGroups} par(es), ${fixedRows} movimiento(s) re-fechado(s).`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
