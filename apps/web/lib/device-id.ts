// Identificador de EQUIPO (PC), estable por navegador. Se guarda en localStorage — a
// diferencia del token (sessionStorage, muere al cerrar) este DEBE persistir entre sesiones:
// es la identidad del PC para el sistema de autorización de equipos. Si el usuario borra los
// datos del navegador, se genera uno nuevo y el equipo vuelve a aparecer como "pendiente" (a
// propósito: el admin lo reautoriza y renombra). localStorage es por ORIGEN, así que cada PC
// que entra por la IP del servidor tiene el suyo.

const KEY = "cashbuddy.deviceId";

// UUID v4 con fallback por si crypto.randomUUID no existe (WebView2/navegadores viejos).
function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* sigue al fallback */ }
  return "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

// Id efímero en memoria si localStorage está bloqueado (modo privado, etc.): la sesión sigue
// funcionando, pero el equipo se verá como nuevo cada vez (se maneja igual desde "Equipos").
let memId: string | null = null;

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    if (!memId) memId = newId();
    return memId;
  }
}

// Marca de "cerrar sistema" que este equipo ya atendió (para no re-desloguear al volver a entrar).
const LOGOUT_KEY = "cashbuddy.logoutHandledAt";
export function getHandledLogout(): string | null {
  try { return localStorage.getItem(LOGOUT_KEY); } catch { return null; }
}
export function setHandledLogout(v: string): void {
  try { localStorage.setItem(LOGOUT_KEY, v); } catch { /* almacenamiento bloqueado */ }
}
