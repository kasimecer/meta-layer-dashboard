import { useState, useEffect } from 'react'
import BarisCard from './components/BarisCard.jsx'

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('./card-data.json')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => setError('card-data.json yüklenemedi — önce npm run build-data çalıştır.'))
  }, [])

  if (error) return (
    <div style={{ padding: 24, color: '#dc2626', fontSize: 14 }}>{error}</div>
  )
  if (!data) return (
    <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>
  )

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#71717a', letterSpacing: 0.3 }}>
          Partner Dashboard
        </h1>
      </header>
      <BarisCard data={data} />
    </div>
  )
}
