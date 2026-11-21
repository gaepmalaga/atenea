/**
 * EL SONIDO DE UN REEL, sintetizado en código (sin ficheros de audio ni
 * derechos de nadie) y atado a la MISMA línea de tiempo que la imagen
 * (`linea.mjs`): el «tic» cae en el número, el golpe en el desvelado.
 *
 * Capas: colchón oscuro de fondo, latido y tics de la cuenta atrás, silbidos
 * (whooshes) en cada entrada, subida y golpe grave al desvelar, campana de
 * acierto, chispas de oro y un cierre de marca. Estéreo, 44,1 kHz.
 * La mezcla final la normaliza ffmpeg (`loudnorm`, -14 LUFS como Instagram).
 */
import { writeFileSync } from 'node:fs';

const SR = 44100;
const TAU = Math.PI * 2;

function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function generaSonido(p, L, ruta) {
  const dur = L.total + 0.6;
  const N = Math.ceil(dur * SR);
  const izq = new Float32Array(N), der = new Float32Array(N);
  const R = rng(1234);
  const nz = () => R() * 2 - 1;

  /** Suma una muestra en `t` segundos con un reparto estéreo `pan` (-1..1). */
  const put = (i, v, g, pan) => { if (i < 0 || i >= N) return; izq[i] += v * g * (1 - Math.max(0, pan)); der[i] += v * g * (1 + Math.min(0, pan)); };
  const env = (k, a, d) => (k < a ? k / a : Math.exp(-(k - a) / d));

  // ── golpe grave con caída de tono (latido, impactos)
  const thump = (t0, { f0 = 110, f1 = 42, dur = .35, g = .8, decay = .09 } = {}) => {
    let ph = 0; const n = Math.floor(dur * SR);
    for (let i = 0; i < n; i++) { const k = i / SR; const f = f1 + (f0 - f1) * Math.exp(-k * 28); ph += TAU * f / SR; put(Math.floor(t0 * SR) + i, Math.sin(ph) * Math.exp(-k / decay), g, 0); }
  };
  // ── tic seco de reloj
  const tic = (t0, g = .5, f = 2300, pan = 0) => {
    const n = Math.floor(.05 * SR); let prev = 0, ph = 0;
    for (let i = 0; i < n; i++) { const k = i / SR; const x = nz(); const hp = x - prev; prev = x; ph += TAU * f / SR;
      put(Math.floor(t0 * SR) + i, (hp * .55 * Math.exp(-k / .006) + Math.sin(ph) * Math.exp(-k / .012)) , g, pan); }
  };
  // ── silbido: ruido filtrado cuya frecuencia barre de f0 a f1
  const whoosh = (t0, d, f0, f1, g = .35, pan = 0, q = 2.2) => {
    const n = Math.floor(d * SR); let lo = 0, bp = 0, lo2 = 0, bp2 = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n; const f = f0 * Math.pow(f1 / f0, k); const c = 2 * Math.sin(Math.PI * Math.min(.45, f / SR));
      const x = nz(); lo += c * bp; const hi = x - lo - bp / q; bp += c * hi;
      const x2 = nz(); lo2 += c * bp2; const hi2 = x2 - lo2 - bp2 / q; bp2 += c * hi2;
      const e = Math.sin(Math.PI * k) ** 1.6;
      const j = Math.floor(t0 * SR) + i;
      izq[j] += bp * e * g * (1 - Math.max(0, pan)) * .8; der[j] += bp2 * e * g * (1 + Math.min(0, pan)) * .8;
    }
  };
  // ── subida de tensión: ruido que sube de agudo + tono que sube
  const riser = (t0, d, g = .4) => {
    const n = Math.floor(d * SR); let lo = 0, bp = 0, ph = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n; const f = 250 * Math.pow(9000 / 250, k * k); const c = 2 * Math.sin(Math.PI * Math.min(.45, f / SR));
      const x = nz(); lo += c * bp; const hi = x - lo - bp / 1.4; bp += c * hi;
      ph += TAU * (180 + 1500 * k * k) / SR;
      const e = Math.pow(k, 2.2);
      const v = bp * .9 + Math.sin(ph) * .25;
      put(Math.floor(t0 * SR) + i, v * e, g, 0);
    }
  };
  // ── campana (parciales inarmónicos)
  const campana = (t0, f, { g = .3, d = 1.6, pan = 0 } = {}) => {
    const parts = [[1, 1], [2.0, .5], [2.76, .38], [4.07, .22], [5.4, .14]];
    const n = Math.floor(d * 2.2 * SR);
    for (const [r, a] of parts) { let ph = 0; for (let i = 0; i < n; i++) { const k = i / SR; ph += TAU * f * r / SR; put(Math.floor(t0 * SR) + i, Math.sin(ph) * a * Math.exp(-k / (d / (r ** .55))) * Math.min(1, k / .004), g, pan); } }
  };
  // ── chispas: destellos agudos al azar
  const chispas = (t0, d, n, g = .09) => {
    for (let c = 0; c < n; c++) { const tt = t0 + R() * d; const f = 2400 + R() * 6000; const pan = R() * 1.6 - .8; const m = Math.floor(.16 * SR); let ph = 0;
      for (let i = 0; i < m; i++) { const k = i / SR; ph += TAU * f / SR; put(Math.floor(tt * SR) + i, Math.sin(ph) * Math.exp(-k / .035) * Math.min(1, k / .002), g * (.4 + R() * .6), pan); } }
  };
  // ── pad oscuro (re menor con quinta y novena), suave y ancho
  const pad = (t0, t1, g = .06) => {
    const notas = [[73.42, -.5], [110, .3], [146.83, -.25], [174.61, .45], [220, -.4], [293.66, .5]];
    const n = Math.floor((t1 - t0) * SR);
    for (const [f, pan] of notas) for (const det of [-.18, 0, .21]) {
      let ph = R() * TAU, lfo = R() * TAU; const ff = f * (1 + det * .006);
      for (let i = 0; i < n; i++) {
        const k = i / n, tt = i / SR; ph += TAU * ff / SR; lfo += TAU * (.07 + det * .02) / SR;
        const v = Math.sin(ph) + .5 * Math.sin(2 * ph + .3) + .22 * Math.sin(3 * ph) + .1 * Math.sin(5 * ph);
        const a = Math.min(1, tt / 1.6) * Math.min(1, (t1 - t0 - tt) / 1.2) * (.78 + .22 * Math.sin(lfo));
        put(Math.floor(t0 * SR) + i, v * a, g / 6, pan);
      }
    }
  };

  // ── hi-hat y palmada (el pulso)
  const hat = (t0, g = .1, open = false) => {
    const n = Math.floor((open ? .12 : .035) * SR); let prev = 0;
    for (let i = 0; i < n; i++) { const k = i / SR; const x = nz(); const hp = x - prev; prev = x; put(Math.floor(t0 * SR) + i, hp * Math.exp(-k / (open ? .04 : .009)), g, .25); }
  };
  const palmada = (t0, g = .2) => {
    const n = Math.floor(.14 * SR); let lo = 0, bp = 0;
    for (let i = 0; i < n; i++) { const k = i / SR; const c = 2 * Math.sin(Math.PI * 1700 / SR); const x = nz(); lo += c * bp; const hi = x - lo - bp / 1.6; bp += c * hi;
      put(Math.floor(t0 * SR) + i, bp * (Math.exp(-k / .045) + .6 * Math.exp(-((k - .012) ** 2) / 4e-5)), g, -.15); }
  };
  // ── «braam» grave: sierras desafinadas que caen de tono (el golpe de marca)
  const braam = (t0, { f = 55, d = 1.5, g = .5 } = {}) => {
    const n = Math.floor(d * SR);
    for (const det of [-.012, 0, .012]) { let ph = R() * TAU;
      for (let i = 0; i < n; i++) { const k = i / SR; const ff = f * (1 + det) * (1 + .45 * Math.exp(-k / .12)); ph += TAU * ff / SR;
        let v = 0; for (let h = 1; h <= 9; h++) v += Math.sin(h * ph) / h; put(Math.floor(t0 * SR) + i, v * Math.exp(-k / (d * .35)) * Math.min(1, k / .006), g / 3, 0); } }
  };
  // ── pitido de confirmación, de radio
  const pitido = (t0, f, d = .09, g = .22) => { let ph = 0; const n = Math.floor(d * SR); for (let i = 0; i < n; i++) { const k = i / SR; ph += TAU * f / SR; put(Math.floor(t0 * SR) + i, Math.sign(Math.sin(ph)) * .35 * Math.sin(ph * .5 + 1) * 0 + Math.sin(ph) * Math.min(1, k / .004) * Math.min(1, (d - k) / .012), g, 0); } };

  // ───────── partitura «operativa» ─────────
  const BPM = 100, beat = 60 / BPM;
  const pulso = (desde, hasta, g) => {
    for (let t = desde, b = 0; t < hasta - 1e-6; t += beat / 2, b++) {
      const t4 = Math.round(b / 2); const entero = b % 2 === 0;
      if (entero) { thump(t, { f0: 120, f1: 46, dur: .3, g: .6 * g, decay: .08 }); if (t4 % 2 === 1) palmada(t, .24 * g); }
      hat(t + (entero ? 0 : 0), .09 * g, !entero);
    }
  };
  pad(0, L.end0 + 1.6, .05);
  // gancho: un solo golpe seco
  braam(.12, { f: 52, d: 1.3, g: .55 });
  whoosh(0, .16, 800, 5000, .18, -.3);
  // pregunta y opciones: el pulso entra con la pregunta
  pulso(L.q0, L.cdStart, 1);
  for (let i = 0; i < 3; i++) { const t = L.cards0 + i * .12; whoosh(t - .02, .3, 600, 3200, .15, i % 2 ? -.4 : .4); tic(t + .26, .2, 1700, i % 2 ? -.3 : .3); }
  // cuenta atrás: se corta la música y solo queda el latido y el reloj
  for (let s = 0; s < L.cdDur; s++) {
    const t = L.cdStart + s; const resto = L.cdDur - s;
    thump(t, { f0: 100, f1: 48, dur: .3, g: resto <= 3 ? .65 : .5, decay: .075 });
    tic(t, resto <= 3 ? .5 : .38, resto <= 3 ? 2900 : 2300);
    if (resto <= 3) { tic(t + .5, .26, 3300, .2); thump(t + .5, { f0: 90, f1: 50, dur: .2, g: .3, decay: .05 }); }
  }
  riser(L.reveal - 2.0, 2.0, .26);
  // desvelado: silencio de un instante, golpe, pitido doble de confirmación
  const tr = L.reveal;
  braam(tr, { f: 49, d: 1.8, g: .75 });
  thump(tr, { f0: 150, f1: 34, dur: 1.8, g: .95, decay: .35 });
  { const n = Math.floor(.35 * SR); let lo = 0; for (let i = 0; i < n; i++) { const k = i / SR; lo += .3 * (nz() - lo); put(Math.floor(tr * SR) + i, lo * 3 * Math.exp(-k / .09), .45, 0); } }
  pitido(tr + .08, 1046.5, .1, .2); pitido(tr + .22, 1568, .16, .2);
  // explicación: el pulso vuelve, más bajo
  whoosh(L.trans, .4, 300, 2400, .18, 0);
  pulso(L.expl0, L.end0 - .3, .45);
  pitido(L.ref0, 1318.5, .07, .12);
  // cierre de marca
  whoosh(L.end0 - .08, .3, 400, 4800, .24, -.2);
  braam(L.end0 + .05, { f: 58, d: 1.6, g: .6 });
  thump(L.end0 + .05, { f0: 120, f1: 40, dur: 1.3, g: .8, decay: .25 });

  // ───────── mezcla y salida ─────────
  const out = Buffer.alloc(N * 4);
  const peak = Math.max(1e-6, ...[izq, der].map((b) => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(b[i])); return m; }));
  const gain = .9 / peak;
  const sat = (x) => Math.tanh(x * 1.25) / Math.tanh(1.25);
  for (let i = 0; i < N; i++) {
    out.writeInt16LE(Math.round(sat(izq[i] * gain) * 32000), i * 4);
    out.writeInt16LE(Math.round(sat(der[i] * gain) * 32000), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + out.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(out.length, 40);
  writeFileSync(ruta, Buffer.concat([head, out]));
}
