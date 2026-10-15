// Panel del dueño: números, lista completa de lugares y moderación (ocultar, mostrar, borrar).
import type { Config, Context } from "@netlify/functions";
import { CATS, PRODUCTS, autoHidden, clean, env, getPlace, json, listPlaces, newId, places, readStats, sameSecret, savePlace } from "../lib/core.mts";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405);
  const key = env("ADMIN_KEY");
  if (!key) return json({ ok: false, reason: "not_configured" }, 500);
  if (!sameSecret(req.headers.get("x-admin-key") ?? "", key)) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ ok: false, reason: "unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  const action = String(body?.action ?? "");

  // Mismo formato que las otras apps, para que el tablero general la entienda.
  if (action === "stats") {
    return json({ ok: true, app: env("APP_NAME", "tricolor"), days: await readStats(Math.min(Math.max(parseInt(body?.days, 10) || 60, 1), 400)) });
  }

  if (action === "list") {
    const all = await listPlaces();
    const visible = all.filter((p) => !p.hidden && !autoHidden(p));
    const summary = {
      places: visible.length,
      hidden: all.length - visible.length,
      countries: new Set(visible.map((p) => p.country).filter(Boolean)).size,
      cities: new Set(visible.map((p) => `${p.country}|${p.city.toLowerCase()}`).filter((x) => !x.endsWith("|"))).size,
    };
    const rows = all
      .map((p) => ({ id: p.id, name: p.name, cat: p.cat, city: p.city, country: p.country, confirms: p.confirms, reports: p.reports, hidden: p.hidden, auto: autoHidden(p), createdAt: p.createdAt, note: p.note, address: p.address, contact: p.contact, lat: p.lat, lng: p.lng }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return json({ ok: true, summary, places: rows });
  }

  // Carga inicial: varios lugares de una vez desde el panel (para que el mapa no arranque vacío).
  if (action === "import") {
    const items = Array.isArray(body?.places) ? body.places.slice(0, 300) : [];
    let added = 0;
    for (const it of items) {
      const lat = Number(it?.lat), lng = Number(it?.lng);
      const cat = String(it?.cat ?? "");
      const name = clean(it?.name, 60);
      if (name.length < 2 || !(CATS as readonly string[]).includes(cat) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const now = new Date().toISOString();
      await savePlace({
        id: newId(), name, cat: cat as any,
        products: Array.isArray(it?.products) ? it.products.map(String).filter((x: string) => (PRODUCTS as readonly string[]).includes(x)) : [],
        note: clean(it?.note, 160), address: clean(it?.address, 100), contact: clean(it?.contact, 40),
        lat, lng, city: clean(it?.city, 60), country: /^[A-Za-z]{2}$/.test(String(it?.country ?? "")) ? String(it.country).toUpperCase() : "",
        createdAt: now, by: "admin", confirms: 0, reports: 0, lastConfirm: "", hidden: false, voters: [],
      });
      added++;
    }
    return json({ ok: true, added });
  }

  const p = await getPlace(String(body?.id ?? ""));
  if (!p) return json({ ok: false, reason: "not_found" }, 404);
  if (action === "hide") { p.hidden = true; await savePlace(p); return json({ ok: true }); }
  if (action === "show") { p.hidden = false; p.reports = 0; await savePlace(p); return json({ ok: true }); }
  if (action === "delete") { await places().delete(p.id); return json({ ok: true }); }
  return json({ ok: false, reason: "bad_action" }, 400);
};

export const config: Config = { path: "/api/admin" };
