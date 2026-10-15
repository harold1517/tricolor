# Tricolor: lo venezolano, cerca de ti

Mapa mundial y gratuito, armado por la comunidad, para encontrar productos venezolanos, areperas y servicios de venezolanos en cualquier ciudad.

## Qué hay aquí
- `public/index.html`: el mapa (OpenStreetMap + Leaflet). Buscar ciudad, "cerca de mí", filtros, ficha del lugar, agregar, confirmar, reportar y compartir.
- `public/admin.html`: panel del dueño (números, moderación y carga de lugares en bloque).
- `netlify/functions/places.mts`: lugares (listar, agregar, confirmar, reportar).
- `netlify/functions/admin.mts`: panel (estadísticas, lista, ocultar, mostrar, borrar, importar).
- `netlify/functions/track.mts`: conteo de visitas y acciones, sin datos personales.

## Variables en Netlify
- `ADMIN_KEY` (obligatoria, secreta): clave del panel. Larga y única.
- `HASH_SALT` (recomendada, secreta): texto al azar para cifrar los identificadores de dispositivo.

## Anti-spam incluido
- Máximo 10 lugares al día por dispositivo y 30 por conexión.
- Campo trampa para robots y rechazo de enlaces web en el texto.
- Se oculta solo si 3 o más personas dicen que ya no existe y pesan más que las que confirman.

## Para crecer
OpenStreetMap y su buscador (Nominatim) son gratis para uso moderado. Si el mapa pasa de unas miles de visitas diarias, hay que cambiar a un proveedor de mapas (por ejemplo MapTiler) con su propia clave.
