"""
Batch Simulator — Mevcut DuckDB'yi anlık feed gibi sunar.

Gerçek canlı sistemde burası MQTT/OPC-UA/REST stream olur.
Şimdilik DB'den 'son 24 saat'in son 15 dakikası gibi pencereler çekiyoruz.
"""
import time
from datetime import timedelta

# Mevcut read-only DB bağlantısını yeniden kullan
from src.core.database import query


def latest_machine_snapshot(machine: str, window_min: int = 15) -> dict:
    """
    Bir makine için 'şu an' simülasyonu — DB'deki en son verinin
    son window_min dakika penceresinden özet.
    """
    # En son veri zamanı (DB tarihsel olduğu için 'şimdi' = MAX(time))
    snap = query(f"""
        WITH latest AS (
            SELECT MAX(time) AS now_t
            FROM nightwatch_data_string ns
            JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
            JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
            WHERE nu.name = '{machine}'
        ),
        recent_alarms AS (
            SELECT COUNT(*) AS alarms,
                   STRING_AGG(DISTINCT TRIM(ns.value), '; ') AS alarm_list
            FROM nightwatch_data_string ns
            JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
            JOIN nightwatch_unit nu ON nu.id = nrd.unit_id, latest
            WHERE nu.name = '{machine}'
              AND nrd.readingdef_name = 'ALM_ARR_MSG'
              AND ns.time BETWEEN latest.now_t - INTERVAL '{window_min} minutes' AND latest.now_t
        ),
        recent_stops AS (
            SELECT COUNT(*) AS stop_count,
                   COALESCE(SUM(duration_milliseconds)/1000.0, 0) AS stop_sec
            FROM mes_stoppage_slice ss
            JOIN mes_unit u ON u.uid = ss.unit_uid, latest
            WHERE u.name = '{machine}'
              AND ss.is_planned = false
              AND ss.started_on >= latest.now_t - INTERVAL '{window_min} minutes'
        ),
        recent_cycle AS (
            SELECT ROUND(AVG(nd.value), 0) AS avg_cycle_ms,
                   ROUND(MAX(nd.value), 0) AS max_cycle_ms,
                   ROUND(STDDEV(nd.value), 0) AS std_cycle_ms,
                   COUNT(*) AS samples
            FROM nightwatch_data nd
            JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
            JOIN nightwatch_unit nu ON nu.id = nrd.unit_id, latest
            WHERE nu.name = '{machine}'
              AND nrd.readingdef_name LIKE '%CYCLE_TIME%'
              AND nd.value > 0
              AND nd.time >= latest.now_t - INTERVAL '{window_min} minutes'
        )
        SELECT (SELECT now_t FROM latest)::VARCHAR AS now_ts,
               (SELECT alarms FROM recent_alarms) AS alarms,
               (SELECT alarm_list FROM recent_alarms) AS alarm_list,
               (SELECT stop_count FROM recent_stops) AS stop_count,
               (SELECT stop_sec FROM recent_stops) AS stop_sec,
               (SELECT avg_cycle_ms FROM recent_cycle) AS avg_cycle_ms,
               (SELECT max_cycle_ms FROM recent_cycle) AS max_cycle_ms,
               (SELECT std_cycle_ms FROM recent_cycle) AS std_cycle_ms,
               (SELECT samples FROM recent_cycle) AS samples
    """)

    if len(snap) == 0:
        return {"machine": machine, "available": False}

    row = snap.iloc[0]
    return {
        "machine": machine,
        "available": True,
        "now_ts": str(row.get("now_ts", "")),
        "window_minutes": window_min,
        "alarms_in_window": int(row.get("alarms", 0) or 0),
        "alarm_messages": (row.get("alarm_list") or "").split("; ") if row.get("alarm_list") else [],
        "stops_in_window": int(row.get("stop_count", 0) or 0),
        "stop_seconds": float(row.get("stop_sec", 0) or 0),
        "cycle_avg_ms": float(row.get("avg_cycle_ms") or 0),
        "cycle_max_ms": float(row.get("max_cycle_ms") or 0),
        "cycle_std_ms": float(row.get("std_cycle_ms") or 0),
        "cycle_samples": int(row.get("samples", 0) or 0),
        "captured_at": time.time(),
    }


def all_machines_snapshot(window_min: int = 15) -> list:
    """Tüm makineler için snapshot"""
    machines_rows = query("SELECT DISTINCT name AS machine FROM mes_unit ORDER BY name")
    out = []
    for _, r in machines_rows.iterrows():
        try:
            snap = latest_machine_snapshot(r["machine"], window_min)
            out.append(snap)
        except Exception as e:
            out.append({"machine": r["machine"], "error": str(e), "available": False})
    return out
