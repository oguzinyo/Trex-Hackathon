"""
CNC Anomaly Intelligence — Merkezi Konfigürasyon
"""
import os

# ── Paths ─────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "trex.duckdb")
DATA_DIR = os.path.join(BASE_DIR, "data", "uludag_hackathon_dataset")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# ── Server ────────────────────────────────────
HOST = "0.0.0.0"
PORT = 8001

# ── LLM ───────────────────────────────────────
LLM_MODEL = "qwen2.5:14b"
LLM_TEMPERATURE = 0

# ── Analysis ──────────────────────────────────
CONTAMINATION_RATE = 0.05        # Isolation Forest
SPIKE_THRESHOLD_MULTIPLIER = 10  # Counter spike IQR
MASS_SHUTDOWN_MIN_MACHINES = 3
MASS_SHUTDOWN_TIME_WINDOW = 1    # saat

# ── Financial Assumptions ─────────────────────
FINANCIAL = {
    "contribution_margin_per_piece": 12.0,   # ₺/parça
    "machine_hour_cost": 45.0,               # ₺/saat
    "downtime_cost_per_hour": 80.0,          # ₺/saat
    "intervention_cost": 300.0,              # ₺ (tek seferlik)
}

# ── Machine List ──────────────────────────────
MACHINES = [
    "Makine 1", "Makine 2", "Makine 3", "Makine 4",
    "Makine 5", "Makine 6", "Makine 7", "Makine 8",
    "Makine 9", "Makine 10", "Makine 11", "TurboCut",
]
