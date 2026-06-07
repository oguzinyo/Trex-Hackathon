"""
Standalone runner — streaming sistemi tek başına çalıştırmak için.

Kullanım:
    python -m streaming.runner

Saniyede bir özet logu basar, Ctrl+C ile temiz kapanır.
"""
import sys, os, time, signal

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from streaming.agents import coordinator
from streaming.core.event_bus import bus
from streaming.core.state import store


def main():
    print("=" * 60)
    print("  STREAMING MULTI-AGENT SYSTEM")
    print("=" * 60)

    # Başlat
    r = coordinator.start(watchdog_interval=10, lookahead_interval=30)
    print(f"\n✓ Streaming başladı: {r}\n")

    stop_requested = False

    def _shutdown(signum, frame):
        nonlocal stop_requested
        if stop_requested:
            return
        stop_requested = True
        print("\n\n→ Kapatılıyor (Ctrl+C)...")
        coordinator.stop()
        print("✓ Temiz kapanış tamamlandı.")
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)

    try:
        while not stop_requested:
            time.sleep(5)
            states = store.all()
            stats = bus.stats()
            print(f"[{time.strftime('%H:%M:%S')}] makineler={len(states)} | events_total={stats['history_size']}", end="")
            critical = [m for m, s in states.items() if s.get('status') == 'critical']
            if critical:
                print(f" | CRITICAL: {', '.join(critical)}", end="")
            print()
    except KeyboardInterrupt:
        _shutdown(None, None)


if __name__ == "__main__":
    main()
