"""
Football simulator (MVP) — trains a model from your Supabase history and simulates matches.

Expected tables:
- partidos: id, fecha, cancha, resultado, equipo_ganador, temporada_id, youtube_link
- jugador_partido: partido_id, jugador_id, equipo, atajadas, cagadas, ...
- goles: partido_id, goleador_id, asistidor_id, equipo, es_gol_en_contra, minuto
- jugadores: id, nombre

Run (local):
  pip install pandas numpy requests torch

Config:
  export SUPABASE_URL="https://xxxx.supabase.co"
  export SUPABASE_ANON_KEY="eyJ..."

Train:
  python futbol_sim_mvp.py train --season_id "<UUID or int-like>" --out model_params.json

Simulate:
  python futbol_sim_mvp.py sim --model model_params.json \
    --team1 "Cogorno,Kite,Berni,Renzo,Darmian" \
    --team2 "Fachita,Boska,Mexa,Colidio,Ggasti" \
    --out sim.json

Notes:
- The model learns team totals (goals, mistakes, saves).
- Goal scorers in simulation are assigned using HISTORICAL scorer distribution
  (by joining goles + jugador_partido), so you don't get absurd scorers.
"""

from __future__ import annotations

import os
import json
import argparse
from dataclasses import dataclass
from typing import Dict, Any, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests

try:
    import torch
    import torch.nn.functional as F
except Exception:  # pragma: no cover
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
        Download all rows using limit/offset pagination.
        Filters are simple eq.<value>.
        """
        filters = filters or {}
        out: List[Dict[str, Any]] = []
        offset = 0

        while True:
            params = {"select": select, "limit": page_size, "offset": offset}
            if order:
                params["order"] = order
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
    Build per-match rows:
      - teams (lists of jugador_id)
      - team goals (from goles.equipo; in this schema it's the team that RECEIVES the goal)
      - team mistakes = sum(jugador_partido.cagadas)
      - team saves    = sum(jugador_partido.atajadas)
    """
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
        # In this app: goles.equipo = team that RECEIVES the goal.
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


def build_goal_counts_by_team(
    partidos: pd.DataFrame,
    jp: pd.DataFrame,
    goles: pd.DataFrame,
) -> Dict[int, Dict[str, int]]:
    """
    Build scorer counts by team side (1/2) using:
      goles(partido_id, goleador_id, es_gol_en_contra) JOIN jugador_partido(partido_id, jugador_id)->equipo

    We exclude own-goals (es_gol_en_contra=True) from scorer distribution to avoid weird assignments.
    """
    if partidos.empty or jp.empty or goles.empty:
        return {1: {}, 2: {}}

    # Restrict to selected matches
    pids = set(partidos["id"].astype(str).tolist())

    jp2 = jp.copy()
    jp2["partido_id"] = jp2["partido_id"].astype(str)
    jp2["jugador_id"] = jp2["jugador_id"].astype(str)
    jp2["equipo"] = jp2["equipo"].apply(_safe_int)
    jp2 = jp2[jp2["partido_id"].isin(pids)]

    g2 = goles.copy()
    g2["partido_id"] = g2["partido_id"].astype(str)
    g2["goleador_id"] = g2["goleador_id"].astype(str)
    if "es_gol_en_contra" in g2.columns:
        g2 = g2[g2["es_gol_en_contra"].fillna(False) == False]
    g2 = g2[g2["partido_id"].isin(pids)]

    if g2.empty or jp2.empty:
        return {1: {}, 2: {}}

    merged = g2.merge(
        jp2[["partido_id", "jugador_id", "equipo"]],
        left_on=["partido_id", "goleador_id"],
        right_on=["partido_id", "jugador_id"],
        how="left",
    )

    merged = merged.dropna(subset=["equipo"])
    if merged.empty:
        return {1: {}, 2: {}}

    counts: Dict[int, Dict[str, int]] = {1: {}, 2: {}}
    for team_no in [1, 2]:
        sub = merged[merged["equipo"].astype(int) == team_no]
        vc = sub["goleador_id"].astype(str).value_counts()
        counts[team_no] = vc.to_dict()

    return counts


# -------------------------
# Model (PyTorch)
# -------------------------

def _pair_synergy(u_team: torch.Tensor) -> torch.Tensor:
    s = u_team.sum(dim=0)
    return 0.5 * ((s * s).sum() - (u_team * u_team).sum())


def _triple_synergy(u_team: torch.Tensor) -> torch.Tensor:
    x = u_team
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

        # Per-player skills
        self.atk = torch.nn.Parameter(torch.zeros(n))
        self.defn = torch.nn.Parameter(torch.zeros(n))
        self.err = torch.nn.Parameter(torch.zeros(n))

        # In-team synergy embeddings
        self.u = torch.nn.Parameter(0.01 * torch.randn(n, d_synergy))

        # Matchup embeddings
        self.p_off = torch.nn.Parameter(0.01 * torch.randn(n, d_match))
        self.q_def = torch.nn.Parameter(0.01 * torch.randn(n, d_match))

        # Global biases/weights
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

        # p(goal | mistake) in logit space
        self.logit_p_goal_from_cagada = torch.nn.Parameter(torch.tensor(2.5))  # ~0.924 initially

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

        # Play goals
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

        # Mistakes
        log_etaA = self.b_err + self.w_err_skill * fa["err"] + self.w_pressure * fb["atk"]
        log_etaB = self.b_err + self.w_err_skill * fb["err"] + self.w_pressure * fa["atk"]

        # Saves (optional flavor)
        log_kappaA = self.b_save + self.w_save_def * fa["def"] + self.w_save_pressure * fb["atk"]
        log_kappaB = self.b_save + self.w_save_def * fb["def"] + self.w_save_pressure * fa["atk"]

        lambdaA = F.softplus(log_lambdaA) + 1e-6
        lambdaB = F.softplus(log_lambdaB) + 1e-6
        etaA = F.softplus(log_etaA) + 1e-6
        etaB = F.softplus(log_etaB) + 1e-6
        kappaA = F.softplus(log_kappaA) + 1e-6
        kappaB = F.softplus(log_kappaB) + 1e-6

        p_goal = torch.sigmoid(self.logit_p_goal_from_cagada)

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

def train_model(
    dataset: List[MatchRow],
    player_ids: List[str],
    epochs: int = 2500,
    lr: float = 0.03,
    l2: float = 1e-3,
    seed: int = 7
) -> FootballModel:
    if torch is None:
        raise RuntimeError("torch not available. Install with: pip install torch")

    torch.manual_seed(seed)
    np.random.seed(seed)

    model = FootballModel(player_ids=player_ids, d_synergy=8, d_match=8)
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    for ep in range(1, epochs + 1):
        opt.zero_grad(set_to_none=True)

        loss = torch.tensor(0.0)
        for m in dataset:
            loss = loss + model.loss_for_match(m)

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
# Simulation
# -------------------------

def softmax_weights(x: np.ndarray, temp: float = 1.0) -> np.ndarray:
    x = x / max(1e-6, temp)
    x = x - x.max()
    e = np.exp(x)
    return e / e.sum()


def simulate_match(
    model_json: Dict[str, Any],
    jugadores_df: pd.DataFrame,
    team1_names: List[str],
    team2_names: List[str],
    scorer_counts_by_team: Optional[Dict[int, Dict[str, int]]] = None,
    seed: int = 123
) -> Dict[str, Any]:
    rng = np.random.default_rng(seed)

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

    cag1 = int(rng.poisson(eta1))
    cag2 = int(rng.poisson(eta2))

    error_goals_team2 = int(rng.binomial(cag1, p_goal))
    error_goals_team1 = int(rng.binomial(cag2, p_goal))

    play1 = int(rng.poisson(lambda1))
    play2 = int(rng.poisson(lambda2))

    goals1 = play1 + error_goals_team1
    goals2 = play2 + error_goals_team2

    # -------------------------
    # Pickers / weights
    # -------------------------

    def pick(ids: List[str], weights: np.ndarray) -> str:
        w = weights / max(1e-9, weights.sum())
        idx = rng.choice(len(ids), p=w)
        return ids[idx]

    # Error culprit weights: prefer higher err (but keep stable if all equal)
    w_err1 = softmax_weights(t1["err"], temp=1.0) if float(t1["err"].var()) > 1e-9 else np.ones(len(team1)) / len(team1)
    w_err2 = softmax_weights(t2["err"], temp=1.0) if float(t2["err"].var()) > 1e-9 else np.ones(len(team2)) / len(team2)

    # Scorer weights: use historical scorer distribution per team side (1/2). Fallback to atk.
    scorer_counts_by_team = scorer_counts_by_team or {1: {}, 2: {}}
    alpha = 0.5  # smoothing to avoid zeros

    def scorer_weights(team_ids: List[str], team_no: int, fallback_atk: np.ndarray) -> np.ndarray:
        counts = scorer_counts_by_team.get(team_no, {}) or {}
        if counts:
            w = np.array([counts.get(pid, 0) + alpha for pid in team_ids], dtype=float)
            if float(w.sum()) > 0:
                return w / w.sum()
        # fallback: attack-based softmax
        w2 = softmax_weights(fallback_atk, temp=1.0) if float(fallback_atk.var()) > 1e-9 else np.ones(len(team_ids)) / len(team_ids)
        return w2

    w_goal1 = scorer_weights(team1, 1, t1["atk"])
    w_goal2 = scorer_weights(team2, 2, t2["atk"])

    # -------------------------
    # Timeline + scorer counts
    # -------------------------

    events: List[Dict[str, Any]] = []
    clock = 0.0
    goals_by_player = {1: {}, 2: {}}

    def id_to_name(pid: str) -> str:
        row = jugadores_df.loc[jugadores_df["id"].astype(str) == str(pid), "nombre"]
        return str(row.iloc[0]) if len(row) else str(pid)

    def bump_goal(team_no: int, player_id: str):
        nm = id_to_name(player_id)
        goals_by_player[team_no][nm] = goals_by_player[team_no].get(nm, 0) + 1

    def add_event(kind: str, team: int, player_id: Optional[str] = None, extra: Optional[Dict[str, Any]] = None):
        nonlocal clock
        clock += float(rng.uniform(0.6, 2.3))
        e = {"t": round(clock, 2), "type": kind, "team": team}
        if player_id is not None:
            e["player"] = id_to_name(player_id)
        if extra:
            e.update(extra)
        events.append(e)

    # Goals from mistakes (ERROR -> GOAL)
    for _ in range(error_goals_team1):
        culprit = pick(team2, w_err2)
        scorer = pick(team1, w_goal1)
        add_event("ERROR", team=2, player_id=culprit, extra={"note": "mistake -> opponent goal"})
        add_event("GOAL", team=1, player_id=scorer, extra={"origin": "error"})
        bump_goal(1, scorer)

    for _ in range(error_goals_team2):
        culprit = pick(team1, w_err1)
        scorer = pick(team2, w_goal2)
        add_event("ERROR", team=1, player_id=culprit, extra={"note": "mistake -> opponent goal"})
        add_event("GOAL", team=2, player_id=scorer, extra={"origin": "error"})
        bump_goal(2, scorer)

    # Play goals (SHOT -> GOAL)
    for _ in range(play1):
        scorer = pick(team1, w_goal1)
        add_event("SHOT", team=1, player_id=scorer)
        add_event("GOAL", team=1, player_id=scorer, extra={"origin": "play"})
        bump_goal(1, scorer)

    for _ in range(play2):
        scorer = pick(team2, w_goal2)
        add_event("SHOT", team=2, player_id=scorer)
        add_event("GOAL", team=2, player_id=scorer, extra={"origin": "play"})
        bump_goal(2, scorer)

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
        "goals_by_player": {
            "team1": goals_by_player[1],
            "team2": goals_by_player[2],
        },
        "events": events,
    }


# -------------------------
# CLI commands
# -------------------------

def cmd_train(args: argparse.Namespace) -> None:
    url = os.environ.get("SUPABASE_URL") or args.supabase_url
    key = os.environ.get("SUPABASE_ANON_KEY") or args.supabase_anon_key
    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL and SUPABASE_ANON_KEY (env or args).")

    sb = SupabaseREST(url, key)

    filtros_partidos = {}
    if args.season_id is not None:
        filtros_partidos["temporada_id"] = args.season_id

    print("📥 Downloading data from Supabase…")
    partidos = pd.DataFrame(sb.fetch_all(
        "partidos",
        select="id,fecha,cancha,resultado,equipo_ganador,temporada_id",
        order="fecha.desc",
        filters=filtros_partidos
    ))
    jp = pd.DataFrame(sb.fetch_all("jugador_partido", select="partido_id,jugador_id,equipo,atajadas,cagadas"))
    goles = pd.DataFrame(sb.fetch_all("goles", select="partido_id,goleador_id,asistidor_id,equipo,es_gol_en_contra"))
    jugadores = pd.DataFrame(sb.fetch_all("jugadores", select="id,nombre", order="nombre.asc"))

    if partidos.empty:
        raise SystemExit("No matches to train (check season_id or RLS).")

    dataset = build_dataset(partidos, jp, goles)

    ids = sorted({pid for m in dataset for pid in (m.team1_ids + m.team2_ids)})
    print(f"✅ Matches used: {len(dataset)} | Players in dataset: {len(ids)}")

    model = train_model(dataset, ids, epochs=args.epochs, lr=args.lr, l2=args.l2, seed=args.seed)
    model_json = model.export_json()
    model_json["meta"] = {"season_id": args.season_id, "matches": len(dataset), "players": len(ids)}

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(model_json, f, ensure_ascii=False, indent=2)

    print(f"💾 Saved: {args.out}")


def cmd_sim(args: argparse.Namespace) -> None:
    with open(args.model, "r", encoding="utf-8") as f:
        model_json = json.load(f)

    url = os.environ.get("SUPABASE_URL") or args.supabase_url
    key = os.environ.get("SUPABASE_ANON_KEY") or args.supabase_anon_key
    if not url or not key:
        raise SystemExit("To simulate by names, set SUPABASE_URL and SUPABASE_ANON_KEY (env or args).")

    sb = SupabaseREST(url, key)
    jugadores = pd.DataFrame(sb.fetch_all("jugadores", select="id,nombre", order="nombre.asc"))

    team1 = [x.strip() for x in args.team1.split(",") if x.strip()]
    team2 = [x.strip() for x in args.team2.split(",") if x.strip()]
    if not team1 or not team2:
        raise SystemExit("Pass teams by name: --team1 'A,B,C,D,E' --team2 'F,G,H,I,J'")

    # Determine which season to use for scorer distribution
    season_id = args.season_id if args.season_id is not None else model_json.get("meta", {}).get("season_id", None)

    scorer_counts = {1: {}, 2: {}}
    try:
        if season_id is not None:
            partidos = pd.DataFrame(sb.fetch_all("partidos", select="id,temporada_id", filters={"temporada_id": season_id}))
        else:
            partidos = pd.DataFrame(sb.fetch_all("partidos", select="id,temporada_id"))

        jp = pd.DataFrame(sb.fetch_all("jugador_partido", select="partido_id,jugador_id,equipo"))
        goles = pd.DataFrame(sb.fetch_all("goles", select="partido_id,goleador_id,es_gol_en_contra"))

        if not partidos.empty and not jp.empty and not goles.empty:
            scorer_counts = build_goal_counts_by_team(partidos, jp, goles)
    except Exception as e:
        # If RLS blocks, we fallback to atk-based scorers automatically
        print(f"⚠️ Could not build scorer distribution from DB (fallback to atk): {e}")

    sim = simulate_match(
        model_json,
        jugadores,
        team1,
        team2,
        scorer_counts_by_team=scorer_counts,
        seed=args.seed
    )

    print(f"\n🏁 Simulated result: {sim['score'][0]} - {sim['score'][1]}")
    print("📌 Breakdown:", sim["breakdown"])

    print("\n⚽ Goals by player:")
    print("  Team1:", sim["goals_by_player"]["team1"])
    print("  Team2:", sim["goals_by_player"]["team2"])

    print("\n🎬 Events (first 25):")
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
        print(f"\n💾 Timeline saved to {args.out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap.add_argument("--supabase_url", default=None)
    ap.add_argument("--supabase_anon_key", default=None)

    ap_train = sub.add_parser("train")
    ap_train.add_argument("--season_id", type=str, default=None)  # UUID/string supported
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
    ap_sim.add_argument("--season_id", type=str, default=None)  # optional override for scorer dist
    ap_sim.add_argument("--seed", type=int, default=123)
    ap_sim.add_argument("--out", type=str, default=None)
    ap_sim.set_defaults(fn=cmd_sim)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
