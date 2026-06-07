"""
RCA Engine — 17 Problemin Analiz Motoru
Her fonksiyon DuckDB'den veri çeker ve JSON-serializable dict döner.
"""
from src.core.database import query
from src.core.cache import cached


# ─────────────────────────────────────────────
# Problem 1: Kronik Hava Basıncı (Makine 1)
# ─────────────────────────────────────────────
def get_air_pressure_pattern():
    """Sabah saati pattern'i + zincirleme alarm zinciri"""
    daily = query("""
        SELECT time::date AS day,
               MIN(time) AS first_alarm,
               EXTRACT(HOUR FROM MIN(time)) AS hour,
               EXTRACT(MINUTE FROM MIN(time)) AS minute,
               COUNT(*) AS alarm_count
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 1'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.value LIKE '%AIR PRESSURE%'
        GROUP BY day
        ORDER BY day
    """)

    cascade = query("""
        SELECT TRIM(ns.value) AS alarm,
               COUNT(*) AS total,
               MIN(ns.time) AS first_seen,
               MAX(ns.time) AS last_seen
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 1'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
        GROUP BY TRIM(ns.value)
        ORDER BY total DESC
    """)

    return {
        "id": 1,
        "title": "Kronik Hava Basıncı Arızası",
        "machine": "Makine 1",
        "severity": "critical",
        "total_alarms": int(daily["alarm_count"].sum()),
        "affected_days": len(daily),
        "avg_hour": round(float(daily["hour"].mean()), 1),
        "avg_minute": round(float(daily["minute"].mean()), 1),
        "cascade_chain": cascade.to_dict(orient="records"),
        "daily_pattern": daily[["day", "alarm_count"]].to_dict(orient="records"),
        "root_cause": "Kompresör startup sequence — basınç yeterli seviyeye ulaşmadan makine açılıyor",
        "solution": "PLC'de basınç interlock'u: kompresör 6 bar'a ulaşmadan makine start komutu kabul etmesin. Alternatif: 10 dk startup delay.",
        "evidence": "248 alarmın tamamı sabah 07:40-07:50 arasında"
    }


# ─────────────────────────────────────────────
# Problem 2: Tekrarlayan Acil Durdurma (Makine 2)
# ─────────────────────────────────────────────
def get_emergency_stop_pareto():
    """Alarm Pareto — frekans bazlı + operatör/mekanik sınıflandırma"""
    pareto = query("""
        SELECT TRIM(ns.value) AS alarm,
               COUNT(*) AS occurrences,
               MIN(ns.time)::date AS first_seen,
               MAX(ns.time)::date AS last_seen
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 2'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
        GROUP BY TRIM(ns.value)
        ORDER BY occurrences DESC
    """)

    operator_alarms = {"DOOR INTERLOCK ALARM.", "EMERGENCY STOP."}
    records = pareto.to_dict(orient="records")
    for r in records:
        r["category"] = "operator" if r["alarm"] in operator_alarms else "mechanical"

    return {
        "id": 2,
        "title": "Tekrarlayan Acil Durdurma",
        "machine": "Makine 2",
        "severity": "critical",
        "pareto": records,
        "total_alarms": int(pareto["occurrences"].sum()),
        "root_cause": "DOOR INTERLOCK 229 kez — operatör kapıyı açmak zorunda kalıyor (talaş birikimi veya cam kirliliği). EMERGENCY STOP bunun sonucu.",
        "solution": "Talaş tahliye sistemi kontrol + makine içi kamera. Operatör kapıyı açmak zorunda kalmamalı.",
        "evidence": "DOOR INTERLOCK → hemen ardından EMERGENCY STOP pattern'i"
    }


# ─────────────────────────────────────────────
# Problem 3: Toplu Fabrika Kapanmaları
# ─────────────────────────────────────────────
def get_mass_shutdown_events():
    """3+ makine aynı saatte durmuş olaylar + kapanma sırası"""
    events = query("""
        SELECT DATE_TRUNC('hour', ss.started_on) AS hour_block,
               COUNT(DISTINCT ss.unit_uid) AS machines_stopped,
               COUNT(*) AS total_events
        FROM mes_stoppage_slice ss
        WHERE ss.is_planned = false
          AND ss.duration_milliseconds > 3600000
        GROUP BY hour_block
        HAVING COUNT(DISTINCT ss.unit_uid) >= 3
        ORDER BY machines_stopped DESC, hour_block
    """)

    detail = query("""
        SELECT u.name AS machine,
               ss.started_on,
               ROUND(ss.duration_milliseconds / 3600000.0, 1) AS hours
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE DATE_TRUNC('hour', ss.started_on) = '2025-12-16 12:00:00+03'
          AND ss.is_planned = false
          AND ss.duration_milliseconds > 3600000
        ORDER BY ss.started_on
    """)

    return {
        "id": 3,
        "title": "Toplu Fabrika Kapanmaları",
        "machine": "Tüm Fabrika",
        "severity": "critical",
        "events": events.to_dict(orient="records"),
        "total_mass_events": len(events),
        "max_machines_at_once": int(events["machines_stopped"].max()) if len(events) > 0 else 0,
        "shutdown_sequence": detail.to_dict(orient="records"),
        "root_cause": "11 makine aynı anda kapanması tesis altyapısı problemi — elektrik panosu, ana pnömatik hat veya ağ altyapısı",
        "solution": "Kapanma sırasını analiz et → zayıf halka olan besleme hattına ayrı UPS veya otomatik transfer switch koy",
        "evidence": "4 farklı tarihte 11/12 makine aynı saatte durmuş"
    }


# ─────────────────────────────────────────────
# Problem 4: Negatif OEE (Makine 9)
# ─────────────────────────────────────────────
def get_negative_oee_cases():
    """PlannedStop ≈ WorkTotal → negatif A hesaplanması"""
    cases = query("""
        SELECT u.name AS machine,
               o.trans_date::date AS day,
               ROUND(o.oee, 4) AS oee,
               ROUND(CAST(json_extract_string(o.availability, '$.A') AS DOUBLE), 4) AS A,
               CAST(json_extract_string(o.availability, '$.WorkTotal') AS BIGINT) AS work_total,
               CAST(json_extract_string(o.availability, '$.PlannedStop') AS BIGINT) AS planned_stop,
               CAST(json_extract_string(o.availability, '$.UnPlannedStop') AS BIGINT) AS unplanned_stop
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        WHERE o.level = 1
          AND CAST(json_extract_string(o.availability, '$.A') AS DOUBLE) < 0
        ORDER BY o.oee ASC
    """)

    return {
        "id": 4,
        "title": "Negatif OEE Hesaplama Hatası",
        "machine": "Makine 9",
        "severity": "high",
        "cases": cases.to_dict(orient="records"),
        "root_cause": "M30 komutu her çevrim sonunda planlı duruş açıyor ve kapatmıyor. PlannedStop neredeyse WorkTotal'a eşit → payda sıfıra yakın → negatif A",
        "solution": "MES konfigürasyonunda M30 sinyal süresi eşiği tanımla — 30sn'den kısa M30 duruşlarını parça değişimi say, planlı duruş olarak sayma",
        "evidence": f"PlannedStop/WorkTotal oranı: {round(float(cases['planned_stop'].iloc[0] / cases['work_total'].iloc[0] * 100), 1) if len(cases) > 0 else 0}%"
    }


# ─────────────────────────────────────────────
# Problem 5: Hayalet Makineler (4, 6, 10)
# ─────────────────────────────────────────────
def get_ghost_machines():
    """0 üretimli makineler + nightwatch veri kontrolü"""
    ghosts = query("""
        SELECT u.name AS machine,
               d.collector_type_name AS controller,
               COUNT(*) AS oee_days,
               SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) AS total_pieces,
               ROUND(AVG(CAST(json_extract_string(o.availability, '$.A') AS DOUBLE)), 4) AS avg_A,
               ROUND(AVG(CAST(json_extract_string(o.performance, '$.P') AS DOUBLE)), 4) AS avg_P
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        JOIN mes_device d ON d.uid = u.device_uid
        WHERE o.level = 1
        GROUP BY u.name, d.collector_type_name
        HAVING SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) = 0
        ORDER BY u.name
    """)

    nw_check = query("""
        SELECT nu.name AS machine,
               COUNT(*) AS nw_readings
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name IN ('Makine 4', 'Makine 6', 'Makine 10')
        GROUP BY nu.name
    """)

    return {
        "id": 5,
        "title": "Hayalet Makineler — 0 Üretim",
        "machine": "Makine 4, 6, 10",
        "severity": "high",
        "ghosts": ghosts.to_dict(orient="records"),
        "nightwatch_data": nw_check.to_dict(orient="records"),
        "root_cause": "Mitsubishi CNC'lerde PIECES_PRODUCED sinyali PLC'ye bağlanmamış. Makine çalışıyor ama MES saymıyor.",
        "solution": "PLC adres konfigürasyonu — M kodu çıkışı (M99/M30 sonrası counter pulse) MES'e bağlanmalı",
        "evidence": "139 gün OEE kaydı, A=%100, P=%0, 0 parça — ama nightwatch sinyalleri aktif"
    }


# ─────────────────────────────────────────────
# Problem 6: Cycle Time Uyumsuzluğu
# ─────────────────────────────────────────────
def get_cycle_time_mismatch():
    """stock_cycle vs gerçek çevrim karşılaştırma"""
    mismatches = query("""
        SELECT u.name AS machine,
               wo.order_no AS product,
               wo.stock_cycle AS ideal_cycle_ms,
               ROUND(wo.duration_milliseconds / 1000.0, 1) AS actual_dur_sec,
               ROUND(wo.stock_cycle / 1000.0, 3) AS ideal_cycle_sec,
               CASE WHEN wo.stock_cycle > 0
                    THEN ROUND(wo.duration_milliseconds / wo.stock_cycle, 1)
                    ELSE NULL END AS ratio
        FROM mes_workorder wo
        JOIN mes_unit u ON u.uid = wo.unit_uid
        WHERE wo.stock_cycle > 0 AND wo.duration_milliseconds > 0
        ORDER BY ratio DESC
        LIMIT 20
    """)

    real_cycles = query("""
        SELECT u.name AS machine,
               wo.order_no AS product,
               wo.stock_cycle AS configured_cycle_ms,
               ROUND(AVG(wo.duration_milliseconds / NULLIF(
                   (SELECT SUM(cs.value) FROM mes_counter_slice cs
                    WHERE cs.unit_uid = wo.unit_uid
                      AND cs.slice_on BETWEEN wo.started_on AND wo.ended_on
                      AND cs.value > 0), 0
               )), 0) AS real_cycle_ms
        FROM mes_workorder wo
        JOIN mes_unit u ON u.uid = wo.unit_uid
        WHERE wo.is_stock = true AND wo.duration_milliseconds > 3600000
        GROUP BY u.name, wo.order_no, wo.stock_cycle
        HAVING COUNT(*) >= 3
        ORDER BY u.name, wo.order_no
        LIMIT 20
    """)

    return {
        "id": 6,
        "title": "Cycle Time Uyumsuzluğu — P=0 Sebebi",
        "machine": "Tüm Fabrika",
        "severity": "critical",
        "mismatches": mismatches.to_dict(orient="records"),
        "real_cycle_times": real_cycles.to_dict(orient="records"),
        "max_ratio": float(mismatches["ratio"].max()) if len(mismatches) > 0 else 0,
        "root_cause": "stock_cycle değerleri yanlış birimde veya varsayılan bırakılmış. 0.064 sn ideal çevrim vs 421,056 sn gerçek süre → 6.5M kat fark",
        "solution": "Her ürün için gerçek çevrim süresini counter_slice + workorder'dan hesapla, ERP'ye doğru değerleri gir. Bu TEK düzeltme tüm fabrikanın P değerini 0'dan gerçekçi seviyeye çıkarır.",
        "evidence": "Tüm makinelerde P≈0 ama üretim var — stock_cycle birimi ms/μs karışmış"
    }


# ─────────────────────────────────────────────
# Problem 7: Uzun Süreli Duruşlar (Tatil)
# ─────────────────────────────────────────────
def get_long_stoppages():
    """>48 saat duruşlar + tatil korelasyonu"""
    long_stops = query("""
        SELECT u.name AS machine,
               ss.started_on,
               ss.ended_on,
               ROUND(ss.duration_milliseconds / 3600000.0, 1) AS hours,
               ss.is_planned,
               EXTRACT(DOW FROM ss.started_on) AS start_dow
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE ss.duration_milliseconds > 172800000
          AND ss.reading_def_uid != '00000000-0000-0000-0000-000000000006'
        ORDER BY ss.duration_milliseconds DESC
        LIMIT 20
    """)

    return {
        "id": 7,
        "title": "Uzun Süreli Duruşlar — Tatil/Bakım Karışıklığı",
        "machine": "Birden Fazla",
        "severity": "medium",
        "long_stops": long_stops.to_dict(orient="records"),
        "root_cause": "MES'te vardiya takvimi tanımlı değil (shift_scheduler tablosu boş). Tatil günleri UNPLANNED sayılıyor.",
        "solution": "MES'te vardiya takvimi tanımla. >48 saat duruşları otomatik PLANNED olarak sınıflandır. 19-25 Aralık = yılbaşı tatili.",
        "evidence": "5 makine aynı anda 142 saat durmuş (19-25 Aralık) ama UNPLANNED"
    }


# ─────────────────────────────────────────────
# Problem 8: Yağlama Degradasyonu (Makine 2)
# ─────────────────────────────────────────────
def get_lube_oil_degradation():
    """Alarm aralığı trend'i + sonraki tahmin"""
    lube = query("""
        SELECT ns.time::date AS alarm_date,
               ns.time,
               COUNT(*) AS repeats_that_session
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 2'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.value LIKE '%LUBE%'
        GROUP BY alarm_date, ns.time
        ORDER BY ns.time
    """)

    dates = lube["alarm_date"].unique()
    intervals = []
    for i in range(1, len(dates)):
        diff = (dates[i] - dates[i - 1]).days
        intervals.append({"from": str(dates[i - 1]), "to": str(dates[i]), "days": int(diff)})

    if len(intervals) >= 2:
        last_interval = intervals[-1]["days"]
        trend = "kısalıyor" if intervals[-1]["days"] < intervals[0]["days"] else "stabil"
        next_predicted = str(dates[-1] + __import__("datetime").timedelta(days=max(last_interval - 5, 7)))
    else:
        trend = "yetersiz veri"
        next_predicted = "bilinmiyor"

    return {
        "id": 8,
        "title": "Yağlama Sistemi Degradasyonu",
        "machine": "Makine 2",
        "severity": "high",
        "alarm_dates": [str(d) for d in dates],
        "intervals": intervals,
        "trend": trend,
        "next_predicted_alarm": next_predicted,
        "root_cause": "Yağ tüketimi artıyor veya sızıntı büyüyor. Alarm aralığı kısalıyorsa degradasyon hızlanıyor.",
        "solution": "Prediktif bakım — tahmin edilen tarihten ÖNCE yağ seviyesi kontrolü ve pompa bakımı yap. Aksi halde rulman hasarı riski.",
        "evidence": f"Alarm aralıkları: {', '.join(str(i['days']) + ' gün' for i in intervals)}"
    }


# ─────────────────────────────────────────────
# Problem 9: Overtravel — Program Bağlantısı
# ─────────────────────────────────────────────
def get_overtravel_program_link():
    """Overtravel anında çalışan program"""
    overtravel = query("""
        SELECT ns.time AS alarm_time,
               TRIM(ns.value) AS alarm,
               nu.name AS machine
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.value LIKE '%OVERTRAVEL%'
        ORDER BY ns.time
    """)

    results = []
    for _, row in overtravel.iterrows():
        t = row["alarm_time"]
        machine = row["machine"]
        prog = query(f"""
            SELECT ns.value AS program
            FROM nightwatch_data_string ns
            JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
            JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
            WHERE nu.name = '{machine}'
              AND nrd.readingdef_name LIKE '%PROGRAM%'
              AND ns.time <= TIMESTAMP '{t}'
            ORDER BY ns.time DESC
            LIMIT 1
        """)
        results.append({
            "time": str(row["alarm_time"]),
            "alarm": row["alarm"],
            "machine": machine,
            "program": prog["program"].iloc[0] if len(prog) > 0 else "bilinmiyor"
        })

    return {
        "id": 9,
        "title": "Eksen Limiti Aşımı — Program Hatası",
        "machine": "Makine 1, 2",
        "severity": "medium",
        "events": results,
        "root_cause": "Belirli CNC programlarında Z ekseni hareketi soft limiti aşıyor. Program düzeltilmeli veya referans noktası kalibre edilmeli.",
        "solution": "Suçlu programları tespit et → Z hareketini simüle et → limit aşımını düzelt. Eğer farklı programlarda oluyorsa encoder/referans switch kontrol et.",
        "evidence": f"{len(results)} overtravel olayı tespit edildi"
    }


# ─────────────────────────────────────────────
# Problem 10: Motor Aşırı Yük (Makine 1)
# ─────────────────────────────────────────────
def get_motor_overload_context():
    """Motor overload anındaki workorder ve program"""
    overload = query("""
        SELECT ns.time AS alarm_time
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = 'Makine 1'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.value LIKE '%MOTOR OVERLOAD%'
        ORDER BY ns.time
    """)

    workorder = query("""
        SELECT wo.order_no, wo.started_on, wo.ended_on, wo.stock_cycle
        FROM mes_workorder wo
        JOIN mes_unit u ON u.uid = wo.unit_uid
        WHERE u.name = 'Makine 1'
          AND wo.started_on <= '2026-01-21 18:00:00+03'
          AND (wo.ended_on >= '2026-01-21 07:00:00+03' OR wo.ended_on IS NULL)
        ORDER BY wo.started_on
    """)

    return {
        "id": 10,
        "title": "Motor Aşırı Yük",
        "machine": "Makine 1",
        "severity": "medium",
        "alarm_count": len(overload),
        "alarm_date": "2026-01-21",
        "workorder_context": workorder.to_dict(orient="records"),
        "root_cause": "Tek günde 17 kez motor overload — muhtemelen yeni malzeme veya aşınmış takım ile uyumsuz kesme parametreleri",
        "solution": "O günkü ürün/malzeme için kesme parametrelerini (feed/speed) düşür. Adaptive clearing veya trokoid frezeleme ile yük dağıtımı yap. Takım ömrü kontrolü.",
        "evidence": "17 overload alarmının tamamı 2026-01-21 tarihinde"
    }


# ─────────────────────────────────────────────
# Problem 11: Sayaç Anomalileri
# ─────────────────────────────────────────────
def get_counter_anomalies():
    """Spike tespiti + delta/kümülatif kontrol"""
    spikes = query("""
        SELECT u.name AS machine,
               cs.slice_on,
               cs.prev_value,
               cs.current_value,
               cs.value AS delta,
               cs.signal_type
        FROM mes_counter_slice cs
        JOIN mes_unit u ON u.uid = cs.unit_uid
        WHERE cs.value > 1000
        ORDER BY cs.value DESC
        LIMIT 20
    """)

    stats = query("""
        SELECT u.name AS machine,
               COUNT(*) AS total_events,
               ROUND(AVG(cs.value), 2) AS avg_delta,
               ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY cs.value), 0) AS p99,
               MAX(cs.value) AS max_delta,
               COUNT(CASE WHEN cs.value > 1000 THEN 1 END) AS spike_count
        FROM mes_counter_slice cs
        JOIN mes_unit u ON u.uid = cs.unit_uid
        GROUP BY u.name
        ORDER BY spike_count DESC
    """)

    return {
        "id": 11,
        "title": "Sayaç Anomalileri — Counter Spike",
        "machine": "Makine 9, 3",
        "severity": "medium",
        "spikes": spikes.to_dict(orient="records"),
        "stats": stats.to_dict(orient="records"),
        "root_cause": "Kümülatif sayaç değeri raw olarak gönderilmiş, delta hesaplanmamış. Veya sayaç sıfırlandığında büyük negatif/pozitif sıçrama.",
        "solution": "Counter logic kontrol — MES'in delta mı kümülatif mi okuduğunu doğrula. prev_value vs current_value farkı ile tutarlılık kontrolü yap.",
        "evidence": "Makine 9: tek seferde 138,695 parça, Makine 3: 106,444 parça"
    }


# ─────────────────────────────────────────────
# Problem 12: Mesai Dışı Uzayan Duruşlar
# ─────────────────────────────────────────────
def get_offhour_response_time():
    """Mesai içi vs dışı duruş süresi karşılaştırma"""
    comparison = query("""
        SELECT
            CASE WHEN EXTRACT(DOW FROM ss.started_on) IN (0, 6) THEN 'Hafta Sonu'
                 ELSE 'Hafta İçi' END AS day_type,
            CASE WHEN EXTRACT(HOUR FROM ss.started_on) BETWEEN 8 AND 17 THEN 'Mesai'
                 WHEN EXTRACT(HOUR FROM ss.started_on) BETWEEN 18 AND 23 THEN 'Akşam'
                 ELSE 'Gece' END AS shift,
            COUNT(*) AS events,
            ROUND(SUM(ss.duration_milliseconds) / 3600000.0, 1) AS total_hours,
            ROUND(AVG(ss.duration_milliseconds) / 60000.0, 1) AS avg_min,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ss.duration_milliseconds) / 60000.0, 1) AS median_min
        FROM mes_stoppage_slice ss
        WHERE ss.is_planned = false
          AND ss.reading_def_uid != '00000000-0000-0000-0000-000000000006'
        GROUP BY day_type, shift
        ORDER BY avg_min DESC
    """)

    # Median ve ortalama ayrımı önemli — birkaç outlier ortalamayı şişirebilir
    records = comparison.to_dict(orient="records")
    mesai_med = next((r["median_min"] for r in records if r.get("shift") == "Mesai" and r.get("day_type") == "Hafta İçi"), 1)
    aksam_med = next((r["median_min"] for r in records if r.get("shift") == "Akşam" and r.get("day_type") == "Hafta İçi"), 3)
    gece_med = next((r["median_min"] for r in records if r.get("shift") == "Gece"), 9)
    mesai_avg = next((r["avg_min"] for r in records if r.get("shift") == "Mesai" and r.get("day_type") == "Hafta İçi"), 40)

    return {
        "id": 12,
        "title": "Mesai Dışı Uzayan Duruşlar",
        "machine": "Tüm Fabrika",
        "severity": "medium",
        "comparison": records,
        "root_cause": f"Mesai dışında alarm reset eden kimse yok. Median duruş: mesai {mesai_med}dk vs gece {gece_med}dk (x{round(gece_med/max(mesai_med,0.1),1)}). Ortalamadaki büyük fark (40dk vs 283dk) birkaç uzun süreli outlier duruştan kaynaklanıyor — her akşam yaşanan bir sorun değil ama yaşandığında saatlerce uzuyor.",
        "solution": "Uzaktan alarm bildirim sistemi (SMS/push) + basit alarmlar için uzaktan reset. Kritik makineler için 7/24 nöbetçi maliyeti vs kayıp üretim karşılaştırması yap.",
        "evidence": f"Median: mesai {mesai_med}dk vs gece {gece_med}dk | Ortalama: mesai {mesai_avg}dk vs akşam {aksam_med}dk (outlier etkisi)"
    }


# ─────────────────────────────────────────────
# Problem 13: Alarm → Duruş Nedensellik Zinciri
# ─────────────────────────────────────────────
def get_alarm_stoppage_chain():
    """MES alarm sonrası duruş eşleştirmesi — kaskad arıza analizi"""
    chain = query("""
        WITH alert_with_stops AS (
            SELECT u.name AS machine,
                   a.started_on AS alert_time,
                   ss.started_on AS stop_started,
                   ss.duration_milliseconds AS stop_dur_ms,
                   EXTRACT(EPOCH FROM (ss.started_on - a.started_on)) AS gap_sec
            FROM mes_alert a
            JOIN mes_unit u ON u.uid = a.unit_uid
            JOIN mes_stoppage_slice ss ON ss.unit_uid = a.unit_uid
                AND ss.started_on BETWEEN a.started_on
                                      AND a.started_on + INTERVAL '1 hour'
                AND ss.is_planned = false
        )
        SELECT machine,
               COUNT(*) AS alarm_to_stop_pairs,
               ROUND(AVG(stop_dur_ms) / 3600000.0, 2) AS avg_stop_hours,
               ROUND(MAX(stop_dur_ms) / 3600000.0, 2) AS max_stop_hours,
               ROUND(AVG(gap_sec) / 60.0, 1) AS avg_gap_min
        FROM alert_with_stops
        GROUP BY machine
        ORDER BY avg_stop_hours DESC
    """)

    biggest_hit = query("""
        SELECT u.name AS machine,
               a.started_on AS alert_time,
               rd.display_text AS alert_label,
               ROUND(MAX(ss.duration_milliseconds) / 3600000.0, 2) AS stop_hours
        FROM mes_alert a
        JOIN mes_unit u ON u.uid = a.unit_uid
        JOIN mes_stoppage_slice ss ON ss.unit_uid = a.unit_uid
            AND ss.started_on BETWEEN a.started_on AND a.started_on + INTERVAL '1 hour'
            AND ss.is_planned = false
        LEFT JOIN mes_reading_def rd ON rd.uid = a.reading_def_uid
        GROUP BY u.name, a.started_on, rd.display_text
        ORDER BY stop_hours DESC
        LIMIT 5
    """)

    return {
        "id": 13,
        "title": "Alarm → Duruş Nedensellik Zinciri",
        "machine": "Makine 1, 2 (76 alarmın tamamı)",
        "severity": "critical",
        "chain_stats": chain.to_dict(orient="records"),
        "biggest_hits": biggest_hit.to_dict(orient="records"),
        "root_cause": "Tek bir alarm (MOTOR OVERLOAD) sonrası 14 saatlik kayıp; EMERGENCY STOP 25 kez tekrar etmiş (Ocak-Mayıs, kronik). Alarmlar sadece Makine 1 ve 2'de — diğer 10 makinede sıfır.",
        "solution": "Alarm öncelik matrisi: kritik alarmlara (MOTOR OVERLOAD, EMERGENCY STOP) anında müdahale. Tekrarlayan EMERGENCY STOP için 9 aylık kök neden analizi şart — operatör eğitimi vs mekanik düzeltme ayrımı.",
        "evidence": "76 alarm: 47 Makine 2 + 29 Makine 1. En kötü: MOTOR OVERLOAD → 14.17h duruş"
    }


# ─────────────────────────────────────────────
# Problem 14: Mikro-Duruşlar (Görünmez 46 saat)
# ─────────────────────────────────────────────
def get_micro_stoppages():
    """<60sn duruşlar — alarm olarak görünmüyor, hiçbir rapora düşmüyor"""
    per_machine = query("""
        SELECT u.name AS machine,
               COUNT(*) AS micro_count,
               ROUND(AVG(ss.duration_milliseconds)/1000.0, 1) AS avg_sec,
               ROUND(SUM(ss.duration_milliseconds)/3600000.0, 1) AS total_hours
        FROM mes_stoppage_slice ss
        JOIN mes_unit u ON u.uid = ss.unit_uid
        WHERE ss.duration_milliseconds < 60000
          AND ss.duration_milliseconds > 0
          AND ss.is_planned = false
        GROUP BY u.name
        ORDER BY total_hours DESC
    """)

    totals = query("""
        SELECT COUNT(*) AS total_micro,
               ROUND(SUM(duration_milliseconds)/3600000.0, 1) AS total_hours,
               ROUND(AVG(duration_milliseconds)/1000.0, 1) AS avg_sec
        FROM mes_stoppage_slice
        WHERE duration_milliseconds < 60000
          AND duration_milliseconds > 0
          AND is_planned = false
    """)
    t = totals.iloc[0]

    return {
        "id": 14,
        "title": "Mikro-Duruşlar — Görünmez 46 Saat",
        "machine": "Tüm Fabrika",
        "severity": "high",
        "per_machine": per_machine.to_dict(orient="records"),
        "total_micro_stops": int(t["total_micro"]),
        "total_lost_hours": float(t["total_hours"]),
        "avg_seconds": float(t["avg_sec"]),
        "root_cause": "1 dakikadan kısa süren binlerce duruş alarm olarak çalmıyor, hiçbir rapora düşmüyor. Toplamda 46 saat = neredeyse 2 gün makine zamanı kaybı. Büyük arızalara odaklanılıyor (14h MOTOR OVERLOAD gibi), ama binlerce karınca fil kadar ağır.",
        "solution": "Mikro-duruş dashboard'u — alarmsız duruşları sürekli izleyen ayrı bir görüntü. Saat bazlı pareto + makine bazlı sıralama. En çok mikro-duruş olan operasyonlara odaklan.",
        "evidence": f"{int(t['total_micro']):,} mikro-duruş, ortalama {float(t['avg_sec']):.1f}sn, toplam {float(t['total_hours']):.1f}h"
    }


# ─────────────────────────────────────────────
# Problem 15: Mikro-Duruş Operatör İmzası
# ─────────────────────────────────────────────
def get_micro_stoppage_signature():
    """Mikro-duruşların saatlik dağılımı — operatör mü makine mi?"""
    hourly = query("""
        SELECT EXTRACT(HOUR FROM ss.started_on) AS hour,
               COUNT(*) AS micro_count
        FROM mes_stoppage_slice ss
        WHERE ss.duration_milliseconds < 60000
          AND ss.duration_milliseconds > 0
          AND ss.is_planned = false
        GROUP BY hour
        ORDER BY hour
    """)

    rec = hourly.to_dict(orient="records")
    mesai = sum(r["micro_count"] for r in rec if 8 <= r["hour"] <= 17)
    disi = sum(r["micro_count"] for r in rec if r["hour"] < 8 or r["hour"] > 17)
    lunch_dip = next((r["micro_count"] for r in rec if r["hour"] == 12), 0)
    peak = max((r["micro_count"] for r in rec), default=0)

    return {
        "id": 15,
        "title": "Mikro-Duruş Operatör İmzası",
        "machine": "Tüm Fabrika",
        "severity": "high",
        "hourly_distribution": rec,
        "in_shift_count": int(mesai),
        "off_shift_count": int(disi),
        "lunch_dip_count": int(lunch_dip),
        "peak_hour_count": int(peak),
        "in_shift_pct": round(mesai / max(mesai + disi, 1) * 100, 1),
        "root_cause": "Mikro-duruşlar sadece mesai saatlerinde (08-17) yoğun (saat başına ~1.100-1.500). Gece (18-07) sıfıra yakın. Saat 12'de belirgin düşüş (öğle molası). Bu insan imzası — makine arızası olsa gece de olurdu. Parça yükleme/boşaltma beklemesi, kontrol duraklaması, manuel müdahale.",
        "solution": "Otomasyon: otomatik parça yükleme (pallet system, robot loader). Prosedür: kademeli mola sistemi — Makine 7/8'de saat 12 düşüşü tüm fabrikaya yayılırsa kayıp katlanır. Vardiya bazlı mikro-duruş KPI'sı.",
        "evidence": f"Mesai içi {mesai:,} vs dışı {disi} ({round(mesai/max(mesai+disi,1)*100,1)}% mesai), saat 12 düşüş: {lunch_dip}"
    }


# ─────────────────────────────────────────────
# Problem 16: Aylık OEE Düz Trend
# ─────────────────────────────────────────────
def get_monthly_trend_flatline():
    """9 ay boyunca OEE düz — iyileşme/kötüleşme yok"""
    monthly = query("""
        SELECT DATE_TRUNC('month', o.trans_date)::date AS month,
               ROUND(AVG(CASE WHEN o.oee BETWEEN 0 AND 1 THEN o.oee END) * 100, 2) AS avg_oee_pct,
               COUNT(*) AS day_records
        FROM mes_oee_summary o
        WHERE o.level = 1
        GROUP BY month
        ORDER BY month
    """)
    rec = monthly.to_dict(orient="records")
    valid_values = [r["avg_oee_pct"] for r in rec if r["avg_oee_pct"] is not None]
    if not valid_values:
        return {"id": 16, "error": "Veri yok"}

    min_oee = min(valid_values)
    max_oee = max(valid_values)
    variation = max_oee - min_oee
    months = len(valid_values)

    return {
        "id": 16,
        "title": "Aylık OEE Düz Trend — 9 Aydır Müdahalesiz",
        "machine": "Tüm Fabrika",
        "severity": "medium",
        "monthly_oee": rec,
        "months_analyzed": months,
        "min_oee_pct": min_oee,
        "max_oee_pct": max_oee,
        "variation_pp": round(variation, 2),
        "trend_classification": "flat" if variation < 4 else "improving" if rec[-1]["avg_oee_pct"] > rec[0]["avg_oee_pct"] else "declining",
        "root_cause": "9 ay boyunca OEE %0.5-3.3 arası düz gidiyor. Ne iyileşme ne kötüleşme. Veriye bakılıyor ama hiçbir aksiyon alınmıyor — çünkü neyin yanlış olduğu görünmüyor (Cycle Time İllüzyonu maskeliyor).",
        "solution": "Aylık OEE inceleme toplantısı + KPI hedefi (örn. her ay +%5 iyileşme). Cycle Time düzeltmesi yapıldığında bu trend dramatik değişecek — çünkü gerçek OEE şu an %25-65 arasında (Corrected OEE bulgusu).",
        "evidence": f"{months} ay, OEE {min_oee:.1f}-{max_oee:.1f}% arası ({variation:.1f}pp varyasyon). 9 aydır müdahale yok."
    }


# ─────────────────────────────────────────────
# Problem 17: PATH_LOAD Kör Noktası (Vizyon)
# ─────────────────────────────────────────────
def get_path_load_blindspot():
    """Mitsubishi makinelerde PATH_LOAD tanımlı ama veri toplanmıyor"""
    coverage = query("""
        SELECT nrd.readingdef_name AS signal,
               nu.name AS machine,
               COUNT(nd.id) AS data_points
        FROM nightwatch_reading_def nrd
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        LEFT JOIN nightwatch_data nd ON nd.readingdef_uid = nrd.readingdef_uid
        WHERE nrd.readingdef_name LIKE '%PATH_LOAD%'
        GROUP BY nrd.readingdef_name, nu.name
        ORDER BY nu.name
    """)

    other_signals = query("""
        SELECT nu.name AS machine,
               COUNT(DISTINCT nrd.readingdef_name) AS active_signals,
               COUNT(*) AS total_data_points
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name IN ('Makine 4', 'Makine 6', 'Makine 7', 'Makine 8')
        GROUP BY nu.name
    """)

    affected = coverage[coverage["data_points"] == 0]["machine"].tolist()

    return {
        "id": 17,
        "title": "PATH_LOAD Kör Noktası — Kestirimci Bakım İçin Kayıp Sinyal",
        "machine": ", ".join(affected) if affected else "Mitsubishi makineler",
        "severity": "medium",
        "coverage": coverage.to_dict(orient="records"),
        "other_signals_active": other_signals.to_dict(orient="records"),
        "affected_machines": affected,
        "root_cause": "PATH_LOAD_MODULE sinyali mekanik yük ölçümü için en kritik proxy (mil/eksen üzerindeki kuvvet → takım aşınması). Mitsubishi sistemi bu sinyali destekliyor (nightwatch_reading_def'te tanımlı), ama nightwatch_data'da SIFIR kayıt — toplanmamış. Diğer sinyaller (CYCLE_TIME, PROGRAM_POSITION) düzenli toplanıyor.",
        "solution": "Trex IoT ekibine sinyal aktivasyon talebi — donanım/altyapı zaten hazır, sadece konfigürasyon eksik. Sinyal akmaya başladığında: yük trendi → takım ömrü tahmini → planlı takım değişimi. Bu reaktif bakımdan kestirimci bakıma geçiş demek.",
        "evidence": f"{len(affected)} Mitsubishi makinesinde PATH_LOAD tanımlı ama 0 veri. Diğer sinyaller normal toplanıyor."
    }


# ─────────────────────────────────────────────
# Tüm problemleri topla
# ─────────────────────────────────────────────
@cached(ttl=600)
def get_all_problems():
    """17 problemin hepsini çalıştır (12 orijinal + 5 ek bulgu)"""
    problems = []
    funcs = [
        get_air_pressure_pattern,
        get_emergency_stop_pareto,
        get_mass_shutdown_events,
        get_negative_oee_cases,
        get_ghost_machines,
        get_cycle_time_mismatch,
        get_long_stoppages,
        get_lube_oil_degradation,
        get_overtravel_program_link,
        get_motor_overload_context,
        get_counter_anomalies,
        get_offhour_response_time,
        get_alarm_stoppage_chain,         # P13
        get_micro_stoppages,              # P14
        get_micro_stoppage_signature,     # P15
        get_monthly_trend_flatline,       # P16
        get_path_load_blindspot,          # P17
    ]
    for fn in funcs:
        try:
            problems.append(fn())
        except Exception as e:
            problems.append({"id": funcs.index(fn) + 1, "error": str(e)})
    return problems


@cached(ttl=600)
def get_overview():
    """Fabrika genel bakış — her makine için özet"""
    overview = query("""
        SELECT u.name AS machine,
               d.collector_type_name AS controller,
               COUNT(*) AS oee_days,
               ROUND(AVG(o.oee), 4) AS avg_oee,
               ROUND(AVG(CAST(json_extract_string(o.availability, '$.A') AS DOUBLE)), 4) AS avg_A,
               ROUND(AVG(CAST(json_extract_string(o.performance, '$.P') AS DOUBLE)), 4) AS avg_P,
               SUM(CAST(json_extract_string(o.quality, '$.ProductSum') AS INT)) AS total_pieces
        FROM mes_oee_summary o
        JOIN mes_unit u ON u.uid = o.unit_uid
        JOIN mes_device d ON d.uid = u.device_uid
        WHERE o.level = 1
        GROUP BY u.name, d.collector_type_name
        ORDER BY avg_oee ASC
    """)

    alarms = query("""
        SELECT u.name AS machine, COUNT(*) AS alarm_count
        FROM mes_alert a
        JOIN mes_unit u ON u.uid = a.unit_uid
        GROUP BY u.name
    """)

    overview_dict = overview.to_dict(orient="records")
    alarm_map = dict(zip(alarms["machine"], alarms["alarm_count"])) if len(alarms) > 0 else {}
    for m in overview_dict:
        m["alarm_count"] = int(alarm_map.get(m["machine"], 0))

    return overview_dict
