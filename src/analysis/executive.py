"""
Executive Summary — Jüri/yönetim sunumu için tek bakışta özet.
Tüm bulguları aksiyon önceliği + finansal etkiyle sıralar.
"""
from src.core.database import query
from src.core.cache import cached
from src.analysis.rca_engine import get_all_problems
from src.analysis.whatif_engine import simulate_corrected_oee, calculate_financial_impact
from config.settings import MACHINES


@cached(ttl=600)
def get_executive_summary():
    """Üst düzey özet — fabrika sağlığı, top aksiyonlar, toplam ROI"""

    # 1. Fabrika geneli metrikler
    fabric_metrics = query("""
        SELECT
            COUNT(DISTINCT u.uid) AS total_machines,
            COUNT(DISTINCT o.trans_date::date) AS days_analyzed,
            ROUND(AVG(CASE WHEN o.oee BETWEEN 0 AND 1 THEN o.oee END), 4) AS avg_oee,
            ROUND(SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS BIGINT)), 0) AS total_pieces,
            ROUND(SUM(CAST(json_extract_string(o.availability, '$.UnPlannedStop') AS BIGINT)) / 3600000.0, 0) AS unplanned_hours,
            ROUND(SUM(CAST(json_extract_string(o.availability, '$.PlannedStop') AS BIGINT)) / 3600000.0, 0) AS planned_hours
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1
    """)
    fm = fabric_metrics.iloc[0].to_dict() if len(fabric_metrics) > 0 else {}

    # 2. Top 3 kritik problem (severity + impact)
    all_problems = get_all_problems()
    valid_problems = [p for p in all_problems if "error" not in p]
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    valid_problems.sort(key=lambda p: sev_rank.get(p.get("severity", "low"), 9))
    top_problems = [{
        "id": p.get("id"),
        "title": p.get("title"),
        "machine": p.get("machine"),
        "severity": p.get("severity"),
        "evidence": p.get("evidence"),
        "solution": p.get("solution"),
    } for p in valid_problems[:5]]

    # 3. Corrected OEE — fabrika geneli potansiyel
    machines_data = []
    total_improvement = 0
    machines_to_analyze = ["Makine 1", "Makine 2", "Makine 3", "Makine 5", "Makine 7", "Makine 9"]
    for m in machines_to_analyze:
        try:
            r = simulate_corrected_oee(m)
            if "error" not in r:
                machines_data.append({
                    "machine": m,
                    "current_oee": r["avg_current_oee"],
                    "corrected_oee": r["avg_corrected_oee"],
                    "improvement_pp": r["avg_improvement"],
                })
                total_improvement += r["avg_improvement"]
        except Exception:
            pass

    avg_improvement = total_improvement / len(machines_data) if machines_data else 0

    # 4. Toplam finansal etki (kabaca)
    financial = calculate_financial_impact(avg_improvement) if avg_improvement > 0 else None
    annual_benefit = financial["net_benefit_per_day"] * 365 * len(machines_data) if financial else 0

    # 5. Top aksiyonlar — finansal sıralama
    actions = [
        {
            "priority": 1,
            "title": "Cycle Time Düzeltmesi",
            "scope": "Tüm fabrika — ERP/MES konfigürasyonu",
            "impact": "P değeri 0'dan ~%60'a — tek başına en büyük etki",
            "effort": "Düşük (konfigürasyon)",
            "estimated_oee_gain": "+25-40 pp",
            "estimated_annual_benefit_try": int(annual_benefit * 0.6) if annual_benefit else 0,
        },
        {
            "priority": 2,
            "title": "Tatil/Uzun Duruş Sınıflandırma",
            "scope": "Makine 7, 9, TurboCut + tüm fabrika",
            "impact": "Availability hesaplaması doğru hale gelir",
            "effort": "Düşük (vardiya takvimi)",
            "estimated_oee_gain": "+15-20 pp",
            "estimated_annual_benefit_try": int(annual_benefit * 0.25) if annual_benefit else 0,
        },
        {
            "priority": 3,
            "title": "Makine 1 — Hava Basıncı Düzeltmesi",
            "scope": "PLC interlock + kompresör startup",
            "impact": "248 alarm/yıl ortadan kalkar",
            "effort": "Orta (pnömatik + PLC programlama)",
            "estimated_oee_gain": "+5-8 pp (Makine 1)",
            "estimated_annual_benefit_try": int(annual_benefit * 0.05) if annual_benefit else 0,
        },
        {
            "priority": 4,
            "title": "Mass Shutdown Root-Cause",
            "scope": "Elektrik altyapı + UPS",
            "impact": "Yılda 4 kez 11 makine birden durmuyor",
            "effort": "Yüksek (altyapı yatırımı)",
            "estimated_oee_gain": "+3-5 pp (fabrika geneli)",
            "estimated_annual_benefit_try": int(annual_benefit * 0.07) if annual_benefit else 0,
        },
        {
            "priority": 5,
            "title": "Mitsubishi (Makine 7-8) Predictive Maintenance",
            "scope": "Cycle time anomali takibi",
            "impact": "Erken arıza tespiti — plansız duruşları azaltır",
            "effort": "Orta (model kurulumu)",
            "estimated_oee_gain": "+2-4 pp",
            "estimated_annual_benefit_try": int(annual_benefit * 0.03) if annual_benefit else 0,
        },
    ]

    return {
        "fabric_overview": {
            "total_machines": int(fm.get("total_machines", 0) or 0),
            "days_analyzed": int(fm.get("days_analyzed", 0) or 0),
            "current_avg_oee": float(fm.get("avg_oee", 0) or 0),
            "total_pieces_produced": int(fm.get("total_pieces", 0) or 0),
            "unplanned_hours": int(fm.get("unplanned_hours", 0) or 0),
            "planned_hours": int(fm.get("planned_hours", 0) or 0),
        },
        "potential": {
            "current_avg_oee": round(sum(m["current_oee"] for m in machines_data) / max(len(machines_data), 1), 4),
            "corrected_avg_oee": round(sum(m["corrected_oee"] for m in machines_data) / max(len(machines_data), 1), 4),
            "improvement_pp": round(avg_improvement, 4),
            "machines": machines_data,
        },
        "top_problems": top_problems,
        "top_actions": actions,
        "financial": {
            "daily_net_benefit_per_machine": financial["net_benefit_per_day"] if financial else 0,
            "annual_benefit_total": int(annual_benefit),
            "payback_days": financial["payback_days"] if financial else 0,
            "machines_count": len(machines_data),
        },
        "kpi_critical": {
            "problems_detected": len(valid_problems),
            "critical_problems": sum(1 for p in valid_problems if p.get("severity") == "critical"),
            "high_problems": sum(1 for p in valid_problems if p.get("severity") == "high"),
            "data_quality_issues": sum(1 for m in machines_data if m["current_oee"] < 0.5),
        }
    }


@cached(ttl=600)
def get_alarm_timeline(days_limit: int = 60):
    """Tüm fabrika alarm timeline — kronolojik + makine bazlı"""

    alarms = query(f"""
        SELECT nu.name AS machine,
               ns.time::date AS day,
               TRIM(ns.value) AS alarm,
               COUNT(*) AS count
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.time > (SELECT MAX(time) - INTERVAL '{days_limit} days' FROM nightwatch_data_string)
        GROUP BY nu.name, day, TRIM(ns.value)
        ORDER BY day DESC, count DESC
    """)

    # Daily aggregated counts
    daily = query(f"""
        SELECT ns.time::date AS day,
               nu.name AS machine,
               COUNT(*) AS alarms
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.time > (SELECT MAX(time) - INTERVAL '{days_limit} days' FROM nightwatch_data_string)
        GROUP BY day, nu.name
        ORDER BY day
    """)

    # Hot days — fabrika genelinde en yoğun alarm günleri
    hot_days = query(f"""
        SELECT ns.time::date AS day,
               COUNT(DISTINCT nu.name) AS machines_affected,
               COUNT(*) AS total_alarms
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.time > (SELECT MAX(time) - INTERVAL '{days_limit} days' FROM nightwatch_data_string)
        GROUP BY day
        ORDER BY total_alarms DESC
        LIMIT 10
    """)

    return {
        "days_window": days_limit,
        "total_alarm_types": len(set(a for a in alarms["alarm"].tolist())) if len(alarms) > 0 else 0,
        "total_alarms": int(alarms["count"].sum()) if len(alarms) > 0 else 0,
        "daily_by_machine": daily.to_dict(orient="records"),
        "hot_days": hot_days.to_dict(orient="records"),
        "top_alarms_recent": alarms.head(20).to_dict(orient="records"),
    }


@cached(ttl=600)
def compare_machines(machines: list = None):
    """Makine karşılaştırma — yan yana metrikler"""
    if not machines:
        machines = ["Makine 1", "Makine 2", "Makine 5", "Makine 7", "Makine 9"]

    placeholders = ",".join(f"'{m}'" for m in machines)
    result = query(f"""
        SELECT u.name AS machine,
               d.collector_type_name AS controller,
               COUNT(*) AS days,
               ROUND(AVG(CASE WHEN o.oee BETWEEN 0 AND 1 THEN o.oee END), 4) AS avg_oee,
               ROUND(AVG(CAST(json_extract_string(o.availability, '$.A') AS DOUBLE)), 4) AS avg_A,
               ROUND(AVG(CAST(json_extract_string(o.performance, '$.P') AS DOUBLE)), 4) AS avg_P,
               SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) AS pieces,
               ROUND(SUM(CAST(json_extract_string(o.availability, '$.UnPlannedStop') AS BIGINT)) / 3600000.0, 0) AS unplanned_h,
               ROUND(SUM(CAST(json_extract_string(o.availability, '$.PlannedStop') AS BIGINT)) / 3600000.0, 0) AS planned_h
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        JOIN mes_device d ON d.uid = u.device_uid
        WHERE o.level = 1 AND u.name IN ({placeholders})
        GROUP BY u.name, d.collector_type_name
        ORDER BY avg_oee DESC NULLS LAST
    """)

    # Alarm sayıları
    alarm_counts = query(f"""
        SELECT nu.name AS machine, COUNT(*) AS alarms
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nrd.readingdef_name = 'ALM_ARR_MSG'
          AND nu.name IN ({placeholders})
        GROUP BY nu.name
    """)
    alarm_map = dict(zip(alarm_counts["machine"], alarm_counts["alarms"])) if len(alarm_counts) > 0 else {}

    records = result.to_dict(orient="records")
    for r in records:
        r["alarms"] = int(alarm_map.get(r["machine"], 0))

    return {
        "machines": records,
        "count": len(records),
    }


@cached(ttl=600)
def get_priority_actions():
    """En yüksek ROI'li 5 aksiyon — sıralanmış"""
    summary = get_executive_summary()
    return summary["top_actions"]
