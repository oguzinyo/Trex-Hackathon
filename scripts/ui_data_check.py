"""
UI Data Accuracy Check — Backend endpoint'leri vs ham SQL karşılaştırma
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import requests
from src.core.database import query

BASE = "http://localhost:8001"

def section(t):
    print(f"\n{'=' * 70}\n{t}\n{'=' * 70}")

# 1. KPI STRIP
section("1. KPI STRIP — Backend hesaplaması vs ham SQL")
health = requests.get(f"{BASE}/api/health").json()
b_pieces = sum(m['total_pieces'] for m in health)
b_alarms = sum(m['alarm_count'] for m in health)
b_down = sum(m['stop_hours'] for m in health)
b_oee = sum(m['avg_oee'] for m in health) / len(health)
b_a = sum(m['avg_A'] for m in health) / len(health)
b_crit = sum(1 for m in health if m['status'] == 'critical')

print(f"Backend /api/health:")
print(f"  Toplam parça: {b_pieces:,}")
print(f"  Toplam alarm: {b_alarms}")
print(f"  Toplam duruş: {b_down:.1f}h")
print(f"  Ort. OEE: {b_oee * 100:.2f}%")
print(f"  Ort. A: {b_a * 100:.2f}%")
print(f"  Kritik: {b_crit}, Makine: {len(health)}")

sql_pieces = int(query("""SELECT SUM(CAST(json_extract_string(o.quality,'$.ProductSum') AS BIGINT)) p
    FROM mes_oee_summary o WHERE o.level=1""").iloc[0]['p'])
sql_alarms = int(query("SELECT COUNT(*) c FROM mes_alert").iloc[0]['c'])
sql_machines = int(query("""SELECT COUNT(DISTINCT u.uid) c FROM mes_oee_summary o
    JOIN mes_unit u ON u.uid=o.unit_uid WHERE o.level=1""").iloc[0]['c'])
sql_down = float(query("""SELECT ROUND(SUM(duration_milliseconds)/3600000.0,1) h
    FROM mes_stoppage_slice WHERE is_planned=false
      AND reading_def_uid!='00000000-0000-0000-0000-000000000006'""").iloc[0]['h'])

print(f"\nHam SQL kontrol:")
print(f"  Parça: {sql_pieces:,} {'OK' if sql_pieces == b_pieces else f'MISMATCH (backend: {b_pieces:,})'}")
print(f"  Alarm: {sql_alarms} {'OK' if sql_alarms == b_alarms else f'MISMATCH (backend: {b_alarms})'}")
print(f"  Makine: {sql_machines} {'OK' if sql_machines == len(health) else f'MISMATCH (backend: {len(health)})'}")
print(f"  Plansız duruş ham: {sql_down:.1f}h | UI: {b_down:.1f}h")

# 2. 17 PROBLEM
section("2. 17 PROBLEM")
problems = requests.get(f"{BASE}/api/problems").json()
print(f"Toplam: {len(problems)}")
sev = {}
for p in problems:
    s = p.get('severity', '?')
    sev[s] = sev.get(s, 0) + 1
print(f"Severity: {sev}")
errors = [p for p in problems if 'error' in p]
print(f"Hatalı: {len(errors)}")
for e in errors:
    print(f"  P{e.get('id', '?')}: {e['error'][:80]}")

# 3. YENİ 5 PROBLEM
section("3. YENİ 5 PROBLEM (P13-P17)")
for p in problems:
    if p['id'] < 13 or 'error' in p:
        continue
    print(f"P{p['id']}: {p['title'][:55]}")
    print(f"  Severity={p['severity']:8s} Conf={p.get('confidence', 0):.3f} Sample={p.get('sample_size', 0):>6}")
    print(f"  Area: {p.get('impact_area', '?')}")
    print(f"  Evidence: {p.get('evidence', '')[:80]}")
    print()

# 4. P14 DETAYLI DOĞRULAMA
section("4. P14 MİKRO-DURUŞLAR — Backend vs SQL")
p14 = next(p for p in problems if p['id'] == 14)
print(f"Backend P14:")
print(f"  Toplam: {p14['total_micro_stops']:,}")
print(f"  Saat: {p14['total_lost_hours']}h")
print(f"  Ortalama: {p14['avg_seconds']}sn")

r = query("""SELECT COUNT(*) cnt,
    ROUND(SUM(duration_milliseconds)/3600000.0,1) h,
    ROUND(AVG(duration_milliseconds)/1000.0,1) sec
    FROM mes_stoppage_slice
    WHERE duration_milliseconds<60000 AND duration_milliseconds>0 AND is_planned=false""").iloc[0]
print(f"Ham SQL:")
print(f"  Toplam: {int(r['cnt']):,}")
print(f"  Saat: {r['h']}h")
print(f"  Ortalama: {r['sec']}sn")
print(f"  Sayım eşleşmesi: {'OK' if int(r['cnt']) == p14['total_micro_stops'] else 'MISMATCH'}")

# 5. EXECUTIVE
section("5. EXECUTIVE SUMMARY")
ex = requests.get(f"{BASE}/api/executive").json()
pot = ex['potential']
fin = ex['financial']
print(f"Current avg OEE: {pot['current_avg_oee'] * 100:.2f}%")
print(f"Corrected avg OEE: {pot['corrected_avg_oee'] * 100:.2f}%")
print(f"Improvement: +{pot['improvement_pp'] * 100:.2f}pp")
print(f"Yillik fayda: {fin['annual_benefit_total']:,} TL")
print(f"Makine sayisi: {fin['machines_count']}")
print(f"Payback: {fin['payback_days']} gun")

print(f"\nPer makine corrected OEE:")
for m in pot['machines']:
    print(f"  {m['machine']:12s}: {m['current_oee'] * 100:>5.1f}% -> {m['corrected_oee'] * 100:>5.1f}% (+{m['improvement_pp'] * 100:.1f}pp)")

# 6. TIMELINE
section("6. TIMELINE (60 gün)")
tl = requests.get(f"{BASE}/api/timeline?days=60").json()
print(f"Toplam alarm: {tl['total_alarms']:,}")
print(f"Alarm tipi: {tl['total_alarm_types']}")
print(f"Hot day sayisi: {len(tl['hot_days'])}")
if tl['hot_days']:
    print(f"En yogun: {tl['hot_days'][0]['day']} = {tl['hot_days'][0]['total_alarms']} alarm")

sql_recent = int(query("""SELECT COUNT(*) c FROM nightwatch_data_string ns
    JOIN nightwatch_reading_def nrd ON nrd.readingdef_uid=ns.readingdef_uid
    WHERE nrd.readingdef_name='ALM_ARR_MSG'
      AND ns.time > (SELECT MAX(time) - INTERVAL '60 days' FROM nightwatch_data_string)""").iloc[0]['c'])
print(f"Ham SQL: {sql_recent:,} | UI hesap: {tl['total_alarms']:,}")

# 7. COMPARE
section("7. COMPARE — Makine karsilastirma")
cmp = requests.get(f"{BASE}/api/compare").json()
print(f"Makine sayisi: {cmp['count']}")
for m in cmp['machines']:
    oee = (m['avg_oee'] or 0) * 100
    print(f"  {m['machine']:12s} OEE={oee:>5.1f}% Pieces={(m['pieces'] or 0):>7} Alarms={m['alarms']:>3}")

# 8. CONFIDENCE TUTARLILIK
section("8. CONFIDENCE — RCA vs Statistics tutarlilik")
confs = requests.get(f"{BASE}/api/statistics/confidences").json()
mismatches = 0
for p in problems:
    if p.get('error'):
        continue
    pid = p['id']
    p_conf = p.get('confidence', 0)
    s_conf = confs.get(str(pid), {}).get('confidence', 0)
    if abs(p_conf - s_conf) > 0.001:
        print(f"  MISMATCH P{pid}: rca={p_conf:.3f} vs statistics={s_conf:.3f}")
        mismatches += 1
print(f"{'Tum confidence tutarli' if mismatches == 0 else f'{mismatches} uyumsuzluk'}")

# 9. AGENT PIPELINE
section("9. AGENT PIPELINE")
agent = requests.get(f"{BASE}/api/agent/analyze?machine=Makine%201").json()
print(f"Pipeline: {[p['agent'] for p in agent.get('pipeline', [])]}")
print(f"Target machine: {agent.get('target_machine')}")
critic = agent.get('critic_review', {})
print(f"Critic score: {critic.get('score')}/100 ({critic.get('status')})")
print(f"Critic verification rate: {critic.get('verification_rate')}")
print(f"Issues: {len(critic.get('issues', []))}")
rca = next((p for p in agent.get('pipeline', []) if p['agent'] == 'RCA'), {}).get('result', {})
print(f"RCA total: {rca.get('total_problems')}, relevant: {rca.get('relevant_problems')}")
