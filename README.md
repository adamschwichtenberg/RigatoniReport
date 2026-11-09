# The Rigatoni Report — landing page ("Order up")

One fixed kitchen scene. Rigatoni stirs and tastes, the oven fire drives the light and his shadow,
and every issue hangs as a ticket on the rail, with the newest one starred and glowing.

## Publish on GitHub Pages
1. Put the contents of this folder at the root of the repository (keep `.nojekyll`).
2. Settings → Pages → Deploy from branch → `main` / root.
3. The site is then `https://<user>.github.io/<repo>/`; each issue lives at `/issues/YYYY-MM/`.

## Add a new month
1. Add the issue as `issues/YYYY-MM/index.html` (copy the published newsletter file and rename it).
   Optional: paste the "Back to the kitchen" link right after `<body>` (see an existing issue).
2. Add the month's mascot cutout as `assets/img/cover-YYYY-MM.webp`.
3. Add the month's baked ticket as `assets/img/ticket-YYYY-MM.webp` (320 × 519, transparent background).
   Make it by editing an existing ticket image so that only the month word changes; the clip, paper and
   "2026" stay identical, so every ticket hangs the same way. The red star is a separate baked image
   (`ticket-star.webp`) stamped on whichever ticket is active, so tickets never need a starred version.
4. In `index.html`, add one entry at the END of the `issues-data` list (oldest first, newest last):
   id, month, year, edition, href, cover, ticket and three headlines.

## Rigatoni's frames
Rigatoni is 12 painted frames (`assets/img/chef-*.webp`, each a 670 × 560 cut-out that sits at x 690, y 140 on the
kitchen plate) plus one matte sheet (`chef-mattes.png`, 4 × 3 tiles in the same order) used for his shadow.
Order: stir, stir2, taste, greet, stir3, stir4, blink, glance, liftlow, lift, sniff, savor.
- Opener: a beat of stirring, then Rigatoni looks up and smiles at the visitor.
- Slow, lazy stirring: a four-frame turn of the spoon (stir → stir2 → stir3 → stir4, about 3.2 s a turn), 3–4 turns a round, with an occasional blink.
- After each round, one moment: two rounds out of three he looks up and smiles (glance → greet); every third round he tastes
  (liftlow → lift → sniff → taste → savor → back into the pot).
New frames are painted as edits of an existing frame (same scene, only the paw, spoon or face changes),
then cut out against the empty kitchen plate.

## Behaviour
- Hover, focus, the arrow keys or the card's ‹ › buttons choose a month; the active ticket gets the red star stamp and a warm glow.
- Click the active ticket or "Open this issue" to go. On phones, the first tap selects and the second opens.
- Sound is off until the visitor turns it on (fire crackle and bell, all synthesized; no audio files).
- No WebGL or reduced motion: the still illustration and the same clickable tickets.
