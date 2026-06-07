"""
Reporter Agent — LLM ile tüm bulguları birleştirip Türkçe rapor üretir
"""
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from config.settings import LLM_MODEL, LLM_TEMPERATURE


def _get_llm():
    return ChatOllama(model=LLM_MODEL, temperature=LLM_TEMPERATURE)


def _fallback_report(rca_result, whatif_result, financial_result=None, prioritizer_result=None, context_result=None):
    top = rca_result.get("top_issue") or {}
    event = (context_result or {}).get("event") or {}
    actions = (prioritizer_result or {}).get("top_actions", [])
    financial = (financial_result or {}).get("impact") or {}

    best_scenario = None
    scenarios = whatif_result.get("scenarios", [])
    if scenarios:
        best_scenario = max(scenarios, key=lambda s: s.get("delta_oee", 0) or 0)

    lines = [
        "1. Genel Durum",
        f"Hedef makine: {whatif_result.get('machine', '-')}. Öncelikli kök neden: {top.get('title', 'Belirlenemedi')}.",
        "",
        "2. En Kritik Kök Neden",
        f"{top.get('root_cause', 'Kök neden hipotezi bulunamadı')}",
        f"Güven skoru: {top.get('confidence', '-')}",
        "",
        "3. Kanıtlar",
    ]
    if event:
        lines.append(f"Kanıt penceresi: {event.get('time')} - {event.get('alarm')}")
    for e in top.get("evidence_items", [])[:3]:
        lines.append(f"Kanıt: {e}")
    lines.append("")
    lines.append("4. OEE Etkisi")
    if best_scenario:
        lines.append(f"Senaryo: {best_scenario.get('scenario')}")
        lines.append(f"Delta OEE: {best_scenario.get('delta_oee', 0)}")
    lines.append(f"Toplam OEE iyileştirme potansiyeli: {whatif_result.get('total_oee_improvement', 0)}")
    if financial:
        lines.append("")
        lines.append("5. Finansal Etki")
        lines.append(f"Günlük net fayda: {financial.get('net_benefit_per_day', 0)} TL")
        lines.append(f"Geri ödeme: {financial.get('payback_days', 0)} gün")
        lines.append("Finansal değerler varsayımsal maliyet/marj girdileriyle hesaplanmıştır.")
    if actions:
        lines.append("")
        lines.append("6. İlk 3 Aksiyon")
        for a in actions[:3]:
            lines.append(f"- {a.get('title')} | skor {a.get('score')} | confidence {a.get('confidence')}")
    return "\n".join(lines)


def run(detector_result, rca_result, whatif_result, machine=None, context_result=None, financial_result=None, prioritizer_result=None):
    """Raporcu — Tüm bulguları LLM ile birleştirip Türkçe rapor üretir"""

    # Summarize inputs for the LLM. Instructions are in English for stricter adherence;
    # report headings and final output remain Turkish for the user/jury.
    context = f"""
You are a CNC manufacturing, RCA, and OEE decision-support specialist.
Write the final report in Turkish for a factory manager.
Use only the evidence and numbers provided below.
Do not invent missing measurements, costs, annual savings, or causal claims.
Clearly label financial values as assumptions, not measured dataset facts.

## Sağlık Durumu (Detector Agent)
- Toplam makine: {detector_result['summary']['total_machines']}
- Kritik makine sayısı: {detector_result['summary']['critical_count']}
- Kritik makineler: {', '.join(detector_result['summary']['critical_machines'])}
- Uyarı makineler: {', '.join(detector_result['summary']['warning_machines'])}

## Kök Neden Analizi (RCA Agent)
- Tespit edilen toplam problem: {rca_result['total_problems']}
- İlgili problem sayısı: {rca_result['relevant_problems']}
"""

    if context_result:
        event = context_result.get("event") or {}
        context += f"""

## Event Context Agent
- Olay penceresi: {context_result.get('context_window')}
- Olay zamanı: {event.get('time', '-')}
- Alarm: {event.get('alarm', '-')}
- Kanıtlar: {'; '.join(context_result.get('evidence', []))}
"""

    for p in rca_result['problems'][:5]:
        context += f"\n### {p.get('title', 'Bilinmeyen')}"
        context += f"\n- Makine: {p.get('machine', '?')}"
        context += f"\n- Severity: {p.get('severity', '?')}"
        context += f"\n- Confidence: {p.get('confidence', '?')}"
        context += f"\n- Impact Area: {p.get('impact_area', '?')}"
        context += f"\n- Kök Neden: {p.get('root_cause', '?')}"
        context += f"\n- Çözüm: {p.get('solution', '?')}"
        for ev in p.get('evidence_items', [])[:3]:
            context += f"\n- Kanıt: {ev}"

    context += f"""

## What-If Simülasyon (WhatIf Agent)
- Hedef makine: {whatif_result['machine']}
- Seçilen senaryolar: {', '.join(whatif_result.get('selected_scenarios', []))}
- Toplam OEE iyileştirme potansiyeli: {whatif_result['total_oee_improvement']}
"""

    for s in whatif_result['scenarios']:
        context += f"\n- {s['scenario']}: ΔOEE = {s.get('delta_oee', 0)} | Neden: {s.get('reason', '-')}"

    if financial_result and financial_result.get('impact'):
        fi = financial_result['impact']
        context += f"\n\n## Finansal Etki (Varsayımsal)"
        context += f"\n- Günlük kazanılacak saat: {fi.get('recovered_hours_per_day', 0)}"
        context += f"\n- Günlük ek üretim: {fi.get('extra_pieces_per_day', 0)} parça"
        context += f"\n- Günlük net fayda: {fi.get('net_benefit_per_day', 0)} ₺"
        context += f"\n- Yatırım geri dönüş: {fi.get('payback_days', 0)} gün"
        context += f"\n- Varsayımlar: {financial_result.get('assumptions', {})}"

    if prioritizer_result:
        context += "\n\n## Prioritizer Agent"
        for a in prioritizer_result.get('top_actions', [])[:5]:
            context += f"\n- {a.get('title')}: skor={a.get('score')}, confidence={a.get('confidence')}, alan={a.get('impact_area')}"

    prompt = context + """

Based only on the data above, write the report in Turkish using exactly these headings:
1. Genel Durum
2. En Kritik Kök Neden
3. Kanıtlar
4. Önerilen Müdahale
5. OEE Etkisi
6. Finansal Etki
7. İlk 3 Aksiyon
8. Varsayım Notu

Rules:
- The final answer must be in Turkish.
- Keep each heading concise; keep the full report under 250 words.
- Do not invent annual savings, costs, measurements, or missing values.
- Clearly state that financial values are assumption-based.
- Do not present root causes without evidence as certain facts.
- Prefer action-oriented wording suitable for a hackathon jury and factory manager.
"""

    try:
        llm = _get_llm()
        response = llm.invoke([
            SystemMessage(content=(
                "You are an industrial IoT, CNC, RCA, and OEE reporting agent. "
                "Use only the supplied evidence. Do not hallucinate numbers or causes. "
                "Separate measured facts from assumptions. Return the final report in Turkish."
            )),
            HumanMessage(content=prompt)
        ])
        report = response.content
        status = "success"
        errors = []
    except Exception as e:
        report = _fallback_report(rca_result, whatif_result, financial_result, prioritizer_result, context_result)
        status = "fallback"
        errors = [str(e)]

    return {
        "agent": "Reporter",
        "status": status,
        "report": report,
        "errors": errors,
        "data_sources": {
            "detector": detector_result['summary'],
            "rca_problem_count": rca_result['relevant_problems'],
            "whatif_improvement": whatif_result['total_oee_improvement'],
            "financial": financial_result.get('impact') if financial_result else None,
            "top_actions": prioritizer_result.get('top_actions', []) if prioritizer_result else [],
            "event_context": context_result,
        }
    }
