"""
Critic Agent — Reporter çıktısını veri kanıtlarıyla doğrular.

Kontroller:
1. Raporda kullanılan sayılar kanıt setinde geçiyor mu?
2. Halüsinasyon: kanıt yokken yapılmış iddia var mı?
3. "Varsayım" etiketi finansal değerlerde var mı?
4. Eksik agent çıktısı referansı var mı?
"""
import re


_NUMBER_RE = re.compile(r"(?<![A-Za-z])([0-9]+(?:[.,][0-9]+)?)(\s*(%|pp|TL|₺|saat|dk|sn|gün|parça|alarm))?", re.IGNORECASE)


def _extract_numbers_from_report(report: str):
    """Rapordan tüm sayısal iddiaları çıkar"""
    numbers = []
    for m in _NUMBER_RE.finditer(report or ""):
        try:
            v = float(m.group(1).replace(",", "."))
            numbers.append({"value": v, "unit": (m.group(3) or "").strip().lower()})
        except Exception:
            continue
    return numbers


def _collect_evidence_numbers(rca_result, whatif_result, financial_result, context_result):
    """Tüm agent çıktılarından sayısal kanıtları topla"""
    evidence_numbers = set()

    # RCA evidence_items içindeki sayılar
    for p in (rca_result or {}).get("problems", []):
        for ev in (p.get("evidence_items") or []):
            for m in _NUMBER_RE.finditer(str(ev)):
                try:
                    evidence_numbers.add(round(float(m.group(1).replace(",", ".")), 1))
                except Exception:
                    pass
        # statistical_details içindeki sample_size
        sd = p.get("statistical_details") or {}
        for v in sd.values():
            if isinstance(v, (int, float)):
                evidence_numbers.add(round(float(v), 1))

    # WhatIf delta'lar
    for s in (whatif_result or {}).get("scenarios", []):
        for k in ["delta_oee", "delta_A", "delta_P", "recovered_hours"]:
            v = s.get(k)
            if isinstance(v, (int, float)):
                evidence_numbers.add(round(float(v), 3))
                evidence_numbers.add(round(float(v) * 100, 1))

    # Financial impact
    impact = (financial_result or {}).get("impact") or {}
    for k, v in impact.items():
        if isinstance(v, (int, float)):
            evidence_numbers.add(round(float(v), 1))

    # EventContext kanıtları
    if context_result:
        for ev in (context_result.get("evidence") or []):
            for m in _NUMBER_RE.finditer(str(ev)):
                try:
                    evidence_numbers.add(round(float(m.group(1).replace(",", ".")), 1))
                except Exception:
                    pass

    return evidence_numbers


def run(report, rca_result=None, whatif_result=None, financial_result=None, context_result=None):
    """
    Raporu kanıt setiyle karşılaştır — hallucination ve eksik etiket tespit et.
    """
    if not report or not isinstance(report, str):
        return {
            "agent": "Critic",
            "status": "no_report",
            "issues": [{"type": "missing_report", "severity": "critical"}],
            "score": 0,
        }

    report_numbers = _extract_numbers_from_report(report)
    evidence_set = _collect_evidence_numbers(rca_result, whatif_result, financial_result, context_result)
    evidence_rounded = {round(n, 1) for n in evidence_set}

    issues = []

    # 1) Halüsinasyon kontrolü — büyük sayıların kanıt setinde olup olmadığı
    large_unverified = 0
    verified = 0
    for n in report_numbers:
        if n["value"] < 5:
            continue  # Section numaraları
        rounded = round(n["value"], 1)
        if rounded in evidence_rounded:
            verified += 1
        else:
            # Tam eşleşme yoksa toleranslı bakış (±%5)
            close = any(abs(rounded - ev) / max(abs(ev), 1) < 0.05 for ev in evidence_rounded)
            if not close:
                large_unverified += 1

    if large_unverified > 5:
        issues.append({
            "type": "potential_hallucination",
            "severity": "high",
            "detail": f"Raporda {large_unverified} adet sayının kanıt setinde tam karşılığı yok",
        })

    # 2) Varsayım etiketi kontrolü
    financial = (financial_result or {}).get("impact")
    if financial:
        has_assumption_label = any(
            tag in report.lower()
            for tag in ["varsayım", "varsayim", "varsayımsal", "assumption-based", "varsayımdır"]
        )
        if not has_assumption_label:
            issues.append({
                "type": "missing_assumption_label",
                "severity": "medium",
                "detail": "Finansal sayılar var ama 'varsayım' etiketi rapora geçmemiş",
            })

    # 3) Başlık eksikliği
    required_headings = ["Genel Durum", "Kök Neden", "Kanıt", "OEE", "Finansal", "Aksiyon"]
    missing_headings = [h for h in required_headings if h.lower() not in report.lower()]
    if len(missing_headings) >= 3:
        issues.append({
            "type": "missing_structure",
            "severity": "medium",
            "detail": f"Beklenen başlıkların {len(missing_headings)}'si eksik: {missing_headings}",
        })

    # 4) Çok kısa rapor
    if len(report.strip()) < 200:
        issues.append({
            "type": "too_short",
            "severity": "low",
            "detail": f"Rapor uzunluğu {len(report)} karakter — çok kısa",
        })

    # Skor: 100 - sorun ağırlığı
    sev_weight = {"critical": 50, "high": 20, "medium": 10, "low": 5}
    deduction = sum(sev_weight.get(i["severity"], 5) for i in issues)
    score = max(0, 100 - deduction)

    verification_rate = (verified / max(verified + large_unverified, 1)) if report_numbers else 1.0

    return {
        "agent": "Critic",
        "status": "ok" if score >= 70 else "warning" if score >= 40 else "failed",
        "score": score,
        "issues": issues,
        "verification_rate": round(verification_rate, 3),
        "stats": {
            "numbers_in_report": len(report_numbers),
            "verified_numbers": verified,
            "unverified_numbers": large_unverified,
            "evidence_numbers_pool_size": len(evidence_rounded),
        },
        "recommendation": (
            "Raporu olduğu gibi kullan" if score >= 70 else
            "Rapor bazı yerlerde kanıt eksiği gösteriyor — tekrar üret veya manuel düzenle" if score >= 40 else
            "Rapor kalitesi düşük — pipeline'ı tekrar çalıştır"
        ),
    }
