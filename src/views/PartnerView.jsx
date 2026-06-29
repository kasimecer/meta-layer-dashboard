import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import Card from '../components/Card.jsx'
import { kartDogrula, gecisUygula } from '../lib/stateMachine.js'
import { submitPartnerInput, CANLI } from '../lib/writePath.js'

// Simülasyon cevapları — yalnız baris; gerçek cevap değil, uçtan-uca test.
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
  'tamamlandı':       { bg: '#dcfce7', color: '#166534' },
}

function MomentumBadge({ value }) {
  const s = MOMENTUM_STYLE[value] ?? { bg: '#ede9fe', color: '#5b21b6' }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 99,
      fontSize: 12, fontWeight: 600, background: s.bg, color: s.color,
      lineHeight: 1.4,
    }}>{value}</span>
  )
}

// ── Baris için mevcut Ozet bileşeni (değişmedi) ─────────────────────────────
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

// ── Yeni proje yüzü başlığı (baris dışı projeler için) ──────────────────────
function AsamaAdim({ ad, durum }) {
  const cfg = {
    bitti:   { renk: '#16a34a', bg: '#f0fdf4', isaret: '✓ ' },
    aktif:   { renk: '#4f46e5', bg: '#eef2ff', isaret: '● ' },
    gelecek: { renk: '#a1a1aa', bg: 'transparent', isaret: '' },
  }
  const r = cfg[durum] ?? cfg.gelecek
  return (
    <span style={{
      fontSize: 12, fontWeight: durum === 'aktif' ? 700 : 500,
      color: r.renk, background: r.bg,
      padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {r.isaret}{ad}
    </span>
  )
}

function ProjeHeader({ ozet, hepsiBitti }) {
  const asamalar = ozet.asamalar ?? []
  const asamaIndeks = ozet.asama_indeks ?? 0

  return (
    <div style={{
      background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14,
      padding: '24px 24px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: '#18181b', margin: 0, letterSpacing: -0.3 }}>
          {ozet.proje}
        </h1>
        <MomentumBadge value={hepsiBitti ? 'tamamlandı' : ozet.momentum} />
      </div>

      {asamalar.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14, flexWrap: 'wrap' }}>
          {asamalar.map((a, i) => {
            const durum = (hepsiBitti && i === asamaIndeks)
              ? 'bitti'
              : i < asamaIndeks ? 'bitti' : i === asamaIndeks ? 'aktif' : 'gelecek'
            return (
              <span key={a} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <AsamaAdim ad={a} durum={durum} />
                {i < asamalar.length - 1 && (
                  <span style={{ color: '#d4d4d8', fontSize: 11, userSelect: 'none' }}>›</span>
                )}
              </span>
            )
          })}
        </div>
      )}

      {hepsiBitti ? (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          fontSize: 14, color: '#15803d', fontWeight: 600, lineHeight: 1.5,
        }}>
          Kararlarınız alındı. Sıradaki adım: {ozet.sonraki_kritik_adim}
        </div>
      ) : (
        <>
          <p style={{ fontSize: 14, color: '#3f3f46', lineHeight: 1.6, marginTop: 14, marginBottom: 0 }}>
            {ozet.son_ilerleme}
          </p>
          {ozet.bekleyen_insan_girdisi && (
            <div style={{
              display: 'flex', gap: 8,
              background: '#fefce8', border: '1px solid #fde68a',
              borderRadius: 8, padding: '9px 13px', marginTop: 12,
              fontSize: 13, color: '#713f12', lineHeight: 1.45,
            }}>
              <span>⏳</span>
              <span><strong>Senden bekleniyor:</strong> {ozet.bekleyen_insan_girdisi}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Pipe() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}><div style={{ width: 2, height: 24, background: '#e4e4e7', borderRadius: 1 }} /></div>
}

// ── localStorage yardımcıları (yalnız baris-dışı projeler; tamamen izole) ──
function localStorageAnahtari(projeId) {
  return `ml-partner-cevaplar-${projeId}`
}

function yerelCevaplariYukle(projeId) {
  try {
    return JSON.parse(localStorage.getItem(localStorageAnahtari(projeId)) ?? '[]')
  } catch { return [] }
}

function yerelCevapKaydet(projeId, kart) {
  try {
    const mevcut = yerelCevaplariYukle(projeId)
    const idx = mevcut.findIndex(c => c.id === kart.id)
    const kayit = { id: kart.id, durum: kart.durum, partner_cevap: kart.partner_cevap ?? null }
    if (idx >= 0) mevcut[idx] = kayit; else mevcut.push(kayit)
    localStorage.setItem(localStorageAnahtari(projeId), JSON.stringify(mevcut))
  } catch { /* localStorage erişilemez — sessizce atla */ }
}

// Yerel kayıtları JSON'dan gelen kartlara overlay eder (refresh sonrası cevaplar korunur).
function yerelCevaplariUygula(kartlar, projeId) {
  const kayitlar = yerelCevaplariYukle(projeId)
  if (!kayitlar.length) return kartlar
  const kayitMap = Object.fromEntries(kayitlar.map(c => [c.id, c]))
  return kartlar.map(k => kayitMap[k.id] ? { ...k, ...kayitMap[k.id] } : k)
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────
export default function PartnerView({ projeId = 'baris' }) {
  const [ozet, setOzet] = useState(null)
  const [kartlar, setKartlar] = useState(null)
  const [hata, setHata] = useState(null)
  const [inboxLog, setInboxLog] = useState([])
  const [simAktif, setSimAktif] = useState(false)

  const isBaris = projeId === 'baris'

  useEffect(() => {
    if (isBaris) {
      Promise.all([
        fetch('./card-data.json').then(r => r.ok ? r.json() : Promise.reject('card-data.json yüklenemedi')),
        fetch('./cards-baris.json').then(r => r.ok ? r.json() : Promise.reject('cards-baris.json yüklenemedi')),
      ]).then(([c, cards]) => {
        const liste = cards.kartlar ?? cards
        liste.forEach(k => { const h = kartDogrula(k); if (h.length) console.warn('şema uyarısı', k.id, h) })
        setOzet(c)
        setKartlar(liste)
      }).catch(e => setHata(String(e)))
    } else {
      fetch(`./cards-${projeId}.json`)
        .then(r => r.ok ? r.json() : Promise.reject(`cards-${projeId}.json yüklenemedi`))
        .then(data => {
          const rawListe = data.kartlar ?? []
          // Yerel cevapları JSON üstüne overlay et → refresh sonrası cevaplandı durumu korunur.
          // Yalnız baris-dışı (demo) projeler; baris kanonik yol kullanır.
          const liste = yerelCevaplariUygula(rawListe, projeId)
          liste.forEach(k => { const h = kartDogrula(k); if (h.length) console.warn('şema uyarısı', k.id, h) })
          setOzet(data)
          setKartlar(liste)
        })
        .catch(e => setHata(String(e)))
    }
  }, [projeId, isBaris])

  async function cevapla(kart, cevap) {
    if (!isBaris) {
      // Demo projeler: in-memory + localStorage kalıcılık; inbox'a / git'e YAZILMAZ.
      const yeniKart = { ...gecisUygula(kart, 'cevaplandi'), partner_cevap: cevap }
      yerelCevapKaydet(projeId, yeniKart)   // yenilemeye karşı tarayıcı-yerel kayıt
      setKartlar(ks => ks.map(k => k.id === kart.id ? yeniKart : k))
      return { ok: true, kart: yeniKart, mock: true }
    }
    const r = await submitPartnerInput({ projeId, kart, cevap })
    if (!r.ok) { console.warn('yazma-yolu:', r.hata); return r }
    setKartlar(ks => ks.map(k => (k.id === kart.id ? r.kart : k)))
    setInboxLog(log => [...log, r.inboxSatiri])
    return r
  }

  async function simulasyonCalistir() {
    setSimAktif(true)
    for (const k of kartlar) {
      if (k.tip === 'girdi-talebi' && k.durum === 'cevap-bekliyor' && SIM_CEVAP[k.id]) {
        await cevapla(k, SIM_CEVAP[k.id])
      }
    }
  }

  if (hata) return <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{hata}</div>
  if (!ozet || !kartlar) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>

  const bekleyenSayi = kartlar.filter(k => k.tip === 'girdi-talebi' && k.durum === 'cevap-bekliyor').length
  const toplamGirdiSayi = kartlar.filter(k => k.tip === 'girdi-talebi').length
  const hepsiBitti = bekleyenSayi === 0 && toplamGirdiSayi > 0

  return (
    <div>
      {isBaris ? (
        <Ozet data={ozet} />
      ) : (
        <ProjeHeader ozet={ozet} hepsiBitti={hepsiBitti} />
      )}

      {/* Simülasyon — yalnız baris, yalnız dev */}
      {isBaris && bekleyenSayi > 0 && !CANLI && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#f5f3ff', border: '1px dashed #c4b5fd', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={simulasyonCalistir} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#7c3aed', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
            ▶ Simülasyonu çalıştır (placeholder A1–A4)
          </button>
          <span style={{ fontSize: 12, color: '#6d28d9' }}>Test amaçlı; gerçek Barış cevabı değil. Yenileyince sıfırlanır.</span>
        </div>
      )}
      {isBaris && simAktif && (
        <div style={{ marginTop: 10, padding: '8px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#92400e' }}>
          ⚠ SİMÜLASYON — placeholder cevaplar, gerçek Barış verisi DEĞİL
        </div>
      )}

      {/* Kart listesi */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 }}>
          {isBaris
            ? `Yolculuk — ${kartlar.length} adım`
            : `${kartlar.length} adım`}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {kartlar.map((kart, i) => (
            <div key={kart.id}>
              <Card kart={kart} onCevap={(cevap) => cevapla(kart, cevap)} />
              {i < kartlar.length - 1 && <Pipe />}
            </div>
          ))}
        </div>
      </div>

      {/* Yazma-yolu çıktısı — yalnız baris */}
      {isBaris && inboxLog.length > 0 && (
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
