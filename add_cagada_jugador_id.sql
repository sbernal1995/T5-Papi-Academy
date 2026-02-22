-- Asociar la "cagada" de un gol a un jugador puntual.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.goles
ADD COLUMN IF NOT EXISTS cagada_jugador_id uuid NULL
REFERENCES public.jugadores (id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_goles_cagada_jugador_id
ON public.goles (cagada_jugador_id);
