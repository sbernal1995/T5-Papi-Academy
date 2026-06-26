# API de export historico

Hay dos formas de sacar todos los datos para estadisticas.

## Desde la web

En la pestana **Historial de Partidos**, el boton **Exportar JSON** descarga un archivo con:

- `tables`: tablas crudas de Supabase.
- `derived.match_rows`: partidos resumidos con resultado y goles.
- `derived.player_match_rows`: una fila por jugador y partido.
- `derived.goal_rows`: goles con nombres de jugadores.
- `derived.tracking_player_rows`: metricas fisicas por jugador cuando hay tracking.

Tambien se puede usar desde la consola del navegador:

```js
const data = await window.T5DataExport.exportAll();
console.log(data.derived.player_match_rows);
```

## Endpoint RPC de Supabase

Para tener una API real, correr `export_api_schema.sql` en el SQL editor de Supabase. Despues queda disponible:

```text
POST https://jqslerzbzxtycwozvtcy.supabase.co/rest/v1/rpc/export_historical_data
```

Ejemplo con `curl`:

```bash
curl -X POST "https://jqslerzbzxtycwozvtcy.supabase.co/rest/v1/rpc/export_historical_data" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

El RPC devuelve solo tablas crudas. Para tener las tablas derivadas listas para analizar, usar `docs/data-export.js` desde la web o reutilizar su funcion `buildDerivedTables()`.
