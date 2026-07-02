# intake-kuyruk/

Bu dizin bir **iş kuyruğudur** — insan tarafından elle düzenlenmez.

Akış:
1. Kullanıcı IntakeView'de (`#/baslat`) bir taslak oluşturur ve **"Materyalize et"** butonuna basar.
2. Tarayıcı, Cloudflare Worker'ın `POST /intake-queue` uç noktasına taslağı gönderir.
3. Worker, `GITHUB_TOKEN` ile bu dizine `<id>.json` dosyasını commit eder (bkz `worker/worker.js`).
4. Kullanıcının kendi makinesinde çalışan `node scripts/intake-queue-watch.mjs` bu dosyayı
   periyodik `git pull` ile bulur, `tools/intakeMateryalizeEt.mjs` ile YEREL materyalize eder
   (kayıt registry'de + proje dosyaları diskte var olur).
5. Materyalizasyon başarılıysa izleyici dosyayı kuyruktan kaldırır (`git rm` + commit + push).

**Kasıtlı sınır — pipeline burada BAŞLAMAZ:** materyalize etmek (kaydı var etmek) ile planlama
pipeline'ını (genesis→premise→arastirma→strateji→master-plan) başlatmak BİLEREK ayrı iki iştir.
Ne izleyici ne de elle-materyalize komutu pipeline'ı kendiliğinden tetikler. Pipeline'ı
başlatmak/devam ettirmek insan tarafından açık bir terminal komutuyla yapılır:
```
node scripts/planlama-baslat.mjs           # bekleyen/kısmi/bloke projeleri listeler
node scripts/planlama-baslat.mjs <id>      # o proje için pipeline'ı başlat/devam ettir
```
Pipeline idempotenttir (geçmiş aşamaları atlar), bu yüzden aynı komut hem ilk-başlatma hem
yarıda-kalanı-devam-ettirme için kullanılır.

**Kuyruk-temizleme kuralı:** bir öğe kuyruktan YALNIZ materyalizasyon başarılı olduğunda
kaldırılır — planlama pipeline'ının durumuyla (başlamış/bloke/tamamlanmış) hiçbir ilişkisi
yoktur, çünkü pipeline artık burada hiç çalışmıyor. Materyalizasyon başarısız olursa (bozuk
JSON, path-traversal reddi, dosya-sistemi hatası) öğe kuyrukta kalır, bir sonraki turda tekrar
denenir.

**Önemli sınır:** İzleyici yalnız kullanıcının makinesi + process açıkken kuyruğu işler.
Anlık/her-zaman-açık bir bulut-materyalizasyonu DEĞİL — makine kapalıysa kayıt burada bekler.

Elle materyalize etmek istersen (izleyicisiz), yedek yol hâlâ çalışır:
```
node scripts/intake-materialize.mjs <taslak.json>
```
