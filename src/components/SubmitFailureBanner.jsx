// Paylaşılan, GÖZE-ÇARPAN başarısız-gönderim banner'ı — MateryalizeButton.jsx (intake) ve
// SoruYanitView.jsx (soru-yanıt) tarafından paylaşılır. 2026-07-18 (C — "silent failure becomes
// visible"): eskiden hata/mock durumu küçük, kolayca-gözden-kaçan bir satır içi kutuydu (bkz
// meta-kanal 2026-07-18 kök-neden raporu, P0 — panele yazılan bir fikrin hiç kuyruğa girmediği,
// operatörün küçük bir uyarı kutusunu fark etmemiş OLABİLECEĞİ ihtimaliyle kapatılamadı). Bu
// bileşen küçük bir not DEĞİL — tam-genişlik, yüksek-kontrast, "KAYDEDİLMEDİ" çerçevesiyle
// operatörü DURDURUR ve açık bir "Tekrar Dene" eylemi ister (worker.js tarafında artık her
// başarısız istek KV'ye de kalıcı iz bırakıyor — bkz GET /failures).
export default function SubmitFailureBanner({ durum, detay, onRetry, retryLabel = 'Tekrar Dene' }) {
  if (durum !== 'hata' && durum !== 'mock') return null
  const mock = durum === 'mock'
  return (
    <div role="alert" style={{
      marginTop: 10, padding: '14px 16px', borderRadius: 10,
      background: mock ? '#fffbeb' : '#fef2f2',
      border: `2px solid ${mock ? '#f59e0b' : '#dc2626'}`,
      boxShadow: `0 1px 3px ${mock ? 'rgba(245,158,11,.25)' : 'rgba(220,38,38,.25)'}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800,
        color: mock ? '#92400e' : '#991b1b', marginBottom: 6,
      }}>
        <span style={{ fontSize: 18 }}>{mock ? '⚠' : '✗'}</span>
        {mock ? 'KAYDEDİLMEDİ — test/MOCK modu' : 'GÖNDERİLMEDİ'}
      </div>
      <div style={{ fontSize: 13, color: mock ? '#78350f' : '#7f1d1d', lineHeight: 1.55 }}>
        Bu veri sunucuya <strong>ulaşmadı</strong>. Sayfadan ayrılmadan önce metnini bir yere
        kopyala. {detay}
      </div>
      {onRetry && (
        <button onClick={onRetry} style={{
          marginTop: 10, fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8,
          border: 'none', background: mock ? '#f59e0b' : '#dc2626', color: '#fff', cursor: 'pointer',
        }}>
          {retryLabel}
        </button>
      )}
    </div>
  )
}
