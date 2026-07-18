import { useState } from 'react'
import { submitIntakeQueue } from '../lib/writePath.js'
import SubmitFailureBanner from './SubmitFailureBanner.jsx'

// Taslak -> Worker kuyruğu (POST /intake-queue) -> yerel izleyici -> materyalize (kayıt +
// proje dosyaları). Pipeline'ı (genesis→master-plan) BAŞLATMAZ — bu insan tarafından ayrı
// bir terminal komutuyla yapılır: node scripts/planlama-baslat.mjs <id>
// Bkz worker/worker.js, scripts/intake-queue-watch.mjs, intake-kuyruk/README.md.
// Worker BURADA materyalize ETMEZ; anlık bulut-sonucu YOK — makine+izleyici açık olmalı.
// IntakeView (yeni taslak) ve ProjectView (taslak banner) tarafından paylaşılır.
export default function MateryalizeButton({ taslak }) {
  const [durum, setDurum] = useState('bos') // bos | gonderiliyor | basarili | hata | mock
  const [detay, setDetay] = useState('')

  async function tikla() {
    setDurum('gonderiliyor')
    setDetay('')
    const { id, projeKaydi, cardsJson, intakeMd } = taslak
    const r = await submitIntakeQueue({ taslak: { id, projeKaydi, cardsJson, intakeMd } })
    if (r.mock) { setDurum('mock'); setDetay(r.hata); return }
    if (!r.ok) { setDurum('hata'); setDetay(r.hata); return }
    setDurum('basarili'); setDetay(r.path || '')
  }

  if (durum === 'basarili') {
    return (
      <div style={{
        padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 8, fontSize: 12.5, color: '#166534', lineHeight: 1.55,
      }}>
        ✓ Kuyruğa alındı{detay ? ` (${detay})` : ''} — yerel izleyici (<code>node scripts/intake-queue-watch.mjs</code>)
        makinende çalıştığında otomatik materyalize edecek (kayıt + proje dosyaları). Planlama
        pipeline'ını başlatmak ayrı, elle bir adım: <code>node scripts/planlama-baslat.mjs</code>.
        İzleyici kapalıysa kuyrukta bekler; anlık bulut-materyalizasyonu DEĞİL.
      </div>
    )
  }

  return (
    <div>
      <button onClick={tikla} disabled={durum === 'gonderiliyor'} style={{
        fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8, border: 'none',
        background: durum === 'gonderiliyor' ? '#a5b4fc' : '#6366f1', color: '#fff',
        cursor: durum === 'gonderiliyor' ? 'default' : 'pointer',
      }}>
        {durum === 'gonderiliyor' ? 'Kuyruğa alınıyor…' : 'Materyalize et →'}
      </button>
      <div style={{ marginTop: 6, fontSize: 11, color: '#a1a1aa', lineHeight: 1.45 }}>
        Taslağı kuyruğa alır; makinende çalışan yerel izleyici bunu görünce materyalize eder
        (kayıt + proje dosyaları). Planlama pipeline'ı (genesis→master-plan) otomatik başlamaz —
        terminalden elle başlatılır. İzleyici kapalıyken anlık sonuç YOK.
      </div>
      <SubmitFailureBanner
        durum={durum}
        detay={`${detay}${durum === 'hata' ? ' — elle materyalize etmek için: node scripts/intake-materialize.mjs <taslak.json>' : ''}`}
        onRetry={tikla}
      />
    </div>
  )
}
