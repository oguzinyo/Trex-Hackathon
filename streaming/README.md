# Streaming Multi-Agent System

> Mevcut `src/agents/` batch pipeline'ından **tamamen bağımsız** çalışan event-driven multi-agent sistem.

## Mimari Felsefe

| | Batch (`src/agents/`) | Streaming (`streaming/`) |
|---|---|---|
| Pattern | Senkron pipeline (Detector → RCA → ... → Critic) | Event-driven Pub/Sub |
| Tetik | Kullanıcı isteği (HTTP request) | Timer + threshold + event |
| State | Stateless (her çağrı bağımsız) | Stateful in-memory store |
| Agent'lar | Sıralı çalışır | Paralel, sürekli, asenkron |
| Çıktı | Tek rapor | Sürekli akan event stream |
| Süre | ~30 saniye | Saniyeden hızlı (sürekli açık) |

## Klasör Yapısı

```
streaming/
├── core/
│   ├── event_bus.py          # Pub/Sub event bus (singleton)
│   ├── scheduler.py          # Periodic task runner (threading)
│   └── state.py              # In-memory machine state store
│
├── ingestion/
│   └── batch_simulator.py    # Mevcut DB'yi "anlık feed" gibi simüle eder
│
├── agents/
│   ├── watchdog.py           # Sürekli scan — 10sn'de bir, eşik takibi
│   ├── lookahead.py          # Predictive ML — 30sn'de bir risk skoru
│   ├── prescriber.py         # Prescriptive — operatöre tavsiye
│   ├── notifier.py           # Bildirim toplayıcı
│   └── coordinator.py        # Tüm agent'ları bootstrap eder
│
├── api/
│   └── router.py             # FastAPI router (/api/streaming/*)
│
└── runner.py                 # Standalone başlatma scripti
```

## Event Tipleri

- `health.degraded` — Watchdog: makine sağlığı düştü
- `health.recovered` — Watchdog: düzeldi
- `threshold.breach` — Watchdog: bir eşik geçildi
- `risk.high` / `risk.medium` — Lookahead: ML risk skoru
- `alarm.triggered` — Gerçek alarm çaldı
- `notification` — Notifier'ın yaydığı bildirim
- `prescription` — Prescriber'ın tavsiyesi

## Kullanım

### Standalone (CLI)
```bash
python -m streaming.runner
```

### FastAPI ile entegre
```python
from streaming.api.router import streaming_router
app.include_router(streaming_router)
```

### Endpoint'ler

| Endpoint | İşlev |
|----------|-------|
| `POST /api/streaming/start` | Tüm agent'ları başlat |
| `POST /api/streaming/stop` | Durdur |
| `GET /api/streaming/status` | Çalışan agent'lar + son tarama |
| `GET /api/streaming/feed` | Anlık makine durumu (Watchdog son tarama) |
| `GET /api/streaming/notifications` | Bildirim listesi |
| `GET /api/streaming/events?type=&limit=` | Event log |
| `GET /api/streaming/prescribe/{machine}` | Anlık tavsiye |

## Tasarım Prensipleri

1. **Mevcut `src/` koduna sıfır bağımlılık** — sadece `src/core/database.py` (read-only)
2. **Thread-safe** — tüm bus/state lock'lu
3. **Graceful shutdown** — `stop()` ile temiz kapanma
4. **Replaceable ingestion** — `batch_simulator` yerine canlı feed kolayca takılır
5. **Observability** — her event log'lanır, history'den çekilebilir
