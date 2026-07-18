import { useEffect, useState } from 'react'
import { sirala } from '../lib/registry.js'
import { DurumBadge, StatusBadge, EtiketBadge, TaslakBadge } from '../components/Badges.jsx'
import { taslaklariOku } from '../lib/intakeBuilder.js'
import { portfoyOzetiKirp } from '../lib/metinKirp.js'

// #/portfoy — operatör (E) ana ekranı: tüm projeler tek yerde.
// localStorage taslakları da gösterir (✏ taslak rozeti ile).
// 2026-07-18 (öz-yazma turu) — kısaltma artık YAZMA anında değil BURADA (render) uygulanır; bkz
// src/lib/metinKirp.js:portfoyOzetiKirp (saf mantık, hermetik test edilebilir — bu dosya JSX
// taşıdığı için düz node ile import edilemez).

function ProjeSatiri({ p }) {
  return (
    <div
      onClick={() => { window.location.hash = `#/proje/${p.id}` }}
      role="button"
      style={{
        border: `1px solid ${p._taslak ? '#fde68a' : '#e4e4e7'}`,
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
        background: p._taslak ? '#fffbeb' : '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#18181b' }}>{p.ad}</span>
        {p._taslak ? <TaslakBadge /> : <DurumBadge durum={p.durum} />}
        {!p._taslak && <StatusBadge status={p.status} />}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#a1a1aa' }}>{p.zaman_son_aktivite || '—'}</span>
      </div>
      {!p._taslak && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#71717a' }}>rol: <strong style={{ color: '#52525b' }}>{p.rol}</strong></span>
          <EtiketBadge label="efor:" value={p.efor} />
          <EtiketBadge label="değer:" value={p.deger} />
        </div>
      )}
      <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.5, margin: 0 }}>{portfoyOzetiKirp(p.ozet)}</p>
    </div>
  )
}

function SortBtn({ aktif, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7,
      border: '1px solid', borderColor: aktif ? '#c7d2fe' : '#e4e4e7',
      background: aktif ? '#eef2ff' : '#fff', color: aktif ? '#4338ca' : '#71717a', cursor: 'pointer',
    }}>{children}</button>
  )
}

export default function PortfolioView() {
  const [projeler, setProjeler] = useState(null)
  const [hata, setHata] = useState(null)
  const [mod, setMod] = useState('durum')

  useEffect(() => {
    fetch('./registry.json')
      .then(r => r.ok ? r.json() : Promise.reject('registry.json yüklenemedi'))
      .then(d => {
        const kayitlar = d.projeler ?? d
        // localStorage taslakları kayıtların önüne ekle (aynı id varsa taslak geçerli)
        const taslaklar = taslaklariOku().map(t => ({ ...t.projeKaydi, _taslak: true }))
        const kayitIdler = new Set(kayitlar.map(p => p.id))
        const birlesik = [
          ...taslaklar.filter(t => !kayitIdler.has(t.id)),
          ...kayitlar,
        ]
        setProjeler(birlesik)
      })
      .catch(e => setHata(String(e)))
  }, [])

  if (hata) return <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{hata}</div>
  if (!projeler) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>

  const materialized = projeler.filter(p => !p._taslak)
  const sirali = [
    ...projeler.filter(p => p._taslak),
    ...sirala(materialized, mod),
  ]
  const aktifSayi = materialized.filter(p => p.status === 'aktif').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#18181b', margin: 0 }}>Portföy</h2>
        <span style={{ fontSize: 12, color: '#a1a1aa' }}>
          {materialized.length} proje · {aktifSayi} aktif
          {projeler.filter(p => p._taslak).length > 0 && ` · ${projeler.filter(p => p._taslak).length} taslak`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <SortBtn aktif={mod === 'durum'} onClick={() => setMod('durum')}>duruma göre</SortBtn>
          <SortBtn aktif={mod === 'aktivite'} onClick={() => setMod('aktivite')}>aktiviteye göre</SortBtn>
          <a href="#/baslat" style={{
            fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 7,
            border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca',
            textDecoration: 'none', display: 'inline-block',
          }}>+ Yeni proje</a>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sirali.map(p => <ProjeSatiri key={p.id} p={p} />)}
      </div>
    </div>
  )
}
