"""
DuckDB Connection Manager
"""
import duckdb
from config.settings import DB_PATH

_con = None


def get_connection():
    global _con
    if _con is None:
        _con = duckdb.connect(DB_PATH, read_only=True)
    return _con


def query(sql, params=None):
    con = get_connection()
    if params:
        return con.execute(sql, params).fetchdf()
    return con.sql(sql).fetchdf()


def query_raw(sql):
    con = get_connection()
    return con.sql(sql).fetchall()
