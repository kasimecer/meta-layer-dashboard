#!/usr/bin/env bash
# Minimal OpenRouter persona-çağrısı (curl + jq). Free-model routing. Test-fikstürü; ürün DEĞİL.
# Kullanım: openrouter-persona.sh <model> <system-prompt-file> <user-message-file>
# Anahtar: $OPENROUTER_API_KEY (env'den; HİÇBİR dosyaya yazılmaz/loglanmaz — SIR-YASAGI).
# Başarı: cevap metnini stdout'a basar, exit 0. Başarısız: 3 denemeden sonra "ERROR:..." stderr + exit 1
# (cevap UYDURULMAZ — çağıran boşluğu işaretler).
set -euo pipefail
MODEL="${1:?model gerekli}"
SYSF="${2:?system-prompt dosyası gerekli}"
USRF="${3:?user-message dosyası gerekli}"
: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY env tanımsız}"

payload=$(jq -n --arg m "$MODEL" --rawfile s "$SYSF" --rawfile u "$USRF" \
  '{model:$m, max_tokens:260, temperature:0.6,
    messages:[{role:"system",content:$s},{role:"user",content:$u}]}')

for attempt in 1 2 3; do
  resp=$(curl -sS --max-time 70 https://openrouter.ai/api/v1/chat/completions \
    -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload") || { echo "deneme $attempt: ağ/curl hatası" >&2; sleep 2; continue; }
  content=$(printf '%s' "$resp" | jq -r '.choices[0].message.content // empty')
  if [ -n "$content" ]; then printf '%s' "$content"; exit 0; fi
  echo "deneme $attempt: $(printf '%s' "$resp" | jq -r '.error.message // .error // "boş yanıt"')" >&2
  sleep 2
done
echo "ERROR: $MODEL için 3 denemede cevap alınamadı" >&2
exit 1
