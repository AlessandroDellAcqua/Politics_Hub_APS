#!/usr/bin/env python3
"""
Politics Hub APS — assemblatore del sito statico.

Legge i frammenti di contenuto da _src/content/{it,en}/*.html,
li avvolge nel guscio comune (header, nav, footer) e scrive le
pagine finali in ../it/ e ../en/. Genera anche sitemap.xml e
docs/wix-images.txt (elenco immagini ancora ospitate su Wix).

Uso:  python3 build.py
"""

import os, re, sys, html

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)          # cartella "website"
SITE = "https://www.politicshub.it"

# ---------------------------------------------------------------- pagine ---
# slug -> (title_it, title_en, desc_it, desc_en, nav_key)
PAGES = {
    "index":                 ("Politics Hub | Giovani", "Politics Hub | Youth",
                              "Politics Hub nasce nel 2019 dalla necessità di ridare valore all'idea di politica, creando spazi di dialogo, lontano da logiche partitiche.",
                              "Politics Hub was founded in 2019 out of the need to give value back to the idea of politics, creating spaces for dialogue, far from party logics.",
                              "home"),
    "chi-siamo":             ("Chi siamo", "About us",
                              "Politics Hub nasce dalla necessità di ridare valore all'idea di politica: spazi di dialogo tra giovani, lontano da ogni logica partitica ed elettorale.",
                              "Politics Hub was born from the need to give value back to the idea of politics: spaces for dialogue among young people, far from any party or electoral logic.",
                              "chi-siamo"),
    "parlano-di-noi":        ("Parlano di noi", "Press",
                              "Alcuni articoli che raccontano le nostre iniziative ed il nostro percorso.",
                              "A selection of articles covering our initiatives and our journey.",
                              "chi-siamo"),
    "photo-gallery":         ("Photo Gallery", "Photo Gallery",
                              "Qualche immagine dei nostri incontri.",
                              "Some pictures from our events.",
                              "chi-siamo"),
    "aspiranti-associati":   ("Aspiranti Associati", "Join us",
                              "Sei interessato ad entrare a far parte attivamente di Politics Hub? Ecco come fare.",
                              "Interested in becoming an active member of Politics Hub? Here is how.",
                              "chi-siamo"),
    "statuto":               ("Statuto", "Statute",
                              "La nostra \"Costituzione\": regole e organizzazione sono alla base della vita associativa.",
                              "Our \"Constitution\": rules and organisation are the foundations of the association's life.",
                              "chi-siamo"),
    "manifesto":             ("Manifesto", "Manifesto",
                              "Politics Hub è un'associazione apartitica, senza finalità elettorali e di lucro. Questo è quello in cui crediamo.",
                              "Politics Hub is a non-partisan association with no electoral or profit aims. This is what we believe in.",
                              "chi-siamo"),
    "organigramma":          ("Organigramma", "Organisation",
                              "Come è organizzata Politics Hub APS: organi sociali e aree di lavoro.",
                              "How Politics Hub APS is organised: governing bodies and working areas.",
                              "chi-siamo"),
    "consiglio-direttivo":   ("Consiglio Direttivo", "Board of Directors",
                              "Il Consiglio Direttivo di Politics Hub APS.",
                              "The Board of Directors of Politics Hub APS.",
                              "chi-siamo"),
    "5x1000":                ("5x1000", "5x1000",
                              "Destina il tuo 5x1000 a Politics Hub APS: codice fiscale 92055080151.",
                              "Allocate your 5x1000 to Politics Hub APS: tax code 92055080151.",
                              "chi-siamo"),
    "eventi":                ("Eventi", "Events",
                              "Pensiamo che lo strumento migliore per il dialogo sia l'incontro con donne e uomini protagonisti sul territorio e a livello internazionale.",
                              "We believe the best tool for dialogue is meeting women and men who are protagonists locally and internationally.",
                              "eventi"),
    "progetti":              ("Progetti", "Projects",
                              "Tutti i progetti di Politics Hub.",
                              "All Politics Hub projects.",
                              "progetti"),
    "caffe-politico":        ("Caffè Politico", "Caffè Politico",
                              "Spazi informali di dialogo e scambio per giovani, sempre accompagnati da un caffè.",
                              "Informal spaces of dialogue and exchange for young people, always accompanied by a coffee.",
                              "progetti"),
    "il-poligono":           ("Il Poligono", "Il Poligono",
                              "Il progetto editoriale di Politics Hub: un'etica giornalistica chiara e critica nell'era dell'informazione digitale.",
                              "Politics Hub's editorial project: a clear and critical journalistic ethic in the digital information age.",
                              "progetti"),
    "rigenerazione":         ("RiGenerazione", "RiGenerazione",
                              "RiGenerazione, la rivista di Politics Hub.",
                              "RiGenerazione, the Politics Hub magazine.",
                              "progetti"),
    "libro":                 ("Dove punta la bussola", "Where the Compass Points",
                              "Un libro per orientarsi nel mondo dell'economia, con il contributo di sei esperti intervistati da Politics Hub.",
                              "A book to find one's bearings in the world of economics, with contributions from six experts interviewed by Politics Hub.",
                              "progetti"),
    "inside-a-firm":         ("Inside a Firm", "Inside a Firm",
                              "Video-interviste a imprenditori di successo, in collaborazione con Confindustria Alto Milanese.",
                              "Video interviews with successful entrepreneurs, in partnership with Confindustria Alto Milanese.",
                              "progetti"),
    "politics-talk":         ("Politics Talk", "Politics Talk",
                              "Il podcast di Politics Hub: una prospettiva giovane su economia, attualità e società.",
                              "The Politics Hub podcast: a young perspective on economics, current affairs and society.",
                              "progetti"),
    "face-to-face":          ("Face to Face", "Face to Face",
                              "Temi d'attualità indagati con approfondimenti e interviste a esperti del settore.",
                              "Current affairs explored through analysis and interviews with experts.",
                              "progetti"),
    "direzione-europa":      ("Direzione Europa", "Direction Europe",
                              "I giovani guardano all'Europa: iniziative per coinvolgere i giovani europei in politica e società.",
                              "Young people look to Europe: initiatives to involve young Europeans in politics and society.",
                              "direzione-europa"),
    "articolo":              ("Articolo", "Article",
                              "Un articolo de Il Poligono, il progetto editoriale di Politics Hub.",
                              "An article from Il Poligono, the editorial project of Politics Hub.",
                              "progetti"),
    "contatti":              ("Contatti", "Contacts",
                              "Per rimanere sempre collegati con noi, per non perdersi nessun evento. Continua a seguirci!",
                              "Stay connected with us and never miss an event. Keep following us!",
                              "contatti"),
    "cookie-policy":         ("Privacy & Cookie Policy", "Privacy & Cookie Policy",
                              "Privacy e cookie policy per i visitatori del sito www.politicshub.it.",
                              "Privacy and cookie policy for visitors of www.politicshub.it.",
                              "legal"),
    "privacy-newsletter":    ("Privacy Policy newsletter", "Newsletter Privacy Policy",
                              "Informativa privacy per gli iscritti alla newsletter di Politics Hub.",
                              "Privacy notice for Politics Hub newsletter subscribers.",
                              "legal"),
    "privacy-eventi":        ("Privacy Policy eventi", "Events Privacy Policy",
                              "Informativa privacy per la partecipazione agli eventi di Politics Hub APS.",
                              "Privacy notice for participation in Politics Hub APS events.",
                              "legal"),
    "privacy-raccolta-dati": ("Privacy Policy raccolta dati", "Data Collection Privacy Policy",
                              "Informativa privacy per la raccolta dati sul sito www.politicshub.it.",
                              "Privacy notice for data collection on www.politicshub.it.",
                              "legal"),
    "privacy-quiz":          ("Privacy Policy Quiz", "Quiz Privacy Policy",
                              "Informativa privacy per la partecipazione ai quiz di Politics Hub APS.",
                              "Privacy notice for participation in Politics Hub APS quizzes.",
                              "legal"),
    "privacy-curriculum-vitae": ("Privacy Policy curriculum vitae", "CV Privacy Policy",
                              "Informativa privacy per la presentazione di un curriculum vitae.",
                              "Privacy notice for submitting a curriculum vitae.",
                              "legal"),
}

# ------------------------------------------------------------------- nav ---
NAV = [
    {
        "key": "chi-siamo", "label": {"it": "Chi siamo", "en": "About us"}, "href": "chi-siamo.html",
        "children": [
            ("chi-siamo.html",            {"it": "Chi siamo", "en": "About us"}),
            ("parlano-di-noi.html",       {"it": "Parlano di noi", "en": "Press"}),
            ("photo-gallery.html",        {"it": "Photo Gallery", "en": "Photo Gallery"}),
            ("aspiranti-associati.html",  {"it": "Aspiranti Associati", "en": "Join us"}),
            ("statuto.html",              {"it": "Statuto APS", "en": "Statute"}),
            ("manifesto.html",            {"it": "Manifesto", "en": "Manifesto"}),
            ("organigramma.html",         {"it": "Organigramma", "en": "Organisation"}),
            ("consiglio-direttivo.html",  {"it": "Consiglio Direttivo", "en": "Board"}),
            ("5x1000.html",               {"it": "5x1000", "en": "5x1000"}),
        ],
    },
    {"key": "eventi",   "label": {"it": "Eventi", "en": "Events"},   "href": "eventi.html", "children": []},
    {
        "key": "progetti", "label": {"it": "Progetti", "en": "Projects"}, "href": "progetti.html",
        "children": [
            ("progetti.html",       {"it": "Tutti i progetti", "en": "All projects"}),
            ("caffe-politico.html", {"it": "Caffè Politico", "en": "Caffè Politico"}),
            ("il-poligono.html",    {"it": "Il Poligono", "en": "Il Poligono"}),
            ("rigenerazione.html",  {"it": "RiGenerazione", "en": "RiGenerazione"}),
            ("libro.html",          {"it": "Libro", "en": "Book"}),
            ("inside-a-firm.html",  {"it": "Inside a Firm", "en": "Inside a Firm"}),
            ("politics-talk.html",  {"it": "Politics Talk", "en": "Politics Talk"}),
            ("face-to-face.html",   {"it": "Face to Face", "en": "Face to Face"}),
        ],
    },
    {"key": "direzione-europa", "label": {"it": "Direzione Europa", "en": "Direction Europe"}, "href": "direzione-europa.html", "children": []},
    {"key": "contatti", "label": {"it": "Contatti", "en": "Contacts"}, "href": "contatti.html", "children": []},
]

LEGAL = [
    ("cookie-policy.html",            {"it": "Privacy & Cookie Policy", "en": "Privacy & Cookie Policy"}),
    ("privacy-newsletter.html",       {"it": "Privacy newsletter", "en": "Newsletter privacy"}),
    ("privacy-eventi.html",           {"it": "Privacy eventi", "en": "Events privacy"}),
    ("privacy-raccolta-dati.html",    {"it": "Privacy raccolta dati", "en": "Data collection privacy"}),
    ("privacy-quiz.html",             {"it": "Privacy Quiz", "en": "Quiz privacy"}),
    ("privacy-curriculum-vitae.html", {"it": "Privacy curriculum vitae", "en": "CV privacy"}),
]

HEPTAGON = ('<svg viewBox="0 0 190 200" aria-hidden="true"><polygon points="95,20 157.5,50.1 173,117.8 '
            '129.7,172.1 60.3,172.1 17,117.8 32.5,50.1"/></svg>')
FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 190 200'%3E"
           "%3Cpolygon points='95,20 157.5,50.1 173,117.8 129.7,172.1 60.3,172.1 17,117.8 32.5,50.1'"
           " fill='%231E6FA8'/%3E%3C/svg%3E")

FOOT_TAGLINE = {
    "it": "Associazione di Promozione Sociale.<br>Legnano, Milano — Italia.",
    "en": "Social Promotion Association.<br>Legnano, Milan — Italy.",
}
FOOT_NAV_TITLE = {"it": "Esplora", "en": "Explore"}
FOOT_LEGAL_TITLE = {"it": "Documenti e privacy", "en": "Documents & privacy"}
FOOT_SUPPORT_TITLE = {"it": "Sostienici", "en": "Support us"}
FOOT_5X_LABEL = {"it": "Il tuo 5×1000", "en": "Your 5×1000"}
FOOT_DONATE = {"it": "Fai una donazione →", "en": "Make a donation →"}
NAV_CTA = {"it": "Associati", "en": "Join us"}

def nav_html(lang, active_key, current_file):
    other = "en" if lang == "it" else "it"
    items = []
    for item in NAV:
        act = ' class="active"' if item["key"] == active_key else ""
        if item["children"]:
            subs = "".join(
                f'<li><a href="{href}">{html.escape(lbl[lang])}</a></li>'
                for href, lbl in item["children"]
            )
            items.append(
                f'<li class="has-sub"><a href="{item["href"]}"{act}>{html.escape(item["label"][lang])}</a>'
                f'<ul class="sub">{subs}</ul></li>'
            )
        else:
            items.append(f'<li><a href="{item["href"]}"{act}>{html.escape(item["label"][lang])}</a></li>')
    cur, oth = lang.upper(), other.upper()
    items.append(f'<li class="lang-switch"><a href="../{other}/{current_file}" lang="{other}" hreflang="{other}"><b>{cur}</b> / {oth}</a></li>')
    items.append(f'<li><a class="nav-cta" href="aspiranti-associati.html">{NAV_CTA[lang]}</a></li>')
    return f'''<header class="site-header" id="site-header">
  <div class="nav-wrap">
    <a class="brand" href="index.html" aria-label="Politics Hub, home">{HEPTAGON}<span>Politics Hub</span></a>
    <button class="nav-toggle" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav class="site-nav"><ul>{"".join(items)}</ul></nav>
  </div>
</header>'''

def footer_html(lang):
    nav_links = "".join(
        f'<li><a href="{i["href"]}">{html.escape(i["label"][lang])}</a></li>' for i in NAV
    )
    legal_links = "".join(
        f'<li><a href="{href}">{html.escape(lbl[lang])}</a></li>' for href, lbl in LEGAL
    )
    return f'''<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="foot-brand">{HEPTAGON.replace("<svg", '<svg style="fill:#5CA9DD"')}<span>Politics Hub</span></div>
        <p>{FOOT_TAGLINE[lang]}<br><a href="mailto:info@politicshub.it">info@politicshub.it</a></p>
        <div class="socials">
          <a href="http://www.facebook.com/politicshub20025" target="_blank" rel="noopener">Facebook</a>
          <a href="http://www.instagram.com/politicshub_" target="_blank" rel="noopener">Instagram</a>
          <a href="https://twitter.com/politicshub_" target="_blank" rel="noopener">X</a>
          <a href="https://www.linkedin.com/company/politicshub" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://open.spotify.com/show/2ciGOiXGAKmAFYC7s6CdMx" target="_blank" rel="noopener">Spotify</a>
        </div>
      </div>
      <div>
        <h4>{FOOT_NAV_TITLE[lang]}</h4>
        <ul>{nav_links}</ul>
      </div>
      <div>
        <h4>{FOOT_LEGAL_TITLE[lang]}</h4>
        <ul>{legal_links}</ul>
      </div>
      <div>
        <h4>{FOOT_SUPPORT_TITLE[lang]}</h4>
        <div class="five">
          <div class="lab">{FOOT_5X_LABEL[lang]}</div>
          <div class="cf">92055080151</div>
        </div>
        <a href="https://www.paypal.com/donate/?hosted_button_id=9VVC2Y4TDYA3Y" target="_blank" rel="noopener">{FOOT_DONATE[lang]}</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span id="year">2026</span> Politics Hub APS — C.F. 92055080151 — Viale Gorizia 44, Legnano (MI)</span>
      <span><a href="cookie-policy.html">Privacy</a> · <a href="statuto.html">{'Statuto' if lang == 'it' else 'Statute'}</a> · <a href="manifesto.html">Manifesto</a></span>
    </div>
  </div>
</footer>'''

def page_html(lang, slug, body):
    t_it, t_en, d_it, d_en, nav_key = PAGES[slug]
    title = t_it if lang == "it" else t_en
    desc = d_it if lang == "it" else d_en
    fname = f"{slug}.html"
    full_title = title if slug == "index" else f"{title} | Politics Hub"
    return f'''<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(full_title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{SITE}/{lang}/{fname}">
<link rel="alternate" hreflang="it" href="{SITE}/it/{fname}">
<link rel="alternate" hreflang="en" href="{SITE}/en/{fname}">
<link rel="alternate" hreflang="x-default" href="{SITE}/it/{fname}">
<meta property="og:site_name" content="Politics Hub">
<meta property="og:title" content="{html.escape(full_title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{SITE}/{lang}/{fname}">
<link rel="icon" href="{FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/style.css">
</head>
<body>
{nav_html(lang, nav_key, fname)}
<main>
{body}
</main>
{footer_html(lang)}
<script src="../assets/js/main.js"></script>
<script src="../assets/js/content.js"></script>
</body>
</html>'''

def build():
    written = 0
    for lang in ("it", "en"):
        src_dir = os.path.join(BASE, "content", lang)
        out_dir = os.path.join(ROOT, lang)
        os.makedirs(out_dir, exist_ok=True)
        for slug in PAGES:
            frag = os.path.join(src_dir, f"{slug}.html")
            if not os.path.exists(frag):
                print(f"[manca] {lang}/{slug}.html — saltato")
                continue
            with open(frag, encoding="utf-8") as f:
                body = f.read()
            with open(os.path.join(out_dir, f"{slug}.html"), "w", encoding="utf-8") as f:
                f.write(page_html(lang, slug, body))
            written += 1
    # sitemap
    urls = []
    for slug in PAGES:
        for lang in ("it", "en"):
            fname = "index.html" if slug == "index" else f"{slug}.html"
            urls.append(
                f'  <url><loc>{SITE}/{lang}/{fname}</loc>'
                f'<xhtml:link rel="alternate" hreflang="it" href="{SITE}/it/{fname}"/>'
                f'<xhtml:link rel="alternate" hreflang="en" href="{SITE}/en/{fname}"/></url>'
            )
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
                'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(urls) + "\n</urlset>\n")
    # elenco immagini Wix ancora in uso
    imgs = set()
    for lang in ("it", "en"):
        d = os.path.join(ROOT, lang)
        for fn in os.listdir(d):
            if fn.endswith(".html"):
                with open(os.path.join(d, fn), encoding="utf-8") as f:
                    imgs.update(re.findall(r'https://static\.wixstatic\.com/[^\s"\')]+', f.read()))
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    with open(os.path.join(ROOT, "docs", "wix-images.txt"), "w", encoding="utf-8") as f:
        f.write("# Immagini ancora ospitate su Wix (static.wixstatic.com).\n"
                "# Scaricarle e sostituirle con copie locali in assets/img/ PRIMA di chiudere l'account Wix.\n\n")
        f.write("\n".join(sorted(imgs)) + "\n")
    print(f"OK: {written} pagine generate, sitemap.xml e docs/wix-images.txt aggiornati ({len(imgs)} immagini Wix).")

if __name__ == "__main__":
    build()
