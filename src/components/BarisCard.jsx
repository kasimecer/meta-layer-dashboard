import { useState } from 'react'
import Markdown from 'react-markdown'

const MOMENTUM_STYLE = {
  araştırma:       { bg: '#dbeafe', color: '#1d4ed8', label: 'Araştırma' },
  planlama:        { bg: '#fef9c3', color: '#854d0e', label: 'Planlama' },
  'karar-bekliyor':{ bg: '#fde8c8', color: '#9a3412', label: 'Karar Bekliyor' },
  aktif:           { bg: '#dcfce7', color: '#166534', label: 'Aktif' },
  arsiv:           { bg: '#e4e4e7', color: '#52525b', label: 'Arşiv' },
}

function MomentumBadge({ value }) {
  const s = MOMENTUM_STYLE[value] ?? { bg: '#e4e4e7', color: '#52525b', label: value }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
      letterSpacing: 0.2,
    }}>
      {s.label}
    </span>
  )
}

export default function BarisCard({ data }) {
  const [open, setOpen] = useState(false)

  const {
    proje,
    tarih,
    momentum,
    son_ilerleme,
    sonraki_kritik_adim,
    bekleyen_insan_girdisi,
    partner_ozet,
    arsiv_link,
  } = data

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e4e4e7',
      borderRadius: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      overflow: 'hidden',
    }}>
      {/* Başlık satırı — her zaman görünür */}
      <button
        onClick={() => partner_ozet && setOpen(o => !o)}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: '20px 24px',
          cursor: partner_ozet ? 'pointer' : 'default',
        }}
        aria-expanded={open}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize' }}>
            {proje}
          </span>
          <MomentumBadge value={momentum} />
          {partner_ozet && (
            <span style={{ marginLeft: 'auto', fontSize: 18, color: '#a1a1aa', userSelect: 'none' }}>
              {open ? '▲' : '▼'}
            </span>
          )}
        </div>

        {bekleyen_insan_girdisi && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 10,
            fontSize: 13,
            color: '#9a3412',
          }}>
            <span>⏳</span>
            <span><strong>Senin girdin bekleniyor:</strong> {bekleyen_insan_girdisi}</span>
          </div>
        )}

        <p style={{ fontSize: 14, color: '#3f3f46', lineHeight: 1.55, marginBottom: 8 }}>
          {son_ilerleme}
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          fontSize: 13,
          color: '#52525b',
        }}>
          <span style={{ marginTop: 1 }}>→</span>
          <span>{sonraki_kritik_adim}</span>
        </div>

        <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 10 }}>
          {tarih}
        </div>
      </button>

      {/* Genişleyen özet */}
      {open && partner_ozet && (
        <div style={{
          borderTop: '1px solid #e4e4e7',
          padding: '20px 24px',
        }}>
          <div className="md-body" style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: '#27272a',
          }}>
            <Markdown>{partner_ozet.replace(/<!--.*?-->/gs, '')}</Markdown>
          </div>

          {arsiv_link && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e4e4e7' }}>
              <a
                href={`./arsiv/${arsiv_link}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#2563eb',
                  textDecoration: 'none',
                }}
              >
                Tam rapor →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
