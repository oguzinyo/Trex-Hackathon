"""
CNC Anomaly Intelligence — Tek komutla başlat
Kullanım: python run.py
"""
import uvicorn
from config.settings import HOST, PORT

if __name__ == "__main__":
    print(f"""
    ╔══════════════════════════════════════════╗
    ║   CNC Anomaly Intelligence v2.0          ║
    ║   Multi-Agent Factory Monitoring System  ║
    ╠══════════════════════════════════════════╣
    ║   Dashboard:  http://localhost:{PORT}       ║
    ║   API Docs:   http://localhost:{PORT}/docs  ║
    ╚══════════════════════════════════════════╝
    """)
    uvicorn.run("api.main:app", host=HOST, port=PORT, reload=True)
