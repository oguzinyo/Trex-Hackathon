# CNC Anomaly Intelligence — Tam Tanıtım

## 🎯 Tek Cümle ile

> 9 ay, 12 CNC makinesi ve 7.5M satır telemetri verisinden **17 operasyonel problem tespit eden**, OEE iyileştirme senaryolarını simüle eden, **ML ile gelecek arıza tahmini yapan** ve **8 otonom AI agent'ı orchestrate ederek Türkçe yönetici raporu üreten** bir multi-agent karar destek sistemi.

---

## 📌 Çözdüğü Problem

Bursa'daki bir CNC üretim tesisi 9 aydır TrexCloud sisteminden veri akıtıyor — ama **OEE %1-3 görünüyor**. Yönetim "fabrikamız berbat" sanıyor, müdahale etmeyi bilmiyor.

Gerçek: Veri hatalı değil — **konfigürasyon hatalı**. `stock_cycle` parametresi saniye yerine milisaniye girilmiş, bu Performance'ı 6 milyon kat şişirip 0'a düşürüyor. Düzeltilirse **gerçek OEE %60-85** arasında.

**Bizim sistem bunu otomatik bulup, kanıtla gösterip, kaç TL kazanç olacağını hesaplıyor.**

---

## 🏗 Mimari — 5 Katman

```
┌──────────────────────────────────────────────────────────┐
│  KATMAN 5 — UI                                           │
│  10 sekme + KPI strip + command palette (Ctrl+K)        │
├──────────────────────────────────────────────────────────┤
│  KATMAN 4 — API (FastAPI, 37 endpoint)                   │
│  Cache, async jobs, structured logging                   │
├──────────────────────────────────────────────────────────┤
│  KATMAN 3 — AGENTS (8-step pipeline)                     │
│  Detector → RCA → EventContext → WhatIf → Financial      │
│  → Prioritizer → Reporter → Critic                       │
├──────────────────────────────────────────────────────────┤
│  KATMAN 2 — ANALYSIS                                     │
│  rca_engine · whatif_engine · anomaly_detector           │
│  statistical · predictive · executive                    │
├──────────────────────────────────────────────────────────┤
│  KATMAN 1 — DATA                                         │
│  DuckDB (14 tablo, 7.5M satır, in-process OLAP)         │
└──────────────────────────────────────────────────────────┘
```

---

## 📊 Veri

| Kaynak | Boyut |
|--------|-------|
| **DuckDB** | 14 tablo, 7.5M satır |
| nightwatch_data (sensor) | 6.3M satır |
| nightwatch_data_string (alarm) | 1.1M satır |
| mes_stoppage_slice | 51.913 duruş kaydı |
| mes_counter_slice | 91.436 üretim kaydı |
| mes_workorder | 9.913 iş emri |
| mes_oee_summary | 1.917 OEE özeti |
| mes_alert | 76 alarm |

**12 makine**, **3 controller tipi**:
- **FanucFocas** (7 makine): Makine 1, 2, 3, 5, 9, 10 + ARES SEIKI
- **MitsubishiCnc** (4 makine): Makine 4, 6, 7, 8 (her birinde 14 sensör sinyali)
- **LibPlc / Nukon** (1 makine): TurboCut 400

**9 ay** verisi: Ağustos 2025 – Mayıs 2026

---

## 🔍 17 Problem Otomatik Tespiti

Her problem **istatistiksel olarak doğrulanmış**, hardcoded değil:

| # | Problem | Confidence | Method |
|---|---------|------------|--------|
| 1 | Kronik Hava Basıncı | **0.897** | Wilson CI + concentration |
| 2 | Tekrarlayan Acil Durdurma | **0.948** | Category share |
| 3 | Toplu Fabrika Kapanmaları | **0.839** | Coincidence rate |
| 4 | Negatif OEE | **0.950** | Mathematical impossibility |
| 5 | Hayalet Makineler (0 üretim) | **0.950** | Zero-production duration |
| 6 | Cycle Time İllüzyonu | **0.651** | Log-scale ratio distribution |
| 7 | Uzun Duruşlar (tatil) | **0.828** | Misclassification rate |
| 8 | Yağlama Degradasyonu | 0.352 | Limited sample warning |
| 9 | Overtravel (eksen limiti) | 0.669 | Event count |
| 10 | Motor Overload | **0.965** | Single-day concentration |
| 11 | Sayaç Spike (138K parça/event) | 0.850 | Tukey IQR |
| 12 | Mesai Dışı Uzayan Duruşlar | **1.000** | Mann-Whitney median |
| **13** | **Alarm → Duruş Zinciri** | **0.959** | Temporal cooccurrence |
| **14** | **Mikro-Duruşlar (12K, 46h)** | **0.970** | Direct enumeration |
| **15** | **Operatör İmzası** | **0.996** | Shift-time concentration |
| **16** | **9 Ay Düz Trend** | **0.775** | Variance-based flatness |
| **17** | **PATH_LOAD Kör Noktası** | **0.950** | Definition vs collection gap |

> Hardcoded `confidence = 0.88` yerine: *"248 alarmın %92.7'si saat 7:00'de — Wilson CI'ye göre güven 0.897"*

---

## 🤖 Üç Farklı ML Modeli

### 1. Isolation Forest — Sensör Anomalisi
Mitsubishi makinelerde 16.537 cycle time anomalisi (%5 oranı). Normal 1167s, anomali 2917s.

### 2. Random Forest Classifier — Failure Prediction
```
Eğitim: 300 sample, 100 test
Performans: AUC-ROC = 0.999, F1 = 0.99
Feature importance: count(0.35) → min(0.22) → p5(0.13) → mean(0.12)
```
**"Gelecek 15 dakikada arıza riski"** tahmini.

### 3. Empirical Survival Analysis — Alarm Forecast
Makine 1 için: Sonraki AIR PRESSURE alarmı **2026-05-22 07:46** (forecast confidence **0.956**).

---

## 🧠 8-Agent Pipeline

Her agent **dict alır, dict döner** — net sorumluluk ayrımı:

```
1️⃣  DETECTOR        → Sağlık skoru (0-100)
2️⃣  RCA             → 12+5 problem + confidence
3️⃣  EVENTCONTEXT    → ±15dk olay penceresi kanıtı
4️⃣  WHATIF          → RCA'ya bağlı senaryo seçimi
5️⃣  FINANCIAL       → ₺ etki (varsayım etiketli)
6️⃣  PRIORITIZER     → severity × confidence × impact × feasibility
7️⃣  REPORTER        → Ollama LLM Türkçe rapor + fallback
8️⃣  CRITIC          → LLM halüsinasyon doğrulama
```

**Critic özellikle önemli**: LLM raporundaki sayıları kanıt seti ile karşılaştırır, uydurma sayıları yakalar (test edildi: 29 sayı arasından 6'sı uydurma çıktı).

LLM yoksa **fallback rapor** — sistem yine çalışır.

---

## 🖥 Dashboard — 10 Sekme

| # | Sekme | İçerik |
|---|-------|--------|
| 1 | **Fabrika Genel** | Makine kartları (controller bazlı 3 grup), health ring, KPI strip |
| 2 | **Problem Listesi** | 17 problem, severity + impact_area filtreleri, confidence bar |
| 3 | **What-If** | 4 senaryo simülasyonu + Corrected OEE + finansal etki (varsayım editlenebilir) |
| 4 | **OEE Trend** | Haftalık A/P/OEE çizgi grafik |
| 5 | **ML Anomali** | Health bar chart + counter spikes + Mitsubishi sensör analizi |
| 6 | **Predictive ML** | RF model metrikleri (AUC/F1) + feature importance + alarm forecast + confidence tablosu |
| 7 | **Veri Kalitesi** | OEE tablosu + sensör kapsama + duruş sınıflandırma + cycle time uyumsuzluk |
| 8 | **Karşılaştırma** | 6 makine yan yana + radar chart |
| 9 | **Timeline** | Son 60 gün alarm hot day'leri + günlük dağılım |
| ⭐ | **Yönetici Özeti** | Mevcut OEE → Hedef OEE + yıllık ₺ fayda + top 5 aksiyon + print-friendly |
| 🤖 | **AI Agent** | 8-agent pipeline animasyonu + EventContext + Prioritizer + Critic review |

### UX İncelikleri
- **Command Palette** (Ctrl+K) — fuzzy search ile sekme arası geçiş
- **Klavye kısayolları** — 1-9 ile sekmeler
- **Toast notifications** — başarı/hata bildirimleri
- **Skeleton loaders** — sayfa yüklerken iskelet placeholder
- **Hash routing** — `#executive` ile paylaşılabilir link
- **Lazy loading** — sekme açılınca yüklenir
- **Print mode** — yönetici özeti A4 sayfasına basılabilir
- **Trex Light Theme** — sistemin gerçek renk paletine uyumlu

---

## 💰 Somut Sonuçlar

**Mevcut OEE (12 makine ortalama):** %0.57 *(jüri yanılır, hayalet makineler düşürüyor)*
**Üretken 6 makine ortalama:** %42

**Düzeltilirse:**

| Makine | Mevcut | Düzeltilmiş | Kazanım |
|--------|--------|-------------|---------|
| Makine 1 | 27.1% | **63.8%** | +36.8pp |
| Makine 2 | 58.2% | **83.8%** | +25.7pp |
| Makine 5 | 66.1% | **85.4%** | +19.4pp |
| Makine 7 | 19.2% | **49.0%** | +29.8pp |

**Tahmini Finansal Etki** (varsayımlar açıkça etiketli):
- Günlük net fayda: **1.836 ₺/makine** (varsayım maliyetleri: 12₺/parça, 45₺/saat)
- Yıllık toplam: **~21M ₺** (6 makine × 365 gün)
- Yatırım geri dönüş: **<1 gün**

---

## 🛡 Production-Ready Mühendislik

- **Pydantic schema'lar** — type-safe API kontratı
- **Cache decorator** `@cached(ttl=600)` — ağır query'ler önbellekte
- **Async jobs** — uzun LLM çağrıları için job_id + polling pattern
- **CORS + GZip + structured logging** middleware
- **`_safe()` wrapper** — tüm endpoint'ler exception-safe
- **`_clean()` serializer** — NaN/Infinity/datetime otomatik temizler
- **Error fallback** — Ollama düşerse deterministik rapor

---

## 📚 Dokümantasyon

- **`AGENTS.md`** (223 satır) — AI asistan onboarding rehberi: 8-agent pipeline kontratı + 37 endpoint tablosu + sık görevler
- **`README.md`** — İnsan dokümantasyonu, hızlı başlangıç, mimari diyagram
- **`/docs`** — FastAPI otomatik Swagger UI

---

## 🎬 Demo Akışı (Jüri İçin 5 Dakika)

### 0:00–0:30 — Açılış
"Bu fabrika 9 aydır kendini %1 OEE'de izliyor. Aslında %60-85 arası. Veri hatalı değil, sistem konfigürasyonu hatalı. Biz bunu otomatik buluyoruz."

### 0:30–1:30 — Fabrika Genel
- 12 makine, 3 controller grubuna ayrı renkler
- KPI strip: 265K parça, 76 alarm, 19K saat duruş
- Hayalet makineler (Makine 4, 6, 10) kritik

### 1:30–2:30 — Problem Listesi
- 17 problem, 5 critical
- P6 Cycle Time → confidence **0.65** (8.574 iş emri analizi)
- *"Hardcoded değil — Wilson CI ile veriden hesaplanmış"*

### 2:30–3:30 — Predictive ML
- Random Forest **AUC 0.999** — gerçek model, gerçek metrik
- Alarm forecast: Sonraki AIR PRESSURE **2026-05-22 07:46** ± 3 gün
- Critic verification %86.7

### 3:30–4:30 — AI Agent
- 8-agent pipeline animasyonu
- EventContext: son alarmın çevresindeki kanıtlar
- Prioritizer: Top 5 aksiyon (score 87.4 → 27.9)
- Critic: Halüsinasyon yakalama

### 4:30–5:00 — Yönetici Özeti
- Mevcut %42 → Hedef %70
- Yıllık tahmini **21M ₺** kazanç (varsayım)
- Top 3 aksiyon → 1 yılda fabrika dönüşümü

---

## 🥇 Neden Bu Sistem Farkı Yaratır

| Hackathon Klişesi | Bizim Yaklaşım |
|-------------------|----------------|
| "ML kullandık" → 1 model, sonuç sayı | 3 farklı ML modeli, AUC/F1 metrikleri, feature importance |
| "Confidence 0.88" hardcoded | Wilson CI / Mann-Whitney / IQR ile veriden hesaplanır |
| "LLM rapor üretir" | LLM + Critic doğrulayıcı + Fallback yedek |
| "OEE %1 kötü, düzeltin" | "OEE %1 yanıltıcı, gerçek %42 — şu 3 hatayı düzeltin" |
| "Çözümleri sıralı listele" | severity × confidence × impact × feasibility skoru |
| Sadece dashboard | DB + ML + Agent + LLM + UI + Production engineering |
| Hardcoded sayılarla "yıllık 1M kazanç" | Şeffaf varsayım editlenebilir + her sayıya "varsayım" etiketi |

**Hikayemiz:** *"Veri zaten 9 aydır akıyordu. Hiçbir aksiyon alınmamıştı. Çünkü gerçeği görmek için 8-agent ve 3 ML modeline ihtiyaç vardı. Bu sistem o görmeyi sağlıyor."*
