# Feed del show local

Datos de solo lectura para el **show de pantallas del evento**: el panel de producción y el proyector que corren localmente en la laptop del operador (repositorio `gdg-presentacion`). El show consulta el ranking y el QR de la charla en curso y los dibuja con sus propias plantillas.

**La app nunca controla el proyector.** El feed no escribe nada: no cambia el escenario y no registra asistencias.

La spec completa está en `gdg-presentacion/docs/SPEC-FEED-ESCENARIO.md`. Código: `src/features/show-feed` (reglas), `src/app-shell/composition/show-feed.server.ts` (composición) y `src/app/api/show-feed/*` (rutas).

## Acceso

- **Clave:** cabecera `Authorization: Bearer <SHOW_FEED_TOKEN>`. Es un secreto de servidor de 32 caracteres o más (ver `docs/deploy.md`).
- **Respuestas según la clave:**
  - Sin la variable, o con una clave corta, o con `FEATURES.showFeed` apagado → `503 {"error":"disabled"}`.
  - Con una clave que falta o no coincide → `401 {"error":"unauthorized"}`.
- **CORS:** el show corre desde `file://`, así que todas las respuestas llevan `Access-Control-Allow-Origin: *` y `OPTIONS` responde `204`. No hay riesgo, porque el feed no usa cookies.
- **Respuesta:** siempre lleva `Cache-Control: no-store` y `serverNow` (ms).
- **Edición:** lee la edición pública, la misma de los cadetes y de `/escenario`.

## Endpoints

| Ruta | Respuesta 200 | Errores |
|---|---|---|
| `GET /api/show-feed/board` | `cadets` (top 10: `position`, `alias`, `squad`, `xp`), `squads` (`position`, `name`, `xp`, `members`, `sprite`: el logo pixel `{rows, palette}` o `null`) y `squadsOn` | `404 off` (ranking apagado en la edición) |
| `GET /api/show-feed/talks` | `talks` (`id`, `name`, `startsAt`, `endsAt`, `active`, `qrNow`), por hora | — |
| `GET /api/show-feed/qr?talk=<id>` | `talkId`, `name`, `cells` (filas de `"1"`/`"0"`, sin zona de silencio), `issuedAt`, `expiresAt` | `400 bad-request`, `404 not-found`, `409 inactive` |
| `GET /api/show-feed/polls` | `polls` (`id`, `question`, `status`): la abierta primero, luego las cerradas; sin borradores | `404 off` (encuestas apagadas) |
| `GET /api/show-feed/polls?id=<id>` | `poll`: `id`, `question`, `status`, `options` (`id`, `text`, `imageUrl`, `votes`) y `total` | `404 not-found` (no existe o es borrador) |
| `GET /api/show-feed/raffle` | `draws` (más reciente primero, sin anulados): `id`, `prizeName`, `prizeImageUrl`, `winner` (`alias`, `squad`), `tickets`, `totalTickets`, `at`, `reel` (los nombres que giró el escenario de la app; solo el último sorteo) | `404 off` (sorteo apagado) |

**Cuándo se entrega el QR:** para cualquier charla activa de la edición, a cualquier hora. El operador del show decide cuándo proyectarlo (los speakers lo piden antes o después de su charla, y las charlas se atrasan). `qrNow` en `talks` indica si la charla está activa. Cada llamada emite un código nuevo de 2 minutos, que se verifica como cualquier otro QR de charla. El texto firmado nunca sale del servidor.

**Costo:** el ranking usa la misma copia de pocos segundos que `/escenario`, y las charlas la copia de 1 minuto de la agenda. El show consulta cada 10 s, solo mientras tiene un cue de ranking o de QR al aire o armado.

## Rotar la clave

Cambia `SHOW_FEED_TOKEN`, redespliega y actualiza `js/feed.js` en la laptop del show. La clave anterior deja de funcionar con el despliegue.

El sorteo se hace en la app (Admin › Sorteo); el show solo lo proyecta. El feed sigue siendo de solo lectura: nunca vota, sortea ni cambia el escenario de la app. `imageUrl` y `prizeImageUrl` pueden ser rutas de la app (`/media/...`): el show les antepone la dirección del feed.
