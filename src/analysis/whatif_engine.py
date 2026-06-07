"""
What-If Engine — OEE Simülasyon Motoru
trexCloud formülleriyle yeniden hesaplama.
"""
import json
from src.core.database import query
from src.core.cache import cached


def _parse_oee_json(row):
    """OEE summary satırından JSON alanlarını parse et"""
    avail = json.loads(row["availability"]) if isinstance(row["availability"], str) else {}
    perf = json.loads(row["performance"]) if isinstance(row["performance"], str) else {}
    qual = json.loads(row["quality"]) if isinstance(row["quality"], str) else {}
    return {
        "work_total": avail.get("WorkTotal", 0),
        "planned_stop": avail.get("PlannedStop", 0),
        "unplanned_stop": avail.get("UnPlannedStop", 0),
        "stop_total": avail.get("StopTotal", 0),
        "A": avail.get("A", 0),
        "working_time": perf.get("WorkingTime", 0),
        "planned_time": perf.get("PlannedTime", 0),
        "P": perf.get("P", 0),
        "product_sum": qual.get("ProductSum", 0),
        "scrape_sum": qual.get("ScrapeSum", 0),
        "Q": qual.get("Q", 1),
        "oee": row["oee"],
    }


def _recalc_oee(work_total, planned_stop, unplanned_stop, working_time, planned_time, product_sum, scrape_sum):
    """OEE formüllerini yeniden hesapla"""
    scheduled = work_total - planned_stop
    run_time = scheduled - unplanned_stop

    A = run_time / scheduled if scheduled > 0 else 0
    A = max(0, min(1, A))

    P = working_time / planned_time if planned_time > 0 else 0
    P = max(0, min(1, P))

    Q = (product_sum - scrape_sum) / product_sum if product_sum > 0 else 1
    Q = max(0, min(1, Q))

    oee = A * P * Q
    return {"A": round(A, 4), "P": round(P, 4), "Q": round(Q, 4), "OEE": round(oee, 4)}


def get_baseline(machine=None, date=None):
    """Mevcut OEE baseline'ı çek"""
    where = ["o.level = 1"]
    if machine:
        where.append(f"u.name = '{machine}'")
    if date:
        where.append(f"o.trans_date::date = '{date}'")

    where.append("o.oee > 0")
    where.append("o.oee < 1")
    where.append("CAST(json_extract_string(o.availability, '$.A') AS DOUBLE) > 0")
    where.append("CAST(json_extract_string(o.availability, '$.A') AS DOUBLE) < 1")
    where_str = " AND ".join(where)

    rows = query(f"""
        SELECT u.name AS machine,
               o.trans_date::date AS day,
               o.oee,
               o.availability,
               o.performance,
               o.quality
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE {where_str}
        ORDER BY o.trans_date DESC
        LIMIT 50
    """)

    results = []
    for _, row in rows.iterrows():
        parsed = _parse_oee_json(row)
        parsed["machine"] = row["machine"]
        parsed["day"] = str(row["day"])
        results.append(parsed)
    return results


def simulate_reduce_unplanned(machine, reduction_pct, date=None):
    """Plansız duruşu %X azalt → yeni OEE"""
    baselines = get_baseline(machine, date)
    if not baselines:
        return {"error": "Veri bulunamadı"}

    results = []
    for b in baselines[:10]:
        new_unplanned = b["unplanned_stop"] * (1 - reduction_pct / 100)
        before = _recalc_oee(
            b["work_total"], b["planned_stop"], b["unplanned_stop"],
            b["working_time"], b["planned_time"], b["product_sum"], b["scrape_sum"]
        )
        after = _recalc_oee(
            b["work_total"], b["planned_stop"], new_unplanned,
            b["working_time"], b["planned_time"], b["product_sum"], b["scrape_sum"]
        )
        recovered_hours = (b["unplanned_stop"] - new_unplanned) / 3_600_000
        results.append({
            "machine": b["machine"],
            "day": b["day"],
            "before": before,
            "after": after,
            "delta_oee": round(after["OEE"] - before["OEE"], 4),
            "delta_A": round(after["A"] - before["A"], 4),
            "recovered_hours": round(recovered_hours, 2),
            "scenario": f"Plansız duruşu %{reduction_pct} azalt"
        })
    return results


def simulate_reclassify_to_planned(machine, reclassify_pct=100, date=None):
    """System Offline'ı PLANNED olarak yeniden sınıflandır"""
    baselines = get_baseline(machine, date)
    if not baselines:
        return {"error": "Veri bulunamadı"}

    # System Offline saatlerini çek
    sys_offline = query(f"""
        SELECT ROUND(SUM(ss.duration_milliseconds) / COUNT(DISTINCT ss.started_on::date), 0) AS daily_avg_ms
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE u.name = '{machine}'
          AND ss.reading_def_uid = '00000000-0000-0000-0000-000000000006'
    """)
    daily_offline_ms = float(sys_offline["daily_avg_ms"].iloc[0]) if len(sys_offline) > 0 and sys_offline["daily_avg_ms"].iloc[0] else 0

    results = []
    for b in baselines[:10]:
        move_amount = daily_offline_ms * (reclassify_pct / 100)
        new_unplanned = max(0, b["unplanned_stop"] - move_amount)
        new_planned = b["planned_stop"] + move_amount

        before = _recalc_oee(
            b["work_total"], b["planned_stop"], b["unplanned_stop"],
            b["working_time"], b["planned_time"], b["product_sum"], b["scrape_sum"]
        )
        after = _recalc_oee(
            b["work_total"], new_planned, new_unplanned,
            b["working_time"], b["planned_time"], b["product_sum"], b["scrape_sum"]
        )
        results.append({
            "machine": b["machine"],
            "day": b["day"],
            "before": before,
            "after": after,
            "delta_A": round(after["A"] - before["A"], 4),
            "delta_oee": round(after["OEE"] - before["OEE"], 4),
            "scenario": f"System Offline'ı %{reclassify_pct} PLANNED yap"
        })
    return results


def simulate_fix_cycle_time(machine, date=None):
    """Gerçek cycle time ile P yeniden hesapla"""
    baselines = get_baseline(machine, date)
    if not baselines:
        return {"error": "Veri bulunamadı"}

    results = []
    for b in baselines[:10]:
        if b["product_sum"] > 0 and b["A"] > 0:
            # Gerçek çalışma süresi
            scheduled = b["work_total"] - b["planned_stop"]
            run_time = scheduled - b["unplanned_stop"]
            # Gerçek cycle time = çalışma süresi / parça
            real_planned_time = run_time  # en iyi senaryo: tüm çalışma süresi üretken
            before = _recalc_oee(
                b["work_total"], b["planned_stop"], b["unplanned_stop"],
                b["working_time"], b["planned_time"], b["product_sum"], b["scrape_sum"]
            )
            after = _recalc_oee(
                b["work_total"], b["planned_stop"], b["unplanned_stop"],
                b["working_time"], real_planned_time, b["product_sum"], b["scrape_sum"]
            )
            results.append({
                "machine": b["machine"],
                "day": b["day"],
                "before": before,
                "after": after,
                "delta_P": round(after["P"] - before["P"], 4),
                "delta_oee": round(after["OEE"] - before["OEE"], 4),
                "scenario": "Cycle time düzeltmesi (gerçek değerler)"
            })
    return results


def simulate_scrap_rate(machine, scrap_pct, date=None):
    """Sentetik fire oranı simülasyonu (Q etkisi)"""
    baselines = get_baseline(machine, date)
    if not baselines:
        return {"error": "Veri bulunamadı"}

    results = []
    for b in baselines[:10]:
        if b["product_sum"] > 0:
            new_scrape = int(b["product_sum"] * scrap_pct / 100)
            before = _recalc_oee(
                b["work_total"], b["planned_stop"], b["unplanned_stop"],
                b["working_time"], b["planned_time"], b["product_sum"], b["scrape_sum"]
            )
            after = _recalc_oee(
                b["work_total"], b["planned_stop"], b["unplanned_stop"],
                b["working_time"], b["planned_time"], b["product_sum"], new_scrape
            )
            results.append({
                "machine": b["machine"],
                "day": b["day"],
                "before": before,
                "after": after,
                "delta_Q": round(after["Q"] - before["Q"], 4),
                "delta_oee": round(after["OEE"] - before["OEE"], 4),
                "scenario": f"%{scrap_pct} fire oranı simülasyonu"
            })
    return results


def calculate_financial_impact(delta_oee, machine=None, assumptions=None):
    """Finansal etki hesaplama"""
    if assumptions is None:
        assumptions = {
            "contribution_margin_per_piece": 12.0,
            "machine_hour_cost": 45.0,
            "downtime_cost_per_hour": 80.0,
            "intervention_cost": 300.0,
        }

    # Ortalama üretim hızı
    avg_rate = query(f"""
        SELECT ROUND(AVG(
            CAST(json_extract_string(o.quality, '$.ProductSum') AS DOUBLE) /
            NULLIF((CAST(json_extract_string(o.availability, '$.WorkTotal') AS DOUBLE)
                   - CAST(json_extract_string(o.availability, '$.PlannedStop') AS DOUBLE)
                   - CAST(json_extract_string(o.availability, '$.UnPlannedStop') AS DOUBLE))
                   / 3600000.0, 0)
        ), 2) AS pieces_per_hour
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1
          AND CAST(json_extract_string(o.quality, '$.ProductSum') AS INT) > 0
          {"AND u.name = '" + machine + "'" if machine else ""}
    """)

    pph = float(avg_rate["pieces_per_hour"].iloc[0]) if len(avg_rate) > 0 and avg_rate["pieces_per_hour"].iloc[0] else 5.0

    # Günlük baz: 24 saat
    daily_hours = 24
    recovered_hours = delta_oee * daily_hours
    extra_pieces = recovered_hours * pph
    gross_benefit = extra_pieces * assumptions["contribution_margin_per_piece"]
    downtime_saving = recovered_hours * assumptions["downtime_cost_per_hour"]
    net_daily = gross_benefit + downtime_saving - (assumptions["intervention_cost"] / 30)
    payback_days = assumptions["intervention_cost"] / max(net_daily, 0.01)

    return {
        "delta_oee": round(delta_oee, 4),
        "recovered_hours_per_day": round(recovered_hours, 2),
        "extra_pieces_per_day": round(extra_pieces, 1),
        "gross_benefit_per_day": round(gross_benefit, 2),
        "downtime_saving_per_day": round(downtime_saving, 2),
        "net_benefit_per_day": round(net_daily, 2),
        "payback_days": round(payback_days, 1),
        "assumptions": assumptions,
    }


@cached(ttl=600)
def simulate_corrected_oee(machine):
    """
    Tüm düzeltmeler uygulanırsa gerçek OEE tahmini:
    1. Tatil/uzun duruşlar → PLANNED (A düzelir)
    2. Cycle time düzeltmesi (P düzelir)
    3. System Offline → PLANNED (A düzelir)
    """
    baselines = get_baseline(machine)
    if not baselines:
        return {"error": "Veri bulunamadı", "machine": machine}

    # System Offline günlük ortalaması
    sys_offline = query(f"""
        SELECT ROUND(SUM(ss.duration_milliseconds) / COUNT(DISTINCT ss.started_on::date), 0) AS daily_avg_ms
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE u.name = '{machine}'
          AND ss.reading_def_uid = '00000000-0000-0000-0000-000000000006'
    """)
    daily_offline_ms = float(sys_offline["daily_avg_ms"].iloc[0]) if len(sys_offline) > 0 and sys_offline["daily_avg_ms"].iloc[0] else 0

    # Uzun duruşların (>48h) günlük payı
    long_stops = query(f"""
        SELECT ROUND(SUM(ss.duration_milliseconds) / NULLIF(COUNT(DISTINCT ss.started_on::date), 0), 0) AS daily_long_ms
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE u.name = '{machine}'
          AND ss.is_planned = false
          AND ss.duration_milliseconds > 172800000
          AND ss.reading_def_uid != '00000000-0000-0000-0000-000000000006'
    """)
    daily_long_ms = float(long_stops["daily_long_ms"].iloc[0]) if len(long_stops) > 0 and long_stops["daily_long_ms"].iloc[0] else 0

    results = []
    for b in baselines[:10]:
        # Adım 1: Uzun duruşları + System Offline → PLANNED
        # reclassify miktarı o günkü unplanned_stop'u aşmamalı
        reclassify_amount = min(daily_offline_ms + daily_long_ms, b["unplanned_stop"] * 0.8)
        new_unplanned = max(0, b["unplanned_stop"] - reclassify_amount)
        new_planned = b["planned_stop"] + reclassify_amount

        # Adım 2: Cycle time düzeltmesi — gerçek run_time'ı planned_time olarak kullan
        scheduled = b["work_total"] - new_planned
        run_time = max(0, scheduled - new_unplanned)
        corrected_planned_time = run_time if run_time > 0 else b["planned_time"]

        before = _recalc_oee(
            b["work_total"], b["planned_stop"], b["unplanned_stop"],
            b["working_time"], b["planned_time"], b["product_sum"], b["scrape_sum"]
        )
        after = _recalc_oee(
            b["work_total"], new_planned, new_unplanned,
            b["working_time"], corrected_planned_time, b["product_sum"], b["scrape_sum"]
        )

        results.append({
            "machine": b["machine"],
            "day": b["day"],
            "before": before,
            "after": after,
            "delta_A": round(after["A"] - before["A"], 4),
            "delta_P": round(after["P"] - before["P"], 4),
            "delta_oee": round(after["OEE"] - before["OEE"], 4),
            "corrections_applied": [
                f"System Offline → PLANNED ({round(daily_offline_ms/3600000,1)}h/gün)",
                f"Uzun duruşlar → PLANNED ({round(daily_long_ms/3600000,1)}h/gün)",
                "Cycle time düzeltmesi (gerçek çalışma süresi)"
            ],
            "scenario": "Tüm düzeltmeler uygulandı"
        })

    # Özet
    avg_before = sum(r["before"]["OEE"] for r in results) / len(results) if results else 0
    avg_after = sum(r["after"]["OEE"] for r in results) / len(results) if results else 0

    return {
        "machine": machine,
        "days_analyzed": len(results),
        "avg_current_oee": round(avg_before, 4),
        "avg_corrected_oee": round(avg_after, 4),
        "avg_improvement": round(avg_after - avg_before, 4),
        "details": results[:5],
    }


def get_oee_trend(machine):
    """Makine bazlı haftalık OEE trend"""
    trend = query(f"""
        SELECT DATE_TRUNC('week', o.trans_date)::date AS week,
               COUNT(*) AS days,
               ROUND(AVG(o.oee), 4) AS avg_oee,
               ROUND(AVG(CAST(json_extract_string(o.availability, '$.A') AS DOUBLE)), 4) AS avg_A,
               ROUND(AVG(CAST(json_extract_string(o.performance, '$.P') AS DOUBLE)), 4) AS avg_P,
               ROUND(AVG(CAST(json_extract_string(o.quality, '$.Q') AS DOUBLE)), 4) AS avg_Q,
               SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) AS pieces
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1 AND u.name = '{machine}'
        GROUP BY week
        ORDER BY week
    """)
    return trend.to_dict(orient="records")
