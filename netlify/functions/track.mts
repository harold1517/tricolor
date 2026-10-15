// Cuenta visitas y acciones de la página. No guarda correos, direcciones IP ni nada que identifique a una persona.
import type { Config, Context } from "@netlify/functions";
import { bump, json } from "../lib/core.mts";

// visita, buscó ciudad, usó "cerca de mí", abrió un lugar, "cómo llegar", compartió, abrió el formulario de agregar
const EVENTS = ["visit", "search", "near", "open", "nav", "share", "addstart"];

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  let body: any;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ ok: false }, 400);
  }
  const event = String(body?.e ?? "");
  if (!EVENTS.includes(event)) return json({ ok: false }, 400);

  const keys = [event];
  const channel = String(body?.ch ?? "");
  if (/^[a-z0-9]{1,12}$/.test(channel)) keys.push(`${event}_c_${channel}`);
  const cc = String(body?.cc ?? "");
  if (event === "visit" && /^[A-Z]{2}$/.test(cc)) keys.push(`visit_cc_${cc}`);

  try {
    await bump(keys);
  } catch {
    return json({ ok: false }, 500);
  }
  return json({ ok: true });
};

export const config: Config = { path: "/api/track" };
