// Piezas compartidas: almacén de lugares, límites anti-spam, estadísticas y utilidades.
import { getStore, getDeployStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const env = (name: string, fallback = ""): string => Netlify.env.get(name) ?? fallback;

// Los datos reales solo viven en el almacén global en producción; las vistas previas usan uno propio.
function storeOf(name: string) {
  const production = Netlify.context?.deploy?.context === "production";
  return production ? getStore({ name, consistency: "strong" }) : getDeployStore(name);
}

export const json = (body: unknown, status = 200, cache = "no-store"): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache },
  });

export function sameSecret(given: string, expected: string): boolean {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const hash = (v: string): string => createHash("sha256").update(env("HASH_SALT", "tricolor") + v).digest("hex").slice(0, 24);
export const isDevice = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);

/* ---------- Lugares ---------- */
export const CATS = ["comida", "productos", "servicios"] as const;
export const PRODUCTS = ["harina", "queso", "malta", "toddy", "dulces", "diablitos", "nata", "cafe", "panaderia", "hallacas"] as const;

export type Place = {
  id: string;
  name: string;
  cat: (typeof CATS)[number];
  products: string[];
  note: string;
  address: string;
  contact: string;
  lat: number;
  lng: number;
  city: string;
  country: string;   // código ISO de 2 letras, en mayúsculas, o vacío
  createdAt: string;
  by: string;        // dispositivo que lo agregó, cifrado
  confirms: number;
  reports: number;
  lastConfirm: string;
  hidden: boolean;
  voters: string[];  // dispositivos que ya confirmaron o reportaron, cifrados (para no contar dos veces)
};

// Lo que se muestra al público: sin datos de quién agregó ni votó.
export const publicPlace = (p: Place) => ({
  id: p.id, name: p.name, cat: p.cat, products: p.products, note: p.note, address: p.address, contact: p.contact,
  lat: p.lat, lng: p.lng, city: p.city, country: p.country, createdAt: p.createdAt,
  confirms: p.confirms, lastConfirm: p.lastConfirm,
});

export const newId = (): string => randomBytes(6).toString("base64url");

export const places = () => storeOf("places");

export async function getPlace(id: string): Promise<Place | null> {
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(id)) return null;
  return (await places().get(id, { type: "json" })) as Place | null;
}

export async function savePlace(p: Place): Promise<void> {
  await places().setJSON(p.id, p);
}

export async function listPlaces(): Promise<Place[]> {
  const s = places();
  const { blobs } = await s.list();
  const all = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" }) as Promise<Place | null>));
  return all.filter((p): p is Place => !!p);
}

// Se oculta solo si varias personas dicen que ya no existe y pesan más que las que confirman.
export const autoHidden = (p: Place): boolean => p.reports >= 3 && p.reports > p.confirms;

/* ---------- Límites: cuántas veces al día puede agregar un mismo dispositivo o conexión ---------- */
export async function underLimit(kind: string, who: string[], max: number): Promise<boolean> {
  const s = storeOf("limits");
  const day = statsDay();
  for (const w of who) {
    const key = `${day}_${kind}_${w}`;
    const n = parseInt((await s.get(key)) ?? "0", 10) || 0;
    if (n >= max) return false;
  }
  for (const w of who) {
    const key = `${day}_${kind}_${w}`;
    const n = parseInt((await s.get(key)) ?? "0", 10) || 0;
    await s.set(key, String(n + 1));
  }
  return true;
}

/* ---------- Estadísticas: contadores por día, sin datos personales ---------- */
export type DayStats = Record<string, number>;
const statsStore = () => storeOf("stats");

export function statsDay(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: env("STATS_TZ", "America/Bogota") }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Suma 1 a cada contador del día (cifras aproximadas). Los contadores con "_c_" o "_cc_" tienen tope.
export async function bump(keys: string[]): Promise<void> {
  const s = statsStore();
  const day = statsDay();
  const cur = ((await s.get(day, { type: "json" })) as DayStats | null) ?? {};
  let extra = Object.keys(cur).filter((k) => k.includes("_c_") || k.includes("_cc_")).length;
  for (const k of keys) {
    if ((k.includes("_c_") || k.includes("_cc_")) && !(k in cur)) {
      if (extra >= 120) continue;
      extra++;
    }
    cur[k] = (cur[k] ?? 0) + 1;
  }
  await s.setJSON(day, cur);
}

export async function readStats(days: number): Promise<{ day: string; counts: DayStats }[]> {
  const s = statsStore();
  const { blobs } = await s.list();
  const keys = blobs.map((b) => b.key).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().reverse().slice(0, days);
  const out: { day: string; counts: DayStats }[] = [];
  for (const k of keys) out.push({ day: k, counts: ((await s.get(k, { type: "json" })) as DayStats | null) ?? {} });
  return out;
}

// Limpia texto: sin etiquetas, sin enlaces, sin saltos raros, con largo máximo.
export function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
export const hasLink = (s: string): boolean => /(https?:\/\/|www\.|\.(com|net|org|xyz|ru|io)\b)/i.test(s);
