"""
Financial Impact Agent — teknik What-If sonucunu varsayımsal iş etkisine çevirir.
"""
from config.settings import FINANCIAL
from src.analysis.whatif_engine import calculate_financial_impact


def run(whatif_result, machine=None):
    total_delta = float(whatif_result.get("total_oee_improvement", 0) or 0)
    if total_delta <= 0:
        return {
            "agent": "Financial",
            "status": "no_positive_impact",
            "assumption_based": True,
            "assumptions": FINANCIAL,
            "impact": None,
        }

    try:
        impact = calculate_financial_impact(total_delta, machine)
        return {
            "agent": "Financial",
            "status": "success",
            "assumption_based": True,
            "assumptions": FINANCIAL,
            "impact": impact,
            "note": "Finansal değerler veri setinde bulunmayan varsayımlar üzerinden hesaplanmıştır.",
        }
    except Exception as e:
        return {
            "agent": "Financial",
            "status": "error",
            "assumption_based": True,
            "assumptions": FINANCIAL,
            "impact": None,
            "errors": [str(e)],
        }
