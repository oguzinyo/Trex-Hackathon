"""
Prioritizer Agent — RCA bulgularını etki, güven ve uygulanabilirlik ile sıralar.
"""

_SEVERITY = {"critical": 1.0, "high": 0.75, "medium": 0.45, "low": 0.2}
_EFFORT = {
    1: 0.65,   # PLC/pnömatik
    2: 0.75,   # operasyonel/mekanik kontrol
    3: 0.35,   # altyapı yatırımı
    4: 0.9,    # MES konfigürasyonu
    5: 0.8,
    6: 0.95,   # cycle time konfigürasyonu
    7: 0.95,   # vardiya takvimi
    8: 0.7,
    9: 0.55,
    10: 0.65,
    11: 0.85,
    12: 0.7,
    13: 0.6,   # alarm öncelik matrisi + KÖR analizi
    14: 0.75,  # mikro-duruş dashboard'u
    15: 0.4,   # otomasyon yatırımı (robot/pallet)
    16: 0.85,  # KPI hedefi ve toplantı disiplini
    17: 0.9,   # sinyal aktivasyonu (sadece config)
}


def run(rca_result, whatif_result=None, financial_result=None):
    actions = []
    for p in rca_result.get("problems", [])[:8]:
        if p.get("error"):
            continue
        pid = p.get("id")
        confidence = float(p.get("confidence", 0.55) or 0.55)
        severity = _SEVERITY.get(p.get("severity"), 0.2)
        impact = float(p.get("impact_score", severity) or severity)
        feasibility = _EFFORT.get(pid, 0.6)
        score = round(100 * severity * confidence * impact * feasibility, 1)
        actions.append({
            "problem_id": pid,
            "title": p.get("title"),
            "machine": p.get("machine"),
            "score": score,
            "confidence": round(confidence, 2),
            "impact_area": p.get("impact_area"),
            "recommended_action": p.get("solution"),
            "recommended_whatif_scenarios": p.get("recommended_whatif_scenarios", []),
        })

    actions.sort(key=lambda x: x["score"], reverse=True)
    return {
        "agent": "Prioritizer",
        "status": "success",
        "top_actions": actions[:5],
        "selected_scenarios": whatif_result.get("selected_scenarios", []) if whatif_result else [],
        "financial_summary": financial_result.get("impact") if financial_result else None,
    }
