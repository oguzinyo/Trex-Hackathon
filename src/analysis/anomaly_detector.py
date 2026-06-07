"""
Anomaly Detector — Isolation Forest + İstatistiksel Anomali Tespiti
"""
import numpy as np
from src.core.database import query
from src.core.cache import cached


def detect_sensor_anomalies(machine, signal=None, contamination=0.05):
    """Isolation Forest ile sensör anomalisi tespiti"""
    from sklearn.ensemble import IsolationForest

    where_signal = f"AND nrd.readingdef_name = '{signal}'" if signal else ""

    data = query(f"""
        SELECT nd.time,
               nd.value,
               nrd.readingdef_name AS signal
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine}'
          {where_signal}
          AND nd.value IS NOT NULL
        ORDER BY nd.time
        LIMIT 100000
    """)

    if len(data) < 100:
        return {"error": f"Yetersiz veri: {len(data)} satır", "machine": machine}

    results = []
    for sig_name in data["signal"].unique():
        sig_data = data[data["signal"] == sig_name].copy()
        if len(sig_data) < 50:
            continue

        values = sig_data["value"].values.reshape(-1, 1)

        # NaN ve inf temizle
        mask = np.isfinite(values.ravel())
        if mask.sum() < 50:
            continue

        clean_values = values[mask].reshape(-1, 1)
        clean_times = sig_data[mask]["time"].values

        model = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100
        )
        labels = model.fit_predict(clean_values)
        scores = model.decision_function(clean_values)

        anomaly_mask = labels == -1
        anomaly_count = int(anomaly_mask.sum())

        anomaly_indices = np.where(anomaly_mask)[0]
        top_anomalies = []
        for idx in anomaly_indices[:20]:
            top_anomalies.append({
                "time": str(clean_times[idx]),
                "value": float(clean_values[idx][0]),
                "score": float(scores[idx])
            })

        results.append({
            "signal": sig_name,
            "total_points": int(mask.sum()),
            "anomaly_count": anomaly_count,
            "anomaly_pct": round(anomaly_count / mask.sum() * 100, 2),
            "mean": round(float(np.mean(clean_values)), 2),
            "std": round(float(np.std(clean_values)), 2),
            "top_anomalies": sorted(top_anomalies, key=lambda x: x["score"])[:10]
        })

    return {
        "machine": machine,
        "signals_analyzed": len(results),
        "results": results
    }


@cached(ttl=600)
def detect_counter_spikes(threshold_multiplier=10):
    """Counter slice'larda spike tespiti (IQR yöntemi)"""
    data = query("""
        SELECT u.name AS machine,
               cs.slice_on AS time,
               cs.value AS delta,
               cs.prev_value,
               cs.current_value
        FROM mes_counter_slice cs
        JOIN mes_unit u ON u.uid = cs.unit_uid
        WHERE cs.value > 0
        ORDER BY cs.value DESC
    """)

    results = []
    for machine in data["machine"].unique():
        m_data = data[data["machine"] == machine]
        values = m_data["delta"].values

        q1 = np.percentile(values, 25)
        q3 = np.percentile(values, 75)
        iqr = q3 - q1
        upper_bound = q3 + threshold_multiplier * iqr

        spikes = m_data[m_data["delta"] > upper_bound]
        results.append({
            "machine": machine,
            "total_events": len(m_data),
            "q1": float(q1),
            "q3": float(q3),
            "iqr": float(iqr),
            "upper_bound": float(upper_bound),
            "spike_count": len(spikes),
            "spikes": spikes[["time", "delta", "prev_value", "current_value"]].head(10).to_dict(orient="records")
        })

    return results


def detect_stoppage_clusters(min_machines=3, time_window_hours=1):
    """Zaman bazlı duruş kümeleri — toplu kapanma tespiti"""
    clusters = query(f"""
        SELECT DATE_TRUNC('hour', ss.started_on) AS hour_block,
               COUNT(DISTINCT ss.unit_uid) AS machines_stopped,
               ARRAY_AGG(DISTINCT u.name ORDER BY u.name) AS machine_list,
               COUNT(*) AS total_events,
               ROUND(AVG(ss.duration_milliseconds) / 3600000.0, 2) AS avg_hours
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE ss.is_planned = false
          AND ss.duration_milliseconds > 3600000
        GROUP BY hour_block
        HAVING COUNT(DISTINCT ss.unit_uid) >= {min_machines}
        ORDER BY machines_stopped DESC, hour_block
    """)

    return {
        "total_clusters": len(clusters),
        "clusters": clusters.to_dict(orient="records")
    }


@cached(ttl=600)
def get_machine_health_scores():
    """Her makine için sağlık skoru (0-100)"""
    metrics = query("""
        SELECT u.name AS machine,
               ROUND(AVG(CASE WHEN o.oee >= 0 THEN o.oee ELSE 0 END), 4) AS avg_oee,
               ROUND(AVG(CASE WHEN CAST(json_extract_string(o.availability, '$.A') AS DOUBLE) >= 0
                         THEN CAST(json_extract_string(o.availability, '$.A') AS DOUBLE) ELSE 0 END), 4) AS avg_A,
               SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) AS total_pieces
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1
        GROUP BY u.name
    """)

    alarms = query("""
        SELECT u.name AS machine, COUNT(*) AS alarm_count
        FROM mes_alert a
        JOIN mes_unit u ON u.uid = a.unit_uid
        GROUP BY u.name
    """)
    alarm_map = dict(zip(alarms["machine"], alarms["alarm_count"])) if len(alarms) > 0 else {}

    stoppages = query("""
        SELECT u.name AS machine,
               ROUND(SUM(ss.duration_milliseconds) / 3600000.0, 1) AS stop_hours
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE ss.is_planned = false
          AND ss.reading_def_uid != '00000000-0000-0000-0000-000000000006'
        GROUP BY u.name
    """)
    stop_map = dict(zip(stoppages["machine"], stoppages["stop_hours"])) if len(stoppages) > 0 else {}

    results = []
    for _, row in metrics.iterrows():
        machine = row["machine"]
        import math
        avg_oee = float(row["avg_oee"]) if not math.isnan(float(row["avg_oee"])) else 0
        avg_A = float(row["avg_A"]) if not math.isnan(float(row["avg_A"])) else 0
        pieces = int(row["total_pieces"]) if not math.isnan(float(row["total_pieces"])) else 0

        oee_score = max(0, avg_oee) * 100  # 0-100
        a_score = max(0, avg_A) * 40       # availability weight
        prod_score = min(30, pieces / 500) if pieces > 0 else 0
        alarm_penalty = min(20, int(alarm_map.get(machine, 0)) * 0.3)
        stop_penalty = min(20, float(stop_map.get(machine, 0)) / 200)

        health = max(0, min(100, a_score + prod_score + oee_score - alarm_penalty - stop_penalty))

        status = "critical" if health < 20 else "warning" if health < 50 else "good"
        results.append({
            "machine": machine,
            "health_score": round(health, 1),
            "status": status,
            "avg_oee": avg_oee,
            "avg_A": avg_A,
            "total_pieces": pieces,
            "alarm_count": int(alarm_map.get(machine, 0)),
            "stop_hours": float(stop_map.get(machine, 0))
        })

    return sorted(results, key=lambda x: x["health_score"])


@cached(ttl=600)
def analyze_mitsubishi_sensors(machine="Makine 7"):
    """
    Mitsubishi CNC sensör analizi — 14 sinyal üzerinde detaylı anomali tespiti.
    Cycle time, eksen pozisyonu, run status pattern'leri.
    """
    from sklearn.ensemble import IsolationForest

    results = {}

    # 1. Cycle Time Analizi (Makine 7)
    cycle = query(f"""
        SELECT nd.time, nd.value
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine}'
          AND nrd.readingdef_name LIKE '%CYCLE_TIME%'
          AND nd.value > 0
        ORDER BY nd.time
    """)

    if len(cycle) > 100:
        values = cycle["value"].values.reshape(-1, 1)
        mask = np.isfinite(values.ravel())
        clean = values[mask].reshape(-1, 1)

        if len(clean) > 100:
            model = IsolationForest(contamination=0.05, random_state=42)
            labels = model.fit_predict(clean)
            scores = model.decision_function(clean)
            anomaly_mask = labels == -1

            # Normal ve anomali çevrim süreleri
            normal_vals = clean[~anomaly_mask].ravel()
            anomaly_vals = clean[anomaly_mask].ravel()

            results["cycle_time"] = {
                "total_readings": int(mask.sum()),
                "anomaly_count": int(anomaly_mask.sum()),
                "anomaly_pct": round(float(anomaly_mask.sum()) / len(clean) * 100, 2),
                "normal_avg_ms": round(float(np.mean(normal_vals)), 0),
                "normal_std_ms": round(float(np.std(normal_vals)), 0),
                "anomaly_avg_ms": round(float(np.mean(anomaly_vals)), 0) if len(anomaly_vals) > 0 else 0,
                "normal_avg_sec": round(float(np.mean(normal_vals)) / 1000, 1),
                "anomaly_avg_sec": round(float(np.mean(anomaly_vals)) / 1000, 1) if len(anomaly_vals) > 0 else 0,
            }

    # 2. Eksen Pozisyon Analizi — çalışma alanı dışına çıkma
    for axis_idx, axis_name in [(1, "X"), (2, "Y")]:
        pos = query(f"""
            SELECT nd.time, nd.value
            FROM nightwatch_data nd
            JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
            JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
            WHERE nu.name = '{machine}'
              AND nrd.readingdef_name LIKE '%PROGRAM_POSITION_3%({axis_idx})'
            ORDER BY nd.time
            LIMIT 50000
        """)

        if len(pos) > 100:
            vals = pos["value"].values
            mask = np.isfinite(vals)
            clean_vals = vals[mask]

            if len(clean_vals) > 100:
                q1, q99 = np.percentile(clean_vals, [1, 99])
                outliers = ((clean_vals < q1) | (clean_vals > q99)).sum()

                results[f"axis_{axis_name}"] = {
                    "readings": int(mask.sum()),
                    "min": round(float(np.min(clean_vals)), 2),
                    "max": round(float(np.max(clean_vals)), 2),
                    "range_mm": round(float(np.max(clean_vals) - np.min(clean_vals)), 2),
                    "std": round(float(np.std(clean_vals)), 2),
                    "outlier_count": int(outliers),
                    "outlier_pct": round(float(outliers) / len(clean_vals) * 100, 2),
                    "p1": round(float(q1), 2),
                    "p99": round(float(q99), 2),
                }

    # 3. Run Status Pattern — duruş/çalışma geçişleri
    status = query(f"""
        SELECT nd.time,
               nrd.readingdef_name AS signal,
               nd.value
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine}'
          AND nrd.readingdef_name LIKE '%RUN_STATUS%'
        ORDER BY nd.time
    """)

    if len(status) > 0:
        status_counts = {}
        for sig in status["signal"].unique():
            sig_data = status[status["signal"] == sig]
            transitions = (sig_data["value"].diff().abs() > 0).sum()
            status_counts[sig.split("__")[0].replace("RUN_STATUS_", "")] = {
                "readings": len(sig_data),
                "transitions": int(transitions),
                "on_pct": round(float(sig_data["value"].mean()) * 100, 1),
            }
        results["run_status"] = status_counts

    # 4. M-Code Frekans Analizi
    mcodes = query(f"""
        SELECT nd.value AS mcode, COUNT(*) AS freq
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine}'
          AND nrd.readingdef_name LIKE '%COMMAND_2%'
          AND nd.value > 0
        GROUP BY nd.value
        ORDER BY freq DESC
        LIMIT 10
    """)

    if len(mcodes) > 0:
        results["m_codes"] = mcodes.to_dict(orient="records")

    return {
        "machine": machine,
        "controller": "Mitsubishi",
        "signals_analyzed": len(results),
        "analysis": results
    }


@cached(ttl=600)
def get_data_quality_report():
    """Veri kalitesi raporu — tüm tablolar için"""

    # OEE veri kalitesi
    oee_quality = query("""
        SELECT u.name AS machine,
               COUNT(*) AS total_days,
               COUNT(CASE WHEN o.oee BETWEEN 0 AND 1 THEN 1 END) AS valid_days,
               COUNT(CASE WHEN o.oee < 0 THEN 1 END) AS negative_days,
               COUNT(CASE WHEN o.oee = 0 THEN 1 END) AS zero_days,
               ROUND(AVG(CASE WHEN o.oee BETWEEN 0 AND 1 THEN o.oee END), 4) AS clean_avg_oee,
               ROUND(AVG(CAST(json_extract_string(o.availability, '$.A') AS DOUBLE)), 4) AS avg_A,
               ROUND(AVG(CAST(json_extract_string(o.performance, '$.P') AS DOUBLE)), 4) AS avg_P
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1
        GROUP BY u.name
        ORDER BY u.name
    """)

    # Sensor coverage
    sensor_coverage = query("""
        SELECT nu.name AS machine,
               COUNT(DISTINCT nrd.readingdef_name) AS signal_count,
               COUNT(*) AS total_readings,
               MIN(nd.time)::date AS first_reading,
               MAX(nd.time)::date AS last_reading
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        GROUP BY nu.name
        ORDER BY nu.name
    """)

    # Stoppage classification
    stop_class = query("""
        SELECT
            COUNT(*) AS total_stoppages,
            COUNT(CASE WHEN is_planned THEN 1 END) AS planned,
            COUNT(CASE WHEN NOT is_planned THEN 1 END) AS unplanned,
            COUNT(CASE WHEN reading_def_uid = '00000000-0000-0000-0000-000000000006' THEN 1 END) AS system_offline,
            COUNT(CASE WHEN duration_milliseconds > 172800000 AND NOT is_planned THEN 1 END) AS long_unplanned,
            ROUND(SUM(CASE WHEN NOT is_planned THEN duration_milliseconds ELSE 0 END) / 3600000.0, 0) AS unplanned_hours,
            ROUND(SUM(CASE WHEN is_planned THEN duration_milliseconds ELSE 0 END) / 3600000.0, 0) AS planned_hours
        FROM mes_stoppage_slice
    """)

    # Counter quality
    counter_quality = query("""
        SELECT u.name AS machine,
               COUNT(*) AS events,
               MAX(cs.value) AS max_delta,
               COUNT(CASE WHEN cs.value > 1000 THEN 1 END) AS suspicious_spikes,
               SUM(cs.value) AS total_pieces
        FROM mes_counter_slice cs
        JOIN mes_unit u ON u.uid = cs.unit_uid
        GROUP BY u.name
        ORDER BY u.name
    """)

    # Workorder cycle time quality
    cycle_quality = query("""
        SELECT u.name AS machine,
               COUNT(*) AS workorders,
               COUNT(CASE WHEN wo.stock_cycle > 0 THEN 1 END) AS has_cycle,
               COUNT(CASE WHEN wo.stock_cycle > 0 AND wo.duration_milliseconds / wo.stock_cycle > 10000 THEN 1 END) AS cycle_mismatch
        FROM mes_workorder wo
        JOIN mes_unit u ON u.uid = wo.unit_uid
        GROUP BY u.name
        ORDER BY u.name
    """)

    issues = []

    # Issue detection
    for _, row in oee_quality.iterrows():
        if row["negative_days"] > 0:
            issues.append({
                "type": "oee_negative",
                "severity": "critical",
                "machine": row["machine"],
                "detail": f"{int(row['negative_days'])} gün negatif OEE"
            })
        if row["avg_P"] is not None and float(row["avg_P"]) < 0.01:
            issues.append({
                "type": "performance_zero",
                "severity": "high",
                "machine": row["machine"],
                "detail": f"P≈0 — stock_cycle yanlış konfigüre"
            })

    for _, row in counter_quality.iterrows():
        if int(row["suspicious_spikes"]) > 0:
            issues.append({
                "type": "counter_spike",
                "severity": "medium",
                "machine": row["machine"],
                "detail": f"{int(row['suspicious_spikes'])} şüpheli spike (>1000 parça/event)"
            })

    sc = stop_class.iloc[0]
    if float(sc["long_unplanned"]) > 10:
        issues.append({
            "type": "misclassified_stops",
            "severity": "high",
            "machine": "Tüm Fabrika",
            "detail": f"{int(sc['long_unplanned'])} uzun duruş (>48h) UNPLANNED olarak sınıflandırılmış"
        })

    return {
        "oee_quality": oee_quality.to_dict(orient="records"),
        "sensor_coverage": sensor_coverage.to_dict(orient="records"),
        "stoppage_summary": stop_class.to_dict(orient="records")[0] if len(stop_class) > 0 else {},
        "counter_quality": counter_quality.to_dict(orient="records"),
        "cycle_time_quality": cycle_quality.to_dict(orient="records"),
        "issues": sorted(issues, key=lambda x: {"critical": 0, "high": 1, "medium": 2}[x["severity"]]),
        "total_issues": len(issues),
    }
