import { useEffect, useState } from 'react'
import { submitSoruYanit } from '../lib/writePath.js'
import SubmitFailureBanner from '../components/SubmitFailureBanner.jsx'

// #/sorular/<id> — planlama pipeline'ının açık sorularını gösterip yanıtlar. Operatör-seviyesi
// (ProjectView'den drill-down, #/proje/<id> ile aynı ruh — jargon-saklama YOK). Dört soru tipi:
//   APPROVAL     — bilgilendirme kartı, bu formdan YANITLANMAZ (CLI'de yeniden-çağırma jesti).
//   CHOICE       — öneri İLK sırada + görünür işaretli (backend sorulariDogrula bunu ZATEN
//                  garanti eder — bu ekran o garantiye GÜVENİR, kendi başına doğrulamaz).
//   DATA-REQUEST — kaynaklanamayan iddia + tam 3 kesin mod (veri/operatör-onaylı-tahmin/düşür).
//   FREE-TEXT    — serbest metin.
// Her APPROVAL-dışı soru ayrıca açıkça atlanabilir (sessiz atlama YOK — gerekçe alanı var).
// Gönderim, mevcut browser→Worker→git-kuyruk→yerel-izleyici yolunu kullanır (submitSoruYanit) —
// pipeline'ı BURADAN başlatmaz/ilerletmez; yalnız kuyruğa yazar.
//
// ÖNEMLİ: bu ekran son `npm run build-data` anlık-görüntüsünü gösterir, CANLI değildir — bir
// --geri sonrası soru sürümü değişmişse, gönderim izleyicide BAYAT olarak reddedilir (sessizce
// güncel SAYILMAZ). Alttaki uyarı bandı bunu operatöre açıkça söyler.

const TIP_ETIKET = { CHOICE: 'SEÇİM', 'DATA-REQUEST': 'VERİ İSTEĞİ', 'FREE-TEXT': 'SERBEST METİN', APPROVAL: 'ONAY' }
const TIP_RENK = { CHOICE: '#4338ca', 'DATA-REQUEST': '#9a3412', 'FREE-TEXT': '#0369a1', APPROVAL: '#71717a' }

const INPUT_STYLE = {
  width: '100%', padding: '8px 11px', border: '1px solid #d4d4d8',
  borderRadius: 7, fontSize: 13, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
}

function TipRozeti({ tip }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
      color: TIP_RENK[tip] ?? '#71717a', border: `1px solid ${TIP_RENK[tip] ?? '#71717a'}`,
      borderRadius: 999, padding: '2px 8px',
    }}>{TIP_ETIKET[tip] ?? tip}</span>
  )
}

function hazirMi(soru, deger) {
  if (!deger) return false
  if (deger.atlandi) return true
  if (soru.tip === 'CHOICE') return !!deger.secim
  if (soru.tip === 'DATA-REQUEST') {
    if (!deger.karar) return false
    if (deger.karar === 'veri') return !!(deger.deger && deger.deger.trim())
    return true
  }
  if (soru.tip === 'FREE-TEXT') return !!(deger.metin && deger.metin.trim())
  return false
}

function yanitKaydiUret(soru, deger) {
  if (deger.atlandi) return { anahtar: soru.anahtar, atlandi: true, gerekce: deger.gerekce || null }
  if (soru.tip === 'CHOICE') return { anahtar: soru.anahtar, secim: deger.secim }
  if (soru.tip === 'DATA-REQUEST') {
    const e = { anahtar: soru.anahtar, karar: deger.karar }
    if (deger.karar === 'veri') {
      e.deger = deger.deger.trim()
      if (deger.kaynak?.trim()) e.kaynak = deger.kaynak.trim()
    }
    return e
  }
  return { anahtar: soru.anahtar, metin: deger.metin.trim() }
}

function AtlaKontrolu({ deger, onDegistir }) {
  const [gerekce, setGerekce] = useState('')
  if (deger?.atlandi) {
    return (
      <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
        ⤼ Atlanacak{deger.gerekce ? ` — ${deger.gerekce}` : ''}
        <button onClick={() => onDegistir(null)} style={{ marginLeft: 8, fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>geri al</button>
      </div>
    )
  }
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
      <input placeholder="atlama gerekçesi (opsiyonel)" value={gerekce} onChange={e => setGerekce(e.target.value)}
        style={{ ...INPUT_STYLE, fontSize: 11, padding: '5px 8px', flex: 1 }} />
      <button onClick={() => onDegistir({ atlandi: true, gerekce: gerekce.trim() || null })} style={{
        fontSize: 11, color: '#71717a', background: '#fff', border: '1px solid #e4e4e7', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
      }}>Atla</button>
    </div>
  )
}

function ChoiceGirdisi({ soru, deger, onDegistir }) {
  return (
    <div>
      {soru.secenekler.map((s, i) => (
        <label key={s} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer',
          border: `1px solid ${deger?.secim === s ? '#6366f1' : '#e4e4e7'}`, borderRadius: 8,
          background: deger?.secim === s ? '#eef2ff' : '#fff',
        }}>
          <input type="radio" name={soru.anahtar} checked={deger?.secim === s} onChange={() => onDegistir({ secim: s })} />
          <span style={{ fontSize: 13, color: '#27272a' }}>{s}</span>
          {i === 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#4338ca', background: '#e0e7ff', padding: '2px 8px', borderRadius: 999 }}>ÖNERİLEN</span>
          )}
        </label>
      ))}
    </div>
  )
}

function DataRequestGirdisi({ soru, deger, onDegistir }) {
  const karar = deger?.karar
  const secenekler = soru.secenekler_kararli ?? []
  return (
    <div>
      {soru.iddia && (
        <div style={{ fontSize: 12.5, color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px', marginBottom: 8, lineHeight: 1.5 }}>
          <strong>Kaynaklanamayan iddia:</strong> {soru.iddia}
          {soru.kaynak && <div style={{ marginTop: 2, fontSize: 11, color: '#9a5b3a' }}>denenen kaynak: {soru.kaynak}</div>}
        </div>
      )}
      {secenekler.map(({ karar: k, etiket }) => (
        <label key={k} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer',
          border: `1px solid ${karar === k ? '#6366f1' : '#e4e4e7'}`, borderRadius: 8,
          background: karar === k ? '#eef2ff' : '#fff',
        }}>
          <input type="radio" name={soru.anahtar} checked={karar === k}
            onChange={() => onDegistir({ karar: k, deger: deger?.deger ?? '', kaynak: deger?.kaynak ?? '' })} />
          <span style={{ fontSize: 13, color: '#27272a' }}>{etiket}</span>
        </label>
      ))}
      {karar === 'veri' && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input placeholder="Değer (ör. yıllık %18)" value={deger?.deger ?? ''} onChange={e => onDegistir({ ...deger, deger: e.target.value })} style={INPUT_STYLE} />
          <input placeholder="Kaynak (opsiyonel)" value={deger?.kaynak ?? ''} onChange={e => onDegistir({ ...deger, kaynak: e.target.value })} style={INPUT_STYLE} />
        </div>
      )}
    </div>
  )
}

function FreeTextGirdisi({ soru, deger, onDegistir }) {
  return (
    <textarea rows={3} value={deger?.metin ?? ''} onChange={e => onDegistir({ metin: e.target.value })}
      placeholder="Yanıtını buraya yaz…" style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }} />
  )
}

function SoruKart({ soru, deger, onDegistir, salt }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e4e4e7', borderRadius: 10, padding: '14px 16px', marginBottom: 10,
      opacity: salt ? 0.75 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <TipRozeti tip={soru.tip} />
        <span style={{ fontSize: 13.5, color: '#18181b', fontWeight: 600, lineHeight: 1.45 }}>{soru.metin}</span>
      </div>

      {soru.tip === 'APPROVAL' && (
        <div style={{ fontSize: 12.5, color: '#71717a', lineHeight: 1.5 }}>
          Bu adım bu formdan yapılmaz — terminalden{' '}
          <code style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', background: '#f4f4f5', padding: '1px 5px', borderRadius: 4 }}>
            node scripts/planlama-baslat.mjs &lt;id&gt;
          </code>{' '}ile onaylanır.
        </div>
      )}
      {!salt && soru.tip === 'CHOICE' && <ChoiceGirdisi soru={soru} deger={deger} onDegistir={onDegistir} />}
      {!salt && soru.tip === 'DATA-REQUEST' && <DataRequestGirdisi soru={soru} deger={deger} onDegistir={onDegistir} />}
      {!salt && soru.tip === 'FREE-TEXT' && <FreeTextGirdisi soru={soru} deger={deger} onDegistir={onDegistir} />}
      {!salt && soru.tip !== 'APPROVAL' && <AtlaKontrolu deger={deger} onDegistir={onDegistir} />}
    </div>
  )
}

export default function SoruYanitView({ projeId }) {
  const [data, setData] = useState(undefined) // undefined = yükleniyor, null = bulunamadı
  const [taslaklar, setTaslaklar] = useState({})
  const [durum, setDurum] = useState('bos') // bos | gonderiliyor | basarili | hata | mock
  const [detay, setDetay] = useState('')

  useEffect(() => {
    setData(undefined); setTaslaklar({}); setDurum('bos'); setDetay('')
    fetch(`./sorular-${projeId}.json`).then(r => r.ok ? r.json() : null)
      .then(setData).catch(() => setData(null))
  }, [projeId])

  function guncelle(anahtar, deger) {
    setTaslaklar(t => ({ ...t, [anahtar]: deger }))
  }

  async function gonder() {
    const substantive = data.acik_sorular.filter(s => hazirMi(s, taslaklar[s.anahtar]))
    if (substantive.length === 0) return
    setDurum('gonderiliyor'); setDetay('')
    const gonderim = {
      projeId, asama: data.asama, surum: data.surum, soruImza: data.soru_imza,
      yanitlar: substantive.map(s => yanitKaydiUret(s, taslaklar[s.anahtar])),
    }
    const r = await submitSoruYanit({ gonderim })
    if (r.mock) { setDurum('mock'); setDetay(r.hata); return }
    if (!r.ok) { setDurum('hata'); setDetay(r.hata); return }
    setDurum('basarili'); setDetay(r.path || '')
  }

  if (data === undefined) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>
  if (data === null) {
    return (
      <div style={{ padding: 24 }}>
        <a href={`#/proje/${projeId}`} style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>← proje</a>
        <div style={{ marginTop: 12, color: '#dc2626', fontSize: 14 }}>sorular-{projeId}.json bulunamadı — bu proje için planlama soru katmanı üretilmemiş olabilir.</div>
      </div>
    )
  }

  const hazirSayisi = data.acik_sorular?.filter(s => hazirMi(s, taslaklar[s.anahtar])).length ?? 0

  return (
    <div style={{ maxWidth: 680 }}>
      <a href={`#/proje/${projeId}`} style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>← proje</a>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#18181b', marginTop: 12, marginBottom: 4 }}>
        Planlama soruları — {projeId}
      </h2>
      <div style={{ fontSize: 12.5, color: '#71717a', marginBottom: 6 }}>
        {data.tamamlandi ? 'pipeline tamamlandı' : `aktif aşama: ${data.aktif_asama ?? '—'}`}
      </div>
      <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 18, lineHeight: 1.5 }}>
        Bu görünüm son <code style={{ fontFamily: 'ui-monospace, monospace' }}>npm run build-data</code> anlık-görüntüsüne
        aittir, canlı değildir — aradan bir <code style={{ fontFamily: 'ui-monospace, monospace' }}>--geri</code> ya da
        yeniden-koşum geçmişse gönderimin bayat sayılıp reddedilmesi (sessizce güncel SAYILMAMASI) beklenir.
      </div>

      {data.reddedilen_gonderimler?.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.55 }}>
          ⚠ {data.reddedilen_gonderimler.length} önceki gönderim reddedildi (bayat/kurcalanmış/defekt) — sessizce
          atılmadı, <code style={{ fontFamily: 'ui-monospace, monospace' }}>soru-yanit-kuyruk/reddedilen/</code>'de
          görünür kalıyor. Aşağıdaki güncel soruları yeniden yanıtlayın.
        </div>
      )}

      {data.soru_turu === 'yok' && (
        <div style={{ padding: '16px 18px', background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: 10, fontSize: 13, color: '#71717a' }}>
          Şu anda açık bir soru turu yok.
        </div>
      )}

      {data.soru_turu === 'defekt' && (
        <div style={{ padding: '16px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#b91c1c', lineHeight: 1.55 }}>
          ✗ Bu aşamanın soru paketi defekt (yapısal olarak geçersiz) — normal bir form olarak
          gösterilemez.{data.defekt_nedeni && <div style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{data.defekt_nedeni}</div>}
        </div>
      )}

      {data.soru_turu === 'gecerli' && (
        <>
          {data.yanit_butunluk === 'bozuk' && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 12.5, color: '#92400e' }}>
              ⚠ Yanıt artefaktı BOZUK bulundu — sorular yeniden yayınlandı, tüm sorular açık sayılıyor.
            </div>
          )}

          {data.acik_sorular.length === 0 ? (
            <div style={{ padding: '16px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, color: '#166534' }}>
              ✓ Açık soru yok — bu aşama için tüm sorular yanıtlanmış/atlanmış.
            </div>
          ) : (
            durum === 'basarili' ? (
              <div style={{ padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, color: '#166534', lineHeight: 1.55 }}>
                ✓ Kuyruğa alındı{detay ? ` (${detay})` : ''} — yerel izleyici
                (<code style={{ fontFamily: 'ui-monospace, monospace' }}>node scripts/soru-yanit-queue-watch.mjs</code>)
                makinende çalıştığında otomatik yanıt artefaktına yazacak. Pipeline'ı ilerletmek ayrı, elle bir
                adım: <code style={{ fontFamily: 'ui-monospace, monospace' }}>node scripts/planlama-baslat.mjs</code>.
              </div>
            ) : (
              <>
                {data.acik_sorular.map(s => (
                  <SoruKart key={s.anahtar} soru={s} deger={taslaklar[s.anahtar]} onDegistir={d => guncelle(s.anahtar, d)} />
                ))}

                <button onClick={gonder} disabled={hazirSayisi === 0 || durum === 'gonderiliyor'} style={{
                  marginTop: 8, fontSize: 13, fontWeight: 700, padding: '10px 22px', borderRadius: 9, border: 'none',
                  background: hazirSayisi > 0 && durum !== 'gonderiliyor' ? '#6366f1' : '#c7d2fe', color: '#fff',
                  cursor: hazirSayisi > 0 && durum !== 'gonderiliyor' ? 'pointer' : 'default',
                }}>
                  {durum === 'gonderiliyor' ? 'Gönderiliyor…' : `Gönder (${hazirSayisi}/${data.acik_sorular.length} hazır)`}
                </button>

                <SubmitFailureBanner
                  durum={durum}
                  detay={`${detay} Girdiğin yanıtlar korundu, kaybolmadı.`}
                  onRetry={gonder}
                />
              </>
            )
          )}

          {data.ertelenen_sorular?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Ertelenen ({data.ertelenen_sorular.length}) — bloklamaz, görünür
              </div>
              {data.ertelenen_sorular.map(s => <SoruKart key={s.anahtar} soru={s} salt />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
