// Lugares del mapa: listar (GET), agregar, confirmar que sigue y reportar que ya no está (POST).
import type { Config, Context } from "@netlify/functions";
import {
  CATS, PRODUCTS, type Place, autoHidden, bump, clean, getPlace, hasLink, hash, isDevice, json,
  listPlaces, newId, publicPlace, savePlace, underLimit,
} from "../lib/core.mts";

export default async (req: Request, context: Context) => {
  if (req.method === "GET") {
    const list = (await listPlaces()).filter((p) => !p.hidden && !autoHidden(p)).map(publicPlace);
    return new Response(JSON.stringify({ ok: true, places: list }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
        "netlify-cdn-cache-control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  }
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad_request" }, 400);
  }
  if (!isDevice(body?.device)) return json({ ok: false, reason: "bad_request" }, 400);
  const dev = hash(body.device);
  const ip = hash(context.ip || "sin-ip");
  const action = String(body?.action ?? "");

  if (action === "add") {
    if (body?.website) return json({ ok: true, id: "x" });   // trampa para robots: campo oculto que una persona no llena
    const name = clean(body?.name, 60);
    const cat = String(body?.cat ?? "");
    const products = Array.isArray(body?.products) ? [...new Set(body.products.map(String))].filter((x) => (PRODUCTS as readonly string[]).includes(x)) : [];
    const note = clean(body?.note, 160);
    const address = clean(body?.address, 100);
    const contact = clean(body?.contact, 40).replace(/[^\w@.+\- ]/g, "");
    const city = clean(body?.city, 60);
    const country = /^[A-Za-z]{2}$/.test(String(body?.country ?? "")) ? String(body.country).toUpperCase() : "";
    const lat = Number(body?.lat), lng = Number(body?.lng);

    if (name.length < 2) return json({ ok: false, reason: "name" }, 400);
    if (!(CATS as readonly string[]).includes(cat)) return json({ ok: false, reason: "cat" }, 400);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return json({ ok: false, reason: "pin" }, 400);
    if ([name, note, address].some(hasLink)) return json({ ok: false, reason: "link" }, 400);

    if (!(await underLimit("add", [dev], 10)) || !(await underLimit("addip", [ip], 30))) return json({ ok: false, reason: "limit" }, 429);

    const p: Place = {
      id: newId(), name, cat: cat as Place["cat"], products, note, address, contact,
      lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, city, country,
      createdAt: new Date().toISOString(), by: dev, confirms: 1, reports: 0,
      lastConfirm: new Date().toISOString(), hidden: false, voters: [dev],
    };
    await savePlace(p);
    try { await bump(["add", `add_${cat}`, ...(country ? [`add_cc_${country}`] : [])]); } catch {}
    return json({ ok: true, place: publicPlace(p) });
  }

  if (action === "confirm" || action === "report") {
    const p = await getPlace(String(body?.id ?? ""));
    if (!p || p.hidden) return json({ ok: false, reason: "not_found" }, 404);
    if (p.voters.includes(dev)) return json({ ok: true, already: true, place: publicPlace(p) });
    if (!(await underLimit("vote", [dev, ip], 60))) return json({ ok: false, reason: "limit" }, 429);
    if (action === "confirm") {
      p.confirms++;
      p.lastConfirm = new Date().toISOString();
    } else p.reports++;
    p.voters.push(dev);
    if (p.voters.length > 500) p.voters = p.voters.slice(-500);
    await savePlace(p);
    try { await bump([action]); } catch {}
    return json({ ok: true, place: publicPlace(p), hiddenNow: autoHidden(p) });
  }

  return json({ ok: false, reason: "bad_action" }, 400);
};

export const config: Config = { path: "/api/places" };
