# Firebreak mark: a chain link cut clean through, with an ember firebreak in the cut.
INK, PAPER, E1, E2 = '#111110', '#EEEDEA', '#FF8A1F', '#FF3B0A'

def mark(uid, fg=INK, size=240, x=0, y=0):
    s = size / 240
    return f'''<g transform="translate({x} {y}) scale({s})">
  <defs>
    <linearGradient id="e{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{E1}"/><stop offset="1" stop-color="{E2}"/></linearGradient>
    <mask id="m{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="240">
      <rect width="240" height="240" fill="#fff"/>
      <g transform="rotate(18 120 120)"><rect x="104" y="0" width="32" height="240" fill="#000"/></g>
    </mask>
  </defs>
  <g mask="url(#m{uid})">
    <rect x="22" y="66" width="196" height="108" rx="54" fill="none" stroke="{fg}" stroke-width="30"/>
  </g>
  <g transform="rotate(18 120 120)"><rect x="113" y="34" width="14" height="172" rx="7" fill="url(#e{uid})"/></g>
</g>'''

def wordmark(fg=INK, x=0, y=0, size=88):
    return f'<text x="{x}" y="{y}" font-family="Inter Display, Inter, sans-serif" font-weight="600" font-size="{size}" letter-spacing="{-0.045*size:.1f}" fill="{fg}">Firebreak</text>'

def svg(w, h, body, bg=None):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{b}{body}</svg>'

if __name__ == '__main__':
    import os
    os.makedirs('out', exist_ok=True)
    open('out/mark.svg', 'w').write(svg(240, 240, mark('a')))
    open('out/mark-paper.svg', 'w').write(svg(240, 240, mark('b', PAPER)))
    open('out/favicon.svg', 'w').write(svg(240, 240, f'<rect width="240" height="240" rx="56" fill="{INK}"/>' + mark('c', PAPER, 200, 20, 20)))
    open('out/icon.svg', 'w').write(svg(512, 512, f'<rect width="512" height="512" rx="112" fill="{INK}"/>' + mark('d', PAPER, 400, 56, 56)))
    open('out/logo-light.svg', 'w').write(svg(620, 160, mark('e', INK, 160, 0, 0) + wordmark(INK, 168, 112, 86)))
    open('out/logo-dark.svg', 'w').write(svg(620, 160, mark('f', PAPER, 160, 0, 0) + wordmark(PAPER, 168, 112, 86), INK))
    # presentation sheet
    W, H = 1600, 1000
    body = f'<rect width="{W}" height="{H}" fill="{PAPER}"/>'
    body += f'<rect x="40" y="40" width="740" height="560" rx="40" fill="#E4E2DD"/>' + mark('g', INK, 420, 200, 110)
    body += f'<rect x="820" y="40" width="740" height="560" rx="40" fill="{INK}"/>' + mark('h', PAPER, 420, 980, 110)
    body += f'<rect x="40" y="640" width="1040" height="320" rx="40" fill="#fff"/>' + mark('i', INK, 200, 90, 700) + wordmark(INK, 300, 850, 150)
    body += f'<rect x="1120" y="640" width="440" height="320" rx="40" fill="#E4E2DD"/><rect x="1240" y="700" width="200" height="200" rx="46" fill="{INK}"/>' + mark('j', PAPER, 168, 1256, 716)
    open('out/sheet.svg', 'w').write(svg(W, H, body))
