/* =====================================================================
   豪士藜麦无边吐司 · 治愈烘焙小厨房 —— main.js
   老爹早餐店式制作台：选材 → 揉面 → 发酵 → 烘焙 → 切片 → 去边 → 评分
   原生 JS，无依赖。竖屏 H5。
===================================================================== */
(function () {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const rand  = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
const A2    = n => './assets2/clean/' + n + '.png';   // 像素素材

/* 美术进度条的内轨与色区（图像宽度的比例；由素材像素测量得出）
   pos: 0..100（轨道局部）→ 图像 x% = (L + pos/100*(R-L))*100 */
const BAR = {
  knead:   { L: 0.165, R: 0.885, green: [0.357, 0.632], over: 0.81 },           // 绿=最佳, 右红=太猛
  ferment: { L: 0.110, R: 0.920, lo: 34, hi: 75, center: 54 },                   // 最佳发酵区(进度%)
  bake:    { L: 0.100, R: 0.920, lo: 50, hi: 74, center: 62 },                   // 金黄最佳区(进度%)
};
function barX(bar, pos) { const b = BAR[bar]; return (b.L + pos / 100 * (b.R - b.L)) * 100; }

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === id));
  // 品牌 logo：加载页外全程显示
  const logo = document.getElementById('brandLogo');
  if (logo) logo.classList.toggle('hidden', id === 'screenLoading');
  // 结算页「下滑去购买」提示：进结算页且未滑到底时显示
  const hint = document.getElementById('scrollHint');
  if (hint) {
    const onResult = id === 'screenResult';
    hint.classList.toggle('hidden', !onResult);
    if (onResult) { hint.classList.remove('fade'); document.getElementById('screenResult').scrollTop = 0; }
  }
  // 小面包师只在六个制作台跟随
  const buddy = document.getElementById('npcBuddy');
  if (buddy) {
    const onStation = /^screenS[1-6]$/.test(id);
    buddy.classList.toggle('hidden', !onStation);
    if (onStation) npcReact('idle');
  }
}

/* ---------- 小面包师表情反应 ---------- */
let npcTimer;
function npcReact(mood, text) {
  const buddy = document.getElementById('npcBuddy');
  if (!buddy) return;
  const face = document.getElementById('npcFace');
  const bubble = document.getElementById('npcBubble');
  const src = mood === 'happy' ? 'npc_happy' : mood === 'nervous' ? 'npc_nervous' : 'npc';
  face.src = A2(src);
  buddy.classList.remove('react-happy', 'react-nervous');
  if (mood === 'happy')   buddy.classList.add('react-happy');
  if (mood === 'nervous') buddy.classList.add('react-nervous');
  bubble.classList.remove('mood-happy', 'mood-nervous');
  if (text) {
    bubble.textContent = text;
    bubble.classList.add('show', mood === 'happy' ? 'mood-happy' : mood === 'nervous' ? 'mood-nervous' : 'mood-happy');
  } else {
    bubble.classList.remove('show');
  }
  if (mood === 'idle') return;   // idle 立即生效、不自动复位
  clearTimeout(npcTimer);
  npcTimer = setTimeout(() => {
    face.src = A2('npc');
    buddy.classList.remove('react-happy', 'react-nervous');
    bubble.classList.remove('show');
  }, 1700);
}

/* ---------- 像素音效（WebAudio） ---------- */
const Sfx = (() => {
  let ctx;
  const ac = () => (ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)()));
  function blip(freq, dur, type = 'square', vol = .14) {
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(c.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.001, c.currentTime + dur);
      o.stop(c.currentTime + dur);
    } catch (e) {}
  }
  return {
    good:    () => { blip(660, .1, 'sine', .16); setTimeout(() => blip(990, .14, 'sine', .16), 90); },
    soft:    () => blip(rand(420, 520), .08, 'sine', .12),
    knock:   () => blip(rand(180, 240), .06, 'square', .12),
    bad:     () => blip(120, .26, 'sawtooth', .18),
    pop:     () => blip(880, .09, 'triangle', .12),
    win:     () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>blip(f,.16,'sine',.16),i*110)); },
  };
})();

/* =====================================================================
   全局制作状态：跨制作台累计的产品指标
   nutrition 营养 / taste 美味 / softness 松软 / chew 咀嚼难度(越低越好)
   各台完成度 0..100 存在 score[]
===================================================================== */
const M = {
  nutrition: 28, taste: 26, softness: 24, chew: 14,
  edgeless: 0,
  score: { material: 0, knead: 0, ferment: 0, bake: 0, slice: 0, edge: 0 },
};

function resetGame() {
  M.nutrition = 28; M.taste = 26; M.softness = 24; M.chew = 14; M.edgeless = 0;
  M.score = { material: 0, knead: 0, ferment: 0, bake: 0, slice: 0, edge: 0 };
}

/* 顶部指标 HUD（每个台都刷新） */
function renderHud(hostId) {
  const host = $('#' + hostId);
  if (!host) return;
  const d = v => Math.round(clamp(v, 0, 100));
  host.innerHTML =
    `<span class="chip">营养 <b>${d(M.nutrition)}</b></span>` +
    `<span class="chip">美味 <b>${d(M.taste)}</b></span>` +
    `<span class="chip">松软 <b>${d(M.softness)}</b></span>` +
    `<span class="chip chew">难嚼 <b>${d(M.chew)}</b></span>`;
}
function refreshAllHud() { ['hud1','hud2','hud3','hud4','hud5','hud6'].forEach(renderHud); }

let toastTimer;
function showToast(text) {
  const t = $('#toastMsg'); if (!t) return;
  t.textContent = text;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

function floatPop(host, txt, plus, x, y) {
  const el = document.createElement('div');
  el.className = 'float-pop ' + (plus ? 'plus' : 'minus');
  el.textContent = txt;
  el.style.left = (x != null ? x : rand(20, 70)) + '%';
  el.style.top  = (y != null ? y : 40) + '%';
  host.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function spawnCrumbs(host, x, y) {
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('div');
    c.className = 'crumb';
    c.style.left = (x || 50) + '%'; c.style.top = (y || 50) + '%';
    host.appendChild(c);
    c.animate(
      [{ transform: 'translate(0,0)', opacity: 1 },
       { transform: `translate(${rand(-60,60)}px, ${rand(-10,60)}px)`, opacity: 0 }],
      { duration: 600, easing: 'ease-out' }
    ).onfinish = () => c.remove();
  }
}

/* 通用：让一个值在 [0,100] 来回弹动的振荡器（needle / fill 共用） */
function makeOscillator(speed) {
  return { pos: 0, dir: 1, speed, step(dt) {
    this.pos += this.dir * this.speed * dt;
    if (this.pos >= 100) { this.pos = 100; this.dir = -1; }
    if (this.pos <= 0)   { this.pos = 0;   this.dir = 1; }
    return this.pos;
  }};
}

/* =====================================================================
   ① 选材台
===================================================================== */
// req:true 为四样必收核心好料；egg/milk 为加分好料（不强制收集）
const GOOD_MATS = [
  { id:'quinoa', img:'ing_quinoa', name:'玻利维亚红藜麦', nutrition:18, taste:6,  softness:4,  req:true },
  { id:'flour',  img:'ing_flour',  name:'高筋小麦粉',     nutrition:7,  taste:5,  softness:10, req:true },
  { id:'yeast',  img:'ing_yeast',  name:'酵母',           nutrition:3,  taste:6,  softness:12, req:true },
  { id:'water',  img:'ing_water',  name:'清水',           nutrition:2,  taste:2,  softness:9,  req:true },
  { id:'egg',    img:'ing_egg',    name:'鸡蛋',           nutrition:9,  taste:5,  softness:3,  req:false },
  { id:'milk',   img:'ing_milk',   name:'牛奶',           nutrition:6,  taste:6,  softness:6,  req:false },
];
const REQ_MATS = GOOD_MATS.filter(m => m.req);
const BAD_MATS = [
  { id:'sugar', img:'bad_sugar', name:'过量糖罐',       chew:13 },
  { id:'dye',   img:'bad_dye',   name:'人工色素瓶',     chew:11 },
  { id:'fat',   img:'bad_fat',   name:'反式脂肪酸怪兽', chew:20 },
  { id:'shard', img:'bad_shard', name:'硬边碎片',       chew:16 },
];

const S1 = { collected: new Set(), goodPicks: 0, badPicks: 0, raf: 0, items: [], lastSpawn: 0, done: false };

function buildChecklist() {
  const host = $('#s1Checklist');
  host.innerHTML = '';
  REQ_MATS.forEach(m => {
    const el = document.createElement('div');
    el.className = 'check-item';
    el.dataset.id = m.id;
    el.innerHTML = `<img src="${A2(m.img)}" alt=""><span>${m.name}</span>`;
    host.appendChild(el);
  });
}

function startS1() {
  S1.collected = new Set(); S1.goodPicks = 0; S1.badPicks = 0;
  S1.items = []; S1.lastSpawn = 0; S1.done = false;
  buildChecklist();
  $('#s1Belt').innerHTML = '';
  $('#s1Burst').innerHTML = '';
  $('#s1Next').disabled = true;
  $('#s1Next').textContent = '集齐好料再继续';
  renderHud('hud1');
  showScreen('screenS1');
  cancelAnimationFrame(S1.raf);
  let last = performance.now();
  const belt = $('#s1Belt');
  const beltW = () => belt.clientWidth;

  function loop(now) {
    const dt = (now - last) / 1000; last = now;
    // 生成：约每 0.85s 一个，正确/错误各半（保证好料够用）
    if (now - S1.lastSpawn > rand(700, 1000) && !S1.done) {
      S1.lastSpawn = now;
      spawnBeltItem(belt, beltW());
    }
    // 移动
    const W = beltW();
    for (let i = S1.items.length - 1; i >= 0; i--) {
      const it = S1.items[i];
      if (it.grabbed) continue;
      it.x += it.vx * dt;
      it.el.style.transform = `translateX(${it.x}px)`;
      if (it.x > W + 70) { it.el.remove(); S1.items.splice(i, 1); }
    }
    S1.raf = requestAnimationFrame(loop);
  }
  S1.raf = requestAnimationFrame(loop);
}

function spawnBeltItem(belt, W) {
  const isGood = Math.random() < 0.52;
  const data = isGood ? pick(GOOD_MATS) : pick(BAD_MATS);
  const el = document.createElement('div');
  el.className = 'belt-item ' + (isGood ? 'good' : 'bad');
  el.innerHTML = `<img src="${A2(data.img)}" alt=""><small>${data.name}</small>`;
  const it = { el, data, isGood, x: -70, vx: rand(70, 105), grabbed: false };
  el.style.transform = 'translateX(-70px)';
  belt.appendChild(el);
  S1.items.push(it);
  attachDrag(it);
}

function attachDrag(it) {
  const el = it.el;
  el.addEventListener('pointerdown', e => {
    if (S1.done) return;
    e.preventDefault();
    it.grabbed = true;
    el.classList.add('grabbing');
    el.setPointerCapture(e.pointerId);
    const move = ev => {
      // 跟随手指：脱离传送带流，改用 fixed 绝对跟随
      el.style.transform = 'none';
      el.style.marginTop = '0';
      el.style.position = 'fixed';
      el.style.left = (ev.clientX - 30) + 'px';
      el.style.top  = (ev.clientY - 30) + 'px';
      // 高亮面盆
      const bowl = $('#s1Bowl').getBoundingClientRect();
      const over = ev.clientX > bowl.left && ev.clientX < bowl.right &&
                   ev.clientY > bowl.top  && ev.clientY < bowl.bottom;
      $('#s1Bowl').classList.toggle('hot', over);
    };
    const up = ev => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      $('#s1Bowl').classList.remove('hot');
      const bowl = $('#s1Bowl').getBoundingClientRect();
      const over = ev.clientX > bowl.left && ev.clientX < bowl.right &&
                   ev.clientY > bowl.top  && ev.clientY < bowl.bottom;
      if (over) { dropIntoBowl(it); }
      else { // 没放进去：直接移除（掉回传送带太复杂，简单处理）
        removeItem(it);
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

function removeItem(it) {
  const idx = S1.items.indexOf(it);
  if (idx >= 0) S1.items.splice(idx, 1);
  it.el.remove();
}

function dropIntoBowl(it) {
  removeItem(it);
  const burst = $('#s1Burst');
  if (it.isGood) {
    const d = it.data;
    M.nutrition += d.nutrition; M.taste += d.taste; M.softness += d.softness;
    S1.goodPicks++;
    if (!S1.collected.has(d.id)) {
      S1.collected.add(d.id);
      const chk = $(`.check-item[data-id="${d.id}"]`);
      if (chk) chk.classList.add('done');
    }
    Sfx.good();
    floatPop(burst, `+营养${d.nutrition}`, true);
    showToast(`好料！${d.name} 入盆`);
    npcReact('happy', '好料！选得棒～');
  } else {
    M.chew += it.data.chew;
    S1.badPicks++;
    Sfx.bad();
    floatPop(burst, `难嚼+${it.data.chew}`, false);
    showToast(`坏东西！${it.data.name} 让吐司更难嚼`);
    npcReact('nervous', '哎呀，那个不能放！');
  }
  renderHud('hud1');
  // 集齐四样必收好料即可继续
  if (REQ_MATS.every(m => S1.collected.has(m.id)) && !S1.done) {
    S1.done = true;
    finishS1();
  }
}

function finishS1() {
  // 选材准确度：好料占比，错料扣分
  const total = S1.goodPicks + S1.badPicks;
  const acc = total ? S1.goodPicks / total : 1;
  M.score.material = Math.round(clamp(acc * 100 - S1.badPicks * 4, 0, 100));
  cancelAnimationFrame(S1.raf);
  $('#s1Belt').innerHTML = '';
  S1.items = [];
  $('#s1Next').disabled = false;
  $('#s1Next').textContent = `好料齐了！揉面去 ▶（准确度 ${M.score.material}）`;
  Sfx.win();
  showToast('四样好料集齐！');
  npcReact('happy', '材料齐啦，去揉面！');
}

/* =====================================================================
   ② 揉面台（节奏：指针进绿区时揉）
===================================================================== */
const S2 = { osc: null, raf: 0, prog: 0, good: 0, over: 0, off: 0, last: 0, done: false };

function startS2() {
  S2.osc = makeOscillator(rand(78, 92));
  S2.prog = 0; S2.good = 0; S2.over = 0; S2.off = 0; S2.done = false;
  $('#s2Prog').style.width = '0%';
  $('#s2Dough').src = A2('dough_plain');
  $('#s2Next').disabled = true;
  $('#s2Next').textContent = '把面团揉开再继续';
  renderHud('hud2');
  showScreen('screenS2');
  cancelAnimationFrame(S2.raf);
  S2.last = performance.now();
  const needle = $('#s2Needle');
  function loop(now) {
    const dt = (now - S2.last) / 1000; S2.last = now;
    const p = S2.osc.step(dt);
    needle.style.left = barX('knead', p) + '%';
    S2.raf = requestAnimationFrame(loop);
  }
  S2.raf = requestAnimationFrame(loop);
}

/* 绿区/红区：对应美术节奏条上的实际色区（轨道局部比例） */
function s2Zone(p) {
  const x = p / 100, g = BAR.knead.green;
  if (x >= g[0] && x <= g[1]) return 'green';
  if (x >= BAR.knead.over)    return 'red';   // 右侧红区：太猛
  return 'yellow';                            // 左侧/黄区：太轻
}

function kneadAction() {
  if (S2.done) return;
  const zone = s2Zone(S2.osc.pos);
  const dough = $('#s2Dough');
  if (zone === 'green') {
    S2.good++; S2.prog = clamp(S2.prog + 9, 0, 100);
    M.softness += 2; M.taste += 0.6;
    dough.src = A2('dough_quinoa');
    dough.classList.remove('knead-bad'); void dough.offsetWidth; dough.classList.add('knead-good');
    Sfx.soft();
  } else if (zone === 'red') {
    // 红区：太猛 → 面团变硬，咀嚼难度上升较多
    S2.over++; S2.prog = clamp(S2.prog + 3, 0, 100);
    M.chew += 2.6;
    dough.classList.remove('knead-good'); void dough.offsetWidth; dough.classList.add('knead-bad');
    npcReact('nervous', '太用力啦，面团会变硬！');
    Sfx.knock();
  } else {
    // 黄区：没揉到位（不在绿区） → 同样增加咀嚼难度
    S2.off++; S2.prog = clamp(S2.prog + 4, 0, 100);
    M.chew += 1.6;
    dough.classList.remove('knead-good'); void dough.offsetWidth; dough.classList.add('knead-bad');
    npcReact('nervous', '没揉到点上，面团没揉开！');
    Sfx.knock();
  }
  $('#s2Prog').style.width = S2.prog + '%';
  renderHud('hud2');
  if (S2.prog >= 100 && !S2.done) finishS2();
}

function finishS2() {
  S2.done = true;
  cancelAnimationFrame(S2.raf);
  const totalHits = S2.good + S2.over + S2.off;
  // 揉面完成度：绿区好揉占比为主，红区(太猛)/黄区(没揉到位)都扣分
  const quality = totalHits ? S2.good / totalHits : 0;
  M.score.knead = Math.round(clamp(quality * 100 - (S2.over + S2.off) * 3, 20, 100));
  const over = (S2.over + S2.off) > S2.good;
  $('#s2Dough').src = A2(over ? 'dough_hard' : 'dough_perfect');
  if (over) { showToast('揉得有点猛，面团偏硬了'); npcReact('nervous', '下次轻一点哦～'); }
  else { showToast('面团揉得松松软软！'); npcReact('happy', '揉得真松软！'); }
  $('#s2Next').disabled = false;
  $('#s2Next').textContent = `面揉好啦！发酵去 ▶（完成度 ${M.score.knead}）`;
  Sfx.win();
}

/* =====================================================================
   ③ 发酵箱（控温 + 在最佳区取出）
===================================================================== */
const TEMP_SPEED = { low: 16, mid: 26, high: 40 };
const S3 = { raf: 0, pos: 0, temp: 'mid', last: 0, done: false };

function startS3() {
  S3.pos = 0; S3.temp = 'mid'; S3.done = false;
  $$('.temp-btn').forEach(b => b.classList.toggle('is-on', b.dataset.temp === 'mid'));
  $('#s3Mark').style.left = barX('ferment', 0) + '%';
  $('#s3Dough').src = A2('ferment_under');
  $('#s3Dough').style.transform = 'scale(1)';
  $('#s3Take').disabled = false;
  renderHud('hud3');
  showScreen('screenS3');
  cancelAnimationFrame(S3.raf);
  S3.last = performance.now();
  const B = BAR.ferment;
  function loop(now) {
    const dt = (now - S3.last) / 1000; S3.last = now;
    if (!S3.done) {
      S3.pos = clamp(S3.pos + TEMP_SPEED[S3.temp] * dt, 0, 100);
      $('#s3Mark').style.left = barX('ferment', S3.pos) + '%';
      $('#s3Dough').src = A2(S3.pos < B.lo ? 'ferment_under' : S3.pos > B.hi ? 'ferment_over' : 'ferment_perfect');
      $('#s3Dough').style.transform = `scale(${1 + S3.pos / 160})`;
      if (S3.pos >= 100) takeFerment(); // 发过头自动结束
    }
    S3.raf = requestAnimationFrame(loop);
  }
  S3.raf = requestAnimationFrame(loop);
}

function takeFerment() {
  if (S3.done) return;
  S3.done = true;
  cancelAnimationFrame(S3.raf);
  $('#s3Take').disabled = true;
  const p = S3.pos, B = BAR.ferment;
  const bestLo = B.lo, bestHi = B.hi, center = B.center;
  let score;
  if (p < bestLo) {            // 太早，不够松软
    score = Math.round(clamp(60 - (bestLo - p) * 1.6, 10, 70));
    M.softness -= (bestLo - p) * 0.3;
    $('#s3Dough').src = A2('ferment_under');
    showToast('取早了，发酵不足，不够松软');
    npcReact('nervous', '取太早了，还没发好！');
  } else if (p > bestHi) {    // 太晚，影响风味
    score = Math.round(clamp(60 - (p - bestHi) * 1.6, 10, 70));
    M.taste -= (p - bestHi) * 0.3;
    $('#s3Dough').src = A2('ferment_over');
    showToast('发过头了，风味受影响');
    npcReact('nervous', '发过头啦，跑味了！');
  } else {                    // 最佳区
    score = Math.round(clamp(100 - Math.abs(p - center) * 1.5, 80, 100));
    M.softness += 8; M.taste += 4;
    $('#s3Dough').src = A2('ferment_perfect');
    showToast('完美发酵！松软又有风味');
    npcReact('happy', '发得刚刚好！');
    Sfx.win();
  }
  M.softness = clamp(M.softness, 0, 200);
  M.taste = clamp(M.taste, 0, 200);
  M.score.ferment = score;
  renderHud('hud3');
  setTimeout(() => startS4(), 1100);
}

/* =====================================================================
   ④ 烘焙炉（核心：火力 + 金黄区出炉）
===================================================================== */
const FIRE_SPEED = { low: 14, mid: 24, high: 40 };
const S4 = { raf: 0, pos: 0, fire: 'mid', last: 0, done: false };

function startS4() {
  S4.pos = 0; S4.fire = 'mid'; S4.done = false;
  $$('.fire-btn').forEach(b => b.classList.toggle('is-on', b.dataset.fire === 'mid'));
  $('#s4Mark').style.left = barX('bake', 0) + '%';
  $('#s4Bread').src = A2('toast_raw');
  $('#s4Out').disabled = false;
  renderHud('hud4');
  showScreen('screenS4');
  cancelAnimationFrame(S4.raf);
  S4.last = performance.now();
  const B = BAR.bake;
  function loop(now) {
    const dt = (now - S4.last) / 1000; S4.last = now;
    if (!S4.done) {
      S4.pos = clamp(S4.pos + FIRE_SPEED[S4.fire] * dt, 0, 100);
      $('#s4Mark').style.left = barX('bake', S4.pos) + '%';
      // 外观随火候变化：生 → 松软成熟 → 金黄 → 焦硬
      $('#s4Bread').src = A2(S4.pos < B.lo ? 'toast_cooked' : S4.pos <= B.hi ? 'toast_golden' : 'toast_burnt');
      if (S4.pos < 18) $('#s4Bread').src = A2('toast_raw');
      if (S4.pos >= 100) bakeOut(); // 焦了自动出炉
    }
    S4.raf = requestAnimationFrame(loop);
  }
  S4.raf = requestAnimationFrame(loop);
}

function bakeOut() {
  if (S4.done) return;
  S4.done = true;
  cancelAnimationFrame(S4.raf);
  $('#s4Out').disabled = true;
  const p = S4.pos, B = BAR.bake;
  const goldLo = B.lo, goldHi = B.hi, center = B.center;
  let score;
  if (p < goldLo) {            // 没熟
    score = Math.round(clamp(55 - (goldLo - p) * 1.4, 10, 65));
    M.taste -= (goldLo - p) * 0.45;
    $('#s4Bread').src = A2(p < 18 ? 'toast_raw' : 'toast_cooked');
    showToast('出早了，面包没熟，美味下降');
    npcReact('nervous', '还没熟呢，太早啦！');
  } else if (p > goldHi) {    // 焦硬边
    score = Math.round(clamp(55 - (p - goldHi) * 1.6, 10, 65));
    M.chew += (p - goldHi) * 0.7;
    $('#s4Bread').src = A2('toast_burnt');
    showToast('烤过头，硬边出现，更难嚼');
    npcReact('nervous', '糊啦糊啦！烤焦了！');
  } else {                    // 金黄最佳
    score = Math.round(clamp(100 - Math.abs(p - center) * 1.4, 82, 100));
    M.taste += 8; M.softness += 3;
    $('#s4Bread').src = A2('toast_golden');
    showToast('金黄出炉！香气松软刚刚好');
    npcReact('happy', '金黄酥香，完美出炉！');
    Sfx.win();
  }
  M.taste = clamp(M.taste, 0, 200);
  M.score.bake = score;
  renderHud('hud4');
  setTimeout(() => startS5(), 1100);
}

/* =====================================================================
   ⑤ 切片机（切割线移到标准厚度区时点切，共 3 片）
===================================================================== */
const S5 = { osc: null, raf: 0, last: 0, slices: [], done: false };
const S5_TARGET = 3;

function startS5() {
  S5.osc = makeOscillator(rand(55, 70));
  S5.slices = []; S5.done = false;
  $('#s5Count').textContent = `已切 0 / ${S5_TARGET} 片`;
  $('#s5Tray').innerHTML = '';
  $('#s5Slice').disabled = false;
  $('#s5Next').classList.add('hidden');
  renderHud('hud5');
  showScreen('screenS5');
  cancelAnimationFrame(S5.raf);
  S5.last = performance.now();
  const cut = $('#s5Cut'), loaf = $('#s5Loaf');
  function loop(now) {
    const dt = (now - S5.last) / 1000; S5.last = now;
    const p = S5.osc.step(dt);
    cut.style.left = `calc(${p}% - 2px)`;
    S5.raf = requestAnimationFrame(loop);
  }
  S5.raf = requestAnimationFrame(loop);
}

/* 标准厚度区：CSS thick-zone 在 42%..58%，中心 50% */
function sliceAction() {
  if (S5.done) return;
  const p = S5.osc.pos;
  const lo = 42, hi = 58, center = 50;
  let q, sliceImg;
  if (p >= lo && p <= hi) {
    q = Math.round(clamp(100 - Math.abs(p - center) * 4, 75, 100));
    M.softness += 2;
    sliceImg = 'slice_std';
    Sfx.good();
    showToast('厚度刚好！松软又好看');
    npcReact('happy', '厚度刚刚好！');
  } else if (p < lo) {        // 太薄易碎
    q = Math.round(clamp(60 - (lo - p) * 2, 15, 60));
    M.softness -= 1;
    sliceImg = 'slice_thin';
    Sfx.knock();
    showToast('切太薄，容易碎');
    npcReact('nervous', '太薄了，会碎的！');
  } else {                    // 太厚难嚼
    q = Math.round(clamp(60 - (p - hi) * 2, 15, 60));
    M.chew += 4;
    sliceImg = 'slice_thick';
    Sfx.knock();
    showToast('切太厚，更难嚼');
    npcReact('nervous', '太厚啦，不好嚼！');
  }
  S5.slices.push(q);
  const tray = $('#s5Tray');
  const si = document.createElement('img');
  si.src = A2(sliceImg); tray.appendChild(si);
  spawnCrumbs($('#s5Loaf'), p, 50);
  M.softness = clamp(M.softness, 0, 200);
  renderHud('hud5');
  $('#s5Count').textContent = `已切 ${S5.slices.length} / ${S5_TARGET} 片`;
  if (S5.slices.length >= S5_TARGET) finishS5();
}

function finishS5() {
  S5.done = true;
  cancelAnimationFrame(S5.raf);
  $('#s5Slice').disabled = true;
  M.score.slice = Math.round(S5.slices.reduce((a, b) => a + b, 0) / S5.slices.length);
  $('#s5Next').classList.remove('hidden');
  $('#s5Next').textContent = `切好啦！去边去 ▶（厚度 ${M.score.slice}）`;
  Sfx.win();
}

/* =====================================================================
   ⑥ 去边台（沿四条虚线滑动，完美则边弹飞组字）
===================================================================== */
const S6 = { edges: {}, done: false, monScale: 1 };
const EDGE_LIST = ['top', 'right', 'bottom', 'left'];

function startS6() {
  S6.edges = {}; S6.done = false;
  EDGE_LIST.forEach(e => S6.edges[e] = null);
  $$('.trim-edge').forEach(el => {
    el.classList.remove('cut', 'flying');
    el.style.transform = '';
    el.style.opacity = '';
  });
  $$('.trim-edge img').forEach(im => { im.style.opacity = ''; });
  $('#s6Words').classList.remove('show');
  $('#s6Words').innerHTML = '';
  $('.trim-core').src = A2('toast_core');          // 中心是无边吐司本体，四条边贴在其四边
  const spark = $('#s6Spark'); spark.classList.remove('show'); spark.style.backgroundImage = '';
  // 硬边小怪兽：复位（满血、坐在吐司上方taunt）
  const mon = $('#s6Mon');
  mon.classList.remove('weak', 'defeated', 'hidden');
  mon.style.opacity = '1';
  mon.style.transform = '';
  mon.style.width = '52px';
  S6.monScale = 1;
  $('#s6Done').disabled = true;
  $('#s6Done').textContent = '把四边都去掉';
  renderHud('hud6');
  showScreen('screenS6');
}

function attachEdgeTrim() {
  $$('.trim-edge').forEach(el => {
    const edge = el.dataset.edge;
    const horiz = edge === 'top' || edge === 'bottom';
    el.addEventListener('pointerdown', e => {
      if (S6.done || S6.edges[edge] != null) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      let minMain = Infinity, maxMain = -Infinity, maxDev = 0;
      const move = ev => {
        // 主方向覆盖范围 + 垂直方向偏离（切歪程度）
        const main = horiz ? ev.clientX : ev.clientY;
        const dev  = horiz ? Math.abs(ev.clientY - (rect.top + rect.height / 2))
                           : Math.abs(ev.clientX - (rect.left + rect.width / 2));
        minMain = Math.min(minMain, main);
        maxMain = Math.max(maxMain, main);
        maxDev  = Math.max(maxDev, dev);
        // 视觉：跟随擦除
        const frac = clamp((maxMain - minMain) / (horiz ? rect.width : rect.height), 0, 1);
        el.style.opacity = String(1 - frac * 0.7);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        const span = horiz ? rect.width : rect.height;
        const coverage = clamp((maxMain - minMain) / span, 0, 1);
        finishEdge(el, edge, coverage, maxDev);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  });
}

// 吐司边弹飞特效（素材 fx_edgefly）
function spawnEdgeFly(el) {
  const host = $('#s6Toast');
  const puff = document.createElement('img');
  puff.src = A2('fx_edgefly');
  puff.style.cssText = 'position:absolute;z-index:4;pointer-events:none;width:70px;height:70px;object-fit:contain;';
  puff.style.left = (el.offsetLeft + el.offsetWidth / 2 - 35) + 'px';
  puff.style.top  = (el.offsetTop + el.offsetHeight / 2 - 35) + 'px';
  host.appendChild(puff);
  puff.animate(
    [{ opacity: .95, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.5)' }],
    { duration: 600, easing: 'ease-out' }
  ).onfinish = () => puff.remove();
}

function finishEdge(el, edge, coverage, dev) {
  // 覆盖不足 → 残留硬边(难嚼)；偏离大 → 切歪(外观)
  const covScore = coverage * 100;                 // 0..100
  const straight = clamp(100 - dev * 3.2, 0, 100);  // 偏离惩罚
  const score = clamp(covScore * 0.65 + straight * 0.35, 0, 100);
  S6.edges[edge] = score;

  if (coverage < 0.55) {
    M.chew += (1 - coverage) * 10;
    el.style.opacity = String(1 - coverage * 0.7);
    el.classList.add('cut'); // 仍标记完成，但留下了边
    showToast('这条边没切干净，残留硬边');
    npcReact('nervous', '这条边没切干净！');
    Sfx.knock();
  } else {
    // 边弹飞
    el.classList.add('flying');
    const fly = { top:'translateY(-160px)', bottom:'translateY(160px)',
                  left:'translateX(-160px)', right:'translateX(160px)' }[edge];
    requestAnimationFrame(() => { el.style.transform = `${fly} rotate(${rand(-40,40)}deg)`; el.style.opacity = '0'; });
    spawnEdgeFly(el);
    Sfx.pop();
    // 切掉一条边 → 硬边小怪兽被削弱（缩小 + 发抖）
    const mon = $('#s6Mon');
    S6.monScale = Math.max(0.4, S6.monScale - 0.2);
    mon.style.width = (52 * S6.monScale) + 'px';
    mon.classList.add('weak');
    if (dev > 18) { showToast('切歪了一点，外观打折'); npcReact('nervous', '切歪了一点点～'); }
    else { showToast('漂亮！这条边干干净净'); npcReact('happy', '干干净净，漂亮！'); }
  }
  renderHud('hud6');

  if (EDGE_LIST.every(e => S6.edges[e] != null) && !S6.done) finishS6();
}

function finishS6() {
  S6.done = true;
  const vals = EDGE_LIST.map(e => S6.edges[e]);
  M.score.edge = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  M.edgeless = M.score.edge;
  $('#s6Done').disabled = false;
  $('#s6Done').textContent = '看看成品报告 ▶';
  const mon = $('#s6Mon');
  // 完美去边 → 闪光 + 组字「好吃到没边了」+ 硬边怪兽被打飞
  if (M.score.edge >= 80) {
    mon.classList.remove('weak');
    mon.classList.add('defeated');
    requestAnimationFrame(() => { mon.style.transform = 'translateX(-50%) translateY(-140px) rotate(420deg) scale(.5)'; mon.style.opacity = '0'; });
    const spark = $('#s6Spark');
    spark.style.backgroundImage = `url(${A2('fx_perfect')})`;
    spark.classList.remove('show'); void spark.offsetWidth; spark.classList.add('show');
    const words = $('#s6Words');
    words.innerHTML = '好吃到没边了'.split('').map(c => `<span>${c}</span>`).join('');
    setTimeout(() => words.classList.add('show'), 300);
    Sfx.win();
    showToast('完美去边！好吃到没边了！');
    npcReact('happy', '好吃到没边了！');
  } else {
    showToast('四边搞定，不过还能更干净～');
    npcReact('happy', '完成啦，去看报告～');
  }
}

/* =====================================================================
   结算：营养 / 美味 / 松软 / 难嚼 / 无边完成度 → S/A/B/C
===================================================================== */
function gradeLetter(v) { return v >= 88 ? 'S' : v >= 72 ? 'A' : v >= 55 ? 'B' : 'C'; }

const RESULT_COPY = {
  S: '营养满分、松软到飞起、四边干干净净——这就是「好吃到没边了」的最高境界！',
  A: '一条非常优秀的藜麦无边吐司，松软又营养，再练练就是大师。',
  B: '不错的成品！有点小瑕疵，但已经是会让人想再咬一口的吐司。',
  C: '完成了！原料和火候还能更稳一些，多做几条就会越来越顺手。',
};
// 评级美术：徽章 / 星星数 / 字母配色
const GRADE_ART = {
  S: { badge: 'badge_s',   stars: 3, dark: false, letter: true  },
  A: { badge: 'badge_a',   stars: 2, dark: true,  letter: true  },
  B: { badge: 'badge_a',   stars: 1, dark: true,  letter: true  },
  C: { badge: 'toast_fail', stars: 0, dark: false, letter: false },
};
const METRIC_ICON = { nutrition:'ic_nutrition', taste:'star1', softness:'ic_softness', edgeless:'ic_edgeless', chew:'ic_chew' };

function showResult() {
  const nutrition = clamp(M.nutrition, 0, 100);
  const taste     = clamp(M.taste, 0, 100);
  const softness  = clamp(M.softness, 0, 100);
  const edgeless  = clamp(M.edgeless, 0, 100);
  const chew      = clamp(M.chew, 0, 100);
  const chewGood  = 100 - chew; // 越低越好 → 转成正向

  const composite = nutrition * 0.2 + taste * 0.2 + softness * 0.2 + edgeless * 0.2 + chewGood * 0.2;
  const grade = gradeLetter(composite);

  // 评级徽章 / 字母 / 星星
  const art = GRADE_ART[grade];
  $('#rBadge').src = A2(art.badge);
  const letterEl = $('#rGrade');
  letterEl.textContent = grade;
  letterEl.className = 'grade-letter' + (art.dark ? ' dark' : '') + (art.letter ? '' : ' hide');
  $('#rStars').innerHTML = Array.from({ length: art.stars }, () => `<img src="${A2('star1')}" alt="">`).join('');
  $('#rTitle').textContent = { S:'没边大师！', A:'金牌烘焙师', B:'熟练学徒', C:'初心面包人' }[grade];
  $('#rCopy').textContent = RESULT_COPY[grade];

  // 五维指标条（带图标）
  const bars = [
    { cls:'nutrition', name:'营养值',   v:nutrition },
    { cls:'taste',     name:'美味值',   v:taste },
    { cls:'softness',  name:'松软值',   v:softness },
    { cls:'edgeless',  name:'无边完成', v:edgeless },
    { cls:'chew',      name:'咀嚼难度', v:chew },
  ];
  $('#rMetrics').innerHTML = bars.map(b =>
    `<div class="mb-row ${b.cls}"><img class="mb-ic" src="${A2(METRIC_ICON[b.cls])}" alt="">` +
    `<span>${b.name}</span>` +
    `<div class="mb-track"><i data-w="${Math.round(b.v)}"></i></div>` +
    `<b>${Math.round(b.v)}</b></div>`).join('');

  // 六台完成度
  const stations = [
    { name:'选材准确度', v:M.score.material },
    { name:'揉面完成度', v:M.score.knead },
    { name:'发酵完成度', v:M.score.ferment },
    { name:'烘焙火候',   v:M.score.bake },
    { name:'切片厚度',   v:M.score.slice },
    { name:'去边完成度', v:M.score.edge },
  ];
  $('#rStations').innerHTML = stations.map(s => {
    const g = gradeLetter(s.v);
    return `<div class="ss-cell"><span>${s.name}</span><b class="s-${g}">${s.v} ${g}</b></div>`;
  }).join('');

  showScreen('screenResult');
  // 入场动画：指标条充能
  requestAnimationFrame(() => {
    $$('#rMetrics .mb-track > i').forEach(i => { i.style.width = i.dataset.w + '%'; });
  });
  Sfx.win();
}

/* =====================================================================
   事件绑定
===================================================================== */
function bind() {
  $('#btnStart').addEventListener('click', () => { resetGame(); startS1(); });

  $('#s1Next').addEventListener('click', () => { if (!$('#s1Next').disabled) startS2(); });
  $('#s2Next').addEventListener('click', () => { if (!$('#s2Next').disabled) startS3(); });

  // 揉面：点击 + 滑动都算一次揉
  const kneadBtn = $('#s2Knead');
  kneadBtn.addEventListener('pointerdown', e => { e.preventDefault(); kneadAction(); });

  // 发酵：温度 + 取出
  $$('.temp-btn').forEach(b => b.addEventListener('click', () => {
    if (S3.done) return;
    S3.temp = b.dataset.temp;
    $$('.temp-btn').forEach(x => x.classList.toggle('is-on', x === b));
  }));
  $('#s3Take').addEventListener('click', takeFerment);

  // 烘焙：火力 + 出炉
  $$('.fire-btn').forEach(b => b.addEventListener('click', () => {
    if (S4.done) return;
    S4.fire = b.dataset.fire;
    $$('.fire-btn').forEach(x => x.classList.toggle('is-on', x === b));
  }));
  $('#s4Out').addEventListener('click', bakeOut);

  // 切片
  $('#s5Slice').addEventListener('click', sliceAction);
  $('#s5Next').addEventListener('click', () => { if (!$('#s5Next').classList.contains('hidden')) startS6(); });

  // 去边
  attachEdgeTrim();
  $('#s6Done').addEventListener('click', () => { if (!$('#s6Done').disabled) showResult(); });

  // 结算
  $('#btnReplay').addEventListener('click', () => { resetGame(); startS1(); });
  $('#btnHome').addEventListener('click', () => { resetGame(); showScreen('screenStart'); });

  // 结算页「下滑去购买」提示：滑到底自动淡出；点击直接滑到购买按钮
  const resScreen = $('#screenResult'), hint = $('#scrollHint');
  if (resScreen && hint) {
    resScreen.addEventListener('scroll', () => {
      const nearBottom = resScreen.scrollTop + resScreen.clientHeight >= resScreen.scrollHeight - 60;
      hint.classList.toggle('fade', nearBottom);
    });
    hint.addEventListener('click', () => {
      const buy = $('#btnBuy');
      if (buy) buy.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else resScreen.scrollTo({ top: resScreen.scrollHeight, behavior: 'smooth' });
    });
  }
}

/* =====================================================================
   加载页：面团发酵进度（同时预加载素材）
===================================================================== */
const LOAD_ASSETS = [
  'bg_start','bg_s1','bg_s2','bg_s3','bg_s4','bg_s5','bg_s6','scorecard_bg',
  'mascot','npc','npc_happy','npc_nervous',
  'ing_quinoa','ing_flour','ing_yeast','ing_water','ing_egg','ing_milk',
  'bad_sugar','bad_dye','bad_fat','bad_shard',
  'dough_plain','dough_quinoa','dough_perfect','dough_hard',
  'ferment_under','ferment_perfect','ferment_over',
  'toast_raw','toast_cooked','toast_golden','toast_burnt',
  'loaf_full','slice_std','slice_thin','slice_thick',
  'toast_core','toast_edgeless','edge_top','edge_bottom','edge_left','edge_right',
  'fx_edgefly','fx_perfect','badge_s','badge_a','toast_fail','star1',
  'ic_nutrition','ic_softness','ic_chew','ic_edgeless','ui_thermo','ui_flame',
  'bar_knead','bar_ferment','bar_bake',
];

function spawnLoadBubble(host) {
  const b = document.createElement('div');
  b.className = 'load-bubble';
  const s = rand(6, 14);
  b.style.left = rand(28, 68) + '%';
  b.style.width = b.style.height = s + 'px';
  host.appendChild(b);
  b.animate(
    [{ opacity: 0, transform: 'translateY(0) scale(.4)' },
     { opacity: .9, offset: .2 },
     { opacity: 0, transform: `translateY(${rand(-50, -82)}px) scale(1.1)` }],
    { duration: rand(900, 1400), easing: 'ease-out' }
  ).onfinish = () => b.remove();
}

function runLoading() {
  const total = LOAD_ASSETS.length;
  let loaded = 0;
  LOAD_ASSETS.forEach(n => {
    const im = new Image();
    im.onload = im.onerror = () => { loaded++; };
    im.src = A2(n);
  });
  const dough = $('#loadDough'), fill = $('#loadFill'), pctEl = $('#loadPct'),
        tip = $('#loadTip'), bubbles = $('#loadBubbles');
  const TIPS = ['正在唤醒酵母…', '面团开始膨胀…', '发酵到松松软软…', '就快好啦，准备开工！'];
  const MIN = 2400;               // 最短观看时长，让发酵动画完整播放
  const start = performance.now();
  let lastBubble = 0, swapped = false, done = false;

  function loop(now) {
    if (done) return;
    const elapsed = now - start;
    const realPct = loaded / total * 100;
    const timePct = Math.min(100, elapsed / MIN * 100);
    const shown = Math.min(realPct, timePct);     // 同时受真实加载与最短时长约束
    fill.style.width = shown + '%';
    pctEl.textContent = Math.round(shown) + '%';
    dough.style.transform = `scale(${0.72 + shown / 100 * 0.42})`;
    if (shown >= 52 && !swapped) { swapped = true; dough.src = A2('ferment_perfect'); }
    tip.textContent = TIPS[Math.min(TIPS.length - 1, Math.floor(shown / 25))];
    if (now - lastBubble > 280) { lastBubble = now; spawnLoadBubble(bubbles); }
    if (loaded >= total && elapsed >= MIN && shown >= 99.5) {
      done = true;
      fill.style.width = '100%'; pctEl.textContent = '100%';
      setTimeout(() => showScreen('screenStart'), 380);
      return;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', () => {
  buildChecklist();
  bind();
  runLoading();
});

})();
