# Panduan Sentinel OceanWATCH

## Pasang di iPad
1. Buka **https://azizdigital.github.io/oceanwatch/** dalam Safari.
2. **Kongsi ⬆️ → Tambah ke Skrin Utama** (ikon gelombang + orbit emas).
3. Kali pertama: **Settings › Import from Dashboard Cuaca** (jika app asal pernah dibuka di iPad sama) untuk salin profil offshore, had kerja, syif & kunci relay. Bahasa lalai English; tukar BM dengan butang **EN/BM** di atas.

## Pasang di PC (Windows)
1. Pasang **Node.js 22 LTS** (nodejs.org) jika belum ada.
2. Ekstrak zip, buka folder yang ada `package.json`, klik bar alamat, taip `cmd`, Enter.
3. `npm install` → `npm run dist`. Dalam folder `dist` ada **Sentinel OceanWATCH Setup 1.3.3.exe** (pasang) dan **Sentinel OceanWATCH 1.3.3.exe** (portable).
4. Buka app → **Settings › Import from Dashboard Cuaca** — profil & tetapan dibaca terus dari app PC Dashboard Cuaca.
5. Boleh buka serentak dengan Dashboard Cuaca dan app satu lagi (port 30060, folder data `%APPDATA%\Sentinel OceanWATCH`). Pilih **Kekal di tray** dalam Tetapan supaya alert terus berbunyi bila tetingkap ditutup.

## Tab Cuaca (baru 1.2.0)
Semua model (6 model angin, 4 model ombak, 2 ensembel) digabung jadi satu cerita untuk lokasi profil.
- **Nombor tebal** = nilai tengah semua model; **dalam kurungan** = model paling rendah – paling tinggi (sama seperti formula demob).
- **Cerita**: setiap 6 jam untuk 3 hari (jam paling teruk dalam tempoh itu) — angin & arah, tiupan, ombak Hs & maks, alun (tinggi / tempoh / arah), hujan atau ribut petir; ↑↓ = naik / turun; label merah bila melebihi had anda; "model tidak sependapat" bila julat angin ≥ 10 kt. Hari 4–7 satu baris sehari. Kompas arah angin & alun sekarang dan +24 jam.
- **Ribut petir**: peratus model yang meramal ribut petir pada jam itu (≥ 20 % mungkin, ≥ 50 % dijangka).
- **Jadual 3 jam** (3 hari): kuning = hampir had (≥ 80 %), merah = melebihi had.
- **Graf 7 hari**: angin, ombak, tempoh alun, hujan & ribut petir; kawasan berwarna = julat model, garis merah = had anda.
- **Pasang surut**: paras laut model di platform + jadual pelabuhan Cukai (Tide Forecast, salinan GitHub Monsoon EYE).

## Tab Kapal (baru 1.2.0, rupa baru 1.3.0)
- **⚙ Tetapan kapal**: nama + MMSI (9 digit) atau IMO (7 digit); callsign, jenis (termasuk AV — kapal penginapan), **laju biasa (kn)**, peranan / nota dan kerja (Go / No-Go) pilihan. Di sini juga **nama platform** yang ditanda di peta (lalai: Irong Barat A, di titik profil). Nombor di halaman kapal VesselFinder / MarineTraffic. Disimpan dalam peranti ini (maksimum 20).
- **Kawasan** → **Carta** OceanWATCH: carta app sendiri (pantai Natural Earth) — platform, bulatan 5 / 10 / 20 / 40 nm, laluan dari pelabuhan Kemaman, angin & alun sekarang. Seret untuk gerak, + / − untuk zum. Tukar ke **VesselFinder / MarineTraffic** untuk kapal AIS langsung (pin platform di tengah; pin pudar bila peta digerak — tekan **Pusatkan semula**).
- **+ Lapor kedudukan** (1.3.0): bila kapten maklumkan kedudukan, isi **bearing + jarak dari platform** (cth 045° 12 nm) **atau lat / lon** (5.6915 atau 5°41.5'N) — satu terisi bila yang lain ditaip — atau **ketik tempat di Carta**. Laju & haluan pilihan.
  - Di Carta: kapal (menghala ikut haluan), **jarak & ETA** ke platform, trek 10 laporan terakhir. Ada laju & haluan → garis putus-putus = **anggaran sekarang** (paling lama 6 jam). Lebih 6 jam → pudar, "laporan lama". Laporan lebih 3 hari dibuang.
  - ETA = jarak ÷ laju (terus ke platform). Laju = yang dilapor, atau laju biasa jenis kapal (crew boat 20, FCB 18, PSV 10, AHTS 11, ERRV 8, AV 7, tunda 6, barge 5, tanker 10 kn) — boleh ubah dalam Tetapan kapal. Haluan lari lebih 60° → "tidak menghala ke platform".
  - **Dari MarineRadar / VesselFinder** (1.3.1): tekan **MarineRadar ↗** (atau **VesselFinder ↗**), salin seluruh halaman kapal (Ctrl+A, Ctrl+C / iPad: tekan lama › Pilih Semua › Salin), tampal dalam kotak. Kapal dipilih ikut MMSI/IMO.
    - **MarineRadar** (percuma) beri **kedudukan sebenar** + laju + haluan; masa laporan = sekarang − umur data ("Updated 3 hours" = 3 jam lalu), lepas tu garis anggaran bawa ke sekarang. Bertanda "MarineRadar".
    - **VesselFinder** (sandaran, tiada lat/lon percuma): app anggar di laluan lurus pelabuhan lepas → destinasi: bahagian perjalanan = (sekarang − ATD) ÷ (ETA − ATD). Bertanda "anggaran VF".
  - **AIS**: kalau relay v5 dengan kunci aisstream ada, Carta tunjuk kapal AIS yang didengar sekitar ~45 nm (kapal anda ikut nama). Tiada yang didengar = tiada apa-apa dipapar (aisstream belum ada penerima dekat Irong Barat).
- **Senarai "Kapal saya"** (1.3.2) di tepi Carta (di bawah Carta bila iPad menegak): kapal di Carta dahulu (paling dekat dahulu), kemudian laporan lama, kemudian "belum di Carta" — setiap satu ada butang **MarineRadar ↗** (buka halaman kapal + borang lapor) dan **Lapor**. Status kerja ditunjuk satu perkataan (GO / CAUTION / NO-GO).
- **Kotak tampal di atas Carta** (1.3.2): tampal halaman kapal MarineRadar / VesselFinder terus di situ — kapal dikenal ikut MMSI/IMO dan terus masuk Carta, tanpa borang.
- **Platform lain** (1.3.2): 145 platform dalam 150 nm dari data satelit 2023 (OOGPs, Si et al. 2026, CC-BY-4.0); oren = ada nyalaan gas. Butang **Platform** di Carta = tunjuk / sorok. Zum masuk untuk jarak & bearing setiap satu. Tiada nama dalam data; data sehingga 105.54°E dan tahun 2023.
- **Auto Open Waters** (1.3.2): setiap 15 minit app tanya Open Waters (percuma, peribadi) untuk semua MMSI anda — dikesan < 6 jam = kedudukan sebenar; lebih lama + destinasi & ETA = anggaran laluan; selain itu baris kapal tulis sebabnya. Suis dan ↻ dalam senarai Kapal saya.
- **Kedudukan terakhir didengar** (1.3.3): kalau Open Waters dengar kapal dalam 7 hari lepas tapi tak boleh anggar laluan (destinasi tak dikenal / ETA lapuk), kapal ditunjuk pudar di tempat terakhir didengar — "terakhir didengar 2 hari lalu". Lebih 7 hari = tak ditunjuk.
- **Tempat saya** (1.3.3): dalam **Tetapan kapal**, bahagian bawah. Destinasi AIS yang app tak kenal (cth ANGSI, RSK, SG KUANG) keluar sebagai butang **+ NAMA** — tekan, kemudian **Pilih platform** dari senarai platform satelit terdekat (jarak & bearing dari platform anda) atau taip Lat / Lon sendiri. Simpan → kapal yang menghala ke situ terus dianggar laluannya.
- Tekan satu kapal: **Carta / VesselFinder / MarineTraffic**, dengan panel kanan — laporan terakhir, anggaran, ETA, **Sejarah** (✕ padam satu laporan) dan butang Lapor kedudukan.
- **Semua kapal saya**: satu peta VesselFinder setiap kapal — kapal itu sahaja, dengan trek 24 jam.
- Kad kapal yang dipautkan ke kerja tunjuk status kerja itu sekarang.
- Semua kapal dalam satu peta perlukan akaun Fleet VesselFinder / MarineTraffic (tidak percuma) — sebab itu satu peta setiap kapal.

## Menu
| Menu | Isi |
|---|---|
| **Home** | Kotak jawapan Go / Caution / No-Go (LQ atau kerja pilihan), 7 nombor utama, **Jobs today** (setiap kerja × blok 3 jam), graf ombak & angin, skor risiko, amaran MET laut |
| **Cuaca / Weather** | Semua model digabung: cerita 6 jam, jadual 3 jam, graf 7 hari, pasang surut |
| **Kapal / Vessels** | Carta sendiri dengan laporan kedudukan, ETA & AIS (bila didengar); peta VesselFinder / MarineTraffic |
| **Jobs** | Jadual penuh Go / Caution / No-Go, weather window, **had operasi** setiap kerja (boleh ubah) |
| **Models** | Perbandingan 6 model angin + 4 model ombak + ensemble, 3/7/14 hari, **PDF A4 gaya AMT** |
| **Sites** | 13 laman (Windy ombak/angin/alun, Nullschool, AIS, radar, satelit, kilat, ribut, Ramalan Marin MET) |
| **Wall / Ask AI / History / Alerts / Settings** | |

## Kotak jawapan di atas
- Kotak besar = status **sekarang** untuk kerja utama. Lalai **Outside work (LQ)**: GO · CAUTION · LIMITED (kerja luar dihadkan) · STAY IN LQ. Pilih kerja lain dari senarai dalam kotak itu.
- Tajuk: kerja yang No-Go sekarang dan sehingga bila. Fakta kanan: GO window seterusnya, amaran awal, amaran MET laut.

## Kerja saya (Settings › My jobs)
Tambah kerja sendiri (contoh **Wellwork – HWU**): had **henti** angin / tiupan / Hs / alun / tempoh alun / penglihatan (had *berhati-hati* = 80% jika kosong), siang sahaja, ribut petir, **berapa jam demob**, masa selamat, dan **demob dengan** bot / helikopter / tunda barge. Kerja ini keluar dalam Jobs today (★), pemilih kotak atas dan Ask AI.

## Teruskan atau demob? (Ask AI)
Pilih *10 standard jobs*, *General* (isi had terus) atau *My job*. App kira:
1. Jam pertama ramalan melanggar mana-mana had henti — **nilai tengah model**; dalam kurungan **model paling teruk** dan **model paling ok**.
2. **Mula demob paling lewat = jam itu − (jam demob + masa selamat)**.
3. Bot / heli mesti masih dalam had (dan siang jika perlu) semasa keluar; jika tidak, masa dimajukan.
Contoh: "Start demob by Mon 05:00 (worst model Sun 04:00 · best model none in 3 days)". Jalur warna 3 hari setiap jam.

## Ask AI — 9 tujuan
Can we do job X? · Continue or demob? · Find a weather window · Weather downtime this week · Crew change · Medevac now? · Daily briefing / toolbox (teks siap baca) · Monsoon / cold surge / storm · Daily weather report (AMT / DPR, teks siap tampal). Setiap satu: **App guide** (tanpa AI) + **Prompt** (Short / Full, BM / EN).

## Penting
Had ialah nilai lazim industri — tukar ikut MOS / SOP syarikat. Keputusan akhir oleh OIM / Marine / juruterbang. Ramalan ialah model, bukan bacaan stesen.
