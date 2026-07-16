import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'

// #/dokuman/<projeId>/<docKey> — operator-<projeId>.json'daki dokumanlar[] içinden AYNI
// snapshot'ı okuyup içeriği (build-time'da gömülen `icerik` alanı) in-app render eder.
// dosyaHref (file://) ile AÇILAMAYAN doküman linklerinin (bkz meta-kanal.md 2026-07-16 16:35
// recon kaydı) yerini alır — .md dosyaları deploy çıktısına HİÇ girmediği için içerik yalnız
// bu gömülü alandan gelebilir, ayrı bir dosya fetch'i YOKTUR.
// docKey eşleşmesi ProjectView.jsx'teki dokumanAnahtari ile AYNI kural: d.asama ?? d.ad.

export default function DocumentView({ projeId, docKey }) {
  const [operator, setOperator] = useState(undefined) // undefined = yükleniyor, null = bulunamadı

  useEffect(() => {
    setOperator(undefined)
    fetch(`./operator-${projeId}.json`).then(r => r.ok ? r.json() : null)
      .then(setOperator).catch(() => setOperator(null))
  }, [projeId])

  if (operator === undefined) return <div style={{ padding: 24, color: '#71717a', fontSize: 14 }}>Yükleniyor…</div>

  const geriLink = <a href={`#/proje/${projeId}`} style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>← proje</a>

  if (operator === null) {
    return (
      <div style={{ padding: 24 }}>
        {geriLink}
        <div style={{ marginTop: 12, color: '#dc2626', fontSize: 14 }}>operator-{projeId}.json bulunamadı.</div>
      </div>
    )
  }

  const doc = (operator.dokumanlar ?? []).find(d => (d.asama ?? d.ad) === docKey)

  if (!doc) {
    return (
      <div style={{ padding: 24 }}>
        {geriLink}
        <div style={{ marginTop: 12, color: '#dc2626', fontSize: 14 }}>"{docKey}" bu projenin doküman listesinde yok.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {geriLink}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#18181b', marginTop: 12, marginBottom: 2 }}>{doc.ad}</h2>
      {doc.asama && <div style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'ui-monospace, monospace', marginBottom: 14 }}>{doc.asama}</div>}
      {doc.icerik ? (
        <div style={{
          fontSize: 13.5, lineHeight: 1.6, color: '#27272a',
          background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 10, padding: '18px 22px',
        }}>
          <Markdown>{doc.icerik}</Markdown>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#a1a1aa', fontStyle: 'italic' }}>
          İçerik bu anlık görüntüde gömülü değil (eski bir build-data koşumu olabilir — `npm run build-data` yeniden koşturun).
        </div>
      )}
    </div>
  )
}
