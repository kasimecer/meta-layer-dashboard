# soru-yanit-kuyruk/

Bu dizin bir **iş kuyruğudur** — insan tarafından elle düzenlenmez.

Akış:
1. Operatör `#/sorular/<id>` ekranında (SoruYanitView) açık planlama sorularını yanıtlar
   (CHOICE/DATA-REQUEST/FREE-TEXT) veya açıkça atlar, sonra gönderir.
2. Tarayıcı, Cloudflare Worker'ın `POST /soru-yanit-queue` uç noktasına gönderimi yollar.
3. Worker, `GITHUB_TOKEN` ile bu dizine `<projeId>--<asama>--v<surum>.json` dosyasını commit
   eder (bkz `worker/worker.js`). Worker burada yalnız SIĞ doğrulama yapar (alan varlığı,
   `asama` whitelist, `surum` tam-sayı) — sürüm/imza tazeliğini ya da yanıt şeklini DEĞERLENDİRMEZ.
4. Kullanıcının kendi makinesinde çalışan `node scripts/soru-yanit-queue-watch.mjs` bu dosyayı
   periyodik `git pull` ile bulur, GERÇEK GÜNCEL soru sürümünü (`planlama-durum.json`'dan;
   gönderimdeki değeri KÖRÜ KÖRÜNE GÜVENMEDEN) okuyup karşılaştırır:
   - **Eşleşirse**: `tools/planlamaSorular.mjs`'in kendi `yanitKaydet`/`atlaYaz`
     fonksiyonlarıyla YEREL yanıt artefaktına (`<asama>-yanitlar[-vN].json`) yazar, sonra
     kuyruk dosyasını kaldırır (`git rm` + commit + push).
   - **Bayat/kurcalanmış/defekt ise**: gönderim SESSİZCE ATILMAZ ve SESSİZCE GÜNCEL SAYILMAZ —
     `reddedilen/` alt dizinine taşınır (görünür, izlenebilir) + yüksek sesle loglanır + commit
     edilip push edilir. Bayat bir sürüme karşı sonsuz yeniden-deneme anlamsızdır (o sürüm asla
     yeniden güncel olmaz), bu yüzden intake-kuyruğunun "başarısızsa kuyrukta kalır, tekrar
     denenir" davranışından BİLEREK farklıdır.

**Kasıtlı sınır — pipeline burada BAŞLAMAZ/İLERLEMEZ:** yanıt artefaktına yazmak (kaydı diskte
var etmek) ile planlama pipeline'ını (genesis→premise→arastirma→strateji→master-plan)
ilerletmek BİLEREK ayrı iki iştir. Bu izleyici SADECE `tools/planlamaSorular.mjs` ve
`tools/planlamaDurumMakinesiV2.mjs`'ten import eder — `tools/planlamaBaslat.mjs`,
`tools/planlamaLoopV2.mjs`, `tools/canliExecutor.mjs` hiçbir yerde YOKTUR; model çağrısına veya
aşama geçişine giden hiçbir kod yolu YAPISAL OLARAK yoktur. Pipeline'ı ilerletmek insan
tarafından açık bir terminal komutuyla yapılır:
```
node scripts/planlama-baslat.mjs           # bekleyen/kısmi/bloke/AÇIK SORULAR projeleri listeler
node scripts/planlama-baslat.mjs <id>      # o proje için pipeline'ı başlat/devam ettir
```

**`reddedilen/`** — karantina. Bayat/kurcalanmış/defekt gönderimler buraya taşınır, görünür
kalır (silinmez), izleme/denetim için. Aynı adda bir dosya zaten varsa zaman-damgalı önek
eklenerek çakışma önlenir.

**Önemli sınır:** İzleyici yalnız kullanıcının makinesi + process açıkken kuyruğu işler.
Anlık/her-zaman-açık bir bulut-servisi DEĞİL — makine kapalıysa gönderim burada bekler.
