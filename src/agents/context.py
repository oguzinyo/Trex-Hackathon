"""
Event Context Agent — seçilen makine için RCA zaman penceresi oluşturur.
"""
from config.settings import MACHINES
from src.core.database import query


def _machine_name(machine=None):
    if machine in MACHINES:
        return machine
    return "Makine 1"


def _sql_text(value: str) -> str:
    return value.replace("'", "''")


def _records(df, limit=None):
    if limit is not None:
        df = df.head(limit)
    return df.to_dict(orient="records")


def _pick_event(machine: str, rca_result=None):
    machine_sql = _sql_text(machine)

    preferred_alarm = None
    if rca_result and rca_result.get("top_issue"):
        top = rca_result["top_issue"]
        if top.get("id") == 1:
            preferred_alarm = "AIR PRESSURE"
        elif top.get("id") == 2:
            preferred_alarm = "DOOR INTERLOCK"
        elif top.get("id") == 8:
            preferred_alarm = "LUBE"
        elif top.get("id") == 10:
            preferred_alarm = "MOTOR OVERLOAD"

    alarm_filter = f"AND ns.value LIKE '%{_sql_text(preferred_alarm)}%'" if preferred_alarm else ""
    event = query(f"""
        SELECT nu.name AS machine,
               ns.time AS event_time,
               TRIM(ns.value) AS alarm
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine_sql}'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
          {alarm_filter}
        ORDER BY ns.time DESC
        LIMIT 1
    """)

    if len(event) == 0 and preferred_alarm:
        event = query(f"""
            SELECT nu.name AS machine,
                   ns.time AS event_time,
                   TRIM(ns.value) AS alarm
            FROM nightwatch_data_string ns
            JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
            JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
            WHERE nu.name = '{machine_sql}'
              AND nrd.readingdef_name = 'ALM_ARR_MSG'
            ORDER BY ns.time DESC
            LIMIT 1
        """)

    if len(event) == 0:
        return None
    row = event.iloc[0]
    return {"machine": row["machine"], "event_time": row["event_time"], "alarm": row["alarm"]}


def run(machine=None, rca_result=None):
    """Olay çevresi: alarm, duruş, iş emri, sayaç ve program bağlamı."""
    machine = _machine_name(machine)
    event = _pick_event(machine, rca_result)
    if not event:
        return {
            "agent": "EventContext",
            "status": "no_event",
            "machine": machine,
            "error": "Makine için alarm olayı bulunamadı",
            "context_window": "[-15dk, +5dk]",
        }

    machine_sql = _sql_text(machine)
    t = str(event["event_time"])

    alarms = query(f"""
        SELECT ns.time, TRIM(ns.value) AS alarm, ns.index
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine_sql}'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.time BETWEEN TIMESTAMP '{t}' - INTERVAL '15 minutes'
                          AND TIMESTAMP '{t}' + INTERVAL '5 minutes'
        ORDER BY ns.time, ns.index
    """)

    stoppages = query(f"""
        SELECT ss.started_on, ss.ended_on,
               ROUND(ss.duration_milliseconds / 60000.0, 1) AS duration_min,
               ss.is_planned,
               rd.display_text AS stop_reason
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        LEFT JOIN mes_reading_def rd ON rd.uid = ss.reading_def_uid
        WHERE u.name = '{machine_sql}'
          AND ss.started_on <= TIMESTAMP '{t}' + INTERVAL '5 minutes'
          AND (ss.ended_on >= TIMESTAMP '{t}' - INTERVAL '15 minutes' OR ss.ended_on IS NULL)
        ORDER BY ss.started_on
        LIMIT 20
    """)

    workorders = query(f"""
        SELECT wo.order_no, wo.started_on, wo.ended_on,
               wo.stock_cycle,
               ROUND(wo.duration_milliseconds / 60000.0, 1) AS duration_min
        FROM mes_workorder wo
        JOIN mes_unit u ON u.uid = wo.unit_uid
        WHERE u.name = '{machine_sql}'
          AND wo.started_on <= TIMESTAMP '{t}' + INTERVAL '5 minutes'
          AND (wo.ended_on >= TIMESTAMP '{t}' - INTERVAL '15 minutes' OR wo.ended_on IS NULL)
        ORDER BY wo.started_on DESC
        LIMIT 10
    """)

    counters = query(f"""
        SELECT COUNT(*) AS events,
               COALESCE(SUM(cs.value), 0) AS pieces,
               MAX(cs.value) AS max_delta
        FROM mes_counter_slice cs
        JOIN mes_unit u ON u.uid = cs.unit_uid
        WHERE u.name = '{machine_sql}'
          AND cs.slice_on BETWEEN TIMESTAMP '{t}' - INTERVAL '15 minutes'
                              AND TIMESTAMP '{t}' + INTERVAL '5 minutes'
    """)

    programs = query(f"""
        SELECT ns.time, nrd.readingdef_name AS signal, ns.value AS program
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine_sql}'
          AND nrd.readingdef_name LIKE '%PROGRAM%'
          AND ns.time <= TIMESTAMP '{t}'
        ORDER BY ns.time DESC
        LIMIT 5
    """)

    counter_row = counters.iloc[0].to_dict() if len(counters) else {}
    evidence = []
    if len(alarms) > 1:
        evidence.append(f"Olay penceresinde {len(alarms)} alarm mesajı görüldü")
    if len(stoppages) > 0:
        evidence.append("Alarm penceresiyle çakışan duruş kaydı var")
    if counter_row.get("pieces", 0) == 0:
        evidence.append("Olay penceresinde üretim sayacı artışı yok")
    if len(workorders) > 0:
        evidence.append("Olay sırasında aktif iş emri/program bağlamı bulundu")

    return {
        "agent": "EventContext",
        "status": "success",
        "machine": machine,
        "event": {"time": str(event["event_time"]), "alarm": event["alarm"]},
        "context_window": "[-15dk, +5dk]",
        "alarms": _records(alarms, 20),
        "stoppages": _records(stoppages, 20),
        "workorders": _records(workorders, 10),
        "programs": _records(programs, 5),
        "counter_activity": counter_row,
        "evidence": evidence,
    }
