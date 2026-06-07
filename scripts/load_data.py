"""
CSV → DuckDB veri yükleme scripti
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import duckdb
import time
from config.settings import DB_PATH, DATA_DIR

con = duckdb.connect(DB_PATH)

TABLES = {
    "nightwatch_data": "trex_nightwatch_data_0*.csv",
    "nightwatch_data_string": "trex_nightwatch_data_string_*.csv",
    "mes_alert": "trex_mes_alert.csv",
    "mes_counter_slice": "trex_mes_counter_slice.csv",
    "mes_device": "trex_mes_device.csv",
    "mes_oee_summary": "trex_mes_oee_summary.csv",
    "mes_reading_def": "trex_mes_reading_def.csv",
    "mes_status": "trex_mes_status.csv",
    "mes_stoppage_def": "trex_mes_stoppage_def.csv",
    "mes_stoppage_slice": "trex_mes_stoppage_slice.csv",
    "mes_unit": "trex_mes_unit.csv",
    "mes_workorder": "trex_mes_workorder.csv",
    "nightwatch_reading_def": "trex_nightwatch_reading_def.csv",
    "nightwatch_unit": "trex_nightwatch_unit.csv",
}

print(f"Hedef DB: {DB_PATH}\n")

for table_name, pattern in TABLES.items():
    csv_path = os.path.join(DATA_DIR, pattern).replace("\\", "/")
    print(f"  {table_name:30s} <- {pattern:40s}", end="  ")
    start = time.time()
    try:
        con.sql(f"DROP TABLE IF EXISTS {table_name}")
        con.sql(f"CREATE TABLE {table_name} AS SELECT * FROM read_csv('{csv_path}', auto_detect=true, ignore_errors=true)")
        count = con.sql(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        elapsed = time.time() - start
        print(f"{count:>12,} satir  ({elapsed:.1f}s)")
    except Exception as e:
        print(f"HATA: {e}")

print("\n--- Ozet ---")
for table_name in TABLES:
    try:
        count = con.sql(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        cols = con.sql(f"SELECT COUNT(*) FROM information_schema.columns WHERE table_name='{table_name}'").fetchone()[0]
        print(f"  {table_name:30s}  {count:>12,} satir, {cols} sutun")
    except:
        pass

con.close()
print(f"\nTamamlandi! DB: {DB_PATH}")
