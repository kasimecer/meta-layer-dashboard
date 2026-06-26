import { useEffect, useState } from 'react'
import { sirala } from '../lib/registry.js'
import { DurumBadge, StatusBadge, EtiketBadge } from '../components/Badges.jsx'

// #/portfoy — operatör (E) ana ekranı: tüm projeler tek yerde.

function ProjeSatiri({ p }) {
  return (
    <div
      onClick={() => { window.location.hash = `#/proje/${p.id}` }}
      role="button"
      style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', background: '#fff' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#18181b' }}>{p.ad}</span>
        <DurumBadge durum={p.durum} />
        <StatusBadge status={p.status} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#a1a1aa' }}>{p.zaman_son_aktivite || '—'}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#71717a' }}>rol: <strong style={{ color: '#52525b' }}>{p.rol}</strong></span>
        <EtiketBadge label="efor:" value={p.efor} />
        <EtiketBadge label="değer:" value={p.deger} />
      </div>
      <p style={{ fontSize: 12.5, color: '#52525b', lineHeight: 1.5, margin: 0 }}>{p.ozet}</p>
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
      .then(d => setProjeler(d.projeler ?? d))
      .catch(e => setHata(String(e)))
  }, [])

  if (hata) return <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{hata}</div>
  if (!projeler) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>

  const sirali = sirala(projeler, mod)
  const aktifSayi = projeler.filter(p => p.status === 'aktif').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#18181b', margin: 0 }}>Portföy</h2>
        <span style={{ fontSize: 12, color: '#a1a1aa' }}>{projeler.length} proje · {aktifSayi} aktif</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <SortBtn aktif={mod === 'durum'} onClick={() => setMod('durum')}>duruma göre</SortBtn>
          <SortBtn aktif={mod === 'aktivite'} onClick={() => setMod('aktivite')}>aktiviteye göre</SortBtn>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sirali.map(p => <ProjeSatiri key={p.id} p={p} />)}
      </div>
    </div>
  )
}
