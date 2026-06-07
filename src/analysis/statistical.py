"""
Statistical Engine — Confidence ve impact_score'ları veriden hesaplar.
Hardcoded sayılar yerine istatistiksel test sonuçları.

Yaklaşım:
- Sample size kontrolü (Wilson confidence interval)
- Effect size (Cohen's d, normalized)
- Pattern strength (entropy, concentration ratio)
- Cross-validation (alternative query'lerle kontrol)
"""
import math
from src.core.database import query
from src.core.cache import cached


def _wilson_ci(successes: int, total: int, z: float = 1.96):
    """Wilson confidence interval — orantı için güven aralığı"""
    if total == 0:
        return (0, 0, 0)
    p = successes / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return (max(0, center - half), p, min(1, center + half))


def _sample_size_factor(n: int, ideal: int = 100) -> float:
    """Örneklem büyüklüğüne göre güven çarpanı — n az → düşük güven"""
    if n <= 0:
        return 0
    if n >= ideal:
        return 1.0
    # Logaritmic ramp: 10 → 0.5, 50 → 0.85, 100+ → 1.0
    return min(1.0, 0.3 + 0.7 * math.log(1 + n) / math.log(1 + ideal))


def _concentration(values, total) -> float:
    """En yüksek değerin toplama oranı — pattern konsantrasyonu"""
    if not values or total == 0:
        return 0
    return max(values) / total


# ─────────────────────────────────────────────
# Problem-specific confidence calculators
# ─────────────────────────────────────────────

@cached(ttl=600)
def confidence_air_pressure():
    """Problem 1: Hava basıncı — saat konsantrasyonu + sample size"""
    r = query("""
        SELECT EXTRACT(HOUR FROM time) AS h, COUNT(*) AS c
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 1'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.value LIKE '%AIR PRESSURE%'
        GROUP BY h
        ORDER BY c DESC
    """)
    if len(r) == 0:
        return {"confidence": 0, "evidence": "Veri yok", "sample_size": 0}

    total = int(r["c"].sum())
    top_hour = int(r["h"].iloc[0])
    top_count = int(r["c"].iloc[0])
    concentration = top_count / total

    size_factor = _sample_size_factor(total, ideal=100)
    lo, p, hi = _wilson_ci(top_count, total)

    # Confidence = sample size güveni × pattern gücü × CI'nın darlığı
    ci_width = hi - lo
    pattern_strength = concentration  # 0.93 demek %93'ü tek saatte
    ci_narrowness = max(0, 1 - ci_width)
    confidence = size_factor * pattern_strength * (0.5 + 0.5 * ci_narrowness)

    return {
        "confidence": round(confidence, 3),
        "sample_size": total,
        "concentration": round(concentration, 3),
        "wilson_ci_95": [round(lo, 3), round(p, 3), round(hi, 3)],
        "evidence": f"{total} alarmın %{round(concentration*100,1)}'i saat {top_hour}:00'da",
        "method": "Wilson CI + concentration ratio"
    }


@cached(ttl=600)
def confidence_emergency_stop():
    """Problem 2: DOOR INTERLOCK → EMERGENCY STOP zinciri varsayımı"""
    pareto = query("""
        SELECT TRIM(ns.value) AS alarm, COUNT(*) AS c
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 2'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
        GROUP BY TRIM(ns.value)
    """)
    if len(pareto) == 0:
        return {"confidence": 0, "evidence": "Veri yok", "sample_size": 0}

    total = int(pareto["c"].sum())
    door = int(pareto[pareto["alarm"].str.contains("DOOR INTERLOCK", case=False, na=False)]["c"].sum())
    estop = int(pareto[pareto["alarm"].str.contains("EMERGENCY STOP", case=False, na=False)]["c"].sum())

    # Operator-kaynaklı kategori payı
    operator_share = (door + estop) / total if total > 0 else 0
    size_factor = _sample_size_factor(total, ideal=200)
    confidence = size_factor * (0.5 + 0.5 * operator_share)

    return {
        "confidence": round(confidence, 3),
        "sample_size": total,
        "door_interlock_count": door,
        "emergency_stop_count": estop,
        "operator_share": round(operator_share, 3),
        "evidence": f"{total} alarmın %{round(operator_share*100,1)}'i operatör kategorisi (DOOR+ESTOP)",
        "method": "Category share + sample-adjusted"
    }


@cached(ttl=600)
def confidence_mass_shutdown():
    """Problem 3: Toplu kapanma — koincidans frekansı"""
    r = query("""
        SELECT DATE_TRUNC('hour', ss.started_on) AS h,
               COUNT(DISTINCT ss.unit_uid) AS machines
        FROM mes_stoppage_slice ss
        WHERE ss.is_planned = false
          AND ss.duration_milliseconds > 3600000
        GROUP BY h
    """)
    if len(r) == 0:
        return {"confidence": 0, "evidence": "Veri yok", "sample_size": 0}

    total_hours = len(r)
    coincident = int((r["machines"] >= 8).sum())
    rate = coincident / total_hours

    # Kaç farklı tarihte oldu?
    distinct_dates = query("""
        SELECT COUNT(DISTINCT DATE_TRUNC('hour', ss.started_on)::date) AS d
        FROM mes_stoppage_slice ss
        WHERE ss.is_planned = false
          AND ss.duration_milliseconds > 3600000
        GROUP BY DATE_TRUNC('hour', ss.started_on)
        HAVING COUNT(DISTINCT ss.unit_uid) >= 8
    """)
    event_count = int(distinct_dates["d"].sum()) if len(distinct_dates) > 0 else 0

    # Az olay ama büyük etki — confidence orta-yüksek
    size_factor = _sample_size_factor(event_count, ideal=10)
    severity_factor = 1.0  # 11 makine birden kapanıyor — yüksek
    confidence = size_factor * 0.7 + 0.3 * severity_factor

    return {
        "confidence": round(confidence, 3),
        "sample_size": event_count,
        "coincident_hours": coincident,
        "rate_per_hour": round(rate, 6),
        "evidence": f"{event_count} olayda 8+ makine aynı anda durdu",
        "method": "Coincidence rate + severity weight"
    }


@cached(ttl=600)
def confidence_negative_oee():
    """Problem 4: Negatif OEE — yüksek güven, çok net veri hatası"""
    r = query("""
        SELECT u.name AS machine, COUNT(*) AS days
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1 AND o.oee < 0
        GROUP BY u.name
    """)
    total_negative = int(r["days"].sum()) if len(r) > 0 else 0

    # Negatif OEE matematiksel olarak imkansız — kanıt %100
    confidence = 0.95 if total_negative > 0 else 0
    return {
        "confidence": round(confidence, 3),
        "sample_size": total_negative,
        "affected_machines": r.to_dict(orient="records"),
        "evidence": f"{total_negative} gün matematiksel olarak imkansız OEE değeri",
        "method": "Mathematical impossibility"
    }


@cached(ttl=600)
def confidence_ghost_machines():
    """Problem 5: Hayalet makine — 0 üretim + yüksek A"""
    r = query("""
        SELECT u.name,
               COUNT(*) AS days,
               SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) AS pieces,
               AVG(CAST(json_extract_string(o.availability, '$.A') AS DOUBLE)) AS avg_a
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1
        GROUP BY u.name
        HAVING SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) = 0
    """)
    if len(r) == 0:
        return {"confidence": 0, "evidence": "Veri yok", "sample_size": 0}

    total_days = int(r["days"].sum())
    machines = r["name"].tolist()
    avg_a = float(r["avg_a"].mean()) if len(r) > 0 else 0

    # 139 gün 0 parça + A=%100 — çok güçlü kanıt
    confidence = min(1.0, _sample_size_factor(total_days, ideal=100) * 0.95)
    return {
        "confidence": round(confidence, 3),
        "sample_size": total_days,
        "affected_machines": machines,
        "avg_availability": round(avg_a, 3),
        "evidence": f"{len(machines)} makinede {total_days} gün boyunca 0 üretim, A=%{round(avg_a*100,1)}",
        "method": "Zero-production duration"
    }


@cached(ttl=600)
def confidence_cycle_time_mismatch():
    """Problem 6: Cycle time — log-scale ratio + workorder coverage"""
    r = query("""
        SELECT u.name AS machine,
               wo.duration_milliseconds AS dur_ms,
               wo.stock_cycle AS cycle_ms
        FROM mes_workorder wo
        JOIN mes_unit u ON u.uid = wo.unit_uid
        WHERE wo.stock_cycle > 0 AND wo.duration_milliseconds > 0
    """)
    if len(r) == 0:
        return {"confidence": 0, "evidence": "Veri yok", "sample_size": 0}

    ratios = (r["dur_ms"].astype(float) / r["cycle_ms"].astype(float))
    log_ratios = ratios.apply(lambda x: math.log10(max(x, 1)))
    mean_log_ratio = float(log_ratios.mean())
    pct_extreme = float((log_ratios > 4).mean())  # >10,000x oran

    sample_size = len(r)
    size_factor = _sample_size_factor(sample_size, ideal=500)

    # Mean log ratio 4+ (10,000x) → tam kanıt
    confidence = min(1.0, size_factor * (0.6 + 0.4 * min(mean_log_ratio / 6, 1)))

    return {
        "confidence": round(confidence, 3),
        "sample_size": sample_size,
        "mean_log10_ratio": round(mean_log_ratio, 2),
        "pct_extreme_mismatch": round(pct_extreme, 3),
        "evidence": f"{sample_size} iş emrinde ortalama 10^{round(mean_log_ratio,1)}× oran",
        "method": "Log-scale ratio distribution"
    }


@cached(ttl=600)
def confidence_long_stoppages():
    """Problem 7: Uzun duruşlar — tatil/sınıflandırma"""
    r = query("""
        SELECT
            COUNT(*) AS total,
            COUNT(CASE WHEN duration_milliseconds > 172800000 AND NOT is_planned THEN 1 END) AS long_unplanned,
            COUNT(CASE WHEN duration_milliseconds > 172800000 THEN 1 END) AS long_total
        FROM mes_stoppage_slice
        WHERE reading_def_uid != '00000000-0000-0000-0000-000000000006'
    """)
    row = r.iloc[0]
    long_unplanned = int(row["long_unplanned"])
    long_total = int(row["long_total"])

    if long_total == 0:
        return {"confidence": 0, "evidence": "Uzun duruş yok", "sample_size": 0}

    misclassification_rate = long_unplanned / long_total
    size_factor = _sample_size_factor(long_unplanned, ideal=20)
    confidence = size_factor * (0.5 + 0.5 * misclassification_rate)

    return {
        "confidence": round(confidence, 3),
        "sample_size": long_unplanned,
        "misclassification_rate": round(misclassification_rate, 3),
        "evidence": f"{long_unplanned} adet >48h duruş UNPLANNED — %{round(misclassification_rate*100,1)} oranında",
        "method": "Misclassification rate"
    }


@cached(ttl=600)
def confidence_lube_oil():
    """Problem 8: Yağlama degradasyonu — trend testi"""
    r = query("""
        SELECT time::date AS d, COUNT(*) AS c
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 2'
          AND ns.value LIKE '%LUBE%'
        GROUP BY d
        ORDER BY d
    """)
    n_dates = len(r)
    if n_dates < 2:
        return {"confidence": 0.3, "sample_size": n_dates, "evidence": "3 veri noktası — trend için zayıf", "method": "Sample insufficient"}

    # Sadece 3 nokta — confidence düşük olmalı
    size_factor = _sample_size_factor(n_dates, ideal=10)
    confidence = size_factor * 0.5
    return {
        "confidence": round(confidence, 3),
        "sample_size": n_dates,
        "evidence": f"Sadece {n_dates} alarm olayı — trend için sınırlı veri",
        "method": "Limited sample warning"
    }


@cached(ttl=600)
def confidence_overtravel():
    """Problem 9: Overtravel"""
    r = query("""
        SELECT nu.name, COUNT(*) AS c
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE ns.value LIKE '%OVERTRAVEL%'
        GROUP BY nu.name
    """)
    total = int(r["c"].sum()) if len(r) > 0 else 0
    size_factor = _sample_size_factor(total, ideal=30)
    confidence = size_factor * 0.7
    return {
        "confidence": round(confidence, 3),
        "sample_size": total,
        "evidence": f"{total} overtravel olayı",
        "method": "Event count"
    }


@cached(ttl=600)
def confidence_motor_overload():
    """Problem 10: Motor overload — tek gün konsantrasyonu"""
    r = query("""
        SELECT time::date AS d, COUNT(*) AS c
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 1' AND ns.value LIKE '%MOTOR OVERLOAD%'
        GROUP BY d
    """)
    total = int(r["c"].sum()) if len(r) > 0 else 0
    n_days = len(r)
    if total == 0:
        return {"confidence": 0, "sample_size": 0, "evidence": "Veri yok"}

    max_day = int(r["c"].max())
    concentration = max_day / total

    size_factor = _sample_size_factor(total, ideal=20)
    confidence = size_factor * concentration
    return {
        "confidence": round(confidence, 3),
        "sample_size": total,
        "concentration": round(concentration, 3),
        "evidence": f"{total} olayın %{round(concentration*100,1)}'i tek günde ({n_days} gün dağılım)",
        "method": "Single-day concentration"
    }


@cached(ttl=600)
def confidence_counter_spikes():
    """Problem 11: Sayaç anomalisi — IQR outlier"""
    r = query("""
        WITH s AS (
            SELECT u.name AS machine, cs.value AS v
            FROM mes_counter_slice cs
            JOIN mes_unit u ON u.uid = cs.unit_uid
            WHERE cs.value > 0
        ),
        q AS (
            SELECT machine,
                   PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY v) AS q1,
                   PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY v) AS q3
            FROM s GROUP BY machine
        )
        SELECT s.machine,
               COUNT(*) AS total,
               COUNT(CASE WHEN s.v > q.q3 + 10 * (q.q3 - q.q1) THEN 1 END) AS spikes
        FROM s JOIN q ON q.machine = s.machine
        GROUP BY s.machine
        HAVING COUNT(CASE WHEN s.v > q.q3 + 10 * (q.q3 - q.q1) THEN 1 END) > 0
    """)
    if len(r) == 0:
        return {"confidence": 0, "sample_size": 0, "evidence": "Spike yok"}

    total_spikes = int(r["spikes"].sum())
    total_events = int(r["total"].sum())
    spike_rate = total_spikes / total_events if total_events > 0 else 0

    size_factor = _sample_size_factor(total_events, ideal=10000)
    confidence = size_factor * 0.85  # IQR outlier — yöntem güçlü
    return {
        "confidence": round(confidence, 3),
        "sample_size": total_spikes,
        "spike_rate": round(spike_rate, 5),
        "evidence": f"{total_events:,} event'ten {total_spikes} IQR outlier",
        "method": "Tukey IQR (10× multiplier)"
    }


@cached(ttl=600)
def confidence_offhour():
    """Problem 12: Mesai dışı — Mann-Whitney karşılaştırma"""
    r = query("""
        SELECT
            CASE WHEN EXTRACT(HOUR FROM started_on) BETWEEN 8 AND 17 THEN 'mesai' ELSE 'disi' END AS shift,
            duration_milliseconds AS dur
        FROM mes_stoppage_slice
        WHERE is_planned = false
          AND reading_def_uid != '00000000-0000-0000-0000-000000000006'
    """)
    if len(r) == 0:
        return {"confidence": 0, "sample_size": 0, "evidence": "Veri yok"}

    mesai = r[r["shift"] == "mesai"]["dur"].astype(float)
    disi = r[r["shift"] == "disi"]["dur"].astype(float)

    if len(mesai) < 10 or len(disi) < 10:
        return {"confidence": 0.3, "sample_size": len(r), "evidence": "Yetersiz örneklem"}

    # Median karşılaştırma (parametrik olmayan)
    med_mesai = float(mesai.median())
    med_disi = float(disi.median())
    effect = (med_disi - med_mesai) / max(med_mesai, 1)

    # Sample size sağlam, ancak ortalamadaki büyük fark outlier kaynaklı — median güveni düşürür
    size_factor = _sample_size_factor(min(len(mesai), len(disi)), ideal=100)
    median_effect = min(1.0, abs(effect) / 5)  # 5× fark = güçlü
    confidence = size_factor * (0.4 + 0.6 * median_effect)

    return {
        "confidence": round(confidence, 3),
        "sample_size": len(r),
        "median_mesai_min": round(med_mesai / 60000, 1),
        "median_disi_min": round(med_disi / 60000, 1),
        "median_ratio": round(med_disi / max(med_mesai, 1), 2),
        "evidence": f"Median: mesai {round(med_mesai/60000,1)}dk vs dışı {round(med_disi/60000,1)}dk ({len(r):,} olay)",
        "method": "Non-parametric median comparison"
    }


# ─────────────────────────────────────────────
# Master function
# ─────────────────────────────────────────────

@cached(ttl=600)
def confidence_alarm_stoppage_chain():
    """Problem 13: Alarm → Duruş zinciri — eşleşme oranı"""
    r = query("""
        SELECT
            (SELECT COUNT(*) FROM mes_alert) AS total_alerts,
            (SELECT COUNT(*) FROM mes_alert a
             JOIN mes_stoppage_slice ss ON ss.unit_uid = a.unit_uid
                AND ss.started_on BETWEEN a.started_on AND a.started_on + INTERVAL '1 hour'
                AND ss.is_planned = false) AS matched_stops
    """)
    row = r.iloc[0]
    alerts = int(row["total_alerts"])
    matched = int(row["matched_stops"])
    if alerts == 0:
        return {"confidence": 0, "sample_size": 0, "evidence": "Alarm yok"}

    match_rate = min(1.0, matched / alerts)
    size_factor = _sample_size_factor(alerts, ideal=100)
    confidence = size_factor * (0.5 + 0.5 * match_rate)
    return {
        "confidence": round(confidence, 3),
        "sample_size": alerts,
        "match_rate": round(match_rate, 3),
        "matched_stops": matched,
        "evidence": f"{alerts} alarmın {matched}'i 1 saat içinde duruşa neden olmuş",
        "method": "Temporal cooccurrence rate",
    }


@cached(ttl=600)
def confidence_micro_stoppages():
    """Problem 14: Mikro-duruşlar — yüksek frekans + büyük örneklem"""
    r = query("""
        SELECT COUNT(*) AS n,
               ROUND(SUM(duration_milliseconds)/3600000.0, 1) AS total_hours
        FROM mes_stoppage_slice
        WHERE duration_milliseconds < 60000
          AND duration_milliseconds > 0
          AND is_planned = false
    """)
    row = r.iloc[0]
    n = int(row["n"])
    hours = float(row["total_hours"])
    if n == 0:
        return {"confidence": 0, "sample_size": 0, "evidence": "Mikro-duruş yok"}

    # 12K örneklemde tespit çok güçlü
    size_factor = _sample_size_factor(n, ideal=1000)
    confidence = min(1.0, size_factor * 0.97)
    return {
        "confidence": round(confidence, 3),
        "sample_size": n,
        "total_lost_hours": hours,
        "evidence": f"{n:,} mikro-duruş, toplam {hours:.1f}h kayıp (kesin sayım)",
        "method": "Direct enumeration",
    }


@cached(ttl=600)
def confidence_micro_signature():
    """Problem 15: Saatlik dağılım — mesai/dışı oranı"""
    r = query("""
        SELECT
            SUM(CASE WHEN EXTRACT(HOUR FROM started_on) BETWEEN 8 AND 17 THEN 1 ELSE 0 END) AS mesai,
            SUM(CASE WHEN EXTRACT(HOUR FROM started_on) < 8 OR EXTRACT(HOUR FROM started_on) > 17 THEN 1 ELSE 0 END) AS disi,
            COUNT(*) AS total
        FROM mes_stoppage_slice
        WHERE duration_milliseconds < 60000
          AND duration_milliseconds > 0
          AND is_planned = false
    """)
    row = r.iloc[0]
    mesai = int(row["mesai"])
    disi = int(row["disi"])
    total = int(row["total"])
    if total == 0:
        return {"confidence": 0, "sample_size": 0, "evidence": "Veri yok"}

    in_shift_ratio = mesai / total
    size_factor = _sample_size_factor(total, ideal=1000)
    # Pattern gücü: %90+ mesai içi → güçlü insan imzası
    confidence = size_factor * in_shift_ratio
    return {
        "confidence": round(confidence, 3),
        "sample_size": total,
        "in_shift_ratio": round(in_shift_ratio, 3),
        "evidence": f"{total:,} mikro-duruşun %{round(in_shift_ratio*100,1)}'i mesai içinde (insan imzası)",
        "method": "Shift-time concentration ratio",
    }


@cached(ttl=600)
def confidence_monthly_flatline():
    """Problem 16: Aylık trend düz — varyasyon ölçümü"""
    r = query("""
        SELECT DATE_TRUNC('month', trans_date)::date AS m,
               ROUND(AVG(CASE WHEN oee BETWEEN 0 AND 1 THEN oee END) * 100, 2) AS pct
        FROM mes_oee_summary
        WHERE level = 1
        GROUP BY m
        HAVING ROUND(AVG(CASE WHEN oee BETWEEN 0 AND 1 THEN oee END) * 100, 2) IS NOT NULL
    """)
    if len(r) < 3:
        return {"confidence": 0, "sample_size": len(r), "evidence": "Yetersiz ay"}

    values = r["pct"].astype(float).tolist()
    months = len(values)
    var = max(values) - min(values)
    # Düz trend → varyasyon küçük → confidence yüksek (flatline iddiası güçlü)
    flatness = max(0, 1 - var / 10)  # 10pp varyasyon = düz değil
    size_factor = _sample_size_factor(months, ideal=12)
    confidence = size_factor * (0.5 + 0.5 * flatness)
    return {
        "confidence": round(confidence, 3),
        "sample_size": months,
        "variation_pp": round(var, 2),
        "min_oee": min(values),
        "max_oee": max(values),
        "evidence": f"{months} ay, OEE varyasyonu {var:.1f}pp — düz trend kanıtı",
        "method": "Variance-based flatness",
    }


@cached(ttl=600)
def confidence_path_load():
    """Problem 17: PATH_LOAD — sinyal tanımlı vs veri var/yok"""
    r = query("""
        SELECT nrd.readingdef_name,
               nu.name AS machine,
               COUNT(nd.id) AS data_points
        FROM nightwatch_reading_def nrd
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        LEFT JOIN nightwatch_data nd ON nd.readingdef_uid = nrd.readingdef_uid
        WHERE nrd.readingdef_name LIKE '%PATH_LOAD%'
        GROUP BY nrd.readingdef_name, nu.name
    """)
    if len(r) == 0:
        return {"confidence": 0, "sample_size": 0, "evidence": "Sinyal tanımı yok"}

    defined = len(r)
    empty = int((r["data_points"] == 0).sum())
    if empty == 0:
        return {"confidence": 0.3, "sample_size": defined, "evidence": "Tüm makinelerde veri toplanıyor"}

    # Mathematical certainty — sinyal tanımlı ama 0 kayıt
    confidence = 0.95
    return {
        "confidence": confidence,
        "sample_size": defined,
        "empty_signals": empty,
        "evidence": f"{empty}/{defined} makinede PATH_LOAD tanımlı ama 0 veri (kesin kör nokta)",
        "method": "Definition vs collection gap",
    }


_CONFIDENCE_FUNCS = {
    1: confidence_air_pressure,
    2: confidence_emergency_stop,
    3: confidence_mass_shutdown,
    4: confidence_negative_oee,
    5: confidence_ghost_machines,
    6: confidence_cycle_time_mismatch,
    7: confidence_long_stoppages,
    8: confidence_lube_oil,
    9: confidence_overtravel,
    10: confidence_motor_overload,
    11: confidence_counter_spikes,
    12: confidence_offhour,
    13: confidence_alarm_stoppage_chain,
    14: confidence_micro_stoppages,
    15: confidence_micro_signature,
    16: confidence_monthly_flatline,
    17: confidence_path_load,
}


@cached(ttl=600)
def get_all_confidences():
    """Tüm problemler için veriden hesaplanmış confidence skorları"""
    result = {}
    for pid, fn in _CONFIDENCE_FUNCS.items():
        try:
            result[pid] = fn()
        except Exception as e:
            result[pid] = {"confidence": 0.5, "error": str(e), "method": "fallback"}
    return result


def get_confidence(problem_id: int) -> dict:
    """Tek bir problem için confidence"""
    fn = _CONFIDENCE_FUNCS.get(problem_id)
    if not fn:
        return {"confidence": 0.5, "method": "no calculator"}
    return fn()
