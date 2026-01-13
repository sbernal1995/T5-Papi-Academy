
"""
Fútbol simulator (MVP) — Entrena un modelo con tu historial (Supabase) y después simula partidos.

Tablas esperadas (según tu app):
- partidos: id, fecha, cancha, resultado, equipo_ganador, temporada_id, youtube_link
- jugador_partido: partido_id, jugador_id, equipo, atajadas, cagadas, mvp, ace, pulmon, ...
- goles: partido_id, goleador_id, asistidor_id, equipo, es_gol_en_contra, minuto
- jugadores: id, nombre (y lo que tengas)

Cómo correr (local):
  pip install pandas numpy requests torch

Config:
  export SUPABASE_URL="https://xxxx.supabase.co"
  export SUPABASE_ANON_KEY="eyJ..."

Entrenar:
  python futbol_sim_mvp.py train --season_id 2 --out model_params.json

Simular:
  python futbol_sim_mvp.py sim --model model_params.json --team1 "Cogorno,Kite,Berni,Renzo,Darmian" --team2 "Fachita,Boska,Mexa,Colidio,Ggasti"

Notas:
- El modelo aprende:
  * goles del equipo (Poisson)
  * cagadas del equipo (Poisson)
  y usa la relación: goles_equipo ≈ goles_de_jugada + goles_por_cagadas_del_rival
- La prob. de que una cagada termine en gol es p_goal_from_cagada (sigmoid, entrenable).
"""

from __future__ import annotations

import os
import json
import argparse
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple, Optional

import numpy as np
import pandas as pd
import requests

try:
    import torch
    import torch.nn.functional as F
except Exception as e:  # pragma: no cover
    torch = None


# -------------------------
# Supabase (PostgREST) fetch
# -------------------------

class SupabaseREST:
    def __init__(self, url: str, anon_key: str, timeout: int = 60):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Accept": "application/json",
        }
        self.timeout = timeout

    def fetch_all(
        self,
        table: str,
        select: str = "*",
        filters: Optional[Dict[str, Any]] = None,
        order: Optional[str] = None,
        page_size: int = 1000,
    ) -> List[Dict[str, Any]]:
        """
        Descarga todas las filas de una tabla usando paginación limit/offset.
        """
        filters = filters or {}
        out: List[Dict[str, Any]] = []
        offset = 0

        while True:
            params = {"select": select, "limit": page_size, "offset": offset}
            if order:
                params["order"] = order
            # filtros simples eq
            for k, v in filters.items():
                params[k] = f"eq.{v}"

            r = requests.get(
                f"{self.base}/{table}",
                headers=self.headers,
                params=params,
                timeout=self.timeout,
            )
            r.raise_for_status()
            rows = r.json()
            if not rows:
                break
            out.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size

        return out


# -------------------------
# Dataset construction
# -------------------------

@dataclass
class MatchRow:
    partido_id: Any
    team1_ids: List[str]
    team2_ids: List[str]
    goals1: int
    goals2: int
    cagadas1: int
    cagadas2: int
    atajadas1: int
    atajadas2: int


def _safe_int(x: Any) -> int:
    try:
        if pd.isna(x):
            return 0
        return int(x)
    except Exception:
        return 0


def build_dataset(partidos: pd.DataFrame, jp: pd.DataFrame, goles: pd.DataFrame) -> List[MatchRow]:
    """
    Arma filas por partido:
      - equipos (listas de jugador_id)
      - goles por equipo (desde tabla goles usando columna 'equipo')
      - cagadas por equipo (sum(jugador_partido.cagadas))
      - atajadas por equipo (sum(jugador_partido.atajadas))
    """
    # Normalizar tipos
    for col in ["partido_id", "jugador_id"]:
        if col in jp.columns:
            jp[col] = jp[col].astype(str)
    if "partido_id" in goles.columns:
        goles["partido_id"] = goles["partido_id"].astype(str)
    if "equipo" in goles.columns:
        goles["equipo"] = goles["equipo"].apply(_safe_int)

    dataset: List[MatchRow] = []

    for _, p in partidos.iterrows():
        pid = str(p["id"])
        jp_pid = jp[jp["partido_id"] == pid]
        if jp_pid.empty:
            continue

        team1 = jp_pid[jp_pid["equipo"].apply(_safe_int) == 1]["jugador_id"].astype(str).tolist()
        team2 = jp_pid[jp_pid["equipo"].apply(_safe_int) == 2]["jugador_id"].astype(str).tolist()
        if len(team1) == 0 or len(team2) == 0:
            continue

        goles_pid = goles[goles["partido_id"] == pid]
        # goles por equipo: usa columna 'equipo' (ya contempla goles en contra, porque 'equipo' es el que recibe el gol)
        g1 = int((goles_pid["equipo"] == 1).sum()) if not goles_pid.empty else 0
        g2 = int((goles_pid["equipo"] == 2).sum()) if not goles_pid.empty else 0

        cag1 = int(jp_pid[jp_pid["equipo"].apply(_safe_int) == 1]["cagadas"].fillna(0).astype(int).sum()) if "cagadas" in jp_pid.columns else 0
        cag2 = int(jp_pid[jp_pid["equipo"].apply(_safe_int) == 2]["cagadas"].fillna(0).astype(int).sum()) if "cagadas" in jp_pid.columns else 0

        at1 = int(jp_pid[jp_pid["equipo"].apply(_safe_int) == 1]["atajadas"].fillna(0).astype(int).sum()) if "atajadas" in jp_pid.columns else 0
        at2 = int(jp_pid[jp_pid["equipo"].apply(_safe_int) == 2]["atajadas"].fillna(0).astype(int).sum()) if "atajadas" in jp_pid.columns else 0

        dataset.append(MatchRow(
            partido_id=pid,
            team1_ids=team1,
            team2_ids=team2,
            goals1=g1,
            goals2=g2,
            cagadas1=cag1,
            cagadas2=cag2,
            atajadas1=at1,
            atajadas2=at2,
        ))

    return dataset


# -------------------------
# Model (PyTorch)
# -------------------------

def _pair_synergy(u_team: torch.Tensor) -> torch.Tensor:
    """
    u_team: (T, D) embeddings de los jugadores del equipo
    Retorna: escalar = sum_{i<j} u_i · u_j
    Computo eficiente: 0.5 * (||sum u||^2 - sum ||u||^2)
    """
    s = u_team.sum(dim=0)
    return 0.5 * ((s * s).sum() - (u_team * u_team).sum())


def _triple_synergy(u_team: torch.Tensor) -> torch.Tensor:
    """
    S3 = sum_{i<j<k} sum_d u_i,d u_j,d u_k,d
    Para cada dim d:
      sum_{i<j<k} x_i x_j x_k = (s1^3 - 3*s1*s2 + 2*s3)/6
      donde s1=sum x, s2=sum x^2, s3=sum x^3
    """
    x = u_team  # (T, D)
    s1 = x.sum(dim=0)
    s2 = (x * x).sum(dim=0)
    s3 = (x * x * x).sum(dim=0)
    triples_per_dim = (s1 ** 3 - 3.0 * s1 * s2 + 2.0 * s3) / 6.0
    return triples_per_dim.sum()


class FootballModel(torch.nn.Module):
    def __init__(self, player_ids: List[str], d_synergy: int = 8, d_match: int = 8):
        super().__init__()
        self.player_ids = list(player_ids)
        self.id2idx = {pid: i for i, pid in enumerate(self.player_ids)}
        n = len(self.player_ids)

        # Skills por jugador
        self.atk = torch.nn.Parameter(torch.zeros(n))
        self.defn = torch.nn.Parameter(torch.zeros(n))
        self.err = torch.nn.Parameter(torch.zeros(n))

        # Embeddings: sinergia dentro del equipo
        self.u = torch.nn.Parameter(0.01 * torch.randn(n, d_synergy))

        # Embeddings: matchup (A vs B)
        self.p_off = torch.nn.Parameter(0.01 * torch.randn(n, d_match))
        self.q_def = torch.nn.Parameter(0.01 * torch.randn(n, d_match))

        # Bias y pesos globales
        self.b_play = torch.nn.Parameter(torch.tensor(0.0))
        self.b_err = torch.nn.Parameter(torch.tensor(-0.5))
        self.b_save = torch.nn.Parameter(torch.tensor(0.0))

        self.w_atk = torch.nn.Parameter(torch.tensor(1.0))
        self.w_def = torch.nn.Parameter(torch.tensor(1.0))
        self.w_syn2 = torch.nn.Parameter(torch.tensor(0.05))
        self.w_syn3 = torch.nn.Parameter(torch.tensor(0.01))
        self.w_cross = torch.nn.Parameter(torch.tensor(0.05))

        self.w_err_skill = torch.nn.Parameter(torch.tensor(1.0))
        self.w_pressure = torch.nn.Parameter(torch.tensor(0.15))

        self.w_save_def = torch.nn.Parameter(torch.tensor(0.35))
        self.w_save_pressure = torch.nn.Parameter(torch.tensor(0.35))

        # p(goal | cagada) en logit (para que esté entre 0 y 1)
        self.logit_p_goal_from_cagada = torch.nn.Parameter(torch.tensor(2.5))  # ~0.924

    def idxs(self, team_ids: List[str]) -> torch.Tensor:
        return torch.tensor([self.id2idx[i] for i in team_ids], dtype=torch.long)

    def team_features(self, idxs: torch.Tensor) -> Dict[str, torch.Tensor]:
        atk = self.atk[idxs].sum()
        defn = self.defn[idxs].sum()
        err = self.err[idxs].sum()
        u_team = self.u[idxs]
        syn2 = _pair_synergy(u_team)
        syn3 = _triple_synergy(u_team)
        p = self.p_off[idxs].sum(dim=0)
        return {"atk": atk, "def": defn, "err": err, "syn2": syn2, "syn3": syn3, "p_sum": p}

    def rates(self, teamA: List[str], teamB: List[str]) -> Dict[str, torch.Tensor]:
        ia = self.idxs(teamA)
        ib = self.idxs(teamB)

        fa = self.team_features(ia)
        fb = self.team_features(ib)

        qB = self.q_def[ib].sum(dim=0)
        qA = self.q_def[ia].sum(dim=0)

        crossA = (fa["p_sum"] * qB).sum()
        crossB = (fb["p_sum"] * qA).sum()

        # goles de jugada
        log_lambdaA = (
            self.b_play
            + self.w_atk * fa["atk"]
            - self.w_def * fb["def"]
            + self.w_syn2 * fa["syn2"]
            + self.w_syn3 * fa["syn3"]
            + self.w_cross * crossA
        )
        log_lambdaB = (
            self.b_play
            + self.w_atk * fb["atk"]
            - self.w_def * fa["def"]
            + self.w_syn2 * fb["syn2"]
            + self.w_syn3 * fb["syn3"]
            + self.w_cross * crossB
        )

        # cagadas (que potencialmente terminan en gol rival)
        log_etaA = self.b_err + self.w_err_skill * fa["err"] + self.w_pressure * fb["atk"]
        log_etaB = self.b_err + self.w_err_skill * fb["err"] + self.w_pressure * fa["atk"]

        # atajadas (opcional, para darle vida)
        log_kappaA = self.b_save + self.w_save_def * fa["def"] + self.w_save_pressure * fb["atk"]
        log_kappaB = self.b_save + self.w_save_def * fb["def"] + self.w_save_pressure * fa["atk"]

        # mantener >0 con softplus
        lambdaA = F.softplus(log_lambdaA) + 1e-6
        lambdaB = F.softplus(log_lambdaB) + 1e-6
        etaA = F.softplus(log_etaA) + 1e-6
        etaB = F.softplus(log_etaB) + 1e-6
        kappaA = F.softplus(log_kappaA) + 1e-6
        kappaB = F.softplus(log_kappaB) + 1e-6

        p_goal = torch.sigmoid(self.logit_p_goal_from_cagada)  # [0..1]

        # goles totales esperados = jugada + (cagadas rivales que terminan en gol)
        muGoalsA = lambdaA + p_goal * etaB
        muGoalsB = lambdaB + p_goal * etaA

        return {
            "lambdaA": lambdaA, "lambdaB": lambdaB,
            "etaA": etaA, "etaB": etaB,
            "kappaA": kappaA, "kappaB": kappaB,
            "p_goal": p_goal,
            "muGoalsA": muGoalsA, "muGoalsB": muGoalsB,
        }

    @staticmethod
    def poisson_nll(k: torch.Tensor, mu: torch.Tensor) -> torch.Tensor:
        # NLL sin constante log(k!)
        return mu - k * torch.log(mu + 1e-8)

    def loss_for_match(self, match: MatchRow) -> torch.Tensor:
        r = self.rates(match.team1_ids, match.team2_ids)

        k_g1 = torch.tensor(float(match.goals1))
        k_g2 = torch.tensor(float(match.goals2))
        k_c1 = torch.tensor(float(match.cagadas1))
        k_c2 = torch.tensor(float(match.cagadas2))
        k_s1 = torch.tensor(float(match.atajadas1))
        k_s2 = torch.tensor(float(match.atajadas2))

        loss = (
            self.poisson_nll(k_g1, r["muGoalsA"]) +
            self.poisson_nll(k_g2, r["muGoalsB"]) +
            self.poisson_nll(k_c1, r["etaA"]) +
            self.poisson_nll(k_c2, r["etaB"]) +
            0.25 * self.poisson_nll(k_s1, r["kappaA"]) +
            0.25 * self.poisson_nll(k_s2, r["kappaB"])
        )
        return loss

    def export_json(self) -> Dict[str, Any]:
        with torch.no_grad():
            p_goal = float(torch.sigmoid(self.logit_p_goal_from_cagada).cpu().item())
            globals_ = {
                "b_play": float(self.b_play.cpu().item()),
                "b_err": float(self.b_err.cpu().item()),
                "b_save": float(self.b_save.cpu().item()),
                "w_atk": float(self.w_atk.cpu().item()),
                "w_def": float(self.w_def.cpu().item()),
                "w_syn2": float(self.w_syn2.cpu().item()),
                "w_syn3": float(self.w_syn3.cpu().item()),
                "w_cross": float(self.w_cross.cpu().item()),
                "w_err_skill": float(self.w_err_skill.cpu().item()),
                "w_pressure": float(self.w_pressure.cpu().item()),
                "w_save_def": float(self.w_save_def.cpu().item()),
                "w_save_pressure": float(self.w_save_pressure.cpu().item()),
                "p_goal_from_cagada": p_goal,
            }

            players: Dict[str, Any] = {}
            for pid, i in self.id2idx.items():
                players[pid] = {
                    "atk": float(self.atk[i].cpu().item()),
                    "def": float(self.defn[i].cpu().item()),
                    "err": float(self.err[i].cpu().item()),
                    "u": self.u[i].detach().cpu().tolist(),
                    "p_off": self.p_off[i].detach().cpu().tolist(),
                    "q_def": self.q_def[i].detach().cpu().tolist(),
                }

        return {"globals": globals_, "players": players}


# -------------------------
# Training
# -------------------------

def train_model(dataset: List[MatchRow], player_ids: List[str], epochs: int = 2500, lr: float = 0.03,
                l2: float = 1e-3, seed: int = 7) -> FootballModel:
    if torch is None:
        raise RuntimeError("No se pudo importar torch. Instalá con: pip install torch")

    torch.manual_seed(seed)
    np.random.seed(seed)

    model = FootballModel(player_ids=player_ids, d_synergy=8, d_match=8)
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    # mini-batch simple (dataset chico)
    for ep in range(1, epochs + 1):
        opt.zero_grad(set_to_none=True)

        loss = torch.tensor(0.0)
        for m in dataset:
            loss = loss + model.loss_for_match(m)

        # regularización L2 suave
        reg = torch.tensor(0.0)
        for p in model.parameters():
            reg = reg + (p * p).mean()
        loss = loss / max(1, len(dataset)) + l2 * reg

        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        opt.step()

        if ep % 250 == 0 or ep == 1:
            with torch.no_grad():
                print(f"[ep {ep:4d}] loss={float(loss.item()):.4f}  p_goal_from_cagada={float(torch.sigmoid(model.logit_p_goal_from_cagada).item()):.3f}")

    return model


# -------------------------
# Simulation (timeline de eventos)
# -------------------------

def softmax_weights(x: np.ndarray, temp: float = 1.0) -> np.ndarray:
    x = x / max(1e-6, temp)
    x = x - x.max()
    e = np.exp(x)
    return e / e.sum()


def simulate_match(model_json: Dict[str, Any], jugadores_df: pd.DataFrame,
                   team1_names: List[str], team2_names: List[str],
                   seed: int = 123) -> Dict[str, Any]:
    rng = np.random.default_rng(seed)

    # map nombre -> id
    name2id = {str(r["nombre"]).strip(): str(r["id"]) for _, r in jugadores_df.iterrows()}
    team1 = [name2id[n.strip()] for n in team1_names]
    team2 = [name2id[n.strip()] for n in team2_names]

    players = model_json["players"]
    g = model_json["globals"]
    p_goal = float(g["p_goal_from_cagada"])

    def team_sums(ids: List[str]) -> Dict[str, Any]:
        atk = np.array([players[i]["atk"] for i in ids], dtype=float)
        deff = np.array([players[i]["def"] for i in ids], dtype=float)
        err = np.array([players[i]["err"] for i in ids], dtype=float)
        return {"atk": atk, "def": deff, "err": err}

    t1 = team_sums(team1)
    t2 = team_sums(team2)

    # tasas (replicar las mismas fórmulas del modelo torch, simplificadas)
    # Para el simulador MVP: ignoramos sinergia/matchup en la parte de Python puro,
    # porque ya quedó "metido" en los scalars durante el entrenamiento.
    # Si querés 1:1 con embeddings, lo hacemos después (es directo).
    # Por ahora: lambda_play ≈ exp(b + w_atk*sum atk - w_def*sum def_rival)
    def softplus(x: float) -> float:
        return float(np.log1p(np.exp(-abs(x))) + max(x, 0.0))

    log_lambda1 = g["b_play"] + g["w_atk"] * float(t1["atk"].sum()) - g["w_def"] * float(t2["def"].sum())
    log_lambda2 = g["b_play"] + g["w_atk"] * float(t2["atk"].sum()) - g["w_def"] * float(t1["def"].sum())

    log_eta1 = g["b_err"] + g["w_err_skill"] * float(t1["err"].sum()) + g["w_pressure"] * float(t2["atk"].sum())
    log_eta2 = g["b_err"] + g["w_err_skill"] * float(t2["err"].sum()) + g["w_pressure"] * float(t1["atk"].sum())

    lambda1 = softplus(log_lambda1) + 1e-6
    lambda2 = softplus(log_lambda2) + 1e-6
    eta1 = softplus(log_eta1) + 1e-6
    eta2 = softplus(log_eta2) + 1e-6

    # samplear cagadas y goles
    cag1 = int(rng.poisson(eta1))
    cag2 = int(rng.poisson(eta2))

    error_goals_team2 = int(rng.binomial(cag1, p_goal))  # cagadas del team1 -> goles del team2
    error_goals_team1 = int(rng.binomial(cag2, p_goal))  # cagadas del team2 -> goles del team1

    play1 = int(rng.poisson(lambda1))
    play2 = int(rng.poisson(lambda2))

    goals1 = play1 + error_goals_team1
    goals2 = play2 + error_goals_team2

    # timeline
    events: List[Dict[str, Any]] = []
    clock = 0.0

    # util: elegir jugador ponderado
    def pick(ids: List[str], weights: np.ndarray) -> str:
        w = weights / max(1e-9, weights.sum())
        idx = rng.choice(len(ids), p=w)
        return ids[idx]

    w_atk1 = softmax_weights(t1["atk"], temp=1.0)
    w_atk2 = softmax_weights(t2["atk"], temp=1.0)
    w_err1 = softmax_weights(t1["err"], temp=1.0) if float(t1["err"].var()) > 1e-9 else np.ones(len(team1)) / len(team1)
    w_err2 = softmax_weights(t2["err"], temp=1.0) if float(t2["err"].var()) > 1e-9 else np.ones(len(team2)) / len(team2)

    def add_event(kind: str, team: int, player_id: Optional[str] = None, extra: Optional[Dict[str, Any]] = None):
        nonlocal clock
        clock += float(rng.uniform(0.6, 2.3))  # “tiempo real” simplificado
        e = {"t": round(clock, 2), "type": kind, "team": team}
        if player_id is not None:
            # id -> nombre
            name = jugadores_df.loc[jugadores_df["id"].astype(str) == str(player_id), "nombre"]
            e["player"] = str(name.iloc[0]) if len(name) else str(player_id)
        if extra:
            e.update(extra)
        events.append(e)

    # generar goles por cagada (siempre ERROR -> GOAL)
    for _ in range(error_goals_team1):
        culprit = pick(team2, w_err2)
        scorer = pick(team1, w_atk1)
        add_event("ERROR", team=2, player_id=culprit, extra={"note": "cagada -> gol rival"})
        add_event("GOAL", team=1, player_id=scorer, extra={"origin": "error"})

    for _ in range(error_goals_team2):
        culprit = pick(team1, w_err1)
        scorer = pick(team2, w_atk2)
        add_event("ERROR", team=1, player_id=culprit, extra={"note": "cagada -> gol rival"})
        add_event("GOAL", team=2, player_id=scorer, extra={"origin": "error"})

    # goles de jugada (SHOT -> GOAL)
    for _ in range(play1):
        scorer = pick(team1, w_atk1)
        add_event("SHOT", team=1, player_id=scorer)
        add_event("GOAL", team=1, player_id=scorer, extra={"origin": "play"})

    for _ in range(play2):
        scorer = pick(team2, w_atk2)
        add_event("SHOT", team=2, player_id=scorer)
        add_event("GOAL", team=2, player_id=scorer, extra={"origin": "play"})

    events = sorted(events, key=lambda x: x["t"])

    return {
        "team1": team1_names,
        "team2": team2_names,
        "score": [goals1, goals2],
        "breakdown": {
            "play_goals": [play1, play2],
            "cagadas": [cag1, cag2],
            "error_goals_from_cagadas": [error_goals_team1, error_goals_team2],
            "p_goal_from_cagada": p_goal,
            "lambda_play": [lambda1, lambda2],
            "eta_cagadas": [eta1, eta2],
        },
        "events": events,
    }


# -------------------------
# CLI
# -------------------------

def cmd_train(args: argparse.Namespace) -> None:
    url = os.environ.get("SUPABASE_URL") or args.supabase_url
    key = os.environ.get("SUPABASE_ANON_KEY") or args.supabase_anon_key
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL y SUPABASE_ANON_KEY (env o args).")

    sb = SupabaseREST(url, key)

    filtros_partidos = {}
    if args.season_id is not None:
        filtros_partidos["temporada_id"] = args.season_id

    print("📥 Bajando data de Supabase…")
    partidos = pd.DataFrame(sb.fetch_all("partidos", select="id,fecha,cancha,resultado,equipo_ganador,temporada_id", order="fecha.desc", filters=filtros_partidos))
    jp = pd.DataFrame(sb.fetch_all("jugador_partido", select="partido_id,jugador_id,equipo,atajadas,cagadas", filters={}))
    goles = pd.DataFrame(sb.fetch_all("goles", select="partido_id,goleador_id,asistidor_id,equipo,es_gol_en_contra", filters={}))
    jugadores = pd.DataFrame(sb.fetch_all("jugadores", select="id,nombre", order="nombre.asc", filters={}))

    if partidos.empty:
        raise SystemExit("No hay partidos para entrenar (revisá season_id o RLS).")

    dataset = build_dataset(partidos, jp, goles)

    # jugadores que aparecen en dataset
    ids = sorted({pid for m in dataset for pid in (m.team1_ids + m.team2_ids)})
    print(f"✅ Partidos usados: {len(dataset)} | Jugadores en dataset: {len(ids)}")

    model = train_model(dataset, ids, epochs=args.epochs, lr=args.lr, l2=args.l2, seed=args.seed)
    model_json = model.export_json()
    model_json["meta"] = {"season_id": args.season_id, "matches": len(dataset), "players": len(ids)}

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(model_json, f, ensure_ascii=False, indent=2)

    print(f"💾 Guardado: {args.out}")


def cmd_sim(args: argparse.Namespace) -> None:
    with open(args.model, "r", encoding="utf-8") as f:
        model_json = json.load(f)

    url = os.environ.get("SUPABASE_URL") or args.supabase_url
    key = os.environ.get("SUPABASE_ANON_KEY") or args.supabase_anon_key
    if not url or not key:
        raise SystemExit("Para simular por nombre necesito SUPABASE_URL y SUPABASE_ANON_KEY (para leer tabla jugadores).")

    sb = SupabaseREST(url, key)
    jugadores = pd.DataFrame(sb.fetch_all("jugadores", select="id,nombre", order="nombre.asc"))

    team1 = [x.strip() for x in args.team1.split(",") if x.strip()]
    team2 = [x.strip() for x in args.team2.split(",") if x.strip()]
    if not team1 or not team2:
        raise SystemExit("Pasá equipos por nombre: --team1 'A,B,C,D,E' --team2 'F,G,H,I,J'")

    n = int(getattr(args, "n", 1) or 1)
    n = max(1, n)

    # 1 simulación: igual que antes
    if n == 1:
        sim = simulate_match(model_json, jugadores, team1, team2, seed=args.seed)

        print(f"\n🏁 Resultado simulado: {sim['score'][0]} - {sim['score'][1]}")
        print("📌 Desglose:", sim["breakdown"])
        print("\n🎬 Eventos (primeros 25):")
        for e in sim["events"][:25]:
            who = f" ({e.get('player')})" if e.get("player") else ""
            extra = ""
            if e.get("origin"):
                extra = f" [{e['origin']}]"
            if e.get("note"):
                extra = f" - {e['note']}"
            print(f"  t={e['t']:>6}  {e['type']:<5}  T{e['team']}{who}{extra}")

        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(sim, f, ensure_ascii=False, indent=2)
            print(f"\n💾 Timeline guardada en {args.out}")
        return

    # n simulaciones: estadísticas
    import numpy as np
    from collections import Counter

    scores = np.zeros((n, 2), dtype=int)
    win1 = win2 = draw = 0

    base_seed = int(args.seed)

    for i in range(n):
        sim = simulate_match(model_json, jugadores, team1, team2, seed=base_seed + i)
        g1, g2 = sim["score"]
        scores[i, 0] = g1
        scores[i, 1] = g2

        if g1 > g2:
            win1 += 1
        elif g2 > g1:
            win2 += 1
        else:
            draw += 1

    g1 = scores[:, 0]
    g2 = scores[:, 1]
    diff = g1 - g2
    total = g1 + g2

    def pct(x: float) -> str:
        return f"{100.0 * x:.1f}%"

    top = Counter([(int(a), int(b)) for a, b in scores.tolist()]).most_common(10)

    summary = {
        "n": n,
        "team1": team1,
        "team2": team2,
        "win_prob": {"team1": win1 / n, "team2": win2 / n, "draw": draw / n},
        "goals": {
            "team1": {"mean": float(g1.mean()), "std": float(g1.std(ddof=0)), "p10": float(np.percentile(g1, 10)), "p50": float(np.percentile(g1, 50)), "p90": float(np.percentile(g1, 90))},
            "team2": {"mean": float(g2.mean()), "std": float(g2.std(ddof=0)), "p10": float(np.percentile(g2, 10)), "p50": float(np.percentile(g2, 50)), "p90": float(np.percentile(g2, 90))},
            "total": {"mean": float(total.mean()), "std": float(total.std(ddof=0))},
        },
        "goal_diff": {"mean": float(diff.mean()), "std": float(diff.std(ddof=0))},
        "most_common_scores": [{"score": [a, b], "count": c, "freq": c / n} for (a, b), c in top],
    }

    print(f"\n📊 {n} simulaciones")
    print(f"✅ P(win) Equipo 1: {pct(summary['win_prob']['team1'])} | Empate: {pct(summary['win_prob']['draw'])} | P(win) Equipo 2: {pct(summary['win_prob']['team2'])}")
    print(f"⚽ Goles Equipo 1: media {summary['goals']['team1']['mean']:.2f} (σ {summary['goals']['team1']['std']:.2f}) | p10 {summary['goals']['team1']['p10']:.1f} p50 {summary['goals']['team1']['p50']:.1f} p90 {summary['goals']['team1']['p90']:.1f}")
    print(f"⚽ Goles Equipo 2: media {summary['goals']['team2']['mean']:.2f} (σ {summary['goals']['team2']['std']:.2f}) | p10 {summary['goals']['team2']['p10']:.1f} p50 {summary['goals']['team2']['p50']:.1f} p90 {summary['goals']['team2']['p90']:.1f}")
    print(f"⚽ Total goles: media {summary['goals']['total']['mean']:.2f} (σ {summary['goals']['total']['std']:.2f})")
    print(f"➖ Diferencia (E1-E2): media {summary['goal_diff']['mean']:.2f} (σ {summary['goal_diff']['std']:.2f})")

    print("\n🏷️ Marcadores más comunes:")
    for item in summary["most_common_scores"]:
        a, b = item["score"]
        print(f"  {a}-{b}: {item['count']} ({pct(item['freq'])})")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"\n💾 Resumen guardado en {args.out}")



def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap.add_argument("--supabase_url", default=None)
    ap.add_argument("--supabase_anon_key", default=None)

    ap_train = sub.add_parser("train")
    ap_train.add_argument("--season_id", type=str, default=None)
    ap_train.add_argument("--epochs", type=int, default=2500)
    ap_train.add_argument("--lr", type=float, default=0.03)
    ap_train.add_argument("--l2", type=float, default=1e-3)
    ap_train.add_argument("--seed", type=int, default=7)
    ap_train.add_argument("--out", type=str, default="model_params.json")
    ap_train.set_defaults(fn=cmd_train)

    ap_sim = sub.add_parser("sim")
    ap_sim.add_argument("--model", type=str, required=True)
    ap_sim.add_argument("--team1", type=str, required=True)
    ap_sim.add_argument("--team2", type=str, required=True)
    ap_sim.add_argument("--seed", type=int, default=123)
    ap_sim.add_argument("--n", type=int, default=1)
    ap_sim.add_argument("--out", type=str, default=None)
    ap_sim.set_defaults(fn=cmd_sim)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
