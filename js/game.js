/* 煎饺合成 — static H5, no third-party libraries */
(function (root) {
  "use strict";

  var VIEW_W = 360;
  var VIEW_H = 640;
  var MAX_TYPE = 10;
  var DROP_MAX = 4;
  var HIGH_KEY = "jianjiao-merge-high";
  var MUTE_KEY = "jianjiao-merge-mute";

  var TIERS = [
    { name: "生坯",     file: "assets/tier-00.png", r: 16, score: 0 },
    { name: "小煎饺",   file: "assets/tier-01.png", r: 21, score: 1 },
    { name: "煎饺",     file: "assets/tier-02.png", r: 26, score: 3 },
    { name: "招手饺",   file: "assets/tier-03.png", r: 32, score: 6 },
    { name: "茶香饺",   file: "assets/tier-04.png", r: 39, score: 10 },
    { name: "筷饺",     file: "assets/tier-05.png", r: 47, score: 15 },
    { name: "满足饺",   file: "assets/tier-06.png", r: 56, score: 21 },
    { name: "礼饺",     file: "assets/tier-07.png", r: 67, score: 28 },
    { name: "金铃饺",   file: "assets/tier-08.png", r: 80, score: 36 },
    { name: "高升饺",   file: "assets/tier-09.png", r: 95, score: 45 },
    { name: "饺中之王", file: "assets/tier-10.png", r: 112, score: 66 }
  ];

  var BOX = { left: 26, right: 334, top: 118, bottom: 568 };
  var DROP_Y = 86;
  var GRAVITY = 1650;
  var RESTITUTION = 0.16;
  var FRICTION = 0.28;
  var ITERATIONS = 8;
  var DROP_WEIGHTS = [5, 4, 3, 2, 1];

  var images = {};
  var audioCtx = null;
  var muted = false;

  var nextId = 1;
  function uid() { return nextId++; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error("无法加载 " + src)); };
      im.src = src;
    });
  }

  function radiusOf(type) { return TIERS[type].r; }

  function makeBall(type, x, y) {
    var r = radiusOf(type);
    return {
      id: uid(),
      type: type,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      r: r,
      rot: (Math.random() - 0.5) * 0.3,
      omega: 0,
      scale: 1,
      pop: 1,
      mergeLock: 0,
      overTime: 0,
      dead: false,
      dropped: false,
      hit: false
    };
  }

  function createWorld() {
    return {
      balls: [],
      score: 0,
      high: 0,
      combo: 0,
      comboTimer: 0,
      maxCombo: 0,
      maxType: 0,
      nextType: pickDropType(),
      queuedType: pickDropType(),
      aimX: (BOX.left + BOX.right) / 2,
      aiming: false,
      canDrop: true,
      dropCooldown: 0,
      fallingId: 0,
      state: "title",
      danger: false,
      shake: 0,
      pops: [],
      crumbs: [],
      newRecord: false,
      overReason: ""
    };
  }

  function pickDropType() {
    var sum = 0;
    var i;
    for (i = 0; i < DROP_WEIGHTS.length; i++) sum += DROP_WEIGHTS[i];
    var t = Math.random() * sum;
    for (i = 0; i < DROP_WEIGHTS.length; i++) {
      t -= DROP_WEIGHTS[i];
      if (t <= 0) return i;
    }
    return 0;
  }

  function stepPhysics(world, dt) {
    var balls = world.balls;
    var i, j, b, a, n = balls.length;
    var L = BOX.left, R = BOX.right, Btm = BOX.bottom;

    for (i = 0; i < n; i++) {
      b = balls[i];
      if (b.dead) continue;
      if (b.mergeLock > 0) b.mergeLock = Math.max(0, b.mergeLock - dt);
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.omega * dt;
      b.vx *= Math.max(0, 1 - 0.12 * dt);
      b.omega *= Math.max(0, 1 - 1.4 * dt);
      if (b.scale < b.pop) {
        b.scale += (b.pop - b.scale) * Math.min(1, dt * 12);
        if (b.pop > 1 && b.scale > 1.04) b.pop = 1;
      } else if (b.scale > 1) {
        b.scale += (1 - b.scale) * Math.min(1, dt * 8);
      }
    }

    var merges = [];
    var it;
    for (it = 0; it < ITERATIONS; it++) {
      for (i = 0; i < n; i++) {
        b = balls[i];
        if (b.dead) continue;
        if (b.x - b.r < L) {
          b.x = L + b.r;
          if (b.vx < 0) b.vx = -b.vx * 0.22;
          b.omega *= 0.75;
          b.hit = true;
        }
        if (b.x + b.r > R) {
          b.x = R - b.r;
          if (b.vx > 0) b.vx = -b.vx * 0.22;
          b.omega *= 0.75;
          b.hit = true;
        }
        if (b.y + b.r > Btm) {
          b.y = Btm - b.r;
          if (b.vy > 0) {
            b.vy = -b.vy * 0.12;
            b.vx *= 0.86;
            b.omega = b.omega * 0.65 + (b.vx / Math.max(8, b.r)) * 0.4;
            if (Math.abs(b.vy) < 28) b.vy = 0;
          }
          b.hit = true;
        }
      }

      for (i = 0; i < n; i++) {
        a = balls[i];
        if (a.dead) continue;
        for (j = i + 1; j < n; j++) {
          b = balls[j];
          if (b.dead) continue;
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var d2 = dx * dx + dy * dy;
          var min = a.r + b.r;
          if (d2 >= min * min || d2 === 0) continue;
          var d = Math.sqrt(d2);
          var nx = dx / d;
          var ny = dy / d;

          if (
            it === 0 &&
            a.type === b.type &&
            a.type < MAX_TYPE &&
            a.mergeLock <= 0 &&
            b.mergeLock <= 0 &&
            d <= min + 1.2
          ) {
            a.dead = true;
            b.dead = true;
            merges.push([a, b]);
            continue;
          }

          var overlap = min - d;
          var ma = a.r * a.r;
          var mb = b.r * b.r;
          var inv = 1 / ma + 1 / mb;
          a.x -= nx * overlap * (1 / ma) / inv;
          a.y -= ny * overlap * (1 / ma) / inv;
          b.x += nx * overlap * (1 / mb) / inv;
          b.y += ny * overlap * (1 / mb) / inv;

          var rvx = b.vx - a.vx;
          var rvy = b.vy - a.vy;
          var vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            var jn = -(1 + RESTITUTION) * vn / inv;
            a.vx -= (jn * nx) / ma;
            a.vy -= (jn * ny) / ma;
            b.vx += (jn * nx) / mb;
            b.vy += (jn * ny) / mb;
            var tx = -ny;
            var ty = nx;
            var vt = rvx * tx + rvy * ty;
            var jt = -vt / inv;
            var maxF = Math.abs(jn) * FRICTION;
            if (jt > maxF) jt = maxF;
            if (jt < -maxF) jt = -maxF;
            a.vx -= (jt * tx) / ma;
            a.vy -= (jt * ty) / ma;
            b.vx += (jt * tx) / mb;
            b.vy += (jt * ty) / mb;
            a.omega -= jt / (ma * a.r) * 0.45;
            b.omega += jt / (mb * b.r) * 0.45;
            a.hit = true;
            b.hit = true;
          }
        }
      }
    }
    return merges;
  }

  function applyMerges(world, pairs) {
    var k;
    for (k = 0; k < pairs.length; k++) {
      var a = pairs[k][0];
      var b = pairs[k][1];
      var type = a.type + 1;
      var ma = a.r * a.r;
      var mb = b.r * b.r;
      var x = (a.x * ma + b.x * mb) / (ma + mb);
      var y = (a.y * ma + b.y * mb) / (ma + mb);
      var r = radiusOf(type);
      x = clamp(x, BOX.left + r, BOX.right - r);
      y = Math.min(y, BOX.bottom - r);
      var ball = makeBall(type, x, y);
      ball.vx = (a.vx * ma + b.vx * mb) / (ma + mb) * 0.35;
      ball.vy = (a.vy * ma + b.vy * mb) / (ma + mb) * 0.35 - 55;
      ball.mergeLock = 0.14;
      ball.scale = 0.72;
      ball.pop = 1.18;
      ball.hit = true;
      world.balls.push(ball);

      if (type > world.maxType) world.maxType = type;

      if (world.comboTimer > 0) world.combo += 1;
      else world.combo = 1;
      world.comboTimer = 0.9;
      if (world.combo > world.maxCombo) world.maxCombo = world.combo;

      var gained = TIERS[type].score;
      if (world.combo > 1) gained += Math.floor(TIERS[type].score * (world.combo - 1) * 0.5);
      world.score += gained;

      world.pops.push({
        x: x,
        y: y - r * 0.2,
        text: "+" + gained,
        name: TIERS[type].name,
        life: 0.7,
        age: 0
      });
      spawnCrumbs(world, x, y, type);
      if (type >= 6) world.shake = Math.max(world.shake, 0.18 + type * 0.015);
      playTone(880 * Math.pow(1.12, type), 0.09, 0.07);
    }
    if (pairs.length) {
      var live = [];
      var i;
      for (i = 0; i < world.balls.length; i++) {
        if (!world.balls[i].dead) live.push(world.balls[i]);
      }
      world.balls = live;
    }
    return pairs.length;
  }

  function spawnCrumbs(world, x, y, type) {
    var n = 7 + type;
    var i;
    for (i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 140;
      world.crumbs.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 50,
        r: 1.4 + Math.random() * 2.4,
        life: 0.35 + Math.random() * 0.35,
        age: 0,
        color: Math.random() < 0.5 ? "#e8b84a" : "#c48a22"
      });
    }
  }

  function updateFx(world, dt) {
    var i;
    if (world.comboTimer > 0) {
      world.comboTimer -= dt;
      if (world.comboTimer <= 0) world.combo = 0;
    }
    if (world.shake > 0) world.shake = Math.max(0, world.shake - dt);

    for (i = world.pops.length - 1; i >= 0; i--) {
      var p = world.pops[i];
      p.age += dt;
      p.y -= 28 * dt;
      if (p.age >= p.life) world.pops.splice(i, 1);
    }
    for (i = world.crumbs.length - 1; i >= 0; i--) {
      var c = world.crumbs[i];
      c.age += dt;
      c.vy += 520 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.age >= c.life) world.crumbs.splice(i, 1);
    }
  }

  function dropBall(world, type, x) {
    var r = radiusOf(type);
    x = clamp(x, BOX.left + r, BOX.right - r);
    var ball = makeBall(type, x, DROP_Y);
    ball.dropped = true;
    ball.vy = 30;
    world.balls.push(ball);
    world.fallingId = ball.id;
    world.canDrop = false;
    world.dropCooldown = 0.85;
    world.aiming = false;
    playTone(220, 0.06, 0.05);
    return ball;
  }

  function afterDropTick(world, dt) {
    if (world.canDrop) return;
    world.dropCooldown -= dt;
    var falling = null;
    var i;
    for (i = 0; i < world.balls.length; i++) {
      if (world.balls[i].id === world.fallingId) {
        falling = world.balls[i];
        break;
      }
    }
    if (!falling || falling.dead || falling.hit || world.dropCooldown <= 0) {
      world.canDrop = true;
      world.fallingId = 0;
    }
  }

  function runSync(world, seconds) {
    var frames = Math.max(1, Math.round(seconds * 60));
    var f;
    for (f = 0; f < frames; f++) {
      var pairs = stepPhysics(world, 1 / 60);
      applyMerges(world, pairs);
      afterDropTick(world, 1 / 60);
      updateFx(world, 1 / 60);
    }
  }

  function checkDanger(world, dt) {

    var danger = false;
    var lose = false;
    var i, b, speed;
    for (i = 0; i < world.balls.length; i++) {
      b = world.balls[i];
      if (b.dead) continue;
      if (b.id === world.fallingId && !b.hit) continue;
      if (b.y - b.r < BOX.top) {
        danger = true;
        speed = Math.hypot(b.vx, b.vy);
        if (speed < 55) {
          b.overTime += dt;
          if (b.overTime > 0.95) lose = true;
        } else {
          b.overTime = Math.max(0, b.overTime - dt * 0.5);
        }
      } else {
        b.overTime = 0;
      }
    }
    world.danger = danger;
    return lose;
  }

  function highestType(world) {
    var m = 0;
    var i;
    for (i = 0; i < world.balls.length; i++) {
      if (!world.balls[i].dead && world.balls[i].type > m) m = world.balls[i].type;
    }
    return Math.max(m, world.maxType);
  }

  /* ---------- audio ---------- */
  function ensureAudio() {
    if (muted) return null;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (err) {
      return null;
    }
  }

  function playTone(freq, dur, gain) {
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { /* ignore */ }
  }

  function playOver() {
    playTone(320, 0.12, 0.06);
    setTimeout(function () { playTone(240, 0.14, 0.06); }, 110);
    setTimeout(function () { playTone(180, 0.22, 0.05); }, 230);
  }

  /* ---------- rendering ---------- */
  function drawBasket(ctx) {
    var L = BOX.left, R = BOX.right, T = BOX.top, Btm = BOX.bottom;
    var wall = 16;

    var bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    bg.addColorStop(0, "#6a4224");
    bg.addColorStop(0.4, "#5a351c");
    bg.addColorStop(1, "#3d2414");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.fillStyle = "rgba(255, 244, 224, 0.04)";
    var i;
    for (i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.ellipse(40 + i * 36, 36 + (i % 3) * 14, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#f3e0bc";
    ctx.fillRect(L, T - 2, R - L, Btm - T + 2);

    var inner = ctx.createLinearGradient(0, T, 0, Btm);
    inner.addColorStop(0, "#f7ead0");
    inner.addColorStop(1, "#e6c894");
    ctx.fillStyle = inner;
    ctx.fillRect(L, T, R - L, Btm - T);

    // walls / floor / danger line are painted after the dumplings
  }

  var dangerPulse = 0;
  var activeWorld = null;
  function worldDangerColor() {
    if (activeWorld && activeWorld.danger) {
      var a = 0.65 + Math.sin(dangerPulse * 8) * 0.35;
      return "rgba(196, 69, 47, " + a + ")";
    }
    return "rgba(196, 69, 47, 0.45)";
  }

  function drawBall(ctx, b, ghost) {
    var img = images["tier-" + b.type];
    var r = b.r * (b.scale || 1);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (!ghost) {
      ctx.fillStyle = "rgba(42, 24, 16, 0.22)";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.78, r * 0.72, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(b.rot || 0);
    if (ghost) ctx.globalAlpha = 0.55;
    if (img) {
      var s = r * 2.04;
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
    } else {
      ctx.fillStyle = "#e8b84a";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWalls(ctx) {
    var L = BOX.left, R = BOX.right, T = BOX.top, Btm = BOX.bottom;
    var wall = 16;
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(L - wall, T - 8, wall, Btm - T + 8);
    ctx.fillStyle = "#7a4d22";
    ctx.fillRect(R, T - 8, wall, Btm - T + 8);
    // floor slats
    ctx.fillStyle = "#6b3e1a";
    ctx.fillRect(L - wall, Btm, (R - L) + wall * 2, 22);
    ctx.fillStyle = "#8a5a2b";
    ctx.fillRect(L - wall, Btm, (R - L) + wall * 2, 5);
    ctx.strokeStyle = "rgba(42, 24, 16, 0.28)";
    ctx.lineWidth = 1;
    var i;
    for (i = 0; i < 8; i++) {
      var y = T + 20 + i * ((Btm - T) / 8);
      ctx.beginPath();
      ctx.moveTo(L - wall, y);
      ctx.lineTo(L, y);
      ctx.moveTo(R, y);
      ctx.lineTo(R + wall, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#c48a22";
    ctx.fillRect(L - wall - 2, T - 14, wall + 2, 12);
    ctx.fillRect(R, T - 14, wall + 2, 12);
    ctx.save();
    ctx.strokeStyle = worldDangerColor();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(L + 6, T);
    ctx.lineTo(R - 6, T);
    ctx.stroke();
    ctx.restore();
  }

  function drawWorld(ctx, world) {
    activeWorld = world;
    ctx.save();
    if (world.shake > 0) {
      var mag = world.shake * 10;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    drawBasket(ctx);

    var i, b;
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOX.left, 0, BOX.right - BOX.left, BOX.bottom - 0);
    ctx.clip();
    for (i = 0; i < world.balls.length; i++) {
      b = world.balls[i];
      if (!b.dead) drawBall(ctx, b, false);
    }
    ctx.restore();

    drawWalls(ctx);

    if (world.state === "playing" && world.canDrop) {
      var gt = world.nextType;
      var gr = radiusOf(gt);
      var gx = clamp(world.aimX, BOX.left + gr, BOX.right - gr);
      ctx.save();
      ctx.beginPath();
      ctx.rect(BOX.left, 0, BOX.right - BOX.left, BOX.bottom);
      ctx.clip();
      ctx.strokeStyle = "rgba(106, 58, 31, 0.28)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(gx, DROP_Y);
      ctx.lineTo(gx, BOX.bottom - 4);
      ctx.stroke();
      drawBall(ctx, { x: gx, y: DROP_Y, r: gr, type: gt, rot: 0, scale: 1 }, true);
      ctx.restore();
    }

    for (i = 0; i < world.crumbs.length; i++) {
      var c = world.crumbs[i];
      var ca = 1 - c.age / c.life;
      ctx.globalAlpha = ca;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.font = "bold 13px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    for (i = 0; i < world.pops.length; i++) {
      var p = world.pops[i];
      var pa = 1 - p.age / p.life;
      ctx.globalAlpha = pa;
      ctx.fillStyle = "#6b3a1f";
      ctx.fillText(p.text, p.x, p.y);
      if (p.name && p.age < 0.5) {
        ctx.font = "bold 11px 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillStyle = "#c48a22";
        ctx.fillText(p.name, p.x, p.y + 14);
        ctx.font = "bold 13px 'PingFang SC', 'Microsoft YaHei', sans-serif";
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawNext(cvs, type) {
    var c = cvs.getContext("2d");
    var w = cvs.width;
    var h = cvs.height;
    c.clearRect(0, 0, w, h);
    var img = images["tier-" + type];
    if (!img) return;
    var pad = 6;
    c.drawImage(img, pad, pad, w - pad * 2, h - pad * 2);
  }

  /* ---------- UI ---------- */
  var els = {};
  var world = null;
  var lastTs = 0;
  var raf = 0;
  var toastTimer = 0;

  function $(id) { return document.getElementById(id); }

  function showScreen(id) {
    var ids = ["screen-boot", "screen-title", "screen-over"];
    var i;
    for (i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (el) el.hidden = ids[i] !== id;
    }
  }

  function hideScreens() {
    var ids = ["screen-boot", "screen-title", "screen-over"];
    var i;
    for (i = 0; i < ids.length; i++) $(ids[i]).hidden = true;
  }

  function formatScore(n) {
    return String(n | 0);
  }

  function readHigh() {
    try {
      var v = parseInt(localStorage.getItem(HIGH_KEY) || "0", 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (err) {
      return 0;
    }
  }

  function writeHigh(n) {
    try { localStorage.setItem(HIGH_KEY, String(n)); } catch (err) { /* ignore */ }
  }

  function updateHud() {
    if (!world) return;
    $("score").textContent = formatScore(world.score);
    $("high").textContent = formatScore(world.high);
    $("title-high").textContent = formatScore(world.high);
    if (world.combo >= 2) {
      $("combo").textContent = "连消 ×" + world.combo;
    } else {
      $("combo").textContent = "";
    }
    drawNext($("next"), world.queuedType);
  }

  function fillDex() {
    var ol = $("dex");
    ol.innerHTML = "";
    var i;
    for (i = 0; i < TIERS.length; i++) {
      var li = document.createElement("li");
      var img = document.createElement("img");
      img.src = TIERS[i].file;
      img.alt = TIERS[i].name;
      img.width = 32;
      img.height = 32;
      var sp = document.createElement("span");
      sp.textContent = TIERS[i].name;
      li.appendChild(img);
      li.appendChild(sp);
      ol.appendChild(li);
    }
  }

  function showToast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  function shareText(w) {
    var best = TIERS[highestType(w)].name;
    return "我在「煎饺合成」里得到 " + w.score + " 分，最高合成了「" + best + "」！来一起煎一锅吧。";
  }

  function copyText(text) {
    if (root.navigator && navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (err) {
      return false;
    }
  }

  function startGame() {
    var high = world ? world.high : readHigh();
    world = createWorld();
    world.high = high;
    world.state = "playing";
    hideScreens();
    $("hud").hidden = false;
    $("hint").hidden = false;
    updateHud();
    ensureAudio();
    playTone(520, 0.07, 0.05);
    setTimeout(function () { playTone(720, 0.08, 0.05); }, 80);
  }

  function endGame() {
    if (world.state !== "playing") return;
    world.state = "over";
    world.canDrop = false;
    var record = world.score > world.high;
    if (record) {
      world.high = world.score;
      world.newRecord = true;
      writeHigh(world.high);
    }
    $("hud").hidden = false;
    $("hint").hidden = true;
    $("over-title").textContent = record ? "新纪录！" : "锅满了！";
    $("over-badge").hidden = !record;
    $("over-score").textContent = formatScore(world.score);
    var meta = "最高合成了「" + TIERS[highestType(world)].name + "」";
    if (world.maxCombo >= 2) meta += " · 连消 ×" + world.maxCombo;
    $("over-meta").textContent = meta;
    $("over-art").src = record ? "assets/sparkle.png" : "assets/sad.png";
    $("over-art").alt = record ? "新纪录" : "锅满了";
    showScreen("screen-over");
    updateHud();
    playOver();
    if (navigator.vibrate) {
      try { navigator.vibrate(record ? [30, 40, 30] : 40); } catch (err) { /* ignore */ }
    }
  }

  function pointerX(ev, canvas) {
    var rect = canvas.getBoundingClientRect();
    var clientX = ev.clientX;
    if (ev.touches && ev.touches.length) clientX = ev.touches[0].clientX;
    else if (ev.changedTouches && ev.changedTouches.length) clientX = ev.changedTouches[0].clientX;
    return ((clientX - rect.left) / rect.width) * VIEW_W;
  }

  function isUiTarget(t) {
    if (!t || !t.closest) return false;
    return !!t.closest("button, a, .card, .footer, #mute");
  }

  function bindInput(canvas) {
    var down = false;

    function onDown(ev) {
      if (world.state !== "playing") return;
      if (isUiTarget(ev.target)) return;
      if (ev.cancelable) ev.preventDefault();
      down = true;
      world.aiming = true;
      world.aimX = pointerX(ev, canvas);
    }
    function onMove(ev) {
      if (!down || world.state !== "playing") return;
      if (ev.cancelable) ev.preventDefault();
      world.aiming = true;
      world.aimX = pointerX(ev, canvas);
    }
    function onUp(ev) {
      if (!down) return;
      down = false;
      if (world.state !== "playing") return;
      if (ev.cancelable) ev.preventDefault();
      world.aimX = pointerX(ev, canvas);
      if (world.canDrop) {
        var type = world.nextType;
        dropBall(world, type, world.aimX);
        world.nextType = world.queuedType;
        world.queuedType = pickDropType();
        updateHud();
        $("hint").hidden = true;
      }
    }

    var stage = $("stage");
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", function () { down = false; if (world) world.aiming = false; });
    stage.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    document.addEventListener("touchmove", function (e) {
      if (e.target && e.target.closest && e.target.closest(".card")) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
  }

  function tick(ts) {
    raf = requestAnimationFrame(tick);
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    dangerPulse += dt;

    if (!world) return;
    var ctx = els.ctx;
    var dpr = els.dpr;

    if (world.state === "playing") {
      var steps = dt > 1 / 50 ? 2 : 1;
      var h = dt / steps;
      var s;
      for (s = 0; s < steps; s++) {
        var pairs = stepPhysics(world, h);
        applyMerges(world, pairs);
        afterDropTick(world, h);
      }
      updateFx(world, dt);
      if (checkDanger(world, dt)) endGame();
      if (world.combo >= 2) $("combo").textContent = "连消 ×" + world.combo;
      else if ($("combo").textContent) $("combo").textContent = "";
    } else if (world.state === "over") {
      stepPhysics(world, dt);
      updateFx(world, dt);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWorld(ctx, world);
  }

  function fitCanvas(canvas) {
    var dpr = Math.max(1, Math.min(2.5, root.devicePixelRatio || 1));
    canvas.width = Math.round(VIEW_W * dpr);
    canvas.height = Math.round(VIEW_H * dpr);
    els.dpr = dpr;
    els.ctx = canvas.getContext("2d");
  }

  function setMuted(v) {
    muted = !!v;
    var btn = $("mute");
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
    btn.setAttribute("aria-label", muted ? "打开声音" : "关闭声音");
    btn.textContent = muted ? "♫" : "♪";
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (err) { /* ignore */ }
    if (!muted) ensureAudio();
  }

  function boot() {
    els.canvas = $("scene");
    fitCanvas(els.canvas);
    world = createWorld();
    world.high = readHigh();
    world.state = "boot";

    try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (err) { muted = false; }
    setMuted(muted);

    fillDex();
    updateHud();
    bindInput(els.canvas);

    $("btn-start").addEventListener("click", function () { startGame(); });
    $("btn-retry").addEventListener("click", function () { startGame(); });
    $("btn-share").addEventListener("click", function () {
      var text = shareText(world);
      copyText(text).then(function (ok) {
        showToast(ok ? "战绩已复制，去粘贴分享吧" : text);
      });
    });
    $("mute").addEventListener("click", function (e) {
      e.stopPropagation();
      setMuted(!muted);
    });

    window.addEventListener("resize", function () { fitCanvas(els.canvas); });
    document.addEventListener("visibilitychange", function () {
      lastTs = 0;
    });

    var srcs = [];
    var i;
    for (i = 0; i < TIERS.length; i++) {
      srcs.push({ key: "tier-" + i, src: TIERS[i].file });
    }
    srcs.push({ key: "hero", src: "assets/hero.png" });
    srcs.push({ key: "sad", src: "assets/sad.png" });
    srcs.push({ key: "sparkle", src: "assets/sparkle.png" });

    Promise.all(srcs.map(function (s) {
      return loadImage(s.src).then(function (im) { images[s.key] = im; });
    })).then(function () {
      showScreen("screen-title");
      requestAnimationFrame(tick);
      if (/[?&]autotest=1\b/.test(location.search)) {
        setTimeout(runBrowserAutotest, 80);
      } else if (/[?&]demo=1\b/.test(location.search)) {
        setTimeout(runDemoBoard, 80);
      } else if (/[?&]over=1\b/.test(location.search)) {
        setTimeout(function () {
          startGame();
          world.score = 1280;
          world.maxType = 10;
          world.maxCombo = 4;
          endGame();
        }, 80);
      }
    }).catch(function (err) {
      $("screen-boot").innerHTML = "<p class='loading'>图片加载失败</p>";
      console.error(err);
    });
  }

  /* ---------- headless / autotest helpers ---------- */
  function runHeadlessMergeTest() {
    var w = createWorld();
    w.state = "playing";
    var a = makeBall(0, 160, 520);
    var b = makeBall(0, 190, 520);
    a.vx = 20;
    b.vx = -20;
    w.balls.push(a, b);
    var merges = 0;
    var frames = 0;
    var exploded = false;
    for (frames = 0; frames < 240; frames++) {
      var pairs = stepPhysics(w, 1 / 60);
      merges += applyMerges(w, pairs);
      var k;
      for (k = 0; k < w.balls.length; k++) {
        var ball = w.balls[k];
        if (!isFinite(ball.x) || !isFinite(ball.y) || Math.abs(ball.vx) > 4000) exploded = true;
      }
    }
    var types = w.balls.map(function (ball) { return ball.type; });
    return {
      merges: merges,
      score: w.score,
      types: types,
      count: w.balls.length,
      hasTier1: types.indexOf(1) !== -1,
      exploded: exploded,
      allFinite: !exploded
    };
  }

  function runChainTest() {
    var w = createWorld();
    w.state = "playing";
    w.balls.push(makeBall(0, 180, 560));
    w.balls.push(makeBall(0, 180, 520));
    w.balls.push(makeBall(1, 180, 470));
    var merges = 0;
    var f;
    for (f = 0; f < 300; f++) {
      merges += applyMerges(w, stepPhysics(w, 1 / 60));
    }
    var maxT = 0;
    w.balls.forEach(function (b) { if (b.type > maxT) maxT = b.type; });
    return { merges: merges, maxType: maxT, score: w.score, count: w.balls.length };
  }

  function publishTest(result) {
    root.__TEST_RESULT__ = result;
    try {
      document.title = result.ok ? "AUTOTEST:OK" : "AUTOTEST:FAIL";
      var node = document.getElementById("autotest-out") || document.createElement("pre");
      node.id = "autotest-out";
      node.textContent = JSON.stringify(result);
      if (!node.parentNode) document.body.appendChild(node);
    } catch (e) {}
    console.log("[autotest]", JSON.stringify(result));
  }

  function runBrowserAutotest() {
    var result = { ok: false, merges: 0, errors: [] };
    try {
      var physics = runHeadlessMergeTest();
      var chain = runChainTest();
      result.physics = physics;
      result.chain = chain;
      startGame();
      dropBall(world, 0, 178);
      runSync(world, 0.95);
      dropBall(world, 0, 186);
      runSync(world, 1.1);
      result.score = world.score;
      result.merges = 0;
      world.balls.forEach(function (b) { if (b.type >= 1) result.merges += 1; });
      if (world.score > 0) result.merges = Math.max(result.merges, 1);
      result.ballCount = world.balls.length;
      result.types = world.balls.map(function (b) { return b.type; });
      result.ok = !!(physics.hasTier1 && !physics.exploded && chain.maxType >= 2 && world.score > 0);
      updateHud();
      $("hint").hidden = true;
      publishTest(result);
    } catch (err) {
      result.errors.push(String(err && err.stack || err));
      publishTest(result);
      console.error(err);
    }
  }

  function runDemoBoard() {
    startGame();
    var drops = [
      [0, 70], [0, 80], [1, 210], [0, 260], [2, 150],
      [1, 200], [0, 100], [3, 290], [0, 170], [2, 155],
      [1, 90], [0, 200], [0, 240], [4, 120]
    ];
    var i;
    for (i = 0; i < drops.length; i++) {
      dropBall(world, drops[i][0], drops[i][1]);
      runSync(world, 0.85);
    }
    runSync(world, 1.2);
    world.canDrop = true;
    world.nextType = 0;
    world.queuedType = 2;
    world.aimX = 180;
    updateHud();
    $("hint").hidden = true;
    try { document.title = "DEMO:READY " + world.score; } catch (e) {}
    console.log("[demo] score=" + world.score + " balls=" + world.balls.length + " max=" + highestType(world));
  }

  var API = {
    TIERS: TIERS,
    createWorld: createWorld,
    stepPhysics: stepPhysics,
    applyMerges: applyMerges,
    makeBall: makeBall,
    dropBall: dropBall,
    runHeadlessMergeTest: runHeadlessMergeTest,
    runChainTest: runChainTest,
    mount: boot
  };

  root.Jianjiao = API;

  if (typeof document !== "undefined" && document.getElementById("scene")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  if (typeof module === "object" && module.exports) {
    module.exports = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
