"use client";

import { useEffect, useState } from "react";
import { Users, Plus, AlertTriangle, CheckCircle2, Trash2, ChevronDown, ChevronUp, Bell, Clock } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/sd-api";
import { ClientDebtWizard } from "@/components/wizards/ClientDebtWizard";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/use-live";
import { HourlyClientsTab } from "./HourlyClientsTab";

function formatCOP(n: number) {
  return "$" + n.toLocaleString("es-CO");
}

type Tab = "deudas" | "hora";

export default function ClientesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("deudas");
  const [clients, setClients] = useState<api.Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [wizardMode, setWizardMode] = useState<"new_client" | "add_debt" | "pay_debt" | null>(null);
  const [selectedClient, setSelectedClient] = useState<api.Client | undefined>();
  // Detalle del cliente expandido: trae TODAS sus deudas (incluidas las pagadas),
  // que la lista liviana (getClients, solo paid:false) no incluye. Se carga bajo
  // demanda al expandir, para no engordar la carga de la lista principal.
  const [detail, setDetail] = useState<api.Client | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getClients();
      setClients(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
    } catch { if (!silent) toast.error("Error al cargar clientes"); }
    if (!silent) setLoading(false);
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try { setDetail(await api.getClient(id)); }
    catch { toast.error("Error al cargar el historial del cliente"); }
    finally { setDetailLoading(false); }
  };

  // Al expandir un cliente cargamos su detalle (con las deudas ya pagadas); al
  // colapsar lo limpiamos. Recargar tras un abono/pago mantiene el historial al día.
  async function toggleExpand(c: api.Client) {
    if (expandedId === c.id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(c.id);
    setDetail(null);
    loadDetail(c.id);
  }

  const refreshAfterAction = () => { load(); if (expandedId) loadDetail(expandedId); };

  useEffect(() => { load(); }, []);
  useLive(() => load(true), 5000);

  const debtors = clients.filter(c => c.pendingDebt > 0);
  const totalDebt = debtors.reduce((s, c) => s + c.pendingDebt, 0);

  function openAddDebt(c: api.Client) { setSelectedClient(c); setWizardMode("add_debt"); }
  function openPayClient(c: api.Client) { setSelectedClient(c); setWizardMode("pay_debt"); }

  async function removeClient(c: api.Client) {
    if (!confirm(`¿Eliminar al cliente "${c.name}"? Esta acción no se puede deshacer y borra su historial de deudas.`)) return;
    try {
      await api.deleteClient(c.id);
      toast.success(`Cliente "${c.name}" eliminado`);
      load();
    } catch (err) { toast.error(String(err)); }
  }

  async function notifyDebtors() {
    if (debtors.length === 0) { toast.info("No hay clientes con deudas pendientes"); return; }

    let opened = 0;
    for (const c of debtors) {
      if (!c.phone) continue;
      const phone = c.phone.replace(/\D/g, "");
      const fullPhone = phone.startsWith("57") ? phone : `57${phone}`;
      const msg = encodeURIComponent(
        `Hola ${c.name} 👋, te recordamos que tienes un saldo pendiente de $${c.pendingDebt.toLocaleString("es-CO")} con nosotros. Por favor comunícate para ponernos al día. ¡Gracias!`
      );
      window.open(`https://wa.me/${fullPhone}?text=${msg}`, "_blank");
      opened++;
      // pequeño delay para no saturar el navegador
      await new Promise(r => setTimeout(r, 400));
    }

    const sinTelefono = debtors.filter(c => !c.phone).length;
    if (opened > 0) toast.success(`📲 WhatsApp abierto para ${opened} cliente(s)`);
    if (sinTelefono > 0) toast.warning(`⚠️ ${sinTelefono} cliente(s) sin teléfono registrado`);
    if (opened === 0) toast.error("Ningún cliente deudor tiene teléfono registrado");
  }

  async function toggleActive(c: api.Client) {
    try {
      await api.updateClient(c.id, { active: !c.active });
      toast.success(c.active ? "Cliente desactivado" : "Cliente reactivado");
      load();
    } catch (err) { toast.error(String(err)); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gestión de deudas y saldos pendientes</p>
        </div>
        {tab === "deudas" && (
          <div className="flex gap-2">
            {debtors.length > 0 && (
              <button
                onClick={notifyDebtors}
                className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-bold hover:bg-secondary transition"
              >
                <Bell className="h-4 w-4" />
                Notificar deudores ({debtors.length})
              </button>
            )}
            <button
              onClick={() => { setSelectedClient(undefined); setWizardMode("new_client"); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition"
            >
              <Plus className="h-4 w-4" /> Nuevo cliente
            </button>
          </div>
        )}
      </div>

      {/* Pestañas: deudas normales / clientes por hora */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-2xl w-fit">
        <TabBtn active={tab === "deudas"} onClick={() => { setTab("deudas"); setExpandedId(null); }}>
          <Users className="h-4 w-4" /> Deudas normales
        </TabBtn>
        <TabBtn active={tab === "hora"} onClick={() => { setTab("hora"); setExpandedId(null); }}>
          <Clock className="h-4 w-4" /> Clientes por hora
        </TabBtn>
      </div>

      {tab === "deudas" ? (
      <>
      {/* Summary cards */}
      {debtors.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SummaryCard icon="👥" label="Total clientes" value={String(clients.length)} />
          <SummaryCard icon="⚠️" label="Con deuda" value={String(debtors.length)} warn />
          <SummaryCard icon="💸" label="Deuda total" value={formatCOP(totalDebt)} warn />
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Cargando…</div>
      ) : clients.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-bold text-lg">Sin clientes aún</p>
          <p className="text-sm text-muted-foreground mt-1">Registra el primer cliente para comenzar</p>
          <button onClick={() => setWizardMode("new_client")} className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition">
            Registrar cliente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(c => {
            const expanded = expandedId === c.id;
            const unpaidDebts = c.debts.filter(d => !d.paid);
            return (
              <div key={c.id} className={`glass-strong rounded-3xl overflow-hidden ${!c.active ? "opacity-60" : ""}`}>
                <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${c.pendingDebt > 0 ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}`}>
                      {c.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {c.name}
                        {!c.active && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">Inactivo</span>}
                      </div>
                      {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.pendingDebt > 0 ? (
                      <div className="text-right">
                        <div className="text-xs text-red-500 font-medium">Deuda pendiente</div>
                        <div className="font-black text-red-600 tnum">{formatCOP(c.pendingDebt)}</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Al día
                      </div>
                    )}
                    <button
                      onClick={() => openAddDebt(c)}
                      className="px-3 py-1.5 text-xs font-bold bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition"
                    >
                      + Deuda
                    </button>
                    <button
                      onClick={() => toggleExpand(c)}
                      className="p-1.5 rounded-lg hover:bg-secondary transition"
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
                    {/* Abono al saldo total del cliente */}
                    {c.pendingDebt > 0 && (
                      <button
                        onClick={() => openPayClient(c)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition"
                      >
                        <span className="text-sm font-bold text-green-700 dark:text-green-400">💵 Abonar / Pagar deuda</span>
                        <span className="text-xs text-muted-foreground">Saldo: <span className="font-bold text-red-500">{formatCOP(c.pendingDebt)}</span></span>
                      </button>
                    )}

                    {unpaidDebts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">Sin deudas pendientes</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Detalle de deudas</p>
                        {unpaidDebts.map(d => {
                          const pendingOnDebt = d.amount - (d.paidAmount ?? 0);
                          return (
                          <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                            <div>
                              <p className="text-sm font-medium">{d.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(d.createdAt).toLocaleDateString("es-CO")}
                                {(d.paidAmount ?? 0) > 0 ? ` · abonado ${formatCOP(d.paidAmount ?? 0)}` : ""}
                              </p>
                            </div>
                            <span className="font-bold text-red-600 tnum">{formatCOP(pendingOnDebt)}</span>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Historial de deudas pagadas: fecha de la deuda, cuándo se pagó,
                        descripción y monto — agrupado por tanda de pago para conciliar. */}
                    {detailLoading && !detail ? (
                      <p className="text-sm text-muted-foreground text-center py-3">Cargando historial…</p>
                    ) : detail && detail.id === c.id ? (
                      <PaidHistory debts={detail.debts} />
                    ) : null}

                    <div className="flex gap-2 pt-2">
                      <button onClick={() => toggleActive(c)} className="flex-1 py-2 text-xs font-bold border border-border rounded-xl hover:bg-secondary transition">
                        {c.active ? "Desactivar" : "Reactivar"}
                      </button>
                      {isAdmin && (
                        <button onClick={() => removeClient(c)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold border border-red-500/30 text-red-500 rounded-xl hover:bg-red-500/10 transition">
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      ) : (
        <HourlyClientsTab />
      )}

      {wizardMode === "new_client" && (
        <ClientDebtWizard open={true} onOpenChange={(v) => { if (!v) setWizardMode(null); }} mode="new_client" onDone={refreshAfterAction} />
      )}
      {wizardMode === "add_debt" && selectedClient && (
        <ClientDebtWizard open={true} onOpenChange={(v) => { if (!v) setWizardMode(null); }} mode="add_debt" client={selectedClient} onDone={refreshAfterAction} />
      )}
      {wizardMode === "pay_debt" && selectedClient && (
        <ClientDebtWizard open={true} onOpenChange={(v) => { if (!v) setWizardMode(null); }} mode="pay_debt" client={selectedClient} onDone={refreshAfterAction} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${active ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function SummaryCard({ icon, label, value, warn }: { icon: string; label: string; value: string; warn?: boolean }) {
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="text-2xl">{icon}</div>
      <div className="text-xs text-muted-foreground mt-2">{label}</div>
      <div className={`font-black text-xl tnum mt-0.5 ${warn ? "text-red-500" : ""}`}>{value}</div>
    </div>
  );
}

// ─── Historial de deudas pagadas ──────────────────────────────────────────────
// Zona horaria Bogotá SIEMPRE (igual que el resto del sistema): se formatea con
// timeZone America/Bogota para no depender del reloj del navegador/equipo.
function bogotaDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // YYYY-MM-DD
}
function fmtShort(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}
function fmtLongDay(day: string): string {
  // day es "YYYY-MM-DD"; T12:00:00 evita cualquier cruce de día al formatear.
  return new Date(day + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function PaidHistory({ debts }: { debts: api.ClientDebt[] }) {
  const paid = debts
    .filter(d => d.paid && d.paidAt)
    .sort((a, b) => (a.paidAt! < b.paidAt! ? 1 : -1)); // más reciente primero

  if (paid.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-2">Sin deudas pagadas todavía</p>;
  }

  // Agrupar por día de pago (tanda) para poder conciliar el total cobrado ese día
  // contra lo que realmente entró al banco/efectivo.
  const groups: { day: string; items: api.ClientDebt[]; total: number }[] = [];
  for (const d of paid) {
    const day = bogotaDay(d.paidAt!);
    let g = groups.find(x => x.day === day);
    if (!g) { g = { day, items: [], total: 0 }; groups.push(g); }
    g.items.push(d);
    g.total += d.paidAmount ?? d.amount;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Historial pagado · {paid.length} deuda(s)
      </p>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {groups.map(g => (
          <div key={g.day} className="rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-green-500/10">
              <span className="text-xs font-bold text-green-700 dark:text-green-400 capitalize">
                Pagado · {fmtLongDay(g.day)}
              </span>
              <span className="text-xs font-black text-green-700 dark:text-green-400 tnum shrink-0">
                {formatCOP(g.total)} · {g.items.length}
              </span>
            </div>
            <div className="divide-y divide-border/40">
              {g.items.map(d => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.description || "Sin descripción"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      🗓️ Deuda del {fmtShort(d.createdAt)} · 👤 creó: <span className="font-semibold">{d.createdByName ?? "—"}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      ✅ pagó {fmtDateTime(d.paidAt)}{d.paidByName ? ` · ${d.paidByName}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-green-600 tnum shrink-0">
                    {formatCOP(d.paidAmount ?? d.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
