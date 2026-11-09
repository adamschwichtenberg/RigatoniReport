/* The Rigatoni Report · "Order up" landing page
   One fixed kitchen scene. WebGL paints the living layer (fire, light, shadows, steam,
   embers, dust, Rigatoni's poses); the tickets, menu card and buttons are plain HTML. */
(() => {
  'use strict';

  // ---------- constants (art pixels) ----------
  const W = 1680, H = 944;
  const SLOT_X = 773, SLOT_GAP = 200, WINDOW = 4;      // newest ticket hangs under the centre lamp
  const TICKET_W = 156, TICKET_TOP = 146;              // tickets are pre-baked images (ticket-YYYY-MM.webp)
  const STAR_SRC = 'assets/img/ticket-star.webp';
  const PRINT_X = 251, PRINT_Y = 652;                   // printer slot (top-left of the emerging paper)
  const FOCUS = { x0: 60, x1: 1620, y0: 100, y1: 935 }; // must stay visible in landscape
  const PORTRAIT_VIEW = { x0: 90, x1: 1290 };           // what phones see

  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const issues = JSON.parse($('#issues-data').textContent).issues;
  const N = issues.length;
  const newest = issues[N - 1];

  const app = $('#app'), stage = $('#stage'), rail = $('#rail'), card = $('#card');
  const below = $('#below');
  const brand = $('#brand'), ui = $('#ui'), canvas = $('#gl');

  // ---------- state ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const params = new URLSearchParams(location.search);
  const mode = 'open';                                  // issues are already up on the rail
  let active = N - 1, winEnd = N - 1;
  let glow = 0, glowTarget = 0;
  let lastPointer = 'mouse';
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let view = { s: 1, tx: 0, ty: 0, portrait: false };
  let tScale = 1, activeAtDown = -1;

  // ---------- markup helpers ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ticketHTML = it =>
    `<span class="t-body"><img class="t-img" src="${esc(it.ticket || 'assets/img/ticket-' + it.id + '.webp')}" width="320" height="519" alt="" draggable="false">` +
    `<img class="t-star" src="${STAR_SRC}" width="128" height="133" alt="" draggable="false"></span>`;

  // ---------- tickets ----------
  const tickets = issues.map((it, i) => {
    const a = document.createElement('a');
    a.className = 'ticket';
    a.href = it.href;
    a.dataset.i = i;
    a.setAttribute('aria-label', `${it.month} ${it.year} issue, ${it.edition}`);
    a.innerHTML = ticketHTML(it);
    rail.appendChild(a);
    return { el: a, i, ang: 0, vel: 0, seed: Math.random() * 10 };
  });

  const slotX = i => SLOT_X - SLOT_GAP * (winEnd - i);

  function layoutRail() {
    tickets.forEach(t => {
      t.el.style.left = slotX(t.i) + 'px';
      const visible = t.i <= winEnd && t.i > winEnd - WINDOW;
      t.el.classList.toggle('is-off', !visible);
      t.el.tabIndex = visible ? 0 : -1;
    });
  }

  function setActive(i, dir, opts = {}) {
    i = clamp(i, 0, N - 1);
    if (i === active && !opts.force) return;
    const prev = active;
    active = i;
    let shifted = false;
    if (active > winEnd) { winEnd = active; shifted = true; }
    if (active < winEnd - WINDOW + 1) { winEnd = active + WINDOW - 1; shifted = true; }
    layoutRail();
    const d = dir || Math.sign(active - prev) || 1;
    tickets.forEach(t => {
      const on = t.i === active;
      t.el.classList.toggle('is-active', on);
      if (on) t.el.setAttribute('aria-current', 'true'); else t.el.removeAttribute('aria-current');
      if (!reduced) {
        const dist = Math.abs(t.i - active);
        t.vel += (shifted ? 80 * d : 0) + (on ? 95 * d : (34 * d) / (1 + dist));
      }
    });
    updateCard();
  }

  function updateCard() {
    const it = issues[active];
    const img = $('.c-cover', card);
    img.src = it.cover;
    img.alt = `Rigatoni, ${it.edition.toLowerCase()}`;
    $('.c-title', card).textContent = `${it.month} ${it.year}`;
    $('.c-edition', card).textContent = it.edition;
    $('.c-list', card).innerHTML = it.headlines.map(h => `<li>${esc(h)}</li>`).join('');
    $('.c-open', card).href = it.href;
    $('.c-open', card).setAttribute('aria-label', `Open the ${it.month} ${it.year} issue`);
    $('.c-prev', card).disabled = active === 0;
    $('.c-next', card).disabled = active === N - 1;
    $('.c-kicker', card).textContent = active === N - 1 ? 'On the pass · newest' : 'On the pass';
  }

  function openIssue(i) {
    const href = issues[i].href;
    store.set('rr-last-seen', newest.id);
    if (reduced) { location.href = href; return; }
    audio.bell();
    chef.force(3, 1.2);
    const t = tickets[i];
    t.vel -= 170;
    const paper = $('.t-body', t.el);
    if (paper.animate) paper.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(14px)' }, { transform: 'translateY(0)' }], { duration: 380, easing: 'ease-out' });
    setTimeout(() => { location.href = href; }, 560);
  }

  // ---------- Rigatoni: stir, stir, taste, sometimes glance up ----------
  const chef = {
    cur: 0, next: 0, t0: 0, dur: 0, queue: [], stepEnd: 0, cycles: 0, mix: 0,
    poseTo(idx, dur, now) {
      if (this.mix >= 0.5) this.cur = this.next;
      this.next = idx; this.t0 = now; this.dur = Math.max(0.001, dur);
      if (this.cur === this.next) this.dur = 0.001;
    },
    // pose index: 0 stir, 1 stir2, 2 taste, 3 greet, 4 stir3, 5 stir4, 6 blink, 7 glance,
    //             8 liftlow, 9 lift, 10 sniff, 11 savor  (every frame is its own painted image)
    // The opener: a beat of stirring, then he looks up and smiles at the visitor.
    opener() {
      this.queue.push({ pose: 0, fade: 0.001, hold: 0.7 });
      this.queue.push({ pose: 7, fade: 0.5, hold: 0.25 });
      this.queue.push({ pose: 3, fade: 0.6, hold: 2.6 });
      this.queue.push({ pose: 7, fade: 0.55, hold: 0.2 });
      this.queue.push({ pose: 0, fade: 0.55, hold: 0.3 });
    },
    plan() {
      // Calm by design: slow, lazy stirring; he looks up and smiles most rounds, and tastes now and then.
      const STIR = [0, 1, 4, 5];                       // one full turn of the spoon around the pot (~3.2 s)
      const turns = 3 + Math.floor(Math.random() * 2);
      for (let k = 0; k < turns * 4; k++) {
        const pose = STIR[k % 4];
        this.queue.push({ pose, fade: 0.55, hold: 0.25 });
        if (pose === 0 && k > 0 && Math.random() < 0.2) {   // an occasional blink, only on the matching stir frame
          this.queue.push({ pose: 6, fade: 0.09, hold: 0.1 });
          this.queue.push({ pose: 0, fade: 0.11, hold: 0.15 });
        }
      }
      this.cycles++;
      if (this.cycles % 3 === 0) {                      // a slow taste: lift, sniff, taste, savour, back into the pot
        this.queue.push({ pose: 8, fade: 0.5, hold: 0.3 });
        this.queue.push({ pose: 9, fade: 0.55, hold: 0.4 });
        this.queue.push({ pose: 10, fade: 0.55, hold: 0.6 + Math.random() * 0.3 });
        this.queue.push({ pose: 2, fade: 0.5, hold: 1.0 + Math.random() * 0.4 });
        this.queue.push({ pose: 11, fade: 0.6, hold: 1.1 + Math.random() * 0.4 });
        this.queue.push({ pose: 9, fade: 0.65, hold: 0.2 });
        this.queue.push({ pose: 8, fade: 0.5, hold: 0.1 });
        this.queue.push({ pose: 0, fade: 0.5, hold: 0.25 });
      } else {                                          // look up and smile at the visitor
        this.queue.push({ pose: 7, fade: 0.5, hold: 0.3 });
        this.queue.push({ pose: 3, fade: 0.6, hold: 2.0 + Math.random() * 0.8 });
        this.queue.push({ pose: 7, fade: 0.55, hold: 0.2 });
        this.queue.push({ pose: 0, fade: 0.55, hold: 0.3 });
      }
    },
    force(pose, hold) {
      this.queue = pose === 3
        ? [{ pose: 7, fade: 0.16, hold: 0.04 }, { pose: 3, fade: 0.2, hold }, { pose: 7, fade: 0.26, hold: 0.1 }, { pose: 0, fade: 0.3, hold: 0.3 }]
        : [{ pose, fade: 0.25, hold }, { pose: 0, fade: 0.32, hold: 0.3 }];
      this.stepEnd = 0;
    },
    update(now) {
      if (reduced) { this.cur = this.next = 0; this.mix = 0; return; }
      if (now >= this.stepEnd) {
        if (!this.cycles && !this.opened) { this.opened = true; this.opener(); }
        if (!this.queue.length) this.plan();
        const s = this.queue.shift();
        this.poseTo(s.pose, s.fade, now);
        this.stepEnd = now + s.fade + s.hold;
      }
      this.mix = clamp((now - this.t0) / this.dur, 0, 1);
      if (this.mix >= 1) { this.cur = this.next; this.mix = 0; }
    }
  };

  // ---------- fire flicker (drives light, shadows and the crackle) ----------
  const fire = {
    crack: 0, nextCrack: 0, value: 0.5,
    update(t, dt) {
      if (reduced) { this.value = 0.5 + 0.05 * Math.sin(t * 0.8); return this.value; }
      if (t > this.nextCrack) {
        this.crack = 0.3 + Math.random() * 0.4;
        this.nextCrack = t + 0.2 + Math.random() * 1.5;
        audio.crackle(this.crack);
      }
      this.crack *= Math.exp(-dt * 9);
      const base = 0.5 + 0.17 * Math.sin(t * 6.1) * Math.sin(t * 1.7 + 0.6)
        + 0.11 * Math.sin(t * 13.3 + Math.sin(t * 3.1)) + 0.06 * Math.sin(t * 0.9);
      this.value = clamp(base + this.crack * 0.55, 0, 1.25);
      return this.value;
    }
  };

  // ---------- sound (off until the visitor turns it on; all synthesized) ----------
  const audio = {
    on: false, ctx: null, master: null, noise: null, queuePrinter: 0,
    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // low fire bed
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      const g = this.ctx.createGain(); g.gain.value = 0.10;
      src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
      return true;
    },
    setOn(on) {
      if (on && !this.ensure()) return false;
      this.on = on;
      if (this.ctx) {
        if (on) this.ctx.resume();
        this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.12);
      }
      return true;
    },
    burst(dur, freq, q, gain, type = 'bandpass', delay = 0) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const s = this.ctx.createBufferSource(); s.buffer = this.noise;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    },
    crackle(s) {
      this.burst(0.018 + Math.random() * 0.035, 1500 + Math.random() * 2600, 0.9, 0.22 * s);
      if (Math.random() < 0.4) this.burst(0.012, 2600 + Math.random() * 2000, 1.2, 0.12 * s, 'bandpass', 0.03 + Math.random() * 0.05);
    },
    printer(sec) { for (let k = 0; k * 0.075 < sec; k++) this.burst(0.012, 3800, 2.5, 0.16, 'bandpass', k * 0.075); },
    tear() { this.burst(0.16, 2400, 0.7, 0.22, 'highpass'); },
    clip() { this.burst(0.03, 5200, 3, 0.18); },
    bell() {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      [[1568, 0.22, 1.6], [3136, 0.06, 0.9], [4705, 0.04, 0.6], [2093, 0.05, 1.2]].forEach(([f, a, d]) => {
        const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05);
      });
    }
  };

  const soundBtn = $('#sound');
  function setSound(on) {
    const ok = audio.setOn(on);
    const real = ok && on;
    soundBtn.setAttribute('aria-pressed', String(real));
    $('.s-label', soundBtn).textContent = real ? 'Sound on' : 'Sound off';
    store.set('rr-sound', real ? '1' : '0');
  }

  // ---------- layout: scale the stage to the window ----------
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const portrait = vw / vh < 0.9;
    if (portrait !== view.portrait || !fit.done) {
      document.body.classList.toggle('portrait', portrait);
      if (portrait) { below.append(card, brand, ui); }
      else { stage.append(card, brand, ui); }
    }
    let s, tx, ty;
    if (portrait) {
      s = vw / (PORTRAIT_VIEW.x1 - PORTRAIT_VIEW.x0);
      tx = -PORTRAIT_VIEW.x0 * s; ty = 0;
      $('#scene').style.height = Math.round(H * s) + 'px';
    } else {
      $('#scene').style.height = '';
      const cover = Math.max(vw / W, vh / H);
      s = Math.min(cover, vw / (FOCUS.x1 - FOCUS.x0), vh / (FOCUS.y1 - FOCUS.y0));
      tx = vw / 2 - ((FOCUS.x0 + FOCUS.x1) / 2) * s;
      ty = vh / 2 - ((FOCUS.y0 + FOCUS.y1) / 2) * s;
      tx = W * s >= vw ? clamp(tx, vw - W * s, 0) : (vw - W * s) / 2;
      ty = H * s >= vh ? clamp(ty, vh - H * s, 0) : (vh - H * s) / 2;
    }
    stage.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
    view = { s, tx, ty, portrait };
    tScale = portrait ? 1.3 : 1;
    fit.done = true;
    gfx && gfx.resize(s);
  }

  // ---------- WebGL ----------
  const VERT = `attribute vec2 aPos;varying vec2 vUv;
void main(){vUv=vec2(aPos.x*0.5+0.5,0.5-aPos.y*0.5);gl_Position=vec4(aPos,0.0,1.0);}`;

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uPlate, uPoseA, uPoseB, uMatte;
uniform float uTime, uFlick, uMix, uIdxA, uIdxB, uActiveX, uGlow, uReduced;
uniform vec2 uPar;
const vec2 S = vec2(1680.0, 944.0);
const vec4 PR = vec4(690.0, 140.0, 670.0, 560.0);

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(17.0,9.0); a*=0.5; } return v; }

vec2 pq(vec2 p){ return (p-PR.xy)/PR.zw; }
float inPatch(vec2 q){ return step(0.0,q.x)*step(0.0,q.y)*step(q.x,1.0)*step(q.y,1.0); }

float matteAt(vec2 p){
  vec2 q = pq(p);
  if (inPatch(q) < 0.5) return 0.0;
  q = clamp(q, vec2(0.002), vec2(0.998));
  vec2 ta = vec2(floor(mod(uIdxA + 0.5, 4.0)), floor((uIdxA + 0.5)/4.0));
  vec2 tb = vec2(floor(mod(uIdxB + 0.5, 4.0)), floor((uIdxB + 0.5)/4.0));
  float a = texture2D(uMatte, (q + ta)/vec2(4.0, 3.0)).r;
  float b = texture2D(uMatte, (q + tb)/vec2(4.0, 3.0)).r;
  return mix(a, b, uMix);
}

vec3 base(vec2 p){
  vec3 c = texture2D(uPlate, p/S).rgb;
  vec2 q = pq(p);
  if (inPatch(q) > 0.5){
    vec4 a = texture2D(uPoseA, q);
    vec4 b = texture2D(uPoseB, q);
    vec3 ca = mix(c, a.rgb, a.a);
    vec3 cb = mix(c, b.rgb, b.a);
    c = mix(ca, cb, uMix);
  }
  return c;
}

vec3 flames(vec2 p, float t){
  vec2 e = (p-vec2(1438.0,474.0))/vec2(102.0,76.0);
  float m = 1.0 - smoothstep(0.72, 1.0, length(e));
  if (m <= 0.0) return vec3(0.0);
  vec2 u = (p-vec2(1440.0,540.0))/vec2(95.0,120.0);
  float h = -u.y;
  float n  = fbm(vec2(u.x*2.4, h*1.8 - t*1.7));
  float n2 = fbm(vec2(u.x*4.2+3.0, h*3.1 - t*2.7));
  float shape = 1.0 - abs(u.x)*0.9;
  float fl = smoothstep(0.05, 0.55, (n*0.7+n2*0.5)*shape*1.25 - h*0.95 + 0.05);
  vec3 col = mix(vec3(0.85,0.18,0.03), vec3(1.0,0.58,0.12), smoothstep(0.1,0.6,fl));
  col = mix(col, vec3(1.0,0.82,0.42), smoothstep(0.7,1.0,fl)*0.8);
  return col*fl*m*(0.36+0.38*uFlick);
}

vec3 embers(vec2 p, float t){
  if (p.x<1300.0 || p.x>1600.0 || p.y<240.0 || p.y>560.0) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i=0;i<10;i++){
    float fi = float(i);
    float h1 = hash(vec2(fi,1.7)); float h2 = hash(vec2(fi,8.3)); float h3 = hash(vec2(fi,3.1));
    float life = fract(t*(0.20+0.25*h1)+h2);
    vec2 pos = vec2(1440.0+(h3-0.5)*150.0 + sin(t*1.7+fi*2.0)*12.0*life, 530.0 - life*270.0);
    float d = length(p-pos);
    acc += vec3(1.0,0.55,0.15)*(1.0-smoothstep(0.4,2.6,d))*(1.0-life)*step(0.04,life);
  }
  return acc*1.3;
}

float steam(vec2 p, float t){
  vec2 u = p-vec2(1175.0,545.0);
  float h = -u.y/320.0;
  if (h<0.0 || h>1.0) return 0.0;
  float w = 55.0+h*130.0;
  float x = (u.x - h*h*90.0 - sin(h*5.0+t*0.8)*12.0)/w;
  if (abs(x) > 1.2) return 0.0;
  float n = fbm(vec2(u.x*0.011 - t*0.04, u.y*0.009 + t*0.32));
  float a = smoothstep(0.42,0.8,n)*(1.0-smoothstep(0.35,1.1,abs(x)))*smoothstep(0.0,0.12,h)*(1.0-smoothstep(0.45,1.0,h));
  return a*0.30;
}

vec3 lampCone(vec2 p, float t){
  if (p.y<110.0 || p.y>660.0) return vec3(0.0);
  float spread = 40.0+(p.y-110.0)*0.42;
  float dx = abs(p.x-773.0);
  float cone = (1.0-smoothstep(spread*0.55,spread,dx))*(1.0-smoothstep(380.0,660.0,p.y));
  if (cone <= 0.0) return vec3(0.0);
  vec3 acc = vec3(1.0,0.78,0.48)*cone*0.035;
  for (int i=0;i<14;i++){
    float fi = float(i);
    float h1 = hash(vec2(fi,5.1)); float h2 = hash(vec2(fi,2.9)); float h3 = hash(vec2(fi,7.7));
    float yy = 150.0+fract(h2+t*0.012*(0.4+h3))*460.0;
    float sp = 40.0+(yy-110.0)*0.42;
    vec2 pos = vec2(773.0+(h1-0.5)*1.4*sp + sin(t*0.6+fi)*6.0, yy);
    acc += vec3(1.0,0.86,0.62)*(1.0-smoothstep(0.2,1.8,length(p-pos)))*0.45*cone;
  }
  return acc;
}

void main(){
  float t = uTime*(uReduced>0.5 ? 0.3 : 1.0);
  vec2 p = (vUv*S - S*0.5)*0.99 + S*0.5 + uPar;
  vec3 c = base(p);
  float f = uFlick;
  float mt = matteAt(p);

  // Rigatoni's shadow on the back wall, thrown left by the oven; it breathes with the fire
  vec2 off = vec2(30.0+22.0*f, -6.0);
  float sh = matteAt(p+off) + matteAt(p+off+vec2(10.0,0.0)) + matteAt(p+off+vec2(-10.0,0.0))
           + matteAt(p+off+vec2(0.0,10.0)) + matteAt(p+off+vec2(0.0,-10.0));
  sh = sh/5.0 * step(p.y, 640.0);
  c *= 1.0 - sh*(1.0-mt)*(0.22+0.20*f);

  // firelight: strongest near the oven, a little everywhere
  vec2 dF = (p-vec2(1440.0,470.0))*vec2(1.0,1.15);
  float fall = exp(-dot(dF,dF)/(2.0*430.0*430.0));
  c *= 1.0 + (f-0.5)*(0.22*fall+0.04);
  c += mt*fall*max(f-0.3,0.0)*0.10*vec3(1.0,0.55,0.2);           // warm rim on the fire side
  float lum = dot(c, vec3(0.299,0.587,0.114));
  c += pow(max(lum-0.62,0.0)/0.38,3.0)*fall*(f-0.4)*0.30*vec3(1.0,0.72,0.4); // copper glints

  vec3 fl = clamp(flames(p,t),0.0,1.0);
  c = 1.0-(1.0-c)*(1.0-fl);
  c += embers(p,t);
  c = mix(c, vec3(1.0,0.92,0.82), steam(p,t));
  c += lampCone(p,t);

  if (uActiveX > 0.0){
    vec2 g = (p-vec2(uActiveX,255.0))/vec2(150.0,170.0);
    c += vec3(1.0,0.68,0.32)*0.12*uGlow*exp(-dot(g,g)*1.6);
  }
  gl_FragColor = vec4(clamp(c,0.0,1.0),1.0);
}`;

  let gfx = null;

  function loadImg(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('image ' + src));
      im.src = src;
    });
  }

  async function initGL() {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const POSES = ['stir', 'stir2', 'taste', 'greet', 'stir3', 'stir4', 'blink', 'glance', 'liftlow', 'lift', 'sniff', 'savor'];
    const srcs = ['kitchen.webp', ...POSES.map(n => 'chef-' + n + '.webp'), 'chef-mattes.png']
      .map(n => 'assets/img/' + n);
    const imgs = await Promise.all(srcs.map(loadImg));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const tex = imgs.map(im => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      return t;
    });
    const U = {};
    ['uPlate', 'uPoseA', 'uPoseB', 'uMatte', 'uTime', 'uFlick', 'uMix', 'uIdxA', 'uIdxB', 'uActiveX', 'uGlow', 'uReduced', 'uPar']
      .forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uPlate, 0); gl.uniform1i(U.uPoseA, 1); gl.uniform1i(U.uPoseB, 2); gl.uniform1i(U.uMatte, 3);
    gl.uniform1f(U.uReduced, reduced ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[0]);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex[POSES.length + 1]);
    const poses = tex.slice(1, POSES.length + 1);

    let lost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; app.classList.remove('gl-ready'); });

    return {
      resize(s) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w = Math.round(W * s * dpr);
        w = clamp(w, 480, 2560);
        const h = Math.round(w * H / W);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
      },
      draw(time, flick) {
        if (lost) return;
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, poses[chef.cur]);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, poses[chef.next]);
        gl.uniform1f(U.uTime, time);
        gl.uniform1f(U.uFlick, flick);
        gl.uniform1f(U.uMix, chef.mix);
        gl.uniform1f(U.uIdxA, chef.cur);
        gl.uniform1f(U.uIdxB, chef.next);
        gl.uniform1f(U.uActiveX, mode === 'open' ? slotX(active) + par.x * 8 : -1);
        gl.uniform1f(U.uGlow, glow);
        gl.uniform2f(U.uPar, -par.x * 4, -par.y * 3);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    };
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(nowMs) {
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    const t = nowMs / 1000;

    const flick = fire.update(t, dt);
    chef.update(t);
    glow += (glowTarget - glow) * Math.min(1, dt * 3);

    if (!reduced) {
      par.x += (par.tx - par.x) * Math.min(1, dt * 2.5);
      par.y += (par.ty - par.y) * Math.min(1, dt * 2.5);
    }
    rail.style.transform = `translate(${(par.x * 8).toFixed(2)}px,${(par.y * 5).toFixed(2)}px)`;

    // tickets: firelight on the baked paper, then a damped spring around a faint heat-draft sway
    rail.style.filter = `brightness(${(0.94 + 0.08 * Math.min(flick, 1.1)).toFixed(3)})`;
    tickets.forEach(tk => {
      const draft = reduced ? 0 : (0.55 * Math.sin(t * 0.8 + tk.seed) + 0.3 * Math.sin(t * 2.1 + tk.i * 1.3)) * (0.6 + 0.4 * flick);
      const acc = -38 * (tk.ang - draft) - 2.6 * tk.vel;
      tk.vel += acc * dt;
      tk.ang = clamp(tk.ang + tk.vel * dt, -24, 24);
      tk.el.style.transform = `rotate(${tk.ang.toFixed(2)}deg) scale(${tScale})`;
    });

    if (audio.queuePrinter && audio.on) { audio.printer(audio.queuePrinter); }
    audio.queuePrinter = 0;

    if (gfx) gfx.draw(t, flick);
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    par.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    par.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  window.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; }, { passive: true, capture: true });

  tickets.forEach(tk => {
    tk.el.addEventListener('pointerenter', e => {
      if (mode !== 'open' || e.pointerType !== 'mouse') return;
      if (tk.i !== active) setActive(tk.i);
      else if (!reduced) tk.vel += 22;
    });
    tk.el.addEventListener('pointerdown', () => { activeAtDown = active; });
    tk.el.addEventListener('focus', () => { if (mode === 'open' && tk.i !== active) setActive(tk.i); });
    tk.el.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      if (lastPointer !== 'mouse' && activeAtDown !== tk.i && activeAtDown !== -1) {   // touch: first tap selects
        setActive(tk.i); activeAtDown = -1; return;
      }
      activeAtDown = -1;
      if (tk.i !== active) setActive(tk.i);
      openIssue(tk.i);
    });
  });

  $('.c-prev', card).addEventListener('click', () => setActive(active - 1, -1));
  $('.c-next', card).addEventListener('click', () => setActive(active + 1, 1));
  $('.c-open', card).addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); openIssue(active);
  });
  soundBtn.addEventListener('click', () => setSound(!audio.on));

  window.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (mode !== 'open') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      setActive(active + d, d);
      if (document.activeElement && document.activeElement.classList.contains('ticket')) tickets[active].el.focus({ preventScroll: true });
    } else if (e.key === 'Enter' && tag === 'BODY') {
      e.preventDefault(); openIssue(active);
    }
  });

  window.addEventListener('resize', fit);
  // returning from an issue with the back button: make sure we are not stuck mid-animation
  window.addEventListener('pageshow', ev => { if (ev.persisted) { chef.force(0, 0.3); } });

  // ---------- boot ----------
  layoutRail();
  updateCard();
  app.classList.add('is-open');
  store.set('rr-last-seen', newest.id);
  setActive(N - 1, 1, { force: true });
  glowTarget = 1;
  app.classList.remove('is-loading');
  fit();

  initGL().then(g => {
    if (!g) return;
    gfx = g;
    fit();
    requestAnimationFrame(() => app.classList.add('gl-ready'));
  }).catch(err => { console.warn('Scene running without WebGL:', err); });

  requestAnimationFrame(frame);
})();
