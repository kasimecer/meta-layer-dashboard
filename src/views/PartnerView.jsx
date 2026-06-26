import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import Card from '../components/Card.jsx'
import { kartDogrula } from '../lib/stateMachine.js'
import { submitPartnerInput } from '../lib/writePath.js'

// Placeholder SİMÜLASYON cevapları — GERÇEK Barış cevabı DEĞİL; yalnız uçtan-uca test.
// In-memory; sayfa yenileyince sıfırlanır (localStorage yok, gerçek dosya bozulmaz).
const SIM_CEVAP = {
  'baris-k12': 'Hemrena Göteborg',
  'baris-k13': 'begagnad (ikinci el) makine',
  'baris-k14': 'marj OK, yeterli',
  'baris-k15': 'parite liste onaylandı',
}

const MOMENTUM_STYLE = {
  'araştırma':        { bg: '#dbeafe', color: '#1d4ed8' },
  'planlama':         { bg: '#fef9c3', color: '#854d0e' },
  'karar-bekliyor':   { bg: '#fde8c8', color: '#9a3412' },
  'aktif':            { bg: '#dcfce7', color: '#166534' },
}

function MomentumBadge({ value }) {
  const s = MOMENTUM_STYLE[value] ?? { bg: '#ede9fe', color: '#5b21b6' }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 99,
      fontSize: 12, fontWeight: 600, background: s.bg, color: s.color,
      lineHeight: 1.4, maxWidth: '100%',
    }}>{value}</span>
  )
}

function Ozet({ data }) {
  const [open, setOpen] = useState(false)
  const { proje, tarih, momentum, son_ilerleme, sonraki_kritik_adim, bekleyen_insan_girdisi, partner_ozet, arsiv_link } = data
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden' }}>
      <button onClick={() => partner_ozet && setOpen(o => !o)} aria-expanded={open} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '20px 24px', cursor: partner_ozet ? 'pointer' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize' }}>{proje}</span>
          <MomentumBadge value={momentum} />
          {partner_ozet && <span style={{ marginLeft: 'auto', fontSize: 18, color: '#a1a1aa' }}>{open ? '▲' : '▼'}</span>}
        </div>
        {bekleyen_insan_girdisi && (
          <div style={{ display: 'flex', gap: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, color: '#9a3412' }}>
            <span>⏳</span><span><strong>Senin girdin bekleniyor:</strong> {bekleyen_insan_girdisi}</span>
          </div>
        )}
        <p style={{ fontSize: 14, color: '#3f3f46', lineHeight: 1.55, marginBottom: 8 }}>{son_ilerleme}</p>
        <div style={{ display: 'flex', gap: 6, fontSize: 13, color: '#52525b' }}>
          <span style={{ marginTop: 1 }}>→</span><span>{sonraki_kritik_adim}</span>
        </div>
        <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 10 }}>{tarih}</div>
      </button>
      {open && partner_ozet && (
        <div style={{ borderTop: '1px solid #e4e4e7', padding: '20px 24px' }}>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#27272a' }}>
            <Markdown>{partner_ozet.replace(/<!--.*?-->/gs, '')}</Markdown>
          </div>
          {arsiv_link && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e4e4e7' }}>
              <a href={`./arsiv/${arsiv_link}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>Tam rapor →</a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Pipe() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}><div style={{ width: 2, height: 24, background: '#e4e4e7', borderRadius: 1 }} /></div>
}

export default function PartnerView({ projeId = 'baris' }) {
  const [ozet, setOzet] = useState(null)
  const [kartlar, setKartlar] = useState(null)
  const [hata, setHata] = useState(null)
  const [inboxLog, setInboxLog] = useState([])
  const [simAktif, setSimAktif] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('./card-data.json').then(r => r.ok ? r.json() : Promise.reject('card-data.json yüklenemedi')),
      fetch('./cards-baris.json').then(r => r.ok ? r.json() : Promise.reject('cards-baris.json yüklenemedi')),
    ]).then(([c, cards]) => {
      const liste = cards.kartlar ?? cards
      liste.forEach(k => { const h = kartDogrula(k); if (h.length) console.warn('şema uyarısı', k.id, h) })
      setOzet(c)
      setKartlar(liste)
    }).catch(e => setHata(String(e)))
  }, [projeId])

  async function cevapla(kart, cevap) {
    const r = await submitPartnerInput({ projeId, kart, cevap })
    if (!r.ok) { console.warn('yazma-yolu:', r.hata); return r }
    setKartlar(ks => ks.map(k => (k.id === kart.id ? r.kart : k)))
    setInboxLog(log => [...log, r.inboxSatiri])
    return r
  }

  async function simulasyonCalistir() {
    setSimAktif(true)
    // güncel state'ten oku; sıralı işle
    for (const k of kartlar) {
      if (k.tip === 'girdi-talebi' && k.durum === 'cevap-bekliyor' && SIM_CEVAP[k.id]) {
        await cevapla(k, SIM_CEVAP[k.id])
      }
    }
  }

  if (hata) return <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{hata}</div>
  if (!ozet || !kartlar) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>

  const bekleyenSayi = kartlar.filter(k => k.tip === 'girdi-talebi' && k.durum === 'cevap-bekliyor').length

  return (
    <div>
      <Ozet data={ozet} />

      {/* Simülasyon kontrolü (SLICE 1 e2e testi — placeholder, gerçek değil) */}
      {bekleyenSayi > 0 && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#f5f3ff', border: '1px dashed #c4b5fd', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={simulasyonCalistir} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#7c3aed', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
            ▶ Simülasyonu çalıştır (placeholder A1–A4)
          </button>
          <span style={{ fontSize: 12, color: '#6d28d9' }}>Test amaçlı; gerçek Barış cevabı değil. Yenileyince sıfırlanır.</span>
        </div>
      )}
      {simAktif && (
        <div style={{ marginTop: 10, padding: '8px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#92400e' }}>
          ⚠ SİMÜLASYON — placeholder cevaplar, gerçek Barış verisi DEĞİL
        </div>
      )}

      {/* Kartlar — paylaşılan primitive */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#71717a', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 16 }}>
          Yolculuk — {kartlar.length} adım
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {kartlar.map((kart, i) => (
            <div key={kart.id}>
              <Card kart={kart} onCevap={(cevap) => cevapla(kart, cevap)} />
              {i < kartlar.length - 1 && <Pipe />}
            </div>
          ))}
        </div>
      </div>

      {/* Yazma-yolu çıktısı — mock inbox.md satırları (write-interface görünür kanıt) */}
      {inboxLog.length > 0 && (
        <div style={{ marginTop: 24, padding: '14px 16px', background: '#0f172a', borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            yazma-yolu çıktısı (mock) — inbox.md'ye eklenecek satırlar
          </div>
          <pre style={{ margin: 0, fontSize: 12, color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, fontFamily: 'ui-monospace, monospace' }}>
            {inboxLog.join('\n')}
          </pre>
        </div>
      )}
    </div>
  )
}
