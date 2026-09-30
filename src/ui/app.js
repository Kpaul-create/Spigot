/* ===== Spigot — page logic ===== */
const THEMES = ['light', 'dark'];
const root = document.documentElement;

const cur = () => THEMES.find(t => root.classList.contains('theme-' + t)) || 'light';

const TT = document.getElementById('tt');
const lab = () => {
  const t = 'Switch to ' + (cur() === 'dark' ? 'day' : 'night') + ' mode';
  TT.setAttribute('aria-label', t);
  TT.title = t;
};
lab();
TT.onclick = () => {
  TT.classList.remove('spin');
  void TT.offsetWidth;
  TT.classList.add('spin');
  const n = THEMES[(THEMES.indexOf(cur()) + 1) % THEMES.length];
  THEMES.forEach(t => root.classList.toggle('theme-' + t, t === n));
  try { localStorage.setItem('theme', n); } catch (e) {}
  lab();
};

const F = document.getElementById('fnt');
F.sheet ? F.media = 'all' : F.addEventListener('load', () => F.media = 'all');

const $ = s => document.querySelector(s);
const hex = n => [...Array(n)].map(() => '0123456789abcdef'[Math.random() * 16 | 0]).join('');
const addr = () => '0x' + hex(4) + '…' + hex(4);

/* Endpoint directory data */
const EP = [
  ["Flux Image Gen", "Pixelworks", "Media", 0.04],
  ["News Summarizer", "Digestly", "AI", 0.01],
  ["Sentiment API", "Pulse Labs", "Data", 0.002],
  ["GPU Burst Compute", "Nimbus", "Compute", 0.15],
  ["FX Rates Feed", "Ledgerly", "Finance", 0.001],
  ["Web Search Tool", "Query Co", "AI", 0.005],
];

/* Routing */
const R = ['home', 'directory', 'dashboard', 'demo', 'docs', 'privacy'];
function route() {
  let h = location.hash.replace('#/', '').split('/')[0] || 'home';
  if (!R.includes(h)) h = 'home';
  R.forEach(r => $('#p-' + r).hidden = r !== h);
  document.querySelectorAll('nav a[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === h));
  scrollTo(0, 0);
  if (h === 'home') setTimeout(() => dispatchEvent(new Event('resize')), 30);
}
addEventListener('hashchange', route);
route();

/* Directory */
let cat = 'All';
const cats = ['All', ...new Set(EP.map(e => e[2]))];
function dir() {
  $('#chips').innerHTML = cats.map(c => `<button class="chip${c === cat ? ' on' : ''}" data-c="${c}">${c}</button> `).join('');
  $('#grid').innerHTML = EP.filter(e => cat === 'All' || e[2] === cat).map(e =>
    `<div class="card"><span class="tag">${e[2]}</span><h3>${e[0]}</h3><p>by ${e[1]}</p><div class="row"><b>$${e[3]}/call</b><a class="btn sm" href="#/demo">Try it live</a></div></div>`
  ).join('');
}
$('#chips').onclick = e => { if (e.target.dataset.c) { cat = e.target.dataset.c; dir(); } };
dir();

/* Live ledger feed */
const row = () => {
  const e = EP[Math.random() * 6 | 0];
  return `<div class="lrow"><span class="dot"></span><code>${addr()}</code><span>${e[0]}</span><b>$${e[3]}</b><span class="ok">Settled on Tempo</span></div>`;
};
const feed = (el, n = 7) => {
  el.insertAdjacentHTML('afterbegin', row());
  while (el.children.length > n) el.lastChild.remove();
};
for (let i = 0; i < 6; i++) { feed($('#feedHome')); feed($('#feedDemo')); }

let liveOn = false;
new IntersectionObserver(es => liveOn = es[0].isIntersecting).observe($('#live'));
setInterval(() => {
  if (document.hidden) return;
  if (liveOn && !$('#p-home').hidden) feed($('#feedHome'));
  if (!$('#p-demo').hidden) feed($('#feedDemo'), 9);
}, 1600);

/* Dashboard chart */
$('#tx').innerHTML = [...Array(8)].map(() => {
  const e = EP[Math.random() * 6 | 0];
  return `<tr><td><code>${addr()}</code></td><td>${e[0]}</td><td>$${e[3]}</td><td>${['pathUSD', 'AlphaUSD', 'BetaUSD'][Math.random() * 3 | 0]}</td><td class="ok" style="color:var(--color-text-accent)">Settled</td></tr>`;
}).join('');
$('#line').setAttribute('points', [...Array(30)].map((_, i) => `${i * 20},${(62 - Math.sin(i / 4) * 8 - i * 1.3 + Math.random() * 7).toFixed(1)}`).join(' '));

/* Demo run button */
$('#run').onclick = () => {
  document.querySelectorAll('#tasks li').forEach((li, i) => {
    li.classList.remove('done');
    setTimeout(() => { li.classList.add('done'); feed($('#feedDemo'), 9); }, 900 * (i + 1));
  });
};

/* Scroll-reveal animations */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .15 });
document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));

/* Newsletter form */
$('#nl').onsubmit = e => {
  e.preventDefault();
  const m = $('#nlMsg'), v = $('#nlEmail').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(v)) { m.textContent = 'Enter a valid email address.'; return; }
  if (!$('#nlOk').checked) { m.textContent = 'Please accept the privacy policy to subscribe.'; return; }
  m.textContent = 'Thanks, you are subscribed.';
  e.target.reset();
};

/* Pause hero scene when off-screen */
window.__spigotOn = true;
new IntersectionObserver(es => { window.__spigotOn = es[0].isIntersecting; }).observe($('#hero'));
