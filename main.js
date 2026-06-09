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

/* 进台提示弹窗显示时，暂停制作台的计时/进度动画 */
let paused = false;

function showTipModal(screenId) {
  const screen = document.getElementById(screenId);
  const tip = screen && screen.querySelector('.st-tip');
  const modal = document.getElementById('tipModal');
  const card = document.getElementById('tipModalCard');
  if (!tip || !modal || !card) return;
  card.innerHTML = tip.innerHTML;
  modal.classList.remove('hidden');
  paused = true;        // 暂停进度，等玩家读完提示
}
function hideTipModal() {
  const modal = document.getElementById('tipModal');
  if (modal) modal.classList.add('hidden');
  paused = false;
}

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
  const onStation = /^screenS[1-6]$/.test(id);
  const buddy = document.getElementById('npcBuddy');
  if (buddy) {
    buddy.classList.toggle('hidden', !onStation);
    if (onStation) npcReact('idle');
  }
  // 制作台：弹出玩法提示并暂停；其它页面关闭提示
  if (onStation) showTipModal(id); else hideTipModal();
}

/* ---------- 小面包师表情反应 + 随动作换位置 ---------- */
let npcTimer;
// 几个安全落点（沿左右两侧、不同高度），随用户动作切换
const NPC_POS = [
  { left: 'calc(100% - 84px)', bottom: '14%', side: 'right'  },  // 右下（默认）
  { left: '6px',               bottom: '14%', side: 'left'   },  // 左下
  { left: 'calc(100% - 84px)', bottom: '32%', side: 'right'  },  // 右中
  { left: '6px',               bottom: '32%', side: 'left'   },  // 左中
  { left: 'calc(50% - 37px)',  bottom: '10%', side: 'center' },  // 正下偏低
];
let npcPosIdx = 0;
function moveNpc(i) {
  const buddy = document.getElementById('npcBuddy');
  if (!buddy) return;
  const p = NPC_POS[((i % NPC_POS.length) + NPC_POS.length) % NPC_POS.length];
  buddy.style.right = 'auto';
  buddy.style.left = p.left;
  buddy.style.bottom = p.bottom;
  // 气泡展开方向：靠边时朝屏内展开，避免出画
  buddy.classList.remove('side-left', 'side-right', 'side-center');
  buddy.classList.add('side-' + p.side);
}
function npcReact(mood, text) {
  const buddy = document.getElementById('npcBuddy');
  if (!buddy) return;
  // idle（进台）回到默认位置；每次动作反应换到下一个位置
  if (mood === 'idle') { npcPosIdx = 0; moveNpc(0); }
  else { npcPosIdx++; moveNpc(npcPosIdx); }
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
    `<span class="chip" data-metric="nutrition">营养 <b>${d(M.nutrition)}</b></span>` +
    `<span class="chip" data-metric="taste">美味 <b>${d(M.taste)}</b></span>` +
    `<span class="chip" data-metric="softness">松软 <b>${d(M.softness)}</b></span>` +
    `<span class="chip chew" data-metric="chew">难嚼 <b>${d(M.chew)}</b></span>`;
}
function refreshAllHud() { ['hud1','hud2','hud3','hud4','hud5','hud6'].forEach(renderHud); }

/* 漂浮数字 → 飞向顶部对应指标卡并「收纳」更新数值
   metric: nutrition/taste/softness/chew；delta：本次变化量（含正负）
   originEl：数字起飞的来源元素；idx：同一动作多个数字时的错位序号 */
const METRIC_LABEL = { nutrition:'营养', taste:'美味', softness:'松软', chew:'难嚼' };
function popMetric(metric, delta, originEl, idx) {
  if (Math.abs(delta) < 0.5) return;          // 太小的变化不弹，避免「+0」
  idx = idx || 0;
  const screen = document.querySelector('.screen.is-active');
  const chip = screen && screen.querySelector(`.metric-hud .chip[data-metric="${metric}"]`);
  const bEl  = chip && chip.querySelector('b');
  const target = Math.round(clamp(M[metric], 0, 100));   // 数字落位后要显示的新值

  const fly = document.createElement('div');
  const cls = metric === 'chew' ? 'chew' : (delta >= 0 ? 'plus' : 'minus');
  fly.className = 'metric-fly ' + cls;
  fly.textContent = `${METRIC_LABEL[metric]}${delta >= 0 ? '+' : '−'}${Math.abs(Math.round(delta))}`;
  document.body.appendChild(fly);

  // 起点：来源元素中心偏上；多个数字横向错开
  let ox = window.innerWidth / 2, oy = window.innerHeight * 0.55;
  if (originEl) { const r = originEl.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height * 0.4; }
  ox += (idx - 1) * 50;
  // 终点：顶部指标卡中心
  let tx = ox, ty = 70;
  if (chip) { const r = chip.getBoundingClientRect(); tx = r.left + r.width / 2; ty = r.top + r.height / 2; }
  fly.style.left = ox + 'px'; fly.style.top = oy + 'px';

  const dx = tx - ox, dy = ty - oy;
  const anim = fly.animate([
    { transform: 'translate(-50%,-50%) scale(.7)',  opacity: 0 },
    { transform: 'translate(-50%,-118%) scale(1.18)', opacity: 1, offset: .26 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0 },
  ], { duration: 760, delay: idx * 90, easing: 'cubic-bezier(.42,0,.32,1)', fill: 'both' });
  anim.onfinish = () => {
    fly.remove();
    if (bEl) bEl.textContent = target;                 // 收纳：更新顶部数值
    if (chip) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
  };
}

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
// 好料权重池：必收料更常见，清水出现频率最高（避免久等清水）
const GOOD_POOL = (() => {
  const pool = [];
  GOOD_MATS.forEach(m => {
    let w = m.req ? 2 : 1;
    if (m.id === 'water') w = 5;
    for (let i = 0; i < w; i++) pool.push(m);
  });
  return pool;
})();
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
  $('#s1Demo').classList.remove('hidden');   // 演示拖动动画复位显示
  renderHud('hud1');
  showScreen('screenS1');
  cancelAnimationFrame(S1.raf);
  let last = performance.now();
  const belt = $('#s1Belt');
  const beltW = () => belt.clientWidth;

  function loop(now) {
    if (paused) { last = now; S1.lastSpawn = now; S1.raf = requestAnimationFrame(loop); return; }
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
  const data = isGood ? pick(GOOD_POOL) : pick(BAD_MATS);
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
    $('#s1Demo').classList.add('hidden');   // 用户开始操作，演示动画消失
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
      else { returnToBelt(it); }   // 没放进面盆（含只点未拖）→ 回归传送带原处
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

// 松手未入盆：清除跟手定位，回到传送带上原来的位置继续移动
function returnToBelt(it) {
  const el = it.el;
  el.classList.remove('grabbing');
  el.style.position = '';
  el.style.left = '';
  el.style.top = '';
  el.style.marginTop = '';
  el.style.transform = `translateX(${it.x}px)`;
  it.grabbed = false;
}

function dropIntoBowl(it) {
  removeItem(it);
  const bowl = $('#s1Bowl');
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
    popMetric('nutrition', d.nutrition, bowl, 0);
    popMetric('taste',     d.taste,     bowl, 1);
    popMetric('softness',  d.softness,  bowl, 2);
    showToast(`好料！${d.name} 入盆`);
    npcReact('happy', '好料！选得棒～');
  } else {
    M.chew += it.data.chew;
    S1.badPicks++;
    Sfx.bad();
    popMetric('chew', it.data.chew, bowl, 1);
    showToast(`坏东西！${it.data.name} 让吐司更难嚼`);
    npcReact('nervous', '哎呀，那个不能放！');
  }
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
  $('#s1Next').textContent = `揉面去 ▶`;
  Sfx.win();
  showToast('四样好料集齐！');
  npcReact('happy', '材料齐啦，去揉面！');
}

/* =====================================================================
   ② 揉面台（节奏：指针进绿区时揉）
===================================================================== */
const S2 = { osc: null, raf: 0, prog: 0, good: 0, over: 0, off: 0, clicks: 0, last: 0, done: false };
const KNEAD_TARGET = 3;   // 揉 3 次即可完成

function startS2() {
  S2.osc = makeOscillator(rand(78, 92));
  S2.prog = 0; S2.good = 0; S2.over = 0; S2.off = 0; S2.clicks = 0; S2.done = false;
  $('#s2Prog').style.width = '0%';
  $('#s2Dough').src = A2('dough_plain');
  // 底部按钮：先只显示「揉面」，成功后再显示「继续」
  $('#s2Knead').classList.remove('hidden');
  $('#s2Hand').classList.remove('hidden');   // 引导手势复位
  $('#s2Next').classList.add('hidden');
  $('#s2Next').disabled = true;
  $('#s2Next').textContent = '把面团揉开再继续';
  renderHud('hud2');
  showScreen('screenS2');
  cancelAnimationFrame(S2.raf);
  S2.last = performance.now();
  const needle = $('#s2Needle');
  function loop(now) {
    if (paused) { S2.last = now; S2.raf = requestAnimationFrame(loop); return; }
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
  // 首次揉面：收起引导手势
  $('#s2Hand').classList.add('hidden');
  const zone = s2Zone(S2.osc.pos);
  const dough = $('#s2Dough');
  if (zone === 'green') {
    S2.good++;
    M.softness += 4; M.taste += 2;
    dough.src = A2('dough_quinoa');
    dough.classList.remove('knead-bad'); void dough.offsetWidth; dough.classList.add('knead-good');
    popMetric('softness', 4, dough, 0);
    popMetric('taste',    2, dough, 2);
    Sfx.soft();
  } else if (zone === 'red') {
    // 红区：太猛 → 面团变硬，咀嚼难度上升较多
    S2.over++;
    M.chew += 2.6;
    dough.classList.remove('knead-good'); void dough.offsetWidth; dough.classList.add('knead-bad');
    popMetric('chew', 2.6, dough, 1);
    npcReact('nervous', '太用力啦，面团会变硬！');
    Sfx.knock();
  } else {
    // 黄区：没揉到位（不在绿区） → 同样增加咀嚼难度
    S2.off++;
    M.chew += 1.6;
    dough.classList.remove('knead-good'); void dough.offsetWidth; dough.classList.add('knead-bad');
    popMetric('chew', 1.6, dough, 1);
    npcReact('nervous', '没揉到点上，面团没揉开！');
    Sfx.knock();
  }
  // 揉 KNEAD_TARGET 次即完成，进度按次数推进
  S2.clicks++;
  S2.prog = clamp(Math.round(S2.clicks / KNEAD_TARGET * 100), 0, 100);
  $('#s2Prog').style.width = S2.prog + '%';
  if (S2.clicks >= KNEAD_TARGET && !S2.done) finishS2();
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
  // 底部按钮：收起「揉面」，只显示「继续」
  $('#s2Hand').classList.add('hidden');
  $('#s2Knead').classList.add('hidden');
  $('#s2Next').classList.remove('hidden');
  $('#s2Next').disabled = false;
  $('#s2Next').textContent = `发酵去 ▶`;
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
  $('#s3Take').classList.remove('ready');     // 引导：复位
  $('#s3Hand').classList.add('hidden');
  renderHud('hud3');
  showScreen('screenS3');
  cancelAnimationFrame(S3.raf);
  S3.last = performance.now();
  const B = BAR.ferment;
  function loop(now) {
    if (paused) { S3.last = now; S3.raf = requestAnimationFrame(loop); return; }
    const dt = (now - S3.last) / 1000; S3.last = now;
    if (!S3.done) {
      S3.pos = clamp(S3.pos + TEMP_SPEED[S3.temp] * dt, 0, 100);
      $('#s3Mark').style.left = barX('ferment', S3.pos) + '%';
      $('#s3Dough').src = A2(S3.pos < B.lo ? 'ferment_under' : S3.pos > B.hi ? 'ferment_over' : 'ferment_perfect');
      $('#s3Dough').style.transform = `scale(${1 + S3.pos / 160})`;
      // 进入最佳发酵区：取出按钮发光脉动 + 手势提示「现在取出」
      const best = S3.pos >= B.lo && S3.pos <= B.hi;
      $('#s3Take').classList.toggle('ready', best);
      $('#s3Hand').classList.toggle('hidden', !best);
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
  $('#s3Take').classList.remove('ready');
  $('#s3Hand').classList.add('hidden');
  const p = S3.pos, B = BAR.ferment;
  const bestLo = B.lo, bestHi = B.hi, center = B.center;
  const dough = $('#s3Dough');
  let score, dSoft = 0, dTaste = 0;
  if (p < bestLo) {            // 太早，不够松软
    score = Math.round(clamp(60 - (bestLo - p) * 1.6, 10, 70));
    dSoft = -(bestLo - p) * 0.3; M.softness += dSoft;
    dough.src = A2('ferment_under');
    showToast('取早了，发酵不足，不够松软');
    npcReact('nervous', '取太早了，还没发好！');
  } else if (p > bestHi) {    // 太晚，影响风味
    score = Math.round(clamp(60 - (p - bestHi) * 1.6, 10, 70));
    dTaste = -(p - bestHi) * 0.3; M.taste += dTaste;
    dough.src = A2('ferment_over');
    showToast('发过头了，风味受影响');
    npcReact('nervous', '发过头啦，跑味了！');
  } else {                    // 最佳区
    score = Math.round(clamp(100 - Math.abs(p - center) * 1.5, 80, 100));
    dSoft = 8; dTaste = 4; M.softness += dSoft; M.taste += dTaste;
    dough.src = A2('ferment_perfect');
    showToast('完美发酵！松软又有风味');
    npcReact('happy', '发得刚刚好！');
    Sfx.win();
  }
  M.softness = clamp(M.softness, 0, 200);
  M.taste = clamp(M.taste, 0, 200);
  M.score.ferment = score;
  popMetric('softness', dSoft, dough, 0);
  popMetric('taste',    dTaste, dough, 2);
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
    if (paused) { S4.last = now; S4.raf = requestAnimationFrame(loop); return; }
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
  const bread = $('#s4Bread');
  let score, dTaste = 0, dSoft = 0, dChew = 0;
  if (p < goldLo) {            // 没熟
    score = Math.round(clamp(55 - (goldLo - p) * 1.4, 10, 65));
    dTaste = -(goldLo - p) * 0.45; M.taste += dTaste;
    bread.src = A2(p < 18 ? 'toast_raw' : 'toast_cooked');
    showToast('出早了，面包没熟，美味下降');
    npcReact('nervous', '还没熟呢，太早啦！');
  } else if (p > goldHi) {    // 焦硬边
    score = Math.round(clamp(55 - (p - goldHi) * 1.6, 10, 65));
    dChew = (p - goldHi) * 0.7; M.chew += dChew;
    bread.src = A2('toast_burnt');
    showToast('烤过头，硬边出现，更难嚼');
    npcReact('nervous', '糊啦糊啦！烤焦了！');
  } else {                    // 金黄最佳
    score = Math.round(clamp(100 - Math.abs(p - center) * 1.4, 82, 100));
    dTaste = 8; dSoft = 3; M.taste += dTaste; M.softness += dSoft;
    bread.src = A2('toast_golden');
    showToast('金黄出炉！香气松软刚刚好');
    npcReact('happy', '金黄酥香，完美出炉！');
    Sfx.win();
  }
  M.taste = clamp(M.taste, 0, 200);
  M.score.bake = score;
  popMetric('taste',    dTaste, bread, 2);
  popMetric('softness', dSoft,  bread, 0);
  popMetric('chew',     dChew,  bread, 1);
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
  $('#s5Slice').classList.remove('hidden', 'ready');
  $('#s5Slice').disabled = false;
  $('#s5Hand').classList.remove('hidden');   // 演示手势复位
  $('#s5Next').classList.add('hidden');
  renderHud('hud5');
  showScreen('screenS5');
  cancelAnimationFrame(S5.raf);
  S5.last = performance.now();
  const cut = $('#s5Cut'), loaf = $('#s5Loaf');
  function loop(now) {
    if (paused) { S5.last = now; S5.raf = requestAnimationFrame(loop); return; }
    const dt = (now - S5.last) / 1000; S5.last = now;
    const p = S5.osc.step(dt);
    cut.style.left = `calc(${p}% - 2px)`;
    // 刀进标准厚度区：切片按钮发光脉动，提示「现在下刀」
    $('#s5Slice').classList.toggle('ready', p >= 42 && p <= 58);
    S5.raf = requestAnimationFrame(loop);
  }
  S5.raf = requestAnimationFrame(loop);
}

/* 标准厚度区：CSS thick-zone 在 42%..58%，中心 50% */
function sliceAction() {
  if (S5.done) return;
  $('#s5Hand').classList.add('hidden');   // 用户已操作，演示消失
  // 刀挥下切一刀
  const knife = $('#s5Knife');
  knife.classList.remove('chop'); void knife.offsetWidth; knife.classList.add('chop');
  const p = S5.osc.pos;
  const lo = 42, hi = 58, center = 50;
  let q, sliceImg, dSoft = 0, dChew = 0;
  const loaf = $('#s5Loaf');
  if (p >= lo && p <= hi) {
    q = Math.round(clamp(100 - Math.abs(p - center) * 4, 75, 100));
    dSoft = 2; M.softness += dSoft;
    sliceImg = 'slice_std';
    Sfx.good();
    showToast('厚度刚好！松软又好看');
    npcReact('happy', '厚度刚刚好！');
  } else if (p < lo) {        // 太薄易碎
    q = Math.round(clamp(60 - (lo - p) * 2, 15, 60));
    dSoft = -1; M.softness += dSoft;
    sliceImg = 'slice_thin';
    Sfx.knock();
    showToast('切太薄，容易碎');
    npcReact('nervous', '太薄了，会碎的！');
  } else {                    // 太厚难嚼
    q = Math.round(clamp(60 - (p - hi) * 2, 15, 60));
    dChew = 4; M.chew += dChew;
    sliceImg = 'slice_thick';
    Sfx.knock();
    showToast('切太厚，更难嚼');
    npcReact('nervous', '太厚啦，不好嚼！');
  }
  S5.slices.push(q);
  const tray = $('#s5Tray');
  const si = document.createElement('img');
  si.src = A2(sliceImg); tray.appendChild(si);
  spawnCrumbs(loaf, p, 50);
  M.softness = clamp(M.softness, 0, 200);
  popMetric('softness', dSoft, loaf, 0);
  popMetric('chew',     dChew, loaf, 1);
  $('#s5Count').textContent = `已切 ${S5.slices.length} / ${S5_TARGET} 片`;
  if (S5.slices.length >= S5_TARGET) finishS5();
}

function finishS5() {
  S5.done = true;
  cancelAnimationFrame(S5.raf);
  $('#s5Slice').disabled = true;
  M.score.slice = Math.round(S5.slices.reduce((a, b) => a + b, 0) / S5.slices.length);
  // 按钮统一：收起「切一刀」，只显示「去边去」
  $('#s5Slice').classList.remove('ready');
  $('#s5Hand').classList.add('hidden');
  $('#s5Slice').classList.add('hidden');
  $('#s5Next').classList.remove('hidden');
  $('#s5Next').textContent = `去边去 ▶`;
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
  resultCelebrated = false;        // 重置庆祝标记
  $('#s6Done').disabled = true;
  $('#s6Done').textContent = '把四边都去掉';
  // 演示：刀切掉上边（循环），跟手刀复位
  $('#s6Knife').classList.add('hidden');
  $('#s6DemoKnife').classList.remove('hidden');
  $('.edge-top').classList.add('demo');
  renderHud('hud6');
  showScreen('screenS6');
}

// 玩家开始去边 → 停止演示动画
function hideS6Demo() {
  const top = $('.edge-top');
  if (top) { top.classList.remove('demo'); top.style.transform = ''; top.style.opacity = ''; }
  $('#s6DemoKnife').classList.add('hidden');
}

function attachEdgeTrim() {
  $$('.trim-edge').forEach(el => {
    const edge = el.dataset.edge;
    const horiz = edge === 'top' || edge === 'bottom';
    el.addEventListener('pointerdown', e => {
      if (S6.done || S6.edges[edge] != null) return;
      e.preventDefault();
      hideS6Demo();                       // 用户开始操作，停止演示
      const knife = $('#s6Knife');
      knife.classList.remove('hidden');   // 跟手刀出现
      knife.style.left = e.clientX + 'px';
      knife.style.top  = e.clientY + 'px';
      knife.style.transform = horiz ? 'rotate(-46deg)' : 'rotate(-90deg)';
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      let minMain = Infinity, maxMain = -Infinity, maxDev = 0;
      const move = ev => {
        // 跟手刀跟随手指
        knife.style.left = ev.clientX + 'px';
        knife.style.top  = ev.clientY + 'px';
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
        $('#s6Knife').classList.add('hidden');   // 跟手刀收起
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
    const dChew = (1 - coverage) * 10;
    M.chew += dChew;
    el.style.opacity = String(1 - coverage * 0.7);
    el.classList.add('cut'); // 仍标记完成，但留下了边
    popMetric('chew', dChew, $('#s6Toast'), 1);
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
  // 切边完成 → 在本幕弹出「面包出炉啦」+ 往上抛面包，让完成更明显
  setTimeout(() => { if ($('.screen.is-active') && $('.screen.is-active').id === 'screenS6') celebrate(); }, 1300);
}

/* =====================================================================
   结算：营养 / 美味 / 松软 / 难嚼 / 无边完成度 → S/A/B/C
===================================================================== */
function gradeLetter(v) { return v >= 88 ? 'S' : v >= 72 ? 'A' : v >= 55 ? 'B' : 'C'; }

const RESULT_COPY = {
  S: '营养满分、松软到飞起、四边干干净净——这就是「好吃到没边了」的最高境界！',
  A: '一条非常优秀的藜麦无边吐司，松软又营养，再练练就是大师。',
  B: '差一点点就完美啦～先尝一口豪士 S 级成品，找找「好吃到没边了」的标准，再来挑战！',
  C: '哎呀，这条还差点火候～建议先买条豪士 S 级无边吐司尝尝真正的味道，再回来试试看！',
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
  // 购买提示也随成绩变化：做得好→带回家；做得一般→先尝标准口味
  const buyTip = $('.buy-tip');
  if (buyTip) buyTip.textContent = (grade === 'S' || grade === 'A')
    ? '把刚做好的「好吃到没边了」带回家 · 淘宝大促价保'
    : '先买条 S 级成品尝尝「好吃到没边了」的标准，下次做得更好！';
  // 购买按钮：无论做成什么样，都引导去购买 S 级无边面包
  const buyBtn = $('#btnBuy');
  if (buyBtn) buyBtn.textContent = '🛒 去购买 S 级无边面包 ▶';

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

  // 庆祝弹窗与抛面包已在去边完成时播放，这里直接进入海报并浮现
  $('#screenResult').classList.add('pre-reveal');
  showScreen('screenResult');
  requestAnimationFrame(() => requestAnimationFrame(revealPoster));
}

// 去边完成的庆祝：产品箱弹窗 +「面包出炉啦」+ 往上抛面包（只触发一次）
let resultCelebrated = false;
function celebrate() {
  if (resultCelebrated) return;
  resultCelebrated = true;
  showProductBox();
}

// 产品箱弹窗（土司箱入场 + 往上抛掷面包动画）
function showProductBox() {
  $('#productModal').classList.remove('hidden');
  const box = $('.prod-box-img');
  box.classList.remove('land'); void box.offsetWidth; box.classList.add('land');  // 放大→缩小归位
  throwProduct();                                                                  // 往上抛面包
}

// 抛掷产品特效（水果忍者式：从底部抛起、旋转、落下），done 在抛物过程中触发海报浮现
function throwProduct(done) {
  const fx = $('#throwFx');
  fx.classList.remove('hidden');
  fx.innerHTML = '';
  // 多种面包/产品素材，从底部中间以不同角度往上抛
  const pics = ['product_front', 'toast_golden', 'loaf_full', 'slice_std', 'slice_thick', 'toast_golden', 'product_front', 'slice_std'];
  let maxEnd = 0;
  pics.forEach((p, i) => {
    const img = document.createElement('img');
    img.className = 'toss-item';
    img.src = A2(p);
    const big = (p === 'product_front' || p === 'loaf_full');
    img.style.width = (big ? 118 : 78) + 'px';
    img.style.left = rand(40, 60) + 'vw';          // 从底部中间附近发射
    fx.appendChild(img);
    // 多角度：水平位移有正有负、幅度不一 → 抛射角度各异（水果忍者式扇形）
    const dx   = rand(-46, 46);                     // vw，决定抛射角度
    const apex = rand(0, 22);                       // 顶点离顶(vh)，高度不一
    const rot  = rand(360, 1080) * (Math.random() < .5 ? -1 : 1);
    const dur  = rand(1350, 1850);
    const delay = i * 85;
    img.animate([
      { transform: 'translate(-50%, 95vh) rotate(0deg) scale(.45)', opacity: 0,
        easing: 'cubic-bezier(.12,.7,.35,1)' },                                   // 发射→上升减速
      { transform: `translate(calc(-50% + ${dx * 0.55}vw), ${apex}vh) rotate(${rot / 2}deg) scale(1)`,
        opacity: 1, offset: 0.46, easing: 'cubic-bezier(.5,0,.85,.5)' },          // 顶点→下落加速
      { transform: `translate(calc(-50% + ${dx}vw), 118vh) rotate(${rot}deg) scale(.85)`,
        opacity: 1, offset: 1 },
    ], { duration: dur, delay, fill: 'forwards' });
    maxEnd = Math.max(maxEnd, dur + delay);
  });
  Sfx.win();
  setTimeout(() => { if (done) done(); }, 650);
  setTimeout(() => { fx.classList.add('hidden'); fx.innerHTML = ''; }, maxEnd + 120);
}

// 海报浮现 + 指标条充能
function revealPoster() {
  $('#screenResult').classList.remove('pre-reveal');
  requestAnimationFrame(() => {
    $$('#rMetrics .mb-track > i').forEach(i => { i.style.width = i.dataset.w + '%'; });
  });
}

/* =====================================================================
   事件绑定
===================================================================== */
function bind() {
  $('#btnStart').addEventListener('click', () => { resetGame(); startS1(); });

  // 背景音乐：右上角旋转音符 点击开/关
  const bgm = $('#bgm'), musicBtn = $('#musicBtn'), musicHint = $('#musicHint');
  if (bgm && musicBtn) {
    bgm.volume = 0.5;
    const syncMusicBtn = () => musicBtn.classList.toggle('paused', bgm.paused);
    bgm.addEventListener('pause', syncMusicBtn);
    bgm.addEventListener('play', syncMusicBtn);
    musicBtn.addEventListener('click', () => {
      if (musicHint) musicHint.classList.add('hidden');
      if (bgm.paused) bgm.play().catch(() => {}); else bgm.pause();
    });
    // 兜底：若自动播放被浏览器拦截，首次用户手势时开始播放
    const kick = () => { startBgm(); document.removeEventListener('pointerdown', kick); document.removeEventListener('touchstart', kick); };
    document.addEventListener('pointerdown', kick);
    document.addEventListener('touchstart', kick);
  }

  // 玩法提示弹窗：点任意处关闭并继续
  $('#tipModal').addEventListener('click', hideTipModal);

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

  // 去边：完成后按钮也可手动触发庆祝（自动庆祝未播放时）
  attachEdgeTrim();
  $('#s6Done').addEventListener('click', () => { if (!$('#s6Done').disabled) celebrate(); });

  // 庆祝弹窗：点击开箱 → 进入成品海报
  $('#productModal').addEventListener('click', () => {
    $('#productModal').classList.add('hidden');
    showResult();
  });

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

/* 背景音乐自动播放（加载完成后尝试；被拦截则由首次手势兜底） */
let bgmHintShown = false;
function startBgm() {
  const bgm = document.getElementById('bgm');
  if (bgm && bgm.paused) bgm.play().catch(() => {});
}
// 首次进入首页时提示「点击音符可关闭音乐」，几秒后自动隐藏
function showMusicHint() {
  const hint = document.getElementById('musicHint');
  if (!hint || bgmHintShown) return;
  bgmHintShown = true;
  hint.classList.remove('hidden');
  setTimeout(() => hint.classList.add('hidden'), 4500);
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
      setTimeout(() => { showScreen('screenStart'); startBgm(); showMusicHint(); }, 380);  // 加载完自动播放音乐 + 提示
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
