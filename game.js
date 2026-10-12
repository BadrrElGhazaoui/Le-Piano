/* =====================================================================
   AVANT QUE ÇA SE REFERME — a dream, in 3D
   Plain JavaScript + three.js r149 (classic build). No tools, no build step.

   FILE MAP (search for the "=== N." markers):
     1. Settings & texts      (edit the French captions here)
     2. Small helpers
     3. Procedural textures   (all drawn with canvas: no image files needed)
     4. Sound                 (everything synthesised: no audio files needed)
     5. Renderer, camera, player controls
     6. Reusable 3D builders  (door, corridor, garden)
     7. The 4 scenes          (corridor, piano room + garden, street, end)
     8. Scene switching, main loop, start button
   ===================================================================== */
(function () {
  'use strict';

  /* === 1. SETTINGS & TEXTS ============================================ */
  var AUTHOR = 'Badr El Ghazaoui';

  var TEXT = {
    corridorStart: 'Je marche pieds nus. Le parquet est froid sous mes pieds.',
    corridorMid:   'Aucune fenêtre. Pourtant cette lumière, comme un coucher de soleil qui ne vient de nulle part.',
    corridorDoor:  'Une musique de piano. Lente. Un peu désaccordée.',
    pianoEnter:    'Ma grand-mère. Cette robe bleu nuit… je ne la lui ai jamais vue.',
    pianoCall:     '« Elle ne peut pas m’entendre. »',
    gardenA:       'Il fait doux, presque tiède. Mais le ciel est chargé, comme avant l’orage.',
    gardenB:       'Des silhouettes au loin… d’anciens camarades de classe ? Leurs visages restent flous.',
    streetA:       'Ma ville d’enfance. Mais les proportions sont fausses.',
    streetB:       'Je dois arriver avant que la porte  ne se referme.'
  };

  /* === 2. SMALL HELPERS =============================================== */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  // Seeded random generator: the same "random" layout every time the game runs
  function makeRng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fatal(msg) {
    var m = $('menu');
    m.innerHTML = '<h1>Oups…</h1><p class="sub">' + msg + '</p>';
    m.style.display = 'flex';
  }

  if (typeof THREE === 'undefined') {
    fatal('Impossible de charger three.js (connexion internet ?). Voir le fichier README.md, section « hors ligne ».');
    return;
  }

  var captionTimer = null;
  function caption(text, ms) {
    var el = $('caption');
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(captionTimer);
    captionTimer = setTimeout(function () { el.style.opacity = 0; }, ms || 5600);
  }
  var lastHint = null;
  function hint(text) {
    text = text || '';
    if (text === lastHint) return;
    lastHint = text;
    var el = $('hint');
    if (text) { el.textContent = text; el.style.opacity = 1; } else { el.style.opacity = 0; }
  }
  function fade(op, ms) {
    var f = $('fade');
    f.style.transition = 'opacity ' + ms + 'ms linear';
    f.style.opacity = op;
  }
  function lightning() {
    var f = $('flash');
    f.style.transition = 'none'; f.style.opacity = 0.5;
    setTimeout(function () { f.style.transition = 'opacity 700ms ease-out'; f.style.opacity = 0; }, 70);
    setTimeout(function () {
      f.style.transition = 'none'; f.style.opacity = 0.3;
      setTimeout(function () { f.style.transition = 'opacity 900ms ease-out'; f.style.opacity = 0; }, 60);
    }, 230);
    audio.thunder(1.0 + Math.random() * 1.5);
  }

  /* === 3. PROCEDURAL TEXTURES ========================================= */
  function canvasTexture(w, h, draw, rx, ry) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    return t;
  }

  // Yellowed striped wallpaper with stains
  function wallpaperTex(base, stripe, rx, ry) {
    var rnd = makeRng(7);
    return canvasTexture(256, 512, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = stripe;
      for (var x = 0; x < w; x += 64) { g.fillRect(x, 0, 18, h); }
      g.fillStyle = 'rgba(0,0,0,0.10)';
      for (var y = 40; y < h; y += 96) {
        for (var x2 = 32; x2 < w; x2 += 64) {
          g.beginPath();
          g.moveTo(x2, y - 12); g.lineTo(x2 + 9, y); g.lineTo(x2, y + 12); g.lineTo(x2 - 9, y);
          g.closePath(); g.fill();
        }
      }
      for (var i = 0; i < 14; i++) {
        var sx = rnd() * w, sy = rnd() * h, r = 30 + rnd() * 70;
        var gr = g.createRadialGradient(sx, sy, 2, sx, sy, r);
        gr.addColorStop(0, 'rgba(80,55,20,0.28)'); gr.addColorStop(1, 'rgba(80,55,20,0)');
        g.fillStyle = gr; g.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
      var shade = g.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = shade; g.fillRect(0, 0, w, h);
    }, rx, ry);
  }

  function parquetTex(rx, ry) {
    var rnd = makeRng(11);
    return canvasTexture(256, 256, function (g, w, h) {
      g.fillStyle = '#3a2614'; g.fillRect(0, 0, w, h);
      for (var r = 0; r < 8; r++) {
        var off = (r % 2) * 64;
        for (var x = -128; x < w + 128; x += 128) {
          var v = 95 + Math.floor(rnd() * 40);
          g.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.68) + ',' + Math.floor(v * 0.4) + ')';
          g.fillRect(x + off, r * 32 + 1, 126, 30);
        }
      }
    }, rx, ry);
  }

  function noiseTex(base, c1, c2, count, rx, ry) {
    var rnd = makeRng(5);
    return canvasTexture(128, 128, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (var i = 0; i < count; i++) {
        g.fillStyle = rnd() < 0.5 ? c1 : c2;
        g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 2, 2);
      }
    }, rx, ry);
  }

  function asphaltTex(ry) {
    var rnd = makeRng(9);
    return canvasTexture(64, 128, function (g, w, h) {
      g.fillStyle = '#3b3d48'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 260; i++) {
        g.fillStyle = rnd() < 0.5 ? '#44465a' : '#2f313b';
        g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 2, 2);
      }
      g.fillStyle = '#cfc9b8';           // dashed centre line
      g.fillRect(30, 8, 4, 40);
    }, 1, ry);
  }

  function facadeTex() {
    var rnd = makeRng(3);
    return canvasTexture(128, 256, function (g, w, h) {
      g.fillStyle = '#d9d2c4'; g.fillRect(0, 0, w, h);
      for (var r = 0; r < 10; r++) {
        for (var c = 0; c < 4; c++) {
          g.fillStyle = rnd() < 0.14 ? '#ffc477' : '#262935';
          g.fillRect(8 + c * 30, 8 + r * 25, 18, 17);
        }
      }
    }, 1, 1);
  }

  // Orange "window light" patch that falls on a wall that has no window
  function lightPatchTex() {
    return canvasTexture(128, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,190,90,0)');
      gr.addColorStop(0.2, 'rgba(255,170,70,0.9)');
      gr.addColorStop(1, 'rgba(255,140,50,0.55)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(14, 10); g.lineTo(114, 30); g.lineTo(114, 230); g.lineTo(14, 246); g.closePath(); g.fill();
      g.clearRect(62, 10, 6, 240); g.clearRect(14, 120, 100, 6);   // window bars
    }, 1, 1);
  }

  function poolTex() {
    return canvasTexture(128, 128, function (g, w, h) {
      var gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,200,120,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, 1, 1);
  }

  function skyTex(stops) {
    return canvasTexture(8, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      for (var i = 0; i < stops.length; i++) { gr.addColorStop(stops[i][0], stops[i][1]); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, 1, 1);
  }

  /* === 4. SOUND (Web Audio, all synthesised) ========================== */
  var audio = (function () {
    var ctx = null, master = null, noiseBuf = null, muted = false;
    var droneGain, windGain, pianoGain, pianoFilter, streetGain, staticGain, staticFilter;
    var pianoWanted = false, nextNote = 0, noteIdx = 0;
    var streetOn = false, urgency = 0, streetTimers = [];
    var lastPianoUpd = 0, lastWindUpd = 0;
    var api = { onNote: null };

    // A slow, slightly wrong piano phrase (MIDI note numbers, A minor-ish)
    var MEL = [57, 60, 64, 60, 59, 62, 65, 62, 60, 64, 67, 64, 62, 65, 69, 65, 57, 60, 64, 69, 68, 64, 60, 57];

    function makeNoise() {
      var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
      return b;
    }
    function noiseSrc() { var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
    function target(param, v, tc) { if (ctx) { param.setTargetAtTime(v, ctx.currentTime, tc || 0.4); } }
    function later(fn, ms) { streetTimers.push(setTimeout(fn, ms)); }

    function playNote(m, when, dur, vel) {
      // -35 cents + a little random detune = "un peu désaccordé"
      var f = 440 * Math.pow(2, (m - 69) / 12) * Math.pow(2, (-35 + (Math.random() * 16 - 8)) / 1200);
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      var g = ctx.createGain(), g2 = ctx.createGain();
      o1.type = 'triangle'; o2.type = 'sine';
      o1.frequency.value = f; o2.frequency.value = f * 2.003;
      g2.gain.value = 0.25;
      o1.connect(g); o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(vel * 0.35, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
      g.connect(pianoFilter);
      o1.start(when); o2.start(when);
      o1.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
    }

    function scheduleNote() {
      var m = MEL[noteIdx % MEL.length];
      noteIdx++;
      if (noteIdx % 9 === 0) { m += (Math.random() < 0.5 ? 1 : -1); }   // a wrong note now and then
      playNote(m, nextNote, 2.4, 0.5 + Math.random() * 0.3);
      var delay = Math.max(0, (nextNote - ctx.currentTime) * 1000);
      setTimeout(function () { if (api.onNote) { api.onNote(); } }, delay);
      var gap = 0.8 + Math.random() * 0.5;
      if (noteIdx % 4 === 0) { gap += 0.7; }
      nextNote += gap;
    }

    function tick() {
      if (!ctx) { return; }
      if (pianoWanted) {
        if (nextNote < ctx.currentTime) { nextNote = ctx.currentTime + 0.05; }
        while (nextNote < ctx.currentTime + 0.45) { scheduleNote(); }
      } else if (nextNote < ctx.currentTime) {
        nextNote = ctx.currentTime + 0.2;
      }
      if (streetOn) { staticFilter.frequency.setTargetAtTime(700 + Math.random() * 4200, ctx.currentTime, 0.08); }
    }

    function syllable(t, pan, level) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      var f0 = 90 + Math.random() * 130;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t + 0.18);
      var b1 = ctx.createBiquadFilter(), b2 = ctx.createBiquadFilter();
      b1.type = 'bandpass'; b2.type = 'bandpass';
      b1.frequency.value = 300 + Math.random() * 600;
      b2.frequency.value = 900 + Math.random() * 1600;
      b1.Q.value = 6; b2.Q.value = 6;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.03);
      g.gain.linearRampToValueAtTime(0, t + 0.14 + Math.random() * 0.1);
      o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g);
      var out = g;
      if (ctx.createStereoPanner) {
        var p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p;
      }
      out.connect(streetGain);
      o.start(t); o.stop(t + 0.35);
    }

    function thump(t, f, v) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.3);
    }

    function babble() {              // voices you cannot understand
      if (!streetOn) { return; }
      var pan = Math.random() * 2 - 1, n = 2 + Math.floor(Math.random() * 4), t0 = ctx.currentTime + 0.05;
      var lvl = 0.10 + urgency * 0.14;
      for (var i = 0; i < n; i++) { syllable(t0 + i * (0.13 + Math.random() * 0.08), pan, lvl); }
      later(babble, (700 - urgency * 450) * (0.5 + Math.random()));
    }
    function beat() {                // heartbeat that speeds up
      if (!streetOn) { return; }
      var v = 0.25 + urgency * 0.5, t = ctx.currentTime + 0.02;
      thump(t, 62, v); thump(t + 0.21, 52, v * 0.7);
      later(beat, 1000 - urgency * 560);
    }
    function startStreet() {
      streetOn = true;
      target(streetGain.gain, 0.5, 1.0);
      target(staticGain.gain, 0.025, 1.0);
      babble(); beat();
    }
    function stopStreet() {
      streetOn = false;
      for (var i = 0; i < streetTimers.length; i++) { clearTimeout(streetTimers[i]); }
      streetTimers = [];
      if (ctx) { target(streetGain.gain, 0, 0.2); target(staticGain.gain, 0, 0.2); }
    }

    api.init = function () {
      if (ctx) { if (ctx.state === 'suspended') { ctx.resume(); } return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return; }
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
      noiseBuf = makeNoise();

      // low drone (corridor tension)
      droneGain = ctx.createGain(); droneGain.gain.value = 0;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280;
      [[55, 'sine', 0.6], [55.8, 'sine', 0.5], [110.4, 'triangle', 0.18], [164.9, 'sine', 0.08]].forEach(function (p) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = p[1]; o.frequency.value = p[0]; g.gain.value = p[2];
        o.connect(g); g.connect(lp); o.start();
      });
      lp.connect(droneGain); droneGain.connect(master);

      // wind (garden)
      windGain = ctx.createGain(); windGain.gain.value = 0;
      var ws = noiseSrc(), wf = ctx.createBiquadFilter();
      wf.type = 'bandpass'; wf.frequency.value = 450; wf.Q.value = 0.6;
      var lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 0.12; lfoG.gain.value = 160; lfo.connect(lfoG); lfoG.connect(wf.frequency); lfo.start();
      ws.connect(wf); wf.connect(windGain); windGain.connect(master); ws.start();

      // piano chain with a little echo
      pianoFilter = ctx.createBiquadFilter(); pianoFilter.type = 'lowpass'; pianoFilter.frequency.value = 800;
      pianoGain = ctx.createGain(); pianoGain.gain.value = 0;
      var dly = ctx.createDelay(1.0), fb = ctx.createGain(), dlp = ctx.createBiquadFilter();
      dly.delayTime.value = 0.31; fb.gain.value = 0.32; dlp.type = 'lowpass'; dlp.frequency.value = 1800;
      pianoFilter.connect(pianoGain); pianoGain.connect(master);
      pianoGain.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(master);

      // street: voices + mistuned-radio static
      streetGain = ctx.createGain(); streetGain.gain.value = 0; streetGain.connect(master);
      staticGain = ctx.createGain(); staticGain.gain.value = 0;
      staticFilter = ctx.createBiquadFilter(); staticFilter.type = 'bandpass'; staticFilter.Q.value = 1.2; staticFilter.frequency.value = 2000;
      var ss = noiseSrc(); ss.connect(staticFilter); staticFilter.connect(staticGain); staticGain.connect(master); ss.start();

      setInterval(tick, 150);
    };

    api.setScene = function (name) {
      if (!ctx) { return; }
      stopStreet();
      pianoWanted = false;
      var drone = { corridor: 0.10, piano: 0.045, street: 0.07, end: 0 }[name];
      if (drone === undefined) { drone = 0.05; }
      var tc = name === 'end' ? 0.05 : 1.2;
      target(droneGain.gain, drone, tc);
      target(windGain.gain, 0, name === 'end' ? 0.05 : 1.0);
      if (name === 'end') { target(pianoGain.gain, 0, 0.05); }
      if (name === 'street') { startStreet(); }
    };

    api.piano = function (level, cutoff) {
      if (!ctx) { return; }
      pianoWanted = level > 0.02;
      var now = ctx.currentTime;
      if (now - lastPianoUpd < 0.08) { return; }
      lastPianoUpd = now;
      target(pianoGain.gain, level * 0.9, 0.15);
      target(pianoFilter.frequency, cutoff || 3000, 0.15);
    };
    api.wind = function (level) {
      if (!ctx) { return; }
      var now = ctx.currentTime;
      if (now - lastWindUpd < 0.1) { return; }
      lastWindUpd = now;
      target(windGain.gain, level * 0.35, 0.8);
    };
    api.urgency = function (u) { urgency = u; };

    api.footstep = function (surface, speed) {
      if (!ctx) { return; }
      var s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.value = surface === 'grass' ? 700 : (surface === 'asphalt' ? 1100 : 520);
      var g = ctx.createGain(), t = ctx.currentTime;
      var v = (surface === 'grass' ? 0.07 : 0.12) * (0.7 + speed * 0.12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t, Math.random() * 1.5, 0.2);
    };

    api.thunder = function (delaySec) {
      if (!ctx) { return; }
      var t = ctx.currentTime + delaySec;
      var s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t, 0, 3);
    };

    api.slam = function () {
      if (!ctx) { return; }
      var t = ctx.currentTime;
      var s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      s.connect(f); f.connect(g); g.connect(master); s.start(t, 0, 0.5);
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      og.gain.setValueAtTime(0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.6);
    };

    api.toggleMute = function () {
      muted = !muted;
      if (ctx) { master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.05); }
    };

    return api;
  })();

  /* === 5. RENDERER, CAMERA, PLAYER ==================================== */
  var canvas = $('c');
  var renderer;
  try {
    // antialias OFF and pixel ratio 1 = much lighter for a 2015 Mac
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  } catch (e) {
    fatal('Ton navigateur ne peut pas afficher la 3D (WebGL). Essaie Chrome ou Firefox.');
    return;
  }
  var quality = 1;
  renderer.setPixelRatio(quality);
  renderer.setSize(window.innerWidth, window.innerHeight);

  var scene = new THREE.Scene();
  var world = new THREE.Group();          // everything of the current scene lives here
  scene.add(world);
  var camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 160);
  camera.rotation.order = 'YXZ';          // yaw first, then pitch = classic first-person look

  // Sky dome (a big inside-out sphere with a gradient), follows the camera
  var skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, transparent: true });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(120, 16, 10), skyMat);
  sky.renderOrder = -1; sky.frustumCulled = false; sky.visible = false;
  scene.add(sky);
  function setSky(stops, opacity) {
    if (skyMat.map) { skyMat.map.dispose(); }
    skyMat.map = skyTex(stops);
    skyMat.needsUpdate = true;
    skyMat.opacity = (opacity === undefined) ? 1 : opacity;
    sky.visible = true;
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  var player = { x: 0, z: 0, yaw: 0, pitch: 0, bob: 0, bobAmp: 0.035, bobRate: 2.6,
                 stride: 0.85, stepAcc: 0, speed: 2.3, shake: 0, surface: 'wood' };
  var bounds = { minX: -1, maxX: 1, minZ: -10, maxZ: 0 };
  var control = { enabled: false };
  var keys = {};

  function setPlayer(o) {
    player.x = o.x; player.z = o.z; player.yaw = o.yaw || 0; player.pitch = 0;
    player.speed = o.speed; player.stride = o.stride; player.bobRate = o.bobRate;
    player.bobAmp = o.bobAmp; player.shake = 0; player.surface = o.surface; player.stepAcc = 0;
  }

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyE') { interact(); }
    if (e.code === 'KeyF') { toggleFullscreen(); }
    if (e.code === 'KeyM') { audio.toggleMute(); }
    if (e.code.indexOf('Arrow') === 0 || e.code === 'Space') { e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });   // avoid "stuck" keys if the window loses focus

  // Mouse look: when the pointer is locked, or when dragging with the button held
  document.addEventListener('mousemove', function (e) {
    if (!control.enabled) { return; }
    if (document.pointerLockElement === canvas || (e.buttons & 1)) {
      player.yaw -= (e.movementX || 0) * 0.0022;
      player.pitch = clamp(player.pitch - (e.movementY || 0) * 0.0022, -1.2, 1.2);
    }
  });
  canvas.addEventListener('click', function () {
    if (control.enabled && canvas.requestPointerLock && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch (err) { /* ignored */ }
    }
  });
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      if (el.requestFullscreen) { el.requestFullscreen(); } else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); }
    } else {
      if (d.exitFullscreen) { d.exitFullscreen(); } else if (d.webkitExitFullscreen) { d.webkitExitFullscreen(); }
    }
  }

  function updatePlayer(dt) {
    if (!control.enabled) { return; }
    var f = ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0);
    var s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    var turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    player.yaw += turn * 1.8 * dt;

    var len = Math.sqrt(f * f + s * s);
    if (len > 0) {
      f /= len; s /= len;
      var fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);     // forward
      var rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);      // right
      var ox = player.x, oz = player.z;
      player.x = clamp(ox + (fx * f + rx * s) * player.speed * dt, bounds.minX, bounds.maxX);
      player.z = clamp(oz + (fz * f + rz * s) * player.speed * dt, bounds.minZ, bounds.maxZ);
      var dx = player.x - ox, dz = player.z - oz;
      var moved = Math.sqrt(dx * dx + dz * dz);
      player.bob += moved * player.bobRate;
      player.stepAcc += moved;
      if (player.stepAcc > player.stride) { player.stepAcc = 0; audio.footstep(player.surface, player.speed); }
    }
  }

  function applyCamera() {
    var sh = player.shake;
    camera.position.set(
      player.x + (sh ? (Math.random() - 0.5) * sh : 0),
      1.6 + Math.sin(player.bob) * player.bobAmp + (sh ? (Math.random() - 0.5) * sh : 0),
      player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    sky.position.copy(camera.position);
  }

  /* === 6. REUSABLE 3D BUILDERS ======================================== */
  function mat(color, o) {
    var p = { color: color };
    if (o) { for (var k in o) { if (o.hasOwnProperty(k)) { p[k] = o[k]; } } }
    return new THREE.MeshBasicMaterial(p);      // Basic = no lighting maths = fast on old GPUs
  }
  function mesh(geo, material, x, y, z, parent) {
    if (typeof material === 'number') { material = mat(material); }
    var m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) { parent.add(m); }
    return m;
  }
  function box(w, h, d, material, x, y, z, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  }
  function disposeObj(o) {
    o.traverse(function (n) {
      if (n.geometry) { n.geometry.dispose(); }
      if (n.material) {
        var ms = Array.isArray(n.material) ? n.material : [n.material];
        ms.forEach(function (m) { if (m.map) { m.map.dispose(); } m.dispose(); });
      }
    });
  }
  function clearWorld() {
    for (var i = world.children.length - 1; i >= 0; i--) {
      var o = world.children[i];
      world.remove(o);
      disposeObj(o);
    }
  }

  // A door in a frame. angle=0 -> closed. A bright plane behind it = "light from the other side".
  function buildDoor(angle) {
    var d = new THREE.Group();
    var frame = mat(0x3b2a18), wood = mat(0x6e4f30), panel = mat(0x5a3f25);
    var glow = mesh(new THREE.PlaneGeometry(0.9, 2.05), mat(0xffe2a8, { fog: false }), 0, 1.03, -0.08, d);
    box(0.1, 2.2, 0.12, frame, -0.52, 1.1, 0, d);
    box(0.1, 2.2, 0.12, frame, 0.52, 1.1, 0, d);
    box(1.14, 0.1, 0.12, frame, 0, 2.2, 0, d);
    var hinge = new THREE.Group();            // pivot on the left edge of the door
    hinge.position.set(-0.45, 0, 0.02);
    hinge.rotation.y = angle;
    d.add(hinge);
    box(0.9, 2.05, 0.05, wood, 0.45, 1.025, 0, hinge);
    box(0.62, 0.8, 0.02, panel, 0.45, 1.5, 0.03, hinge);
    box(0.62, 0.8, 0.02, panel, 0.45, 0.6, 0.03, hinge);
    mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xc9a24a), 0.8, 1.0, 0.06, hinge);
    d.userData.hinge = hinge;
    d.userData.glow = glow;
    return d;
  }

  // The long corridor (also reused, shorter, for the final shot)
  function buildCorridor(L, doorAngle) {
    var W = 3, H = 3.2, DS = THREE.DoubleSide;
    var g = new THREE.Group();
    var wallMat = mat(0xffffff, { map: wallpaperTex('#cdb877', '#bda55f', L, 1), side: DS });
    var floorMat = mat(0xffffff, { map: parquetTex(W / 1.5, L / 1.5), side: DS });
    var left = mesh(new THREE.PlaneGeometry(L, H), wallMat, -W / 2, H / 2, -L / 2, g);
    left.rotation.y = Math.PI / 2;
    var right = mesh(new THREE.PlaneGeometry(L, H), wallMat, W / 2, H / 2, -L / 2, g);
    right.rotation.y = -Math.PI / 2;
    var floor = mesh(new THREE.PlaneGeometry(W, L), floorMat, 0, 0, -L / 2, g);
    floor.rotation.x = -Math.PI / 2;
    var ceil = mesh(new THREE.PlaneGeometry(W, L), mat(0x8c6b3b, { side: DS }), 0, H, -L / 2, g);
    ceil.rotation.x = Math.PI / 2;
    mesh(new THREE.PlaneGeometry(W, H), mat(0xb89f5c, { side: DS }), 0, H / 2, -L, g);
    mesh(new THREE.PlaneGeometry(W, H), mat(0xb89f5c, { side: DS }), 0, H / 2, 0, g);

    var skirt = mat(0x3a2a18);
    box(0.04, 0.14, L, skirt, -W / 2 + 0.02, 0.07, -L / 2, g);
    box(0.04, 0.14, L, skirt, W / 2 - 0.02, 0.07, -L / 2, g);

    // closed doors along the walls (they make the corridor feel endless)
    var side = -1;
    for (var z = -6; z > -L + 8; z -= 6.5) {
      var cd = buildDoor(0);
      cd.position.set(side * (W / 2 - 0.03), 0, z);
      cd.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(cd);
      side = -side;
    }

    // peeling wallpaper: dark plaster patch + a curled strip
    var rnd = makeRng(21);
    var plaster = mat(0x4b3b26, { side: DS }), curl = mat(0xdccb8c, { side: DS });
    var n = Math.round(L * 0.5);
    for (var i = 0; i < n; i++) {
      var sd = rnd() < 0.5 ? -1 : 1;
      var pz = -2 - rnd() * (L - 4), py = 0.5 + rnd() * 2.2;
      var pw = 0.15 + rnd() * 0.35, ph = 0.25 + rnd() * 0.7;
      var holder = new THREE.Group();
      holder.position.set(sd * (W / 2 - 0.012), py, pz);
      holder.rotation.y = sd < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(holder);
      mesh(new THREE.PlaneGeometry(pw, ph), plaster, 0, 0, 0, holder);
      var strip = mesh(new THREE.PlaneGeometry(pw * 0.8, ph * 0.5), curl, 0, ph * 0.25, 0.02, holder);
      strip.rotation.x = -0.35;
    }

    // orange light patches on windowless walls: "un coucher de soleil qui ne vient de nulle part"
    var patchMat = mat(0xffffff, { map: lightPatchTex(), transparent: true, opacity: 0.6,
                                   blending: THREE.AdditiveBlending, depthWrite: false, side: DS });
    var ps = 1;
    for (var lz = -4; lz > -L + 4; lz -= 8.5) {
      var patch = mesh(new THREE.PlaneGeometry(1.1, 2.0), patchMat, ps * (W / 2 - 0.01), 1.6, lz, g);
      patch.rotation.y = ps < 0 ? Math.PI / 2 : -Math.PI / 2;
      ps = -ps;
    }

    var door = buildDoor(doorAngle);
    door.position.set(0, 0, -L + 0.02);
    g.add(door);
    return { group: g, door: door, W: W, H: H };
  }

  // The garden: grass, trees, bushes, a pale path and an iron gate at the far end
  function buildGarden(parent) {
    var rnd = makeRng(99);
    var ground = mesh(new THREE.PlaneGeometry(80, 120),
      mat(0xffffff, { map: noiseTex('#56654a', '#4a5840', '#68775a', 500, 24, 36) }), 0, -0.02, -22, parent);
    ground.rotation.x = -Math.PI / 2;

    var trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6); trunkGeo.translate(0, 0.8, 0);
    var crownGeo = new THREE.ConeGeometry(1.2, 3.0, 7);            crownGeo.translate(0, 1.5, 0);
    var bushGeo = new THREE.SphereGeometry(0.6, 6, 5);
    var trunkMat = mat(0x3a2f2a), crownA = mat(0x3d5240), crownB = mat(0x465a47), bushMat = mat(0x4d6048);

    function blocked(x, z) {
      if (Math.abs(x) < 5.5 && z > -5.5 && z < 5.5) { return true; }    // the room
      if (Math.abs(x) < 2.8 && z < -3) { return true; }                // the path
      return false;
    }
    var placed = 0, tries = 0;
    while (placed < 40 && tries < 600) {
      tries++;
      var x = (rnd() - 0.5) * 40, z = 10 - rnd() * 46;
      if (blocked(x, z)) { continue; }
      var s = 0.9 + rnd() * 0.9;
      var t = mesh(trunkGeo, trunkMat, x, 0, z, parent); t.scale.set(s, s, s);
      var c = mesh(crownGeo, rnd() < 0.5 ? crownA : crownB, x, 1.4 * s, z, parent); c.scale.set(s, s, s);
      placed++;
    }
    placed = 0; tries = 0;
    while (placed < 26 && tries < 400) {
      tries++;
      var bx = (rnd() - 0.5) * 38, bz = 9 - rnd() * 42;
      if (blocked(bx, bz)) { continue; }
      var bs = 0.6 + rnd() * 0.9;
      var b = mesh(bushGeo, bushMat, bx, 0.25 * bs, bz, parent); b.scale.set(bs, bs * 0.65, bs);
      placed++;
    }

    var path = mesh(new THREE.PlaneGeometry(2.2, 30), mat(0x8a859e), 0, 0.01, -18, parent);
    path.rotation.x = -Math.PI / 2;

    // iron gate at z = -33
    var iron = mat(0x1a1730);
    box(0.5, 3.4, 0.5, iron, -1.6, 1.7, -33, parent);
    box(0.5, 3.4, 0.5, iron, 1.6, 1.7, -33, parent);
    box(3.7, 0.3, 0.4, iron, 0, 3.3, -33, parent);
    for (var i = -3; i <= 3; i++) { box(0.05, 2.9, 0.05, iron, i * 0.3, 1.5, -33, parent); }
    mesh(new THREE.PlaneGeometry(2.7, 2.9), mat(0xa597c4, { fog: false }), 0, 1.5, -33.4, parent);
  }

  /* === 7. THE SCENES ================================================== */
  var scenes = {};
  var sceneTime = 0;
  var current = null;

  function interact() {
    if (control.enabled && current && current.interact) { current.interact(); }
  }

  /* ---- Scene 1: the corridor ------------------------------------------- */
  scenes.corridor = function () {
    var L = 50;
    scene.fog = new THREE.Fog(0xd8832c, 3, 34);
    scene.background = new THREE.Color(0xd8832c);
    sky.visible = false;
    camera.fov = 70; camera.updateProjectionMatrix();
    $('vignette').style.opacity = 0.3;

    var built = buildCorridor(L, -0.75);          // door slightly open
    world.add(built.group);
    setPlayer({ x: 0, z: -1.2, yaw: 0, speed: 2.3, stride: 0.85, bobRate: 2.6, bobAmp: 0.035, surface: 'wood' });
    bounds = { minX: -built.W / 2 + 0.35, maxX: built.W / 2 - 0.35, minZ: -L + 1.5, maxZ: -0.5 };

    var s1 = false, s2 = false, s3 = false, leaving = false;
    return {
      update: function (dt, t) {
        if (t > 2.5 && !s1) { s1 = true; caption(TEXT.corridorStart); }
        if (player.z < -16 && !s2) { s2 = true; caption(TEXT.corridorMid, 6500); }
        // the piano is heard from behind the door: louder and clearer as you come closer
        var k = clamp((-player.z - 20) / 26, 0, 1);
        audio.piano(k * 0.9, 350 + k * 2600);
        if (player.z < -33 && !s3) { s3 = true; caption(TEXT.corridorDoor); }
        if (!leaving && player.z < -L + 2.0) { leaving = true; goTo('piano'); }
      }
    };
  };

  /* ---- Scene 2: the piano room, which turns into the garden ------------ */
  scenes.piano = function () {
    var roomFog = new THREE.Color(0x2a1a10), gardenFog = new THREE.Color(0x7a6c98);
    scene.fog = new THREE.Fog(0x2a1a10, 2, 11);
    scene.background = new THREE.Color(0x2a1a10);
    sky.visible = false;
    camera.fov = 70; camera.updateProjectionMatrix();
    $('vignette').style.opacity = 0.35;

    var g = new THREE.Group(); world.add(g);
    var gh = new THREE.Group(); g.add(gh);            // everything that will "fade away"
    var fadeMats = [], ghostMats = [];
    function fm(color, o) { var p = o || {}; p.transparent = true; var m = mat(color, p); fadeMats.push(m); return m; }
    function gm(color, o) { var p = o || {}; p.transparent = true; var m = mat(color, p); ghostMats.push(m); return m; }

    buildGarden(g);                                   // waits behind the walls

    // --- the room (walls, floor and ceiling dissolve during the transformation)
    var shellMat = fm(0xffffff, { map: wallpaperTex('#7b5738', '#6c4b30', 6, 1), side: THREE.DoubleSide });
    var defs = [[0, -3, 0], [0, 3, Math.PI], [-3, 0, Math.PI / 2], [3, 0, -Math.PI / 2]];
    var wallMeshes = [];
    for (var i = 0; i < defs.length; i++) {
      var w = mesh(new THREE.PlaneGeometry(6, 3), shellMat, defs[i][0], 1.5, defs[i][1], g);
      w.rotation.y = defs[i][2];
      wallMeshes.push(w);
    }
    var floor = mesh(new THREE.PlaneGeometry(6, 6), fm(0xffffff, { map: parquetTex(4, 4) }), 0, 0.003, 0, g);
    floor.rotation.x = -Math.PI / 2;
    var ceil = mesh(new THREE.PlaneGeometry(6, 6), fm(0x3b281a, { side: THREE.DoubleSide }), 0, 2.997, 0, g);
    ceil.rotation.x = Math.PI / 2;
    // the doorway we came through (behind the player)
    var openMat = fm(0x0a0705), frameMat = fm(0x2d1d10);
    var dark = mesh(new THREE.PlaneGeometry(0.9, 2.05), openMat, 0, 1.03, 2.97, g); dark.rotation.y = Math.PI;
    box(0.1, 2.2, 0.1, frameMat, -0.5, 1.1, 2.95, g);
    box(0.1, 2.2, 0.1, frameMat, 0.5, 1.1, 2.95, g);
    box(1.1, 0.1, 0.1, frameMat, 0, 2.2, 2.95, g);

    // --- lamp, light pool, piano, bench (these ghost-fade after the transformation)
    var poolMat = gm(0xffffff, { map: poolTex(), depthWrite: false });
    var pool = mesh(new THREE.PlaneGeometry(3.6, 3.6), poolMat, 0, 0.012, -1.6, gh);
    pool.rotation.x = -Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.12, 8, 6), gm(0xffe2a8, { fog: false }), 0, 2.5, -1.8, gh);
    box(0.015, 0.5, 0.015, gm(0x1b110c), 0, 2.75, -1.8, gh);

    var pianoWood = gm(0x241510), keysWhite = gm(0xeee6d2), keysBlack = gm(0x0d0806);
    box(1.7, 1.35, 0.6, pianoWood, 0, 0.675, -2.7, gh);
    box(1.4, 0.05, 0.25, keysWhite, 0, 0.78, -2.4, gh);
    for (var k = 0; k < 20; k++) {
      if ([0, 1, 3, 4, 5].indexOf(k % 7) >= 0) {
        box(0.035, 0.04, 0.14, keysBlack, -0.7 + (k + 1) * (1.4 / 21), 0.82, -2.46, gh);
      }
    }
    var stand = box(1.2, 0.5, 0.03, gm(0x1b110c), 0, 1.12, -2.42, gh); stand.rotation.x = -0.25;
    var wood2 = gm(0x3a2417);
    box(0.9, 0.07, 0.34, wood2, 0, 0.45, -1.95, gh);
    box(0.05, 0.42, 0.05, wood2, -0.4, 0.21, -1.95, gh);
    box(0.05, 0.42, 0.05, wood2, 0.4, 0.21, -1.95, gh);

    // --- the grandmother, seen from behind (built from simple shapes)
    var gma = new THREE.Group(); gma.position.set(0, 0, -1.95); gh.add(gma);
    var blue = gm(0x15204d), skin = gm(0xd8b49a), hair = gm(0xd9d9e0);
    box(0.46, 0.14, 0.52, blue, 0, 0.52, -0.12, gma);
    box(0.15, 0.45, 0.15, blue, -0.12, 0.22, -0.36, gma);
    box(0.15, 0.45, 0.15, blue, 0.12, 0.22, -0.36, gma);
    mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.62, 10), blue, 0, 0.82, 0.02, gma);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), skin, 0, 1.17, 0, gma);
    mesh(new THREE.SphereGeometry(0.12, 10, 8), skin, 0, 1.28, 0, gma);
    mesh(new THREE.SphereGeometry(0.13, 10, 8), hair, 0, 1.3, 0.025, gma);
    mesh(new THREE.SphereGeometry(0.06, 8, 6), hair, 0, 1.4, 0.1, gma);
    var hands = new THREE.Group(); gma.add(hands);
    var armL = box(0.08, 0.08, 0.55, blue, -0.22, 0.955, -0.25, hands); armL.rotation.x = -0.36;
    var armR = box(0.08, 0.08, 0.55, blue, 0.22, 0.955, -0.25, hands); armR.rotation.x = -0.36;
    box(0.09, 0.05, 0.12, skin, -0.22, 0.83, -0.52, hands);
    box(0.09, 0.05, 0.12, skin, 0.22, 0.83, -0.52, hands);

    // --- the classmates: blurry dark silhouettes (appear later in the garden)
    var cmBody = mat(0x2d2744, { transparent: true, opacity: 0 });
    var cmHalo = mat(0x2d2744, { transparent: true, opacity: 0, depthWrite: false });
    var bodyGeo = new THREE.CylinderGeometry(0.2, 0.26, 1.15, 7); bodyGeo.translate(0, 0.58, 0);
    var headGeo = new THREE.SphereGeometry(0.13, 8, 6); headGeo.translate(0, 1.3, 0);
    var crng = makeRng(31), mates = [];
    for (var m = 0; m < 9; m++) {
      var fg = new THREE.Group();
      mesh(bodyGeo, cmBody, 0, 0, 0, fg); mesh(headGeo, cmBody, 0, 0, 0, fg);
      var h1 = mesh(bodyGeo, cmHalo, 0, 0, 0, fg); h1.scale.set(1.35, 1.05, 1.35);
      var h2 = mesh(headGeo, cmHalo, 0, 0, 0, fg); h2.scale.set(1.5, 1.5, 1.5);
      fg.visible = false;
      g.add(fg);
      mates.push({ g: fg, cx: (crng() - 0.5) * 30, cz: -10 - crng() * 16, rad: 2 + crng() * 3,
                   sp: 0.12 + crng() * 0.15, ph: crng() * 6.28, x: 0, z: 0 });
    }

    // --- state
    var stage = 0;              // 0 room · 1 called out · 2 transforming · 3 garden
    var calledAt = 0, morphStart = 0, doneAt = 0, pulse = 0, ghostsGone = false, shellGone = false;
    var said1 = false, saidB = false, flashTimer = 12, leaving = false;
    var MORPH = 9;
    var gardenBounds = { minX: -16, maxX: 16, minZ: -33.5, maxZ: 9 };

    setPlayer({ x: 0, z: 2.4, yaw: 0, speed: 2.1, stride: 0.8, bobRate: 2.6, bobAmp: 0.03, surface: 'wood' });
    bounds = { minX: -2.5, maxX: 2.5, minZ: -0.55, maxZ: 2.6 };
    audio.onNote = function () { pulse = 1; };

    function setOpacity(list, v) { for (var q = 0; q < list.length; q++) { list[q].opacity = v; } }

    return {
      interact: function () {
        var dz = player.z + 1.95, dist = Math.sqrt(player.x * player.x + dz * dz);
        if (stage === 0 && dist < 5.2) {
          stage = 1; calledAt = sceneTime;
          hint('');
          caption(TEXT.pianoCall, 5600);       // no sound comes out: only the inner murmur
        }
      },
      update: function (dt, t) {
        var dz = player.z + 1.95, dist = Math.sqrt(player.x * player.x + dz * dz);
        pulse *= Math.exp(-dt * 5);
        if (!ghostsGone) {                       // she plays: hands tap, body sways
          hands.position.y = -0.012 * pulse;
          gma.rotation.z = Math.sin(t * 0.6) * 0.025;
          gma.rotation.x = 0.01 * pulse;
        }
        if (t > 3.5 && !said1) { said1 = true; caption(TEXT.pianoEnter); }

        if (stage === 0) {
          hint(t > 7 && dist < 5 ? 'E — l’appeler' : '');
          audio.piano(clamp(1.15 - dist * 0.12, 0.35, 1), 4200);
          if (t > 80) { stage = 1; calledAt = t - 3; }          // she never answers anyway
        } else if (stage === 1) {
          audio.piano(0.9, 4200);
          if (t > calledAt + 6) { stage = 2; morphStart = t; }
        } else if (stage === 2) {
          var p = clamp((t - morphStart) / MORPH, 0, 1), e = smooth(p);
          setOpacity(fadeMats, 1 - e);
          scene.fog.color.lerpColors(roomFog, gardenFog, e);
          scene.background.copy(scene.fog.color);
          scene.fog.near = lerp(2, 8, e); scene.fog.far = lerp(11, 60, e);
          if (e > 0.3 && !sky.visible) { setSky([[0, '#3b3158'], [0.5, '#7a6c98'], [1, '#8d82a6']], 0); }
          if (sky.visible) { skyMat.opacity = e; }
          audio.piano(0.9 * (1 - e), lerp(4200, 700, e));
          audio.wind(e * 0.5);
          if (p > 0.45) { bounds = gardenBounds; player.surface = 'grass'; }
          if (p >= 1) {
            stage = 3; doneAt = t;
            floor.visible = false; ceil.visible = false; dark.visible = false;
            for (var wi = 0; wi < wallMeshes.length; wi++) { wallMeshes[wi].visible = false; }
            shellGone = true;
            caption(TEXT.gardenA, 6500);
          }
        } else {
          audio.piano(0, 700);
          audio.wind(0.5);
          // the ghosts of the room (piano, grandmother) fade away
          var gp = smooth((t - doneAt - 4) / 10);
          setOpacity(ghostMats, 1 - gp);
          if (gp >= 1 && !ghostsGone) { ghostsGone = true; gh.visible = false; }
          // the classmates appear, blurry, and keep their distance
          var cf = smooth((t - doneAt - 3) / 6);
          cmBody.opacity = 0.55 * cf; cmHalo.opacity = 0.18 * cf;
          for (var n = 0; n < mates.length; n++) {
            var mt = mates[n];
            mt.g.visible = cf > 0.01;
            var tx = mt.cx + Math.sin(t * mt.sp + mt.ph) * mt.rad;
            var tz = mt.cz + Math.cos(t * mt.sp * 0.8 + mt.ph) * mt.rad;
            var ddx = tx - player.x, ddz = tz - player.z, dd = Math.sqrt(ddx * ddx + ddz * ddz);
            if (dd < 8 && dd > 0.001) { tx += (ddx / dd) * (8 - dd); tz += (ddz / dd) * (8 - dd); }
            var kk = 1 - Math.exp(-dt * 2);
            mt.x = lerp(mt.x || tx, tx, kk); mt.z = lerp(mt.z || tz, tz, kk);
            mt.g.position.set(mt.x, 0, mt.z);
          }
          if (t > doneAt + 12 && !saidB) { saidB = true; caption(TEXT.gardenB, 6500); }
          // distant lightning, no rain: the sky is only heavy
          flashTimer -= dt;
          if (flashTimer <= 0) { flashTimer = 10 + Math.random() * 10; lightning(); }
          // the gate at the end of the path: a hard cut to another place
          if (!leaving && player.z < -31.5 && Math.abs(player.x) < 3) { leaving = true; goTo('street', { cut: true }); }
        }
        if (shellGone) { shellMat.opacity = 0; }
      }
    };
  };

  /* ---- Scene 3: the street (running, urgency) --------------------------- */
  scenes.street = function () {
    var L = 112, fogC = 0x6e6488;
    scene.fog = new THREE.Fog(fogC, 6, 62);
    scene.background = new THREE.Color(fogC);
    setSky([[0, '#2e2748'], [0.5, '#6e6488'], [1, '#7d7396']], 1);
    camera.fov = 70; camera.updateProjectionMatrix();

    var g = new THREE.Group(); world.add(g);
    var gl = L + 30;
    var road = mesh(new THREE.PlaneGeometry(7, gl),
      mat(0xffffff, { map: asphaltTex(gl / 8) }), 0, 0, -(L + 2) / 2, g);
    road.rotation.x = -Math.PI / 2;
    var walkMat = mat(0x6c6674);
    box(2, 0.14, gl, walkMat, -4.5, 0.07, -(L + 2) / 2, g);
    box(2, 0.14, gl, walkMat, 4.5, 0.07, -(L + 2) / 2, g);

    // Buildings: too tall and leaning over the street. Each pivots on its inner bottom edge.
    var fac = facadeTex();
    var tints = [0xffffff, 0xf0e0d0, 0xd8e0e8, 0xe8d8d8], bm = [];
    for (var i = 0; i < tints.length; i++) { bm.push(mat(tints[i], { map: fac })); }
    var rnd = makeRng(77);
    for (var sd = -1; sd <= 1; sd += 2) {
      var z = 12;
      while (z > -L - 20) {
        var bw = 7 + rnd() * 5, bh = 14 + rnd() * 18, bd = 6 + rnd() * 4;
        var geo = new THREE.BoxGeometry(bd, bh + 4, bw);
        var uv = geo.attributes.uv;                        // scale the windows to the size
        for (var u = 0; u < uv.count; u++) { uv.setXY(u, uv.getX(u) * (bw / 6), uv.getY(u) * (bh / 6)); }
        geo.translate(sd * bd / 2, (bh - 4) / 2, 0);
        var b = new THREE.Mesh(geo, bm[Math.floor(rnd() * bm.length)]);
        b.position.set(sd * 5.5, 0, z - bw / 2);
        b.rotation.z = -sd * (0.07 + rnd() * 0.08);       // lean toward the street
        g.add(b);
        z -= bw + 0.1;
      }
    }
    // a wall closes the street; the door from the beginning stands in front of it
    box(24, 34, 1, mat(0x2c2840), 0, 17, -L - 6.5, g);
    var door = buildDoor(-0.75);
    door.scale.set(1.7, 1.7, 1.7);
    door.position.set(0, 0, -L - 5.8);
    g.add(door);

    setPlayer({ x: 0, z: 6, yaw: 0, speed: 4.2, stride: 1.9, bobRate: 1.5, bobAmp: 0.05, surface: 'asphalt' });
    bounds = { minX: -5.2, maxX: 5.2, minZ: -L + 1, maxZ: 10 };

    var s1 = false, s2 = false, slam = false, slamT = 0, leaving = false;
    return {
      update: function (dt, t) {
        var u = clamp(-player.z / (L - 8), 0, 1);           // progress = urgency
        if (!slam) {
          player.speed = 4.2 + 2.0 * u;
          player.shake = 0.01 + 0.03 * u;
          camera.fov = 70 + 16 * u; camera.updateProjectionMatrix();
          $('vignette').style.opacity = 0.2 + 0.65 * u;
          audio.urgency(u);
        }
        if (t > 1.5 && !s1) { s1 = true; caption(TEXT.streetA); }
        if (t > 10 && !s2) { s2 = true; caption(TEXT.streetB, 6500); }

        // when you get close, the door slams shut
        if (!slam && player.z < -L + 2) {
          slam = true; slamT = 0; control.enabled = false; player.shake = 0.03;
          audio.slam();
        }
        if (slam) {
          slamT += dt;
          door.userData.hinge.rotation.y = lerp(-0.75, 0, clamp(slamT / 0.3, 0, 1));
          if (slamT > 0.3) { door.userData.glow.visible = false; }
          if (slamT > 1.0 && !leaving) { leaving = true; transitioning = false; goTo('end', { cut: true }); }
        }
      }
    };
  };

  /* ---- Scene 4: the closed door at the start (end image) ---------------- */
  scenes.end = function () {
    scene.fog = new THREE.Fog(0xd8832c, 3, 34);
    scene.background = new THREE.Color(0xd8832c);
    sky.visible = false;
    camera.fov = 70; camera.updateProjectionMatrix();
    $('vignette').style.opacity = 0.35;
    $('caption').style.opacity = 0;
    hint('');
    var built = buildCorridor(10, 0);                   // the same door, now closed
    world.add(built.group);
    setPlayer({ x: 0, z: -3.5, yaw: 0, speed: 0, stride: 1, bobRate: 0, bobAmp: 0, surface: 'wood' });
    bounds = { minX: 0, maxX: 0, minZ: -3.5, maxZ: -3.5 };
    try { if (document.exitPointerLock) { document.exitPointerLock(); } } catch (e) { /* ignored */ }
    var shown = false;
    $('author').textContent = AUTHOR;
    return {
      playable: false,
      update: function (dt, t) {
        if (t > 3.5 && !shown) {
          shown = true;
          var el = $('endcard');
          el.style.display = 'flex'; el.style.opacity = 0;
          void el.offsetWidth;
          el.style.transition = 'opacity 2s'; el.style.opacity = 1;
        }
      }
    };
  };

  /* === 8. SCENE SWITCHING, MAIN LOOP, START ============================ */
  var transitioning = false;

  function startScene(name) {
    clearWorld();
    audio.onNote = null;
    hint('');
    sceneTime = 0;
    current = scenes[name]();
    audio.setScene(name);
    applyCamera();
  }

  // Fade to black -> build the next scene -> fade back in. {cut:true} = hard, fast cut.
  function goTo(name, o) {
    if (transitioning) { return; }
    o = o || {};
    transitioning = true; control.enabled = false;
    var out = o.cut ? 120 : 1500;
    fade(1, out);
    setTimeout(function () {
      startScene(name);
      setTimeout(function () {
        fade(0, o.cut ? 200 : 1800);
        transitioning = false;
        control.enabled = !(current && current.playable === false);
      }, 150);
    }, out + 80);
  }

  var last = 0, fpsAcc = 0, fpsN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var raw = (now - last) / 1000; last = now;
    if (raw <= 0) { return; }
    var dt = Math.min(raw, 0.1);
    sceneTime += dt;
    updatePlayer(dt);
    if (current && current.update) { current.update(dt, sceneTime); }
    applyCamera();
    renderer.render(scene, camera);

    // Automatic quality: if the computer is struggling, lower the resolution
    if (sceneTime > 1.5 && raw < 0.5) {
      fpsAcc += raw; fpsN++;
      if (fpsAcc > 2.5) {
        var fps = fpsN / fpsAcc;
        if (fps < 27 && quality > 0.5) {
          quality -= 0.25;
          renderer.setPixelRatio(quality);
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
        fpsAcc = 0; fpsN = 0;
      }
    }
  }

  function begin() {
    audio.init();
    $('menu').style.display = 'none';
    $('endcard').style.display = 'none';
    startScene('corridor');
    last = performance.now();
    setTimeout(function () { fade(0, 2200); control.enabled = true; }, 300);
    try { if (canvas.requestPointerLock) { canvas.requestPointerLock(); } } catch (e) { /* ignored */ }
  }

  var started = false;
  $('start').addEventListener('click', function () {
    begin();
    if (!started) { started = true; requestAnimationFrame(frame); }
  });
  $('again').addEventListener('click', function () {
    transitioning = false;
    var el = $('endcard');
    el.style.transition = 'opacity 0.6s'; el.style.opacity = 0;
    fade(1, 600);
    setTimeout(begin, 750);
  });
})();
