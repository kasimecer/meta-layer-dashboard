import { useEffect, useState } from 'react'
import PartnerView from './views/PartnerView.jsx'
import PortfolioView from './views/PortfolioView.jsx'
import ProjectView from './views/ProjectView.jsx'

// meta-layer-core — hash-tabanlı scoped router (GH-Pages-güvenli, ek bağımlılık yok).
//   #/portfoy            → portföy
//   #/proje/<id>         → proje
//   #/partner/<id>       → partner — temiz sayfa (iç başlık/nav gizlenir)
function rota() {
  const h = (window.location.hash || '').replace(/^#\/?/, '')
  const [view, projeId] = h.split('/')
  return { view: view || 'portfoy', projeId: projeId || 'baris' }
}

const SEKMELER = [
  { key: 'portfoy', label: 'Portföy', hash: '#/portfoy' },
  { key: 'proje',   label: 'Proje',   hash: '#/proje/baris' },
  { key: 'partner', label: 'Partner', hash: '#/partner/baris' },
]

export default function App() {
  const [r, setR] = useState(rota())

  useEffect(() => {
    const f = () => setR(rota())
    window.addEventListener('hashchange', f)
    if (!window.location.hash) window.location.hash = '#/portfoy'
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // Partner görünümü: iç başlık ve nav tab'lar gizlenir — ortak sade bir sayfa görür.
  if (r.view === 'partner') {
    return <PartnerView projeId={r.projeId} />
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 15, fontWeight: 700, color: '#18181b', letterSpacing: 0.2 }}>meta-layer-core</h1>
        <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 2 }}>birleşik kontrol katmanı · slice 1</div>
      </header>

      {/* Nav — üç scoped görünüm */}
      <nav style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #e4e4e7', paddingBottom: 0 }}>
        {SEKMELER.map(s => {
          const aktif = r.view === s.key
          return (
            <a key={s.key} href={s.hash} style={{
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              padding: '8px 14px', borderRadius: '8px 8px 0 0',
              color: aktif ? '#4338ca' : '#71717a',
              background: aktif ? '#eef2ff' : 'transparent',
              borderBottom: aktif ? '2px solid #6366f1' : '2px solid transparent',
            }}>{s.label}</a>
          )
        })}
      </nav>

      {r.view === 'portfoy' && <PortfolioView />}
      {r.view === 'proje'   && <ProjectView projeId={r.projeId} />}
    </div>
  )
}
