# intake-kuyruk/

Bu dizin bir **iş kuyruğudur** — insan tarafından elle düzenlenmez.

Akış:
1. Kullanıcı IntakeView'de (`#/baslat`) bir taslak oluşturur ve **"Materyalize et"** butonuna basar.
2. Tarayıcı, Cloudflare Worker'ın `POST /intake-queue` uç noktasına taslağı gönderir.
3. Worker, `GITHUB_TOKEN` ile bu dizine `<id>.json` dosyasını commit eder (bkz `worker/worker.js`).
4. Kullanıcının kendi makinesinde çalışan `node scripts/intake-queue-watch.mjs` bu dosyayı
   periyodik `git pull` ile bulur, `tools/intakeMateryalizeEt.mjs` ile YEREL materyalize eder
   (abonelik-auth burada çalışır) ve planlama pipeline'ını (genesis→master-plan) başlatır.
5. İşlem bitince izleyici dosyayı kuyruktan kaldırır (`git rm` + commit + push).

**Önemli sınır:** İzleyici yalnız kullanıcının makinesi + process açıkken kuyruğu işler.
Anlık/her-zaman-açık bir bulut-materyalizasyonu DEĞİL — makine kapalıysa kayıt burada bekler.

Elle materyalize etmek istersen (izleyicisiz), yedek yol hâlâ çalışır:
```
node scripts/intake-materialize.mjs <taslak.json>
```
