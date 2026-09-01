"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, Clock3, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/use-live";
import * as api from "@/lib/sd-api";
import { getHandledLogout, setHandledLogout } from "@/lib/device-id";

/**
 * Puerta de EQUIPOS en el frontend. Consulta /devices/me y, según el estado del PC:
 *  - approved (o PC servidor) → deja pasar a la app.
 *  - pending → pantalla "esperando autorización del administrador".
 *  - blocked → pantalla "equipo bloqueado".
 * Además atiende la señal de "cerrar sistema" (logoutRequestedAt): si llega una más nueva que
 * la ya atendida por este PC, cierra sesión y vuelve al login (sirve para identificar el equipo).
 * El respaldo REAL está en el backend (esta puerta es UX): un PC no autorizado no puede operar.
 */
export function DeviceGate({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth();
  const [device, setDevice] = useState<api.MyDevice | null>(null);
  const [checked, setChecked] = useState(false);

  const check = useCallback(async () => {
    try {
      const d = await api.getMyDevice();
      if (d.logoutRequestedAt && d.logoutRequestedAt !== getHandledLogout()) {
        setHandledLogout(d.logoutRequestedAt);
        logout();
        return;
      }
      setDevice(d);
    } catch {
      /* error de red: conservar el último estado conocido */
    } finally {
      setChecked(true);
    }
  }, [logout]);

  useEffect(() => { check(); }, [check]);
  useLive(check, 4000);

  if (!checked && !device) {
    return (
      <Screen>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Screen>
    );
  }

  if (device && !device.allowed) {
    if (device.status === "blocked") {
      return (
        <Screen>
          <StatusCard
            icon={<ShieldAlert className="h-10 w-10 text-red-500" />}
            title="Equipo bloqueado"
            tone="red"
            message="Este computador fue bloqueado por el administrador y no puede usar el sistema. Si crees que es un error, pídele que lo reautorice desde “Equipos”."
            deviceId={device.id}
            userName={user?.name ?? user?.email ?? null}
            onLogout={logout}
          />
        </Screen>
      );
    }
    return (
      <Screen>
        <StatusCard
          icon={<Clock3 className="h-10 w-10 text-amber-500" />}
          title="Esperando autorización"
          tone="amber"
          message="Este computador aún no está autorizado. Pídele al administrador que lo apruebe y le ponga un nombre desde “Equipos”. En cuanto lo haga, esta pantalla entra sola."
          deviceId={device.id}
          userName={user?.name ?? user?.email ?? null}
          onLogout={logout}
        />
      </Screen>
    );
  }

  return <>{children}</>;
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 bg-background">{children}</div>;
}

function StatusCard({
  icon, title, message, tone, deviceId, userName, onLogout,
}: {
  icon: React.ReactNode; title: string; message: string; tone: "amber" | "red";
  deviceId: string | null; userName: string | null; onLogout: () => void;
}) {
  const ring = tone === "red" ? "ring-red-500/20" : "ring-amber-500/20";
  return (
    <div className={`glass-strong rounded-3xl p-8 max-w-md w-full text-center space-y-4 ring-1 ${ring}`}>
      <div className="flex justify-center">
        {/* Pulso sutil para que se note que está "esperando" */}
        <div className="relative">
          {icon}
          {tone === "amber" && <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/20" />}
        </div>
      </div>
      <h1 className="text-xl font-black">{title}</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      {deviceId && (
        <p className="text-[11px] text-muted-foreground">
          ID de este equipo: <span className="font-mono font-bold">{deviceId.slice(0, 8)}</span>
          {userName ? <> · sesión de <span className="font-semibold">{userName}</span></> : null}
        </p>
      )}
      <button
        onClick={onLogout}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition"
      >
        <LogOut className="h-4 w-4" /> Cerrar sesión
      </button>
    </div>
  );
}
