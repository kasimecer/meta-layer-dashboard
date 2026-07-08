# meta-layer-write — Cloudflare Worker (yazma-yolu + auth temeli)

Statik site (GH-Pages) **olduğu gibi kalır**. Bu Worker ayrı bir write/auth endpoint'idir.

- `POST /submit` — partner cevabını GitHub'daki inbox dosyasına APPEND eder (`SUBMIT_TOKEN` kapısı).
- `POST /intake-queue` — intake taslağını `intake-kuyruk/<id>.json` olarak commit eder (`SUBMIT_TOKEN`
  kapısı). Worker burada **materyalize ETMEZ** — yalnız git'e yazar. Kullanıcının kendi makinesinde
  çalışan `node scripts/intake-queue-watch.mjs` bu dosyayı bulup YEREL materyalize eder (kayıt +
  proje dosyaları). Planlama pipeline'ını başlatmaz — bu insan tarafından ayrı, elle bir terminal
  komutuyla yapılır (`node scripts/planlama-baslat.mjs <id>`). Bkz `intake-kuyruk/README.md`.
- `POST /soru-yanit-queue` — planlama sorularına operatör yanıtını
  `soru-yanit-kuyruk/<projeId>--<asama>--v<surum>.json` olarak commit eder (`SUBMIT_TOKEN`
  kapısı, aynı token). Worker burada **yanıt artefaktına YAZMAZ** / sürüm-tazeliği ya da
  bütünlük **DEĞERLENDİRMEZ** — yalnız git'e yazar (sığ doğrulama: alan varlığı + `asama`
  whitelist + `surum` tam-sayı). Kullanıcının kendi makinesinde çalışan
  `node scripts/soru-yanit-queue-watch.mjs` bu dosyayı bulup gerçek sürüm/imza tazeliğini
  denetler ve YEREL yanıt artefaktına yazar. Planlama pipeline'ını başlatmaz/ilerletmez — bu
  insan tarafından ayrı, elle bir terminal komutuyla yapılır (`node scripts/planlama-baslat.mjs
  <id>`). Bkz `soru-yanit-kuyruk/README.md`.
- `GET /health` — canlılık testi.

Operatör okuma-yolu artık burada değil: `meta-layer-operator.pages.dev` (Direct-Upload, ayrı Pages
projesi, Cloudflare Access ile korunur). Eski `GET /operator` (`OPERATOR_TOKEN` iskelet) kaldırıldı.

Yapılandırma `wrangler.toml [vars]` içinde (owner/repo/branch/inbox-path). Secret'ler **repoya girmez**.

---

## Kurulum (E çalıştırır — TEK SEFER)

> Secret DEĞERLERİNİ kimseyle paylaşma; aşağıdaki komutlar değeri terminalde sorar.

### 1. Wrangler + login
```bash
npm i -g wrangler          # ya da her komutta `npx wrangler ...`
wrangler login             # tarayıcı açılır, Cloudflare hesabına izin ver
```

### 2. GitHub token (GERÇEK secret — server-side)
GitHub → Settings → Developer settings → **Fine-grained personal access token**:
- Repository access: **yalnız** `meta-layer-dashboard`
- Permissions → **Contents: Read and write**
- (Klasik geniş `ghp_` token KULLANMA — dar kapsam = az risk.)

### 3. Deploy + secret'ler
```bash
cd ~/dev/meta-layer-dashboard/worker
wrangler deploy            # Worker'ı yayınlar → URL verir: https://meta-layer-write.<altad>.workers.dev

# Secret'leri Cloudflare'e koy (değeri komut soracak — yapıştır):
wrangler secret put GITHUB_TOKEN     # adım 2'deki fine-grained PAT
wrangler secret put SUBMIT_TOKEN     # rastgele dize:  openssl rand -hex 24
```
`SUBMIT_TOKEN` değerini **not al** — birazdan client `.env`'ine AYNISI girecek.

### 4. Client'ı Worker'a bağla
```bash
cd ~/dev/meta-layer-dashboard
cp .env.example .env
# .env içine yaz:
#   VITE_WORKER_URL=https://meta-layer-write.<altad>.workers.dev
#   VITE_SUBMIT_TOKEN=<adım 3'teki SUBMIT_TOKEN ile AYNI>
npm run deploy:public       # .env build'e gömülür → allowlist-trimmed dist → gh-pages'e push
```
`.env` boş kalırsa partner-view **MOCK** modda kalır (Worker'sız da çalışır, dosya yazmaz).

### 5. Test
```bash
curl https://meta-layer-write.<altad>.workers.dev/health        # → {"ok":true,...}
```
Sonra partner sayfasında bir kartı cevapla → `partner-inbox/baris.md` (main) dosyasında commit görmelisin.
İlk cevapta dosya yoksa Worker başlıkla oluşturur.

---

## Intake-kuyruğu izleyici (yerel materyalizasyon)

`.env`'de `VITE_WORKER_URL`/`VITE_SUBMIT_TOKEN` doluysa IntakeView'deki **"Materyalize et"**
butonu taslağı `POST /intake-queue` ile kuyruğa alır. Bunu işlemek için makinende (abonelik
oturumunun olduğu yerde) izleyiciyi çalıştır:

```bash
node scripts/intake-queue-watch.mjs            # her 45s'de bir kontrol eder, açık kalır
node scripts/intake-queue-watch.mjs --once      # tek tur (test/cron için)
```

İzleyici `git pull` yapar, `intake-kuyruk/*.json` bulur, `tools/intakeMateryalizeEt.mjs` ile
YEREL materyalize eder (registry kaydı + proje dosyaları diskte var olur), sonra dosyayı
kuyruktan kaldırıp push eder. **Yalnız makine + bu process açıkken çalışır** — anlık/her-zaman-açık
bir bulut-servisi değildir; kapatılırsa kayıt kuyrukta bekler. Elle materyalize etmek istersen
yedek yol hâlâ çalışır: `node scripts/intake-materialize.mjs <taslak.json>`.

İzleyici planlama pipeline'ını (genesis→premise→arastirma→strateji→master-plan) BAŞLATMAZ —
materyalize etmek ile pipeline'ı başlatmak kasıtlı olarak ayrı iki iştir. Pipeline'ı
başlatmak/devam ettirmek insan tarafından, ayrı bir terminal komutuyla yapılır:
```bash
node scripts/planlama-baslat.mjs            # bekleyen/kısmi/bloke/tamamlanmış projeleri listeler
node scripts/planlama-baslat.mjs <id>       # o proje için pipeline'ı başlat/devam ettir
```

---

## Soru-yanıt kuyruğu izleyici (yerel yanıt-artefaktı yazımı)

`.env`'de `VITE_WORKER_URL`/`VITE_SUBMIT_TOKEN` doluysa `#/sorular/<id>` ekranındaki yanıt
formu operatörün cevaplarını `POST /soru-yanit-queue` ile kuyruğa alır. Bunu işlemek için
makinende izleyiciyi çalıştır:

```bash
node scripts/soru-yanit-queue-watch.mjs            # her 45s'de bir kontrol eder, açık kalır
node scripts/soru-yanit-queue-watch.mjs --once      # tek tur (test/cron için)
```

İzleyici `git pull` yapar, `soru-yanit-kuyruk/*.json` bulur, HER gönderim için gerçek
GÜNCEL soru sürümünü (`planlama-durum.json`'dan, gönderimdeki değeri DEĞİL) okuyup sürüm/imza
tazeliğini denetler: eşleşirse `tools/planlamaSorular.mjs`'in kendi `yanitKaydet`/`atlaYaz`
fonksiyonlarıyla YEREL yanıt artefaktına yazar; eşleşmezse (bayat/kurcalanmış/defekt) gönderimi
SESSİZCE atmaz — `soru-yanit-kuyruk/reddedilen/`e taşır ve yüksek sesle loglar. İşlenen/reddedilen
her öğe kuyruktan kaldırılıp push edilir. **Yalnız makine + bu process açıkken çalışır** —
kapatılırsa gönderim kuyrukta bekler.

İzleyici planlama pipeline'ını BAŞLATMAZ/İLERLETMEZ — yanıt artefaktına yazmak ile pipeline'ı
ilerletmek kasıtlı olarak ayrı iki iştir. Pipeline'ı ilerletmek insan tarafından, ayrı bir
terminal komutuyla yapılır: `node scripts/planlama-baslat.mjs <id>`. Bkz
`soru-yanit-kuyruk/README.md`.

---

## Lokal geliştirme (opsiyonel)
```bash
cd worker
cp .dev.vars.example .dev.vars   # GERÇEK değerleri doldur (.dev.vars gitignored)
wrangler dev                     # http://localhost:8787
```
Lokal client testi için `ALLOWED_ORIGIN`'e `http://localhost:5173` ekle (virgülle).

---

## Güvenlik notları
- **`SUBMIT_TOKEN` client JS'inde görünür** (gh-pages public). Kararlı saldırgana karşı gerçek değil —
  hafif casual-abuse kapısı (v1, Barış için kabul). `GITHUB_TOKEN` server-side = gerçek.
- Mevcut sertleştirme (kod içinde): CORS origin-allowlist + sabit-zaman token compare + boyut limiti + 409 retry.
- **Ucuz v1-sonrası sertleştirme** (öneri, zorunlu değil): Cloudflare Turnstile (free CAPTCHA) +
  KV ile basit rate-limit. İkisi de `/submit`'e birkaç satır.
- **Çok-proje**: `INBOX_PATH` tek dosya (v1). İkinci partner gelince, `projeId`'yi path'e GÖMME
  (traversal riski) — server-side `{projeId → path}` allowlist map ekle.

## Seam (orkestratör notu)
Kanonik inbox **Drive'da** (`projeler/baris/inbox.md`); Worker yalnız **git'e** yazabilir. Bu yüzden
partner cevapları `partner-inbox/baris.md`'ye (git) düşer = **ikinci kanal**. Loop bunu okuyup Drive
kanoniğine uzlaştırmalı, sonra git dosyasını temizlemeli. v1 düşük-hacim (Barış 4 kart) → kabul.
