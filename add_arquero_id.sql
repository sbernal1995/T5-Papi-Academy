-- Asociar el arquero que recibio un gol a un jugador puntual.
-- Ejecutar en Supabase SQL Editor si la tabla goles todavia no tiene arquero_id.

ALTER TABLE public.goles
ADD COLUMN IF NOT EXISTS arquero_id uuid NULL
REFERENCES public.jugadores (id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_goles_arquero_id
ON public.goles (arquero_id);
