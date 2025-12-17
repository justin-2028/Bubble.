export function initialsFromName(fullName: string) {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstWord = parts[0] ?? trimmed;
  const lastWord = parts.length > 1 ? parts[parts.length - 1] : '';

  const firstChar = [...firstWord][0] ?? '?';
  if (!lastWord) return firstChar.toUpperCase();

  const lastChar = [...lastWord][0] ?? '';
  const out = (firstChar + lastChar).toUpperCase();
  return out || firstChar.toUpperCase();
}

function hueFromString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h % 360;
}

export function svgAvatarDataUrl(fullName: string) {
  const initials = initialsFromName(fullName);
  const hue = hueFromString((fullName ?? '').trim() || initials);
  const bg1 = `hsl(${hue} 85% 62%)`;
  const bg2 = `hsl(${(hue + 28) % 360} 85% 50%)`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="176" font-weight="700" fill="rgba(255,255,255,0.92)">${escapeXml(
          initials
        )}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

