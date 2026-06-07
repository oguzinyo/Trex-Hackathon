"""
Orchestrator — RCA kanıtı, What-If ve finansal etkiyi bağlayan agent pipeline.
"""
from src.agents import detector, rca, whatif, reporter, context, financial, prioritizer, critic


def run_full_analysis(machine=None):
    """
    Tam analiz agent pipeline:
    1. Detector → sağlık durumu
    2. RCA → kök nedenler
    3. EventContext → olay penceresi ve kanıtlar
    4. WhatIf → RCA'ya bağlı simülasyon
    5. Financial → varsayımsal iş etkisi
    6. Prioritizer → aksiyon sıralaması
    7. Reporter → kanıta bağlı rapor
    """

    # Makine seçimi
    if not machine:
        detector_result = detector.run()
        if detector_result['summary']['critical_machines']:
            machine = detector_result['summary']['critical_machines'][0]
        else:
            machine = "Makine 1"
    else:
        detector_result = detector.run(machine)

    # Pipeline
    rca_result = rca.run(machine)
    context_result = context.run(machine, rca_result)
    whatif_result = whatif.run(machine, rca_result)
    financial_result = financial.run(whatif_result, machine)
    prioritizer_result = prioritizer.run(rca_result, whatif_result, financial_result)
    reporter_result = reporter.run(
        detector_result, rca_result, whatif_result, machine,
        context_result=context_result,
        financial_result=financial_result,
        prioritizer_result=prioritizer_result,
    )
    critic_result = critic.run(
        reporter_result.get("report"),
        rca_result=rca_result,
        whatif_result=whatif_result,
        financial_result=financial_result,
        context_result=context_result,
    )

    return {
        "target_machine": machine,
        "pipeline": [
            {"agent": "Detector", "status": "✅", "result": detector_result},
            {"agent": "RCA", "status": "✅", "result": rca_result},
            {"agent": "EventContext", "status": "✅", "result": context_result},
            {"agent": "WhatIf", "status": "✅", "result": whatif_result},
            {"agent": "Financial", "status": "✅", "result": financial_result},
            {"agent": "Prioritizer", "status": "✅", "result": prioritizer_result},
            {"agent": "Reporter", "status": "✅", "result": reporter_result},
            {"agent": "Critic", "status": "✅", "result": critic_result},
        ],
        "final_report": reporter_result["report"],
        "summary": reporter_result["data_sources"],
        "critic_review": critic_result,
    }


def run_quick_scan():
    """Hızlı fabrika taraması — tüm makineleri tarar"""

    detector_result = detector.run()
    rca_result = rca.run()

    target = detector_result['summary']['critical_machines'][0] if detector_result['summary']['critical_machines'] else "Makine 1"
    context_result = context.run(target, rca_result)
    whatif_result = whatif.run(target, rca_result)
    financial_result = financial.run(whatif_result, target)
    prioritizer_result = prioritizer.run(rca_result, whatif_result, financial_result)
    reporter_result = reporter.run(
        detector_result, rca_result, whatif_result, target,
        context_result=context_result,
        financial_result=financial_result,
        prioritizer_result=prioritizer_result,
    )

    return {
        "scan_type": "quick",
        "target_machine": target,
        "final_report": reporter_result["report"],
        "health_scores": detector_result["health_scores"],
        "problems": rca_result["problems"],
        "improvement_potential": whatif_result["total_oee_improvement"],
        "financial": financial_result.get("impact"),
        "top_actions": prioritizer_result.get("top_actions", []),
    }
