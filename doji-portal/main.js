(() => {
const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.0,1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform float uT;
uniform float uGlowAmt,uGlowSize,uStretch,uWarp,uWFall,uInner,uCoreBend;
uniform float uZoom,uRotDeg,uCX,uCY,uFine;
uniform float uBreathAmt,uBreathPh;
float gFill=0.0;
float gDot=1.0;
float gFan=1.0;
float gL=0.0;
uniform float uLW,uSpread,uDens,uFront,uHalo,uFill,uPhase,uOff,uReach;
uniform float uLayers,uDepth,uLOff,uHotAmt,uHotPos,uTails;
uniform float uMass,uHor,uTwist,uTurb,uBright,uGrain;
uniform vec3 uBlue,uHot;
uniform float uAlpha;

float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}

// Lens: screen point -> point in a stream layer behind the hole. E = that layer's ring radius.
vec2 lens(vec2 th, float E){
  float r2=dot(th,th)+1e-7;
  float r=sqrt(r2);
  float alpha=uWarp*E*pow(E/r,uWFall);
  vec2 b=th-th/r*alpha;
  float tw=uTwist*E*E/(r2+E*E*0.15);
  float c=cos(tw), s=sin(tw);
  b=mat2(c,-s,s,c)*b;
  float ring=exp(-pow((r-E)/(E*0.9+1e-4),2.0));
  vec2 nn=vec2(n3(vec3(th*3.5/(E+0.05),uT*0.15)),n3(vec3(th*3.5/(E+0.05)+17.0,uT*0.15)))-0.5;
  b+=nn*uTurb*E*0.6*ring;
  return b;
}

// Soft dot profile, pixel-aware: keeps total light constant when a dot shrinks below a pixel.
float prof(float d, float w, float fw){
  float s=sqrt(w*w+fw*fw*0.5);
  return exp(-d*d/(s*s))*(w/s);
}

// 1 where the stream passes the hole, 0 far above and below it.
float fanAt(float y){ return exp(-pow(y/(uMass*uReach+1e-4),2.0)); }
float spreadAt(float y){ return uSpread+gFan*gFill*uMass*0.7*fanAt(y); }

// A dense crowd of tiny dots packed around a line at x = off.
// Lanes live in spread-relative units, so Spread squeezes the same dots closer instead of removing them.
vec3 dots(vec2 s, float off, float laneN, float rowH, float spd, float seed, float fw, vec3 col){
  float sp=spreadAt(s.y);
  float ux=(s.x-off)/sp;
  float base=floor(ux/laneN);
  float acc=0.0;
  for(int k=-1;k<=1;k++){
    float lane=base+float(k);
    float ph=h21(vec2(lane,seed+5.3))*rowH;
    float spdL=spd*(0.85+0.3*h21(vec2(lane,seed+9.1)));
    float y=s.y+uPhase*spdL+ph;
    float row0=floor(y/rowH);
    float lc=(lane+0.5)*laneN;
    if(abs(lc)>3.0) continue;
    float L=gL*rowH*2.6;
    // each dot drags a trail behind it (upward, since it falls); the lens stretches these into long arcs
    for(int j=0;j<3;j++){
      if(j>0 && L<1e-5) break;
      float row=row0-float(j);
      vec2 id=vec2(lane,mod(row,4096.0))+seed;
      if(h21(id)>uDens*exp(-lc*lc)) continue;
      vec2 c=vec2(off+(lc+(h21(id+1.7)-0.5)*laneN*0.8)*sp, (row+0.1+0.8*h21(id+4.2))*rowH);
      float w=0.00055*uLW*gDot*(0.6+0.8*h21(id+8.1));
      float ty=clamp(y-c.y,0.0,L);
      float fade=1.0-0.75*ty/max(L,1e-5);
      acc+=prof(length(vec2(s.x-c.x,y-c.y-ty)),w,fw)*(0.6+0.7*h21(id+6.6))*fade;
    }
  }
  return col*acc;
}

// Rare glowing dots, a bit bigger than the rest, scattered at random along the stream.
vec3 glows(vec2 s, float off, float seed, float fw){
  float G=0.08;
  float y=s.y+uPhase*0.9;
  float r0=floor(y/G);
  float sp=spreadAt(s.y);
  vec3 acc=vec3(0.0);
  for(int k=-1;k<=1;k++){
    float row=r0+float(k);
    vec2 id=vec2(mod(row,4096.0),seed);
    if(h21(id)>uGlowAmt*0.6) continue;
    float cx=off+(h21(id+1.3)-0.5)*3.0*sp;
    float cy=(row+h21(id+2.7))*G;
    float d=length(vec2(s.x-cx,y-cy));
    float w=0.0007*uLW*gDot*uGlowSize*(0.7+0.6*h21(id+3.3));
    float tw=0.65+0.35*sin(uT*2.5+h21(id+5.0)*40.0);
    vec3 gc=mix(uHot,vec3(1.0,0.96,0.9),0.35*h21(id+7.7));
    acc+=gc*(prof(d,w,fw)*2.2+prof(d,w*4.5,fw)*0.4)*tw;
  }
  return acc;
}

vec3 stream(vec2 s, float off, float seed, float fw, vec3 col){
  vec3 c=dots(s,off,0.3,0.0035,1.0,seed,fw,col)*1.3;
  c+=dots(s,off,0.45,0.0055,0.7,seed+67.0,fw,col)*0.9;
  c+=glows(s,off,seed+11.0,fw);
  return c;
}

void main(){
  vec2 ps=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  float cr=cos(radians(uRotDeg)), sr=sin(radians(uRotDeg));
  vec2 p=mat2(cr,sr,-sr,cr)*(ps/uZoom)+vec2(uCX,uCY);
  gDot=mix(1.0,1.0/uZoom,uFine);
  // Breathe: depth and fan out swell and settle together.
  float br=sin(uBreathPh);
  gFill=uFill*max(0.0,1.0+uBreathAmt*br);
  float depthE=clamp(uDepth*(1.0+uBreathAmt*br),0.0,1.0);
  float r=length(p);
  float E=uMass;
  vec3 col=vec3(0.0);
  float n=max(uLayers,1.0);

  // Stream layers at different depths behind the hole: each one bends into its own ring, so they nest and fill the disc.
  for(int i=0;i<8;i++){
    if(float(i)>=n) break;
    float t=n>1.0?float(i)/(n-1.0):0.5;
    float Ei=E*mix(1.0-depthE*0.55,1.0+depthE*0.25,t);
    vec2 s=lens(p,Ei);
    float fw=max(length(dFdx(s)),length(dFdy(s)));
    // Stretch only where the lens magnifies: dots keep their shape in the stream, the warp pulls them into arcs.
    float sfac=smoothstep(1.6,4.5,r/max(length(s),1e-5));
    gL=uStretch*sfac;
    float off=uOff+(h21(vec2(float(i),3.7))-0.5)*2.0*uLOff*fanAt(s.y);
    float hot=uHotAmt*exp(-pow((t-uHotPos)/0.16,2.0));
    vec3 tint=mix(uBlue,uHot,hot);
    vec3 c=stream(s,off,float(i)*41.0,fw,tint)*(1.0+hot*1.5);
    float dx=s.x-off;
    float sp=spreadAt(s.y);
    c+=tint*exp(-dx*dx/(sp*sp*30.0))*uHalo*0.05;
    float near=exp(-pow(r/(Ei*1.5),4.0));
    float inner=mix(uInner,1.0,smoothstep(Ei*0.8,Ei*1.02,r));
    col+=c*(1.6/sqrt(n))*mix(uTails,1.0,near)*inner;
  }

  float hole=E*uHor;
  col*=smoothstep(hole*0.97,hole*1.03+0.0005,r);

  // The line in front of the hole: never bent.
  // The middle line runs through its own small warp, so it bends and stretches like the rest instead of sitting on top.
  if(uFront>0.0){
    vec2 sc=lens(p,E*uCoreBend);
    float fw=max(length(dFdx(sc)),length(dFdy(sc)));
    float sfac=smoothstep(1.6,4.5,r/max(length(sc),1e-5));
    gFan=0.0; gL=uStretch*sfac;
    col+=stream(sc,uOff,977.0,fw,uBlue)*uFront;
  }

  col=1.0-exp(-col*uBright);
  col*=1.0+(h21(gl_FragCoord.xy+fract(uT*13.7)*100.0)-0.5)*uGrain*3.0;
  col=clamp(col,0.0,1.0);
  // Transparent export: the light becomes its own alpha (premultiplied), so it lands exactly like this over black.
  o=vec4(col,uAlpha>0.5?max(col.r,max(col.g,col.b)):1.0);
}`;

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) { document.querySelector('.stage').textContent = 'This browser does not support WebGL 2, which this piece needs.'; return; }

function sh(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'a');
gl.enableVertexAttribArray(loc);
gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

const U = {};
const u = n => (U[n] ??= gl.getUniformLocation(prog, n));
const $ = id => document.getElementById(id);
const sliders = { breathe:'uBreathAmt', zoom:'uZoom', rot:'uRotDeg', cx:'uCX', cy:'uCY', fine:'uFine', corebend:'uCoreBend', stretch:'uStretch', warp:'uWarp', wfall:'uWFall', inner:'uInner', glow:'uGlowAmt', gsize:'uGlowSize', lw:'uLW', spread:'uSpread', dens:'uDens', front:'uFront', halo:'uHalo', fill:'uFill', off:'uOff', reach:'uReach',
  layers:'uLayers', depth:'uDepth', loff:'uLOff', tails:'uTails', hotamt:'uHotAmt', hotpos:'uHotPos',
  mass:'uMass', hor:'uHor', twist:'uTwist', turb:'uTurb', bright:'uBright', grain:'uGrain' };
const colors = { cBlue:'uBlue', cHot:'uHot' };
const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
// The only colors on offer: eight blues, then eight golds, dark to light.
const PALETTE = [
  ['Midnight', '#1a2a9c'], ['Doji', '#2c3ad6'], ['Royal', '#3550ff'], ['Cobalt', '#2f6bff'],
  ['Azure', '#3d8bff'], ['Sky', '#5aa8ff'], ['Ice', '#8cc4ff'], ['Glacier', '#b5dcff'],
  ['Bronze', '#b8762e'], ['Amber', '#e09a3a'], ['Gold', '#f2b84b'], ['Honey', '#ffc96b'],
  ['Glow', '#ffc49a'], ['Sand', '#ffd9a0'], ['Champagne', '#ffe7c2'], ['Ivory', '#fff3dd']
];

const units = { rot: '°', zoom: '×' };
// Show as many decimals as the slider's step uses (at least 2 for fine steps), so tiny values like Spread don't read as 0.000.
function places(el){ const s = el.step, d = (s.split('.')[1] || '').length; return +s >= 0.1 ? d : Math.max(2, d); }
function outputs(){
  document.querySelectorAll('output').forEach(o => {
    const el = $(o.htmlFor.value);
    o.value = (+el.value).toFixed(places(el)) + (units[el.id] || '');
  });
  // White fill on each slider track up to the thumb
  document.querySelectorAll('input[type=range]').forEach(r => r.style.setProperty('--p', (r.value - r.min) / (r.max - r.min) * 100 + '%'));
  // Color fields show just the picked swatch and its name
  document.querySelectorAll('.cpick').forEach(b => {
    const v = $(b.dataset.for).value.toLowerCase(), hit = PALETTE.find(p => p[1] === v);
    b.querySelector('.sw i').style.background = v;
    b.querySelector('.cname').textContent = hit ? hit[0] : v.toUpperCase();
  });
  if (popFor) markSwatches();
}

let busy = false, sizeLock = false;
// ---- Camera: drag to move, scroll to zoom around the cursor ----
function camRot(){ const a = (+$('rot').value) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; }
function toWorld(px, py, z){ const [c, s] = camRot(); return [c * px / z - s * py / z, s * px / z + c * py / z]; }
function setCenter(x, y){ $('cx').value = x.toFixed(4); $('cy').value = y.toFixed(4); outputs(); panel.dispatchEvent(new Event('input')); }
let drag = null;
canvas.style.touchAction = 'none';
canvas.style.cursor = 'grab';
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const H = canvas.clientHeight, z = +$('zoom').value;
  const [wx, wy] = toWorld((e.clientX - drag.x) / H, -(e.clientY - drag.y) / H, z);
  drag = { x: e.clientX, y: e.clientY };
  setCenter(+$('cx').value - wx, +$('cy').value - wy);
});
const endDrag = () => { drag = null; canvas.style.cursor = 'grab'; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), H = r.height;
  const px = (e.clientX - r.left - r.width / 2) / H, py = -(e.clientY - r.top - H / 2) / H;
  const z = +$('zoom').value, nz = Math.min(60, Math.max(1, z * Math.exp(-e.deltaY * 0.0015)));
  const [ax, ay] = toWorld(px, py, z), [bx, by] = toWorld(px, py, nz);
  $('zoom').value = nz.toFixed(2);
  setCenter(+$('cx').value + ax - bx, +$('cy').value + ay - by);
}, { passive: false });

function resize(){
  if (sizeLock) return;
  const W = window.innerWidth, H = window.innerHeight;
  const r = $('ratio').value;
  let w = W, h = H;
  if (r !== 'full') { const ar = +r; if (W / H > ar) { h = H; w = H * ar; } else { w = W; h = W / ar; } }
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);

const presets = {
  contour: { lw:0.38, spread:0.0002, dens:0.06, stretch:0.49, glow:0, gsize:3.63, front:0.78, corebend:0.37, halo:0.71, fill:0, reach:0.8, speed:0.05, off:-0.002, layers:8, depth:0.09, loff:0.042, tails:1, breathe:0.3, bspeed:0.12, hotamt:0, hotpos:0.33, mass:0.17, hor:0.58, warp:1.7, wfall:0.52, inner:0.19, twist:0, turb:0, zoom:1, rot:0, cx:0, cy:0 },
  doji:   { lw:0.2, spread:0.0002, dens:1, stretch:0.49, glow:0.23, gsize:3.63, front:0.78, halo:0, fill:0.34, reach:0.8, speed:0.08, off:0, layers:8, depth:0.09, loff:0.042, tails:1, hotamt:0, hotpos:0.33, mass:0.17, hor:0.58, warp:1.7, wfall:0.52, inner:0.19, twist:0, turb:0, bright:8 },
  clean:  { lw:1, spread:0.001, dens:1, stretch:0.49, glow:0.23, gsize:3.63, front:1, halo:0.52, fill:0.25, reach:0.5, speed:0.1, off:0.004, layers:7, depth:0.6, loff:0.018, tails:0.12, hotamt:0.55, hotpos:0.35, mass:0.19, hor:0.14, warp:1.7, wfall:0.52, inner:0.19, twist:0, turb:0, bright:3.5, grain:0.03 },
  vortex: { lw:0.99, spread:0.006, dens:1, stretch:0.51, glow:0.23, gsize:3.63, front:0, halo:1.08, fill:0.66, reach:0.5, speed:0.05, off:-0.014, layers:5, depth:1, loff:0.035, tails:0, hotamt:0.9, hotpos:0.3, mass:0.2, hor:0.1, warp:1.57, wfall:0.52, inner:0, twist:0.39, turb:0.44, bright:6.17, grain:0.03 },
  wide:   { lw:0.9, spread:0.0008, dens:1, front:1.2, halo:0.3, fill:0.1, reach:1.2, speed:0.06, off:0, layers:4, depth:0.4, loff:0.01, tails:0.3, hotamt:0.4, hotpos:0.5, mass:0.22, hor:0.3, twist:0, turb:0, bright:3 }
};
// The last preset clicked stays lit until a slider or color is changed by hand.
const markPreset = name => document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b.dataset.preset === name));
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
  Object.entries(presets[b.dataset.preset]).forEach(([k, val]) => { $(k).value = val; });
  outputs();
  markPreset(b.dataset.preset);
}));

const panel = $('panel');
panel.addEventListener('submit', e => e.preventDefault());
panel.addEventListener('input', e => {
  if (e.target.id === 'ratio') resize();
  if (e.target.matches('input[type=range],input[type=color]')) markPreset(null);
  outputs();
});
panel.addEventListener('change', e => { if (e.target.id === 'ratio') resize(); });

// ---- Color fields: click one to pick from the palette (a row of blues, a row of golds) in a popover ----
// The hidden color inputs hold the pick; the popover is shared and sits outside the panel so nothing clips it.
const pop = $('cpop'), swatchGrid = pop.querySelector('.swatches');
let popFor = null;
function markSwatches(){ const v = $(popFor.dataset.for).value.toLowerCase(); swatchGrid.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.color === v)); }
function placePop(){
  const r = popFor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left; if (left + pw > innerWidth - 8) left = r.right - pw;
  let top = r.bottom + 6; if (top + ph > innerHeight - 8) top = r.top - ph - 6;
  pop.style.left = Math.max(8, left) + 'px'; pop.style.top = Math.max(8, top) + 'px';
}
function openPop(btn){
  closePop();
  popFor = btn; btn.setAttribute('aria-expanded', 'true');
  pop.setAttribute('aria-label', document.getElementById('l-' + btn.dataset.for).textContent);
  markSwatches(); pop.hidden = false; placePop();
  (swatchGrid.querySelector('[aria-checked=true]') || swatchGrid.querySelector('button')).focus();
}
function closePop(refocus){
  if (!popFor) return;
  const btn = popFor; popFor = null; pop.hidden = true; btn.setAttribute('aria-expanded', 'false');
  if (refocus) btn.focus();
}
for (const [name, c] of PALETTE) {
  const b = document.createElement('button');
  b.type = 'button'; b.title = name; b.dataset.color = c; b.style.background = c;
  b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
  b.addEventListener('click', () => { const input = $(popFor.dataset.for); input.value = c; input.dispatchEvent(new Event('input', { bubbles: true })); closePop(true); });
  swatchGrid.appendChild(b);
}
document.querySelectorAll('.cpick').forEach(b => b.addEventListener('click', () => { if (popFor === b) closePop(); else openPop(b); }));
document.addEventListener('pointerdown', e => { if (popFor && !pop.contains(e.target) && !popFor.contains(e.target)) closePop(); });
pop.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); closePop(true); return; }
  // Arrow keys walk the 8-wide grid
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[e.key];
  if (!step) return;
  const all = [...swatchGrid.children], i = all.indexOf(document.activeElement);
  if (i >= 0 && all[i + step]) { e.preventDefault(); all[i + step].focus(); }
});
$('panelBody').addEventListener('scroll', () => closePop());
window.addEventListener('resize', () => closePop());
// Colors from older saves or imports snap to the closest palette color.
function nearest(v){
  const c = hex(v); let best = PALETTE[0][1], bd = Infinity;
  for (const [, p] of PALETTE) { const q = hex(p), d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

let paused = false;
$('animate').addEventListener('change', () => { paused = !$('animate').checked; });
function setHidden(h){ closePop(); panel.hidden = h; $('brand').hidden = h; $('show').hidden = !h; }
$('show').addEventListener('click', () => setHidden(false));

// ---- Collapsing: the whole panel and each section, remembered between visits ----
const UI_KEY = 'doji-portal-ui-v1';
let ui = {};
try { ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) {}
function saveUI(){ try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) {} }
function setPanelOpen(open){ panel.classList.toggle('closed', !open); $('collapse').setAttribute('aria-expanded', open); $('collapse').setAttribute('aria-label', open ? 'Collapse panel' : 'Expand panel'); }
setPanelOpen(ui.panel ?? true);
panel.querySelector('.panel-head').addEventListener('click', e => {
  if (e.target.closest('#defaults')) return;
  ui.panel = panel.classList.contains('closed'); setPanelOpen(ui.panel); saveUI();
});
document.querySelectorAll('.sec[data-sec]').forEach(sec => {
  const id = sec.dataset.sec, btn = sec.querySelector('[data-collapse]');
  const set = open => { sec.classList.toggle('closed', !open); btn.setAttribute('aria-expanded', open); };
  set(ui[id] ?? !sec.hasAttribute('data-closed'));
  sec.querySelector('.sec-head').addEventListener('click', e => {
    if (e.target.closest('[data-reset]')) return;
    ui[id] = sec.classList.contains('closed'); set(ui[id]); saveUI();
  });
});
window.addEventListener('keydown', e => {
  if (e.key && e.key.toLowerCase() === 'h' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) setHidden(!panel.hidden);
});

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { $('time').value = 0.4; }

const KEY='doji-portal-settings-v2';
const defaultsAll={};
panel.querySelectorAll('input[type=range],input[type=color],select').forEach(el=>{ if(el.id) defaultsAll[el.id]=el.value; });
function current(){ const o={}; panel.querySelectorAll('input[type=range],input[type=color],select').forEach(el=>{ if(el.id) o[el.id]=el.value; }); return o; }
function apply(o){ Object.entries(o||{}).forEach(([k,v])=>{ const el=$(k); if(el && el.tagName!=='TEXTAREA') el.value=v; }); Object.keys(colors).forEach(id=>{ $(id).value=nearest($(id).value); }); outputs(); resize(); syncExportUI(); }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(current())); }catch(e){} }
try{ const saved=JSON.parse(localStorage.getItem(KEY)||'null'); if(saved) apply(saved); }catch(e){}
panel.addEventListener('input', save);
panel.addEventListener('change', save);
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click', save));
$('defaults').addEventListener('click', ()=>{ apply(defaultsAll); save(); markPreset(null); });
// Each section's reset puts just that section's controls back to their defaults.
document.querySelectorAll('[data-reset]').forEach(b=>b.addEventListener('click', ()=>{
  const o={}; b.closest('.sec').querySelectorAll('input[type=range],input[type=color],select').forEach(el=>{ o[el.id]=defaultsAll[el.id]; });
  apply(o); save(); markPreset(null);
}));
$('copy').addEventListener('click', ()=>{
  const txt=JSON.stringify(current());
  const lbl=$('copy').querySelector('span');
  const show=()=>{ $('dump').hidden=false; $('dumpLabel').hidden=false; $('dump').value=txt; $('dump').focus(); $('dump').select(); };
  try{ navigator.clipboard.writeText(txt).then(()=>{ lbl.textContent='Copied'; setTimeout(()=>{lbl.textContent='Copy settings';},1500); }, show); }catch(e){ show(); }
});

outputs(); resize();

let t = 0, phase = 0, bph = 0, last = performance.now();
function frame(now){
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (busy) { requestAnimationFrame(frame); return; }
  if (!paused) { t += dt * +$('time').value; phase += dt * +$('time').value * +$('speed').value; bph += dt * +$('time').value * +$('bspeed').value * 6.2832; }
  if (bph > 6283.2) bph -= 6283.2;
  // keep the clocks small so the GPU's float precision never degrades the dot pattern
  if (phase > 400) phase -= 400;
  if (t > 1800) t -= 1800;
  draw();
  requestAnimationFrame(frame);
}
function draw(){
  gl.uniform1f(u('uPhase'), phase);
  gl.uniform1f(u('uBreathPh'), bph);
  gl.uniform2f(u('uRes'), canvas.width, canvas.height);
  gl.uniform1f(u('uT'), t);
  for (const [id, n] of Object.entries(sliders)) gl.uniform1f(u(n), +$(id).value);
  for (const [id, n] of Object.entries(colors)) gl.uniform3fv(u(n), hex($(id).value));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
requestAnimationFrame(frame);

// ---- Export: PNG, GIF, MP4 ----
let downloads = null;
(async () => {
  try { downloads = await window.claude?.use?.('downloads'); } catch (e) { downloads = null; }
  // Opened as a plain file outside Claude: save through a normal browser download.
  if (!downloads && !window.claude) downloads = { save: async ({ filename, data }) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return { status: 'saved' }; } };
  if (downloads) $('exportBox').hidden = false;
})();
const msg = t => { $('exportMsg').textContent = t; };
function target(cap){
  const cw = canvas.width, ch = canvas.height, m = Math.max(cw, ch);
  const sel = $('exportSize').value;
  let k = sel === 'small' ? 540 / m : sel === '2x' ? 2 : sel === '4k' ? 3840 / m : 1;
  k = Math.min(k, cap / m);
  const ev = v => Math.max(2, Math.round(v * k / 2) * 2);
  return [ev(cw), ev(ch)];
}
function setSize(w, h){ canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
// ---- Settings travel inside every export ----
// The same marked text is written into each format: a PNG text chunk, a GIF comment, an MP4 'free' box.
const MARK_A = 'DOJI-SETTINGS:', MARK_B = ':DOJI-END';
function settingsText(){ return MARK_A + JSON.stringify({ app: 'doji-portal', saved: new Date().toISOString(), settings: current() }) + MARK_B; }
const enc8 = s => new TextEncoder().encode(s);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes){ let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function concat(parts){ const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
function u32(n){ return new Uint8Array([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]); }
async function embedSettings(name, blob){
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const src = new Uint8Array(await blob.arrayBuffer());
  const text = enc8(settingsText());
  let out = null;
  if (ext === 'png') {
    const body = concat([enc8('tEXt'), enc8('doji-settings'), new Uint8Array([0]), text]);
    const chunk = concat([u32(body.length - 4), body, u32(crc32(body))]);
    out = concat([src.subarray(0, 33), chunk, src.subarray(33)]);
  } else if (ext === 'gif') {
    const blocks = [new Uint8Array([0x21, 0xfe])];
    for (let i = 0; i < text.length; i += 255) { const part = text.subarray(i, i + 255); blocks.push(new Uint8Array([part.length]), part); }
    blocks.push(new Uint8Array([0]));
    const end = src[src.length - 1] === 0x3b ? src.length - 1 : src.length;
    out = concat([src.subarray(0, end), ...blocks, new Uint8Array([0x3b])]);
  } else if (ext === 'mp4') {
    out = concat([src, u32(text.length + 8), enc8('free'), text]);
  }
  return out ? new Blob([out], { type: blob.type }) : blob;
}
$('loadBtn').addEventListener('click', () => $('loadFile').click());
$('loadFile').addEventListener('change', async () => {
  const f = $('loadFile').files[0]; $('loadFile').value = '';
  if (!f) return;
  const say = t => { $('loadMsg').textContent = t; };
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const s = new TextDecoder('latin1').decode(bytes);
    const a = s.lastIndexOf(MARK_A), b = s.indexOf(MARK_B, a);
    let settings = null;
    if (a >= 0 && b >= 0) settings = JSON.parse(s.slice(a + MARK_A.length, b)).settings;
    // A .json file holding what "Copy settings" puts on the clipboard
    else if (/\.json$/i.test(f.name)) { const j = JSON.parse(new TextDecoder().decode(bytes)); settings = j.settings || j; }
    if (!settings) { say('No Doji settings found in that file. Only files exported from here carry them.'); return; }
    apply(settings); save(); markPreset(null);
    say('Loaded the settings from ' + f.name + '.');
  } catch (e) { say('Could not read settings from that file.'); }
});

async function saveFile(name, blob){
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds());
  const dot = name.lastIndexOf('.');
  name = name.slice(0, dot) + '-' + stamp + name.slice(dot);
  try { blob = await embedSettings(name, blob); } catch (e) { console.error(e); }
  try { await downloads.save({ filename: name, data: blob }); msg('Saved ' + name + ' (settings included)'); }
  catch (e) {
    msg(e && e.code === 'declined' ? 'Save cancelled.' : 'Could not save this file here.');
    if (e && (e.code === 'unavailable' || e.code === 'not_granted')) $('exportBox').hidden = true;
  }
}
const tick = () => new Promise(r => setTimeout(r, 0));

async function exportPNG(){
  const [w, h] = target(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  gl.uniform1f(u('uAlpha'), $('transparent').checked ? 1 : 0);
  setSize(w, h); draw();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  gl.uniform1f(u('uAlpha'), 0);
  resize();
  if (blob) await saveFile('doji-portal-' + w + 'x' + h + '.png', blob); else msg('Export failed.');
}

function step(dt){ t += dt * +$('time').value; phase += dt * +$('time').value * +$('speed').value; bph += dt * +$('time').value * +$('bspeed').value * 6.2832; }

// GIF: render each frame at 2x and scale down, so the dots stay crisp instead of blurring at low resolution.
async function exportGIF(){
  msg('Loading GIF encoder…');
  let lib;
  try { lib = await import('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js'); }
  catch (e) { msg('Could not load the GIF encoder.'); return; }
  const { GIFEncoder, quantize, applyPalette } = lib;
  const [w, h] = target(1080);
  const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
  const ss = Math.max(1, Math.min(2, Math.floor(max / Math.max(w, h))));
  const fps = 25, n = Math.round(+$('exportLen').value * fps), dt = 1 / fps;
  const enc = GIFEncoder();
  const down = document.createElement('canvas'); down.width = w; down.height = h;
  const ctx = down.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  busy = true;
  try {
    for (let i = 0; i < n; i++) {
      step(dt);
      setSize(w * ss, h * ss); draw();
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(canvas, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h).data;
      const pal = quantize(img, 256, { format: 'rgb444' });
      enc.writeFrame(applyPalette(img, pal, 'rgb444'), w, h, { palette: pal, delay: 1000 / fps });
      if (i % 3 === 0) { msg('Rendering GIF ' + Math.round(i / n * 100) + '%'); await tick(); }
    }
    enc.finish();
  } finally { busy = false; resize(); }
  await saveFile('doji-portal-' + w + 'x' + h + '.gif', new Blob([enc.bytes()], { type: 'image/gif' }));
}

// MP4: render frame by frame (no dropped frames) and encode at a high bitrate with the browser's H.264 encoder.
async function exportVideo(){
  if (!window.VideoEncoder) return exportVideoRealtime();
  msg('Loading MP4 writer…');
  let lib;
  try { lib = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs'); }
  catch (e) { return exportVideoRealtime(); }
  const { Muxer, ArrayBufferTarget } = lib;
  const fps = 60;
  let [w, h] = target(3840);
  const codecs = ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.4D0034', 'avc1.42003E'];
  let config = null;
  for (let tries = 0; tries < 3 && !config; tries++) {
    const bitrate = Math.min(w * h * fps * 0.3, 120e6);
    for (const codec of codecs) {
      const c = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } };
      try { const r = await VideoEncoder.isConfigSupported(c); if (r.supported) { config = c; break; } } catch (e) {}
    }
    if (!config) { w = Math.round(w * 0.5 / 2) * 2; h = Math.round(h * 0.5 / 2) * 2; }
  }
  if (!config) return exportVideoRealtime();
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h }, fastStart: 'in-memory' });
  let failed = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failed = e; } });
  encoder.configure(config);
  const n = Math.round(+$('exportLen').value * fps), dt = 1 / fps, us = 1e6 / fps;
  busy = true;
  try {
    for (let i = 0; i < n && !failed; i++) {
      step(dt);
      setSize(w, h); draw();
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * us), duration: Math.round(us) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 4));
      if (i % 6 === 0) { msg('Rendering video ' + Math.round(i / n * 100) + '%'); await tick(); }
    }
    await encoder.flush();
  } finally { busy = false; resize(); }
  if (failed) { msg('Video encoding failed.'); return; }
  muxer.finalize();
  await saveFile('doji-portal-' + w + 'x' + h + '.mp4', new Blob([muxer.target.buffer], { type: 'video/mp4' }));
}

// Fallback for browsers without WebCodecs: record the live canvas.
async function exportVideoRealtime(){
  if (!window.MediaRecorder || !canvas.captureStream) { msg('This browser cannot record video.'); return; }
  const types = ['video/mp4;codecs=avc1.640034', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) { msg('This browser cannot record video.'); return; }
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const [w, h] = target(1920);
  const len = +$('exportLen').value;
  sizeLock = true; setSize(w, h);
  const stream = canvas.captureStream(60);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 60e6 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(r => { rec.onstop = r; });
  rec.start(250);
  const t0 = performance.now();
  const iv = setInterval(() => msg('Recording ' + Math.min(len, Math.floor((performance.now() - t0) / 1000)) + ' / ' + len + ' s'), 250);
  await new Promise(r => setTimeout(r, len * 1000));
  rec.stop(); await done; clearInterval(iv);
  stream.getTracks().forEach(tr => tr.stop());
  sizeLock = false; resize();
  if (ext !== 'mp4') msg('This browser records WebM, not MP4. Saving WebM.');
  await saveFile('doji-portal-' + w + 'x' + h + '.' + ext, new Blob(chunks, { type: mime.split(';')[0] }));
}

let exporting = false;
$('export').addEventListener('click', async () => {
  if (!downloads || exporting) return;
  exporting = true; $('export').disabled = true;
  try {
    const f = $('exportFmt').value;
    if (f === 'png') await exportPNG(); else if (f === 'gif') await exportGIF(); else await exportVideo();
  } catch (e) { msg('Export failed.'); console.error(e); }
  exporting = false; $('export').disabled = false;
});
function syncExportUI(){
  const f = $('exportFmt').value;
  $('exportLen').closest('.field').hidden = f === 'png';
  $('transparent').closest('.switch').hidden = f !== 'png';
  $('export').querySelector('span').textContent = 'Export ' + f.toUpperCase();
}
$('exportFmt').addEventListener('change', syncExportUI); syncExportUI();
})();
