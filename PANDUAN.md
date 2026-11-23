# Panduan Sentinel OceanWATCH

## Pasang di iPad
1. Buka **https://azizdigital.github.io/oceanwatch/** dalam Safari.
2. **Kongsi ⬆️ → Tambah ke Skrin Utama** (ikon gelombang + orbit emas).
3. Kali pertama: **Settings › Import from Dashboard Cuaca** (jika app asal pernah dibuka di iPad sama) untuk salin profil offshore, had kerja, syif & kunci relay. Bahasa lalai English; tukar BM dengan butang **EN/BM** di atas.

## Pasang di PC (Windows)
1. Pasang **Node.js 22 LTS** (nodejs.org) jika belum ada.
2. Ekstrak zip, buka folder yang ada `package.json`, klik bar alamat, taip `cmd`, Enter.
3. `npm install` → `npm run dist`. Dalam folder `dist` ada **Sentinel OceanWATCH Setup 1.2.0.exe** (pasang) dan **Sentinel OceanWATCH 1.2.0.exe** (portable).
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

## Tab Kapal (baru 1.2.0)
- **⚙ Tetapan kapal**: nama + MMSI (9 digit) atau IMO (7 digit); jenis, peranan / nota dan kerja (Go / No-Go) pilihan. Nombor di halaman kapal VesselFinder / MarineTraffic. Disimpan dalam peranti ini (maksimum 20).
- **Semua kapal saya**: satu peta setiap kapal — VesselFinder tunjuk kapal itu sahaja, dengan trek 24 jam, pelabuhan seterusnya, ETA & laju.
- Tekan satu kapal untuk peta besar; tukar **VesselFinder / MarineTraffic** (MarineTraffic tanda kapal anda tetapi kapal lain turut nampak). **Kawasan** = semua kapal sekitar platform. **Buka laman penuh ↗** untuk butiran.
- Kad kapal yang dipautkan ke kerja tunjuk status kerja itu sekarang.
- Semua kapal dalam satu peta perlukan akaun Fleet VesselFinder / MarineTraffic (tidak percuma) — sebab itu satu peta setiap kapal.

## Menu
| Menu | Isi |
|---|---|
| **Home** | Kotak jawapan Go / Caution / No-Go (LQ atau kerja pilihan), 7 nombor utama, **Jobs today** (setiap kerja × blok 3 jam), graf ombak & angin, skor risiko, amaran MET laut |
| **Cuaca / Weather** | Semua model digabung: cerita 6 jam, jadual 3 jam, graf 7 hari, pasang surut |
| **Kapal / Vessels** | Kapal anda di peta VesselFinder / MarineTraffic |
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
