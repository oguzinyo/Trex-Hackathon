"""
Predictive Maintenance — Alarm öncesi sensor pattern'lerinden risk tahmini.

İki model:
1. Cycle-time anomaly model (Makine 7 — Mitsubishi)
   - Random Forest classifier: cycle time window → next-alarm risk
2. Alarm-recurrence forecast (Makine 1 — AIR PRESSURE)
   - Sabah saatleri pattern → bir sonraki alarm tahmini

Tüm modeller veriden öğrenir, scikit-learn kullanır.
"""
import numpy as np
import pandas as pd
import math
from datetime import timedelta
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

from src.core.database import query
from src.core.cache import cached


def _safe_int(x, default=0):
    try:
        return int(x)
    except Exception:
        return default


@cached(ttl=900)
def cycle_time_failure_model(machine="Makine 7", lookback_minutes=60, horizon_minutes=15):
    """
    Cycle Time → Failure Risk Modeli

    Yaklaşım:
    - Alarm timeleri al
    - Her alarmdan önceki `lookback_minutes` cycle time pencere özelliklerini topla
    - Pozitif örnek: alarm öncesi pencereler
    - Negatif örnek: rastgele alarm-olmayan pencereler
    - Random Forest binary classification

    Features (window içinde):
    - mean, std, max, min cycle time
    - p95, p5 (kuyruk değerleri)
    - trend (linear slope)
    - rate of increase (last/first)
    """

    # 1. Alarm zamanları (Mitsubishi alarmı yoksa boş döner)
    alarms = query(f"""
        SELECT ns.time AS t
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine}'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
        ORDER BY ns.time
    """)

    # 2. Cycle time verisi
    cycles = query(f"""
        SELECT nd.time AS t, nd.value AS v
        FROM nightwatch_data nd
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = nd.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine}'
          AND nrd.readingdef_name LIKE '%CYCLE_TIME%'
          AND nd.value > 0
        ORDER BY nd.time
    """)

    if len(cycles) < 200:
        return {
            "status": "insufficient_data",
            "machine": machine,
            "samples_available": int(len(cycles)),
            "alarms_available": int(len(alarms)),
            "reason": "Cycle time veri noktası 200'den az",
        }

    cycles["t"] = pd.to_datetime(cycles["t"])
    cycles = cycles.set_index("t").sort_index()

    # 3. Mitsubishi için alarm yoksa cycle-time anomaly proxy oluştur
    # Yüksek z-score'lu noktaları "failure" olarak işaretle
    cycle_values = cycles["v"].astype(float)
    mu, sigma = cycle_values.mean(), cycle_values.std()
    if sigma == 0:
        return {"status": "no_variance", "machine": machine}

    z_scores = (cycle_values - mu) / sigma
    anomaly_threshold = 2.5
    anomaly_mask = (z_scores.abs() > anomaly_threshold)
    anomaly_times = cycles.index[anomaly_mask].tolist()

    if len(alarms) > 0:
        alarms["t"] = pd.to_datetime(alarms["t"])
        positive_events = list(alarms["t"]) + anomaly_times
    else:
        positive_events = anomaly_times

    if len(positive_events) < 20:
        return {
            "status": "insufficient_failures",
            "machine": machine,
            "positive_events": len(positive_events),
            "reason": "Pozitif örnek sayısı 20'nin altında",
        }

    # 4. Feature extraction
    def extract_features(window):
        if len(window) < 5:
            return None
        v = window["v"].astype(float).values
        if v.size == 0:
            return None
        try:
            slope = np.polyfit(np.arange(len(v)), v, 1)[0]
        except Exception:
            slope = 0
        return {
            "mean": float(np.mean(v)),
            "std": float(np.std(v)),
            "max": float(np.max(v)),
            "min": float(np.min(v)),
            "p95": float(np.percentile(v, 95)),
            "p5": float(np.percentile(v, 5)),
            "slope": float(slope),
            "trend_ratio": float(v[-1] / max(v[0], 1)) if len(v) > 1 else 1.0,
            "count": int(len(v)),
        }

    # Pozitif örnekler — alarm öncesi pencere
    positives = []
    for et in positive_events[:200]:
        win_start = et - timedelta(minutes=lookback_minutes)
        window = cycles.loc[(cycles.index >= win_start) & (cycles.index < et)]
        feat = extract_features(window)
        if feat:
            feat["label"] = 1
            positives.append(feat)

    # Negatif örnekler — rastgele zaman (pozitif pencerelerden uzak)
    positive_set = set(positive_events)
    sample_times = cycles.index[::max(1, len(cycles) // 500)][:300]
    negatives = []
    for t in sample_times:
        if any(abs((t - pe).total_seconds()) < 3600 for pe in positive_events[:100]):
            continue
        win_start = t - timedelta(minutes=lookback_minutes)
        window = cycles.loc[(cycles.index >= win_start) & (cycles.index < t)]
        feat = extract_features(window)
        if feat:
            feat["label"] = 0
            negatives.append(feat)
        if len(negatives) >= len(positives):
            break

    if len(positives) < 10 or len(negatives) < 10:
        return {
            "status": "insufficient_balanced_samples",
            "machine": machine,
            "positives": len(positives),
            "negatives": len(negatives),
        }

    # 5. Train/test split
    df = pd.DataFrame(positives + negatives)
    feature_cols = ["mean", "std", "max", "min", "p95", "p5", "slope", "trend_ratio", "count"]
    X = df[feature_cols].values
    y = df["label"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    # 6. Random Forest
    model = RandomForestClassifier(
        n_estimators=120, max_depth=8, min_samples_leaf=3,
        random_state=42, class_weight="balanced"
    )
    model.fit(X_train, y_train)

    # 7. Performance metrics
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    try:
        auc = float(roc_auc_score(y_test, y_prob))
    except Exception:
        auc = 0.5

    metrics = {
        "auc_roc": round(auc, 3),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 3),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 3),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 3),
    }

    feature_importance = sorted(
        [(name, round(float(imp), 3)) for name, imp in zip(feature_cols, model.feature_importances_)],
        key=lambda x: -x[1]
    )

    # 8. Current risk — son penceredeki tahmin
    last_time = cycles.index[-1]
    last_window = cycles.loc[cycles.index >= last_time - timedelta(minutes=lookback_minutes)]
    last_feat = extract_features(last_window)
    current_risk = None
    if last_feat:
        X_now = np.array([[last_feat[c] for c in feature_cols]])
        current_risk = float(model.predict_proba(X_now)[0, 1])

    return {
        "status": "trained",
        "machine": machine,
        "model_type": "RandomForestClassifier",
        "lookback_minutes": lookback_minutes,
        "horizon_minutes": horizon_minutes,
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "positives": int(sum(y)),
        "negatives": int(len(y) - sum(y)),
        "metrics": metrics,
        "feature_importance": feature_importance,
        "current_risk_score": round(current_risk, 3) if current_risk is not None else None,
        "risk_level": (
            "HIGH" if current_risk and current_risk > 0.7
            else "MEDIUM" if current_risk and current_risk > 0.4
            else "LOW"
        ) if current_risk is not None else "UNKNOWN",
        "interpretation": (
            "Bu model son 60 dakikalık cycle-time pencere istatistiklerine bakarak "
            "önümüzdeki dönemde anomali/arıza olasılığını tahmin eder."
        ),
    }


@cached(ttl=900)
def alarm_recurrence_forecast(machine="Makine 1", alarm_keyword="AIR PRESSURE"):
    """
    Alarm tekrarlama tahmini — geçmiş pattern'den bir sonraki alarm günü/saati

    Yaklaşım:
    - Alarm zamanlarını al
    - Günlük frekans hesapla (saat-of-day dağılımı)
    - Aralık histogramı (inter-arrival time)
    - Median + 95th percentile aralık tahmini

    Bu basit ama açıklanabilir bir survival-analysis yaklaşımı.
    """
    alarms = query(f"""
        SELECT ns.time AS t
        FROM nightwatch_data_string ns
        JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid = ns.readingdef_uid
        JOIN nightwatch_unit nu ON nu.id = nrd.unit_id
        WHERE nu.name = '{machine}'
          AND nrd.readingdef_name = 'ALM_ARR_MSG'
          AND ns.value LIKE '%{alarm_keyword}%'
        ORDER BY ns.time
    """)
    n = len(alarms)
    if n < 10:
        return {
            "status": "insufficient_data", "machine": machine,
            "alarm": alarm_keyword, "samples": int(n),
        }

    alarms["t"] = pd.to_datetime(alarms["t"])
    times = alarms["t"].sort_values()

    # Inter-arrival times (gün cinsinden)
    intervals = times.diff().dropna().dt.total_seconds() / 3600
    median_hours = float(intervals.median())
    p95_hours = float(intervals.quantile(0.95))
    p5_hours = float(intervals.quantile(0.05))

    # Saat-of-day dağılımı
    hours = times.dt.hour
    hour_counts = hours.value_counts().sort_index()
    top_hour = int(hour_counts.idxmax())
    top_hour_share = float(hour_counts.max() / n)

    last_time = times.iloc[-1]
    expected_next_median = last_time + timedelta(hours=median_hours)
    expected_next_p5 = last_time + timedelta(hours=p5_hours)
    expected_next_p95 = last_time + timedelta(hours=p95_hours)

    # Güven: pattern konsantrasyonu + sample size
    sample_factor = min(1.0, n / 100)
    concentration_factor = top_hour_share
    forecast_confidence = sample_factor * (0.4 + 0.6 * concentration_factor)

    return {
        "status": "success",
        "machine": machine,
        "alarm_keyword": alarm_keyword,
        "total_alarms": int(n),
        "last_alarm_time": str(last_time),
        "median_interval_hours": round(median_hours, 1),
        "p5_interval_hours": round(p5_hours, 1),
        "p95_interval_hours": round(p95_hours, 1),
        "preferred_hour": top_hour,
        "preferred_hour_share": round(top_hour_share, 3),
        "expected_next_alarm_median": str(expected_next_median),
        "expected_next_window": [str(expected_next_p5), str(expected_next_p95)],
        "forecast_confidence": round(forecast_confidence, 3),
        "method": "Empirical survival + hour-of-day concentration",
    }


@cached(ttl=900)
def fleet_risk_summary():
    """Tüm makineler için risk özeti — predictive view"""
    machines_to_check = ["Makine 1", "Makine 7"]
    results = []
    for m in machines_to_check:
        if m == "Makine 7":
            r = cycle_time_failure_model(m)
        else:
            r = alarm_recurrence_forecast(m, "AIR PRESSURE")
        results.append({"machine": m, "model": r.get("model_type") or "recurrence", "data": r})
    return {"fleet_risk": results}
