(() => {
  const params = new URLSearchParams(window.location.search);
  const PREVIEW_MODE = params.get("preview") === "1";
  const SOUND_ENABLED = params.get("sound") === "1";

  const BASE_W = 1024;
  const BASE_H = 640;
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const images = {};
  let audio = null;
  let rafId = 0;
  let running = true;
  let lastTs = 0;
  let viewport = {
    cssW: 0,
    cssH: 0,
    dpr: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  const state = {
    shipX: BASE_W / 2,
    shipY: BASE_H - 54,
    playerDir: 1,
    invaders: [],
    invDir: 1,
    invSpeed: 26,
    animToggle: false,
    animElapsed: 0,
    edgeCooldown: 0,
    playerBullet: null,
    playerCooldown: 0,
    alienBullets: [],
    alienCooldown: 0.4,
    shields: [],
    ufo: null,
    ufoCooldown: 12,
    playerExplosion: { timer: 0 },
    gameOver: false,
    youWin: false,
    resetTimer: 0,
    metrics: {
      invW: 18,
      invH: 12,
      shipW: 18,
      shipH: 12,
      gapX: 46,
      gapY: 30,
      stepDown: 16,
      shieldBlock: 4,
    },
  };

  const COLS = 11;
  const ROWS = 5;
  const SHIP_SCALE = 0.44;
  const INVADER_SCALE = 0.38;
  const PLAYER_BULLET_W = 5;
  const PLAYER_BULLET_H = 16;
  const ALIEN_BULLET_W = 5;
  const ALIEN_BULLET_H = 14;
  const PLAYER_FIRE_COOLDOWN = PREVIEW_MODE ? 1.2 : 0.9;
  const PLAYER_BULLET_SPEED = 340;
  const INVADER_SPEED_MAX = PREVIEW_MODE ? 110 : 160;
  const INVADER_ANIM_PERIOD = 0.35;
  const ALIEN_FIRE_COOLDOWN = PREVIEW_MODE ? 1.4 : 1.1;
  const ALIEN_BULLET_SPEED = PREVIEW_MODE ? 130 : 160;
  const RESET_DELAY = 2.0;
  const UFO_SPEED = 140;
  const UFO_Y = 70;
  const UFO_BLOCK = 4;
  const SHIELD_COLOR = "#3dd13d";
  const UFO_COLOR = "#ff00ff";

  const SHIELD_SHAPE = [
    "    #########    ",
    "   ###########   ",
    "  #############  ",
    " ############### ",
    " ############### ",
    " ############### ",
    " ######   ###### ",
    " #####     ##### ",
    " ####       #### ",
    " ###         ### ",
  ];

  const UFO_SHAPE = [
    "    #########    ",
    "   ###########   ",
    "  #############  ",
    " ############### ",
    " ############### ",
    " ############### ",
    "   ###   ###     ",
  ];

  function makeAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ac = new AC();
    const master = ac.createGain();
    master.gain.value = 0.05;
    master.connect(ac.destination);

    function beep(freq = 440, dur = 0.08, type = "square", vol = 0.6) {
      const oscillator = ac.createOscillator();
      const gain = ac.createGain();
      oscillator.type = type;
      oscillator.frequency.value = freq;
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(master);
      const t = ac.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      oscillator.start(t);
      oscillator.stop(t + dur + 0.02);
    }

    function noiseBurst(dur = 0.12, vol = 0.5) {
      const length = Math.floor(ac.sampleRate * dur);
      const buffer = ac.createBuffer(1, length, ac.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) channel[i] = (Math.random() * 2 - 1) * 0.7;
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      source.buffer = buffer;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(master);
      const t = ac.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      source.start(t);
    }

    let ufoOsc = null;
    let ufoGain = null;
    let lfo = null;
    let lfoGain = null;

    function ufoStart() {
      if (ufoOsc) return;
      ufoOsc = ac.createOscillator();
      ufoGain = ac.createGain();
      lfo = ac.createOscillator();
      lfoGain = ac.createGain();

      ufoOsc.type = "square";
      ufoOsc.frequency.value = 560;
      lfo.frequency.value = 5.5;
      lfoGain.gain.value = 8;

      lfo.connect(lfoGain);
      lfoGain.connect(ufoOsc.frequency);
      ufoOsc.connect(ufoGain);
      ufoGain.connect(master);

      const t = ac.currentTime;
      ufoGain.gain.setValueAtTime(0, t);
      ufoGain.gain.linearRampToValueAtTime(0.07, t + 0.08);
      ufoOsc.start();
      lfo.start();
    }

    function ufoStop() {
      if (!ufoOsc) return;
      const t = ac.currentTime;
      ufoGain.gain.cancelScheduledValues(t);
      ufoGain.gain.setValueAtTime(Math.max(ufoGain.gain.value, 0.0001), t);
      ufoGain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      window.setTimeout(() => {
        try { ufoOsc.stop(); } catch (_) {}
        try { lfo.stop(); } catch (_) {}
        ufoOsc.disconnect();
        ufoGain.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        ufoOsc = null;
        ufoGain = null;
        lfo = null;
        lfoGain = null;
      }, 120);
    }

    return {
      resume: () => ac.resume && ac.resume(),
      suspend: () => ac.suspend && ac.suspend(),
      step: () => beep(360 + Math.random() * 60, 0.07, "square", 0.35),
      shoot: () => beep(880 + Math.random() * 40, 0.06, "triangle", 0.45),
      explosion: () => noiseBurst(0.12, 0.45),
      playerDie: () => {
        beep(220, 0.10, "sawtooth", 0.5);
        window.setTimeout(() => beep(196, 0.12, "sawtooth", 0.5), 120);
      },
      ufoStart,
      ufoStop,
    };
  }

  function snap(value) {
    return Math.round(value);
  }

  function overlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function updateViewport() {
    const cssW = window.innerWidth || BASE_W;
    const cssH = window.innerHeight || BASE_H;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    viewport.cssW = cssW;
    viewport.cssH = cssH;
    viewport.dpr = dpr;
    viewport.scale = Math.max(0.1, Math.min(cssW / BASE_W, cssH / BASE_H));
    viewport.offsetX = (cssW - BASE_W * viewport.scale) / 2;
    viewport.offsetY = (cssH - BASE_H * viewport.scale) / 2;

    computeMetrics();
    rebuildFormation();
    rebuildShields();
  }

  function computeMetrics() {
    const invaderAssetW = images.InvaderA ? images.InvaderA.naturalWidth : 24;
    const invaderAssetH = images.InvaderA ? images.InvaderA.naturalHeight : 16;
    const shipAssetW = images.Ship ? images.Ship.naturalWidth : 24;
    const shipAssetH = images.Ship ? images.Ship.naturalHeight : 16;

    state.metrics.invW = invaderAssetW * INVADER_SCALE;
    state.metrics.invH = invaderAssetH * INVADER_SCALE;
    state.metrics.shipW = shipAssetW * SHIP_SCALE;
    state.metrics.shipH = shipAssetH * SHIP_SCALE;
    state.metrics.gapX = state.metrics.invW * 1.85;
    state.metrics.gapY = state.metrics.invH * 1.6;
    state.metrics.stepDown = Math.max(state.metrics.invH * 1.05, 14);
    state.metrics.shieldBlock = 4;
    state.shipY = BASE_H - 54;
  }

  function rebuildFormation() {
    const { invW, gapX, gapY } = state.metrics;
    const totalWidth = COLS * invW + (COLS - 1) * gapX;
    const startX = (BASE_W - totalWidth) / 2 + invW / 2;
    const startY = Math.max(90, BASE_H * 0.18);

    state.invaders = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        state.invaders.push({
          col,
          row,
          alive: true,
          x: startX + col * (invW + gapX),
          y: startY + row * (state.metrics.invH + gapY),
        });
      }
    }

    state.invDir = 1;
    state.invSpeed = 26;
    state.edgeCooldown = 0;
  }

  function rebuildShields() {
    const count = 4;
    const margin = 150;
    const spacing = (BASE_W - margin * 2) / (count - 1);
    const baseY = BASE_H - 138;
    const size = state.metrics.shieldBlock;

    state.shields = [];
    for (let i = 0; i < count; i += 1) {
      const shield = { x: margin + i * spacing, y: baseY, cells: [] };
      for (let row = 0; row < SHIELD_SHAPE.length; row += 1) {
        for (let col = 0; col < SHIELD_SHAPE[row].length; col += 1) {
          if (SHIELD_SHAPE[row][col] === "#") {
            shield.cells.push({
              dx: (col - SHIELD_SHAPE[row].length / 2) * size,
              dy: (row - SHIELD_SHAPE.length / 2) * size,
              alive: true,
            });
          }
        }
      }
      state.shields.push(shield);
    }
  }

  function lowestAliveInColumn(col) {
    let selected = null;
    for (const inv of state.invaders) {
      if (!inv.alive || inv.col !== col) continue;
      if (!selected || inv.row > selected.row) selected = inv;
    }
    return selected;
  }

  function anyInvadersAlive() {
    return state.invaders.some((inv) => inv.alive);
  }

  function ufoSize() {
    return {
      w: UFO_SHAPE[0].length * UFO_BLOCK,
      h: UFO_SHAPE.length * UFO_BLOCK,
    };
  }

  function resetGame() {
    state.playerBullet = null;
    state.alienBullets = [];
    state.playerCooldown = 0;
    state.alienCooldown = 0.5;
    state.shipX = BASE_W / 2;
    state.playerDir = Math.random() > 0.5 ? 1 : -1;
    state.ufo = null;
    state.ufoCooldown = 10 + Math.random() * 8;
    state.playerExplosion = { timer: 0 };
    state.gameOver = false;
    state.youWin = false;
    state.resetTimer = 0;
    rebuildFormation();
    rebuildShields();
  }

  function hitShield(bullet) {
    const size = state.metrics.shieldBlock;
    for (const shield of state.shields) {
      for (const cell of shield.cells) {
        if (!cell.alive) continue;
        const rect = { x: shield.x + cell.dx, y: shield.y + cell.dy, w: size, h: size };
        if (overlap(bullet, rect)) {
          cell.alive = false;
          return true;
        }
      }
    }
    return false;
  }

  function update(dt) {
    if (state.gameOver) {
      state.resetTimer -= dt;
      if (state.resetTimer <= 0) resetGame();
      if (state.playerExplosion.timer > 0) state.playerExplosion.timer -= dt;
      return;
    }

    state.shipX += 85 * dt * state.playerDir;
    if (state.shipX > BASE_W - 30) {
      state.shipX = BASE_W - 30;
      state.playerDir = -1;
    }
    if (state.shipX < 30) {
      state.shipX = 30;
      state.playerDir = 1;
    }

    state.playerCooldown -= dt;
    if (!state.playerBullet && state.playerCooldown <= 0) {
      state.playerBullet = {
        x: state.shipX,
        y: state.shipY - 18,
        w: PLAYER_BULLET_W,
        h: PLAYER_BULLET_H,
        vy: -PLAYER_BULLET_SPEED,
      };
      state.playerCooldown = PLAYER_FIRE_COOLDOWN * (0.8 + Math.random() * 0.4);
      if (audio) audio.shoot();
    }

    if (state.playerBullet) {
      state.playerBullet.y += state.playerBullet.vy * dt;
      if (state.playerBullet.y + state.playerBullet.h < 0) state.playerBullet = null;
    }

    state.animElapsed += dt;
    if (state.animElapsed > INVADER_ANIM_PERIOD) {
      state.animElapsed = 0;
      state.animToggle = !state.animToggle;
      if (audio) audio.step();
    }

    for (const inv of state.invaders) {
      if (inv.alive) inv.x += state.invDir * state.invSpeed * dt;
    }

    state.edgeCooldown -= dt;
    const margin = 24;
    const invW = state.metrics.invW;
    const invH = state.metrics.invH;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const inv of state.invaders) {
      if (!inv.alive) continue;
      minX = Math.min(minX, inv.x - invW / 2);
      maxX = Math.max(maxX, inv.x + invW / 2);
    }

    if (state.edgeCooldown <= 0 && (minX < margin || maxX > BASE_W - margin)) {
      state.invDir *= -1;
      const shift = minX < margin ? margin - minX : BASE_W - margin - maxX;
      for (const inv of state.invaders) {
        if (!inv.alive) continue;
        inv.x += shift;
        inv.y += state.metrics.stepDown;
      }
      state.invSpeed = Math.min(state.invSpeed * 1.06, INVADER_SPEED_MAX);
      state.edgeCooldown = 0.12;
    }

    state.alienCooldown -= dt;
    if (state.alienCooldown <= 0) {
      const candidates = Array.from({ length: COLS }, (_, i) => i);
      while (candidates.length > 0) {
        const pick = Math.floor(Math.random() * candidates.length);
        const col = candidates.splice(pick, 1)[0];
        const shooter = lowestAliveInColumn(col);
        if (shooter) {
          state.alienBullets.push({
            x: shooter.x,
            y: shooter.y + 12,
            w: ALIEN_BULLET_W,
            h: ALIEN_BULLET_H,
            vy: ALIEN_BULLET_SPEED,
          });
          break;
        }
      }
      state.alienCooldown = ALIEN_FIRE_COOLDOWN * (0.7 + Math.random() * 0.6);
    }

    for (const bullet of state.alienBullets) bullet.y += bullet.vy * dt;
    state.alienBullets = state.alienBullets.filter((bullet) => bullet.y < BASE_H + 20);

    if (state.playerBullet) {
      for (const inv of state.invaders) {
        if (!inv.alive) continue;
        const rect = {
          x: inv.x - invW / 2,
          y: inv.y - invH / 2,
          w: invW,
          h: invH,
        };
        if (overlap(state.playerBullet, rect)) {
          inv.alive = false;
          state.playerBullet = null;
          if (audio) audio.explosion();
          break;
        }
      }
    }

    if (state.playerBullet && hitShield(state.playerBullet)) state.playerBullet = null;
    state.alienBullets = state.alienBullets.filter((bullet) => !hitShield(bullet));

    const shipRect = {
      x: state.shipX - state.metrics.shipW / 2,
      y: state.shipY - state.metrics.shipH / 2,
      w: state.metrics.shipW,
      h: state.metrics.shipH,
    };
    for (const bullet of state.alienBullets) {
      if (overlap(bullet, shipRect)) {
        state.playerExplosion = { timer: 0.7 };
        state.gameOver = true;
        state.youWin = false;
        state.resetTimer = RESET_DELAY;
        if (audio) audio.playerDie();
        break;
      }
    }

    if (state.playerExplosion.timer > 0) state.playerExplosion.timer -= dt;

    if (!anyInvadersAlive()) {
      state.gameOver = true;
      state.youWin = true;
      state.resetTimer = RESET_DELAY;
    }

    if (!state.ufo) {
      state.ufoCooldown -= dt;
      if (state.ufoCooldown <= 0) {
        const size = ufoSize();
        const dir = Math.random() < 0.5 ? 1 : -1;
        state.ufo = {
          x: dir > 0 ? -size.w - 16 : BASE_W + size.w + 16,
          y: UFO_Y,
          w: size.w,
          h: size.h,
          dir,
        };
        if (audio) audio.ufoStart();
      }
    } else {
      state.ufo.x += state.ufo.dir * UFO_SPEED * dt;

      if (state.playerBullet) {
        const ufoRect = {
          x: state.ufo.x - state.ufo.w / 2,
          y: state.ufo.y - state.ufo.h / 2,
          w: state.ufo.w,
          h: state.ufo.h,
        };
        if (overlap(state.playerBullet, ufoRect)) {
          state.playerBullet = null;
          state.ufo = null;
          state.ufoCooldown = 10 + Math.random() * 8;
          if (audio) {
            audio.explosion();
            audio.ufoStop();
          }
        }
      }

      if (
        state.ufo &&
        ((state.ufo.dir > 0 && state.ufo.x - state.ufo.w / 2 > BASE_W + 12) ||
          (state.ufo.dir < 0 && state.ufo.x + state.ufo.w / 2 < -12))
      ) {
        state.ufo = null;
        state.ufoCooldown = 10 + Math.random() * 8;
        if (audio) audio.ufoStop();
      }
    }

    if (!state.ufo && audio) audio.ufoStop();
  }

  function renderUfo() {
    if (!state.ufo) return;
    const startX = snap(state.ufo.x - state.ufo.w / 2);
    const startY = snap(state.ufo.y - state.ufo.h / 2);
    ctx.fillStyle = UFO_COLOR;
    for (let row = 0; row < UFO_SHAPE.length; row += 1) {
      for (let col = 0; col < UFO_SHAPE[row].length; col += 1) {
        if (UFO_SHAPE[row][col] === "#") {
          ctx.fillRect(startX + col * UFO_BLOCK, startY + row * UFO_BLOCK, UFO_BLOCK, UFO_BLOCK);
        }
      }
    }
  }

  function render() {
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, viewport.cssW, viewport.cssH);

    ctx.save();
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.scale, viewport.scale);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    ctx.fillStyle = SHIELD_COLOR;
    const shieldBlock = state.metrics.shieldBlock;
    for (const shield of state.shields) {
      for (const cell of shield.cells) {
        if (!cell.alive) continue;
        ctx.fillRect(snap(shield.x + cell.dx), snap(shield.y + cell.dy), shieldBlock, shieldBlock);
      }
    }

    renderUfo();

    const invaderTexture = state.animToggle ? images.InvaderB : images.InvaderA;
    for (const inv of state.invaders) {
      if (!inv.alive || !invaderTexture) continue;
      ctx.drawImage(
        invaderTexture,
        snap(inv.x - state.metrics.invW / 2),
        snap(inv.y - state.metrics.invH / 2),
        state.metrics.invW,
        state.metrics.invH
      );
    }

    if (state.playerExplosion.timer > 0 && images.Explosion) {
      const explosionW = state.metrics.shipW * 1.2;
      const explosionH = state.metrics.shipH * 1.2;
      ctx.drawImage(
        images.Explosion,
        snap(state.shipX - explosionW / 2),
        snap(state.shipY - explosionH / 2),
        explosionW,
        explosionH
      );
    } else if (images.Ship) {
      ctx.drawImage(
        images.Ship,
        snap(state.shipX - state.metrics.shipW / 2),
        snap(state.shipY - state.metrics.shipH / 2),
        state.metrics.shipW,
        state.metrics.shipH
      );
    }

    ctx.fillStyle = "#ffffff";
    if (state.playerBullet) {
      ctx.fillRect(
        snap(state.playerBullet.x),
        snap(state.playerBullet.y),
        state.playerBullet.w,
        state.playerBullet.h
      );
    }
    for (const bullet of state.alienBullets) {
      ctx.fillRect(snap(bullet.x), snap(bullet.y), bullet.w, bullet.h);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
    for (let y = 0; y < BASE_H; y += 4) ctx.fillRect(0, y, BASE_W, 1);

    ctx.restore();
  }

  function tick(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt);
    render();
    rafId = window.requestAnimationFrame(tick);
  }

  function pause() {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastTs = 0;
    if (audio) audio.suspend();
  }

  function resume() {
    if (running) return;
    running = true;
    if (audio) audio.resume();
    rafId = window.requestAnimationFrame(tick);
  }

  function loadImage(name) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `assets/${name}`;
    });
  }

  window.__spaceInvaders = { pause, resume };
  window.addEventListener("resize", updateViewport);

  Promise.all([
    loadImage("Ship.gif").then((image) => { images.Ship = image; }),
    loadImage("InvaderA.gif").then((image) => { images.InvaderA = image; }),
    loadImage("InvaderB.gif").then((image) => { images.InvaderB = image; }),
    loadImage("Explosion.gif").then((image) => { images.Explosion = image; }).catch(() => {}),
  ])
    .then(() => {
      if (SOUND_ENABLED) {
        try {
          audio = makeAudio();
          if (audio) audio.resume();
        } catch (_) {
          audio = null;
        }
      }
      updateViewport();
      resetGame();
      render();
      if (running) rafId = window.requestAnimationFrame(tick);
    })
    .catch((error) => {
      console.error("No se pudieron cargar los assets", error);
      updateViewport();
      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, viewport.cssW, viewport.cssH);
      ctx.fillStyle = "#fff";
      ctx.font = "18px monospace";
      ctx.fillText("Error cargando assets del screensaver", 24, 40);
    });
})();
