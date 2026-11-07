// =========================================================================================
// Sunburst: un sol de rayos metálicos que gira alrededor de un agujero
// =========================================================================================
//
// Un experimento de VERTIK, en homenaje a la portada de «Death in Space» (2021). Todo es un
// plano, como un cartel: arriba el símbolo; en medio, el recuadro con los
// rayos; abajo, el pie entre dos líneas.
//
//   rays.js  → las bandas, su metal (un shader) y el agujero
//   tunnel.js → el modo túnel: anillos que caen hacia el agujero (otro shader)
//   main.js  → el escenario, el giro, la luz, el doble toque y los modos (este archivo)
//
// Cuatro modos, con «Prev» y «Next» en el pie, las flechas del teclado o la dirección
// (#flat, #tunnel, #wire): «folds», cada tramo del zigzag una faceta que destella por su
// cuenta; «flat», todas las bandas recortadas de una sola lámina de metal; «tunnel», sin
// rayos: anillos blancos y negros que caen hacia el agujero, con el desgaste de una
// impresión vieja; y «wire», siempre el último, para ver cómo está hecho: contornos, guías
// y los números, en gris y negro.
//
// El agujero cae en un sitio al azar del recuadro y sigue al cursor, pero con pereza: tarda
// en arrancar, no llega del todo y, si el cursor se va, vuelve a su sitio. Con el ratón
// pulsado o el dedo puesto, crece (se traga los rayos); al soltar, vuelve a su tamaño. Con doble clic o
// doble toque, sale un sol nuevo (otro sitio, otros destellos). Mover el ratón o el dedo
// también mueve la luz.

import * as THREE from 'three';
import { createRays, HOLE, INFO, WIRE_PAPER } from './rays.js';
import { createTunnel } from './tunnel.js';
import '../style.css';

const BACKGROUND = '#0d0d0d';

// Qué parte del lado corto del recuadro ocuparía un radio de 1: el agujero (HOLE, rays.js)
// sale siempre del mismo tamaño en proporción, sea la pantalla que sea.
const FILL = 0.7;

// Hasta dónde se aleja el agujero del centro, en partes de medio recuadro (1 = el borde).
const OFFSET = 0.55;

// El giro, en radianes por segundo, y su respiración: acelera y frena un poco, con dos
// ondas lentas de distinta duración, para que no se repita igual.
const SPIN = -0.12;
const PULSE = 0.5;
const spinAt = (time) => SPIN * (1 + PULSE * (0.7 * Math.sin(0.6 * time) + 0.3 * Math.sin(1.7 * time + 1)));

// El agujero sigue al cursor con un muelle: FOLLOW es hasta dónde se deja llevar (1 = hasta
// el cursor; 0,6 = un 60 % del camino desde su sitio), PULL lo fuerte que tira el muelle y
// DRAG el rozamiento (con este, frena sin rebotar: se nota pesado, con resistencia). Y
// hasta dónde puede irse, en partes de medio recuadro.
const FOLLOW = 0.6;
const PULL = 4;
const DRAG = 4.4;
const ROAM = 0.85;

// El agujero que crece: cuánto por segundo mientras se mantiene pulsado (1 = su tamaño
// cada segundo), hasta cuánto (veces su tamaño) y lo que tarda en volver al soltar (s).
const GROW = 0.9;
const GROW_MAX = 5;
const SHRINK = 0.35;

// La luz: hacia dónde está (radianes), cuánto la mueve el ratón (de un lado al otro del
// recuadro) y lo que tarda en seguirlo (segundos).
const LIGHT = 0.8;
const LIGHT_REACH = 1.6;
const LIGHT_EASE = 0.4;

const canvas = document.querySelector('[data-sunburst]');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(BACKGROUND);

const scene = new THREE.Scene();
// Cámara ortográfica: sin perspectiva, todo plano.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
// La mitad del ancho y del alto de lo que se ve (en radios).
const half = { width: 1, height: 1 };

// El tamaño del recuadro manda: la cámara ve el lado corto a FILL y el largo, lo que toque.
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const short = 1 / FILL;
  half.width = w < h ? short : (short * w) / h;
  half.height = w < h ? (short * h) / w : short;
  camera.left = -half.width;
  camera.right = half.width;
  camera.top = half.height;
  camera.bottom = -half.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// Los modos, en orden. El primero es el de siempre (sin # en la dirección).
// «wire», siempre el último. (Los nombres de antes, en castellano, siguen valiendo.)
const MODES = ['folds', 'flat', 'tunnel', 'wire'];
const OLD_NAMES = { pliegues: 'folds', plano: 'flat', tunel: 'tunnel' };
let mode = MODES[0];

// El túnel: uno para siempre (no tiene nada al azar), escondido salvo en su modo.
const tunnel = createTunnel({ paper: '#e9e6df', ink: '#111111' });
scene.add(tunnel.object);

// Lo que se ve en cada modo: el túnel, o los rayos con su metal.
// En wire, además, el papel gris claro de fondo y la ficha con los números.
const notes = document.querySelector('[data-notes]');
function showMode() {
  tunnel.object.visible = mode === 'tunnel';
  sun.object.visible = mode !== 'tunnel';
  sun.setLook(mode);
  renderer.setClearColor(mode === 'wire' ? WIRE_PAPER : BACKGROUND);
  if (notes) notes.hidden = mode !== 'wire';
}

// La ficha del modo wire: qué es esto y con qué números funciona.
if (notes) {
  const rows = [
    'SUNBURST · WIRE',
    `${INFO.count} BANDAS · FILL ${INFO.fill}`,
    `ESPIRAL LOG. · TWIST ${INFO.twist}`,
    `ZIGZAG ${INFO.zigs}/R · ZAG ${INFO.zag} RAD`,
    `AGUJERO ${INFO.hole} · MUELLE + ROZAMIENTO`,
    'SHADER: TORNEADO + FACETAS',
    'VERTIK.NET',
  ];
  notes.innerHTML = rows.map((row) => `<div>${row}</div>`).join('');
}

// El sol: sus rayos y, al azar, dónde está su agujero.
let sun = null;
let offset = { x: 0, y: 0 };
// Dónde está el agujero ahora y a qué velocidad va (en partes de medio recuadro).
const hole = { x: 0, y: 0, vx: 0, vy: 0 };
function newSun() {
  if (sun) {
    scene.remove(sun.object);
    sun.dispose();
  }
  sun = createRays({ background: BACKGROUND });
  const random = () => (Math.random() * 2 - 1) * OFFSET;
  offset = { x: random(), y: random() };
  // El sol nuevo aparece en su sitio, quieto, y en el modo que esté puesto.
  Object.assign(hole, { x: offset.x, y: offset.y, vx: 0, vy: 0 });
  scene.add(sun.object);
  showMode();
}
newSun();

// Dónde está el cursor en el recuadro (de -1 a 1 en cada eje; arriba, 1), o null si no
// está encima. El agujero lo sigue con su muelle, y la luz, con su lado a lado (pointerX).
let pointerX = 0;
let pointer = null;
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer = { x: pointerX, y: 1 - ((e.clientY - rect.top) / rect.height) * 2 };
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
});

// Mientras se mantiene pulsado (el ratón o el dedo, dentro del recuadro), el agujero crece.
let pressed = false;
canvas.addEventListener('pointerdown', (e) => {
  if (e.isPrimary) pressed = true;
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  canvas.addEventListener(type, () => {
    pressed = false;
  });
}
let holeSize = 1;

// Doble clic o doble toque: un sol nuevo. Lo detectamos a mano (dos toques en menos de
// 300 ms y a menos de 30 px): en el móvil, el «dblclick» del navegador no llega siempre.
let lastTap = { time: 0, x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return;
  const now = performance.now();
  const close = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
  if (now - lastTap.time < 300 && close) {
    newSun();
    lastTap = { time: 0, x: 0, y: 0 };
  } else {
    lastTap = { time: now, x: e.clientX, y: e.clientY };
  }
});

// Cambiar de modo: el metal, y la dirección (sin llenar el historial).
function setMode(name) {
  name = OLD_NAMES[name] ?? name;
  mode = MODES.includes(name) ? name : MODES[0];
  showMode();
  const hash = mode === MODES[0] ? '' : `#${mode}`;
  if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
}
const stepMode = (by) => setMode(MODES[(MODES.indexOf(mode) + by + MODES.length) % MODES.length]);
document.querySelector('[data-mode-prev]')?.addEventListener('click', () => stepMode(-1));
document.querySelector('[data-mode-next]')?.addEventListener('click', () => stepMode(1));
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  stepMode(e.key === 'ArrowLeft' ? -1 : 1);
});
const fromHash = () => setMode(decodeURIComponent(location.hash.slice(1)));
window.addEventListener('hashchange', fromHash);
fromHash();

// Cada fotograma: gira, la luz se acerca a donde apunta el ratón, y se pinta.
let time = 0;
let angle = 0;
let light = LIGHT;
let last = performance.now();
renderer.setAnimationLoop((now) => {
  // Si la pestaña estuvo escondida, dt sería enorme: lo limitamos.
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  time += dt;
  angle += spinAt(time) * dt;
  light += (LIGHT - pointerX * LIGHT_REACH - light) * Math.min(1, dt / LIGHT_EASE);
  // El agujero: el muelle tira de él hacia su objetivo (un trozo del camino hacia el
  // cursor, o su sitio si no hay cursor) y el rozamiento lo frena.
  const goal = pointer ? { x: offset.x + (pointer.x - offset.x) * FOLLOW, y: offset.y + (pointer.y - offset.y) * FOLLOW } : offset;
  for (const axis of ['x', 'y']) {
    const target = Math.max(-ROAM, Math.min(ROAM, goal[axis]));
    const v = `v${axis}`;
    hole[v] += (PULL * (target - hole[axis]) - DRAG * hole[v]) * dt;
    hole[axis] += hole[v] * dt;
  }
  sun.object.position.set(hole.x * half.width, hole.y * half.height, 0);
  // Pulsado, crece a ritmo constante; suelto, vuelve a su tamaño, deprisa al principio.
  holeSize = pressed ? Math.min(GROW_MAX, holeSize + GROW * dt) : holeSize + (1 - holeSize) * Math.min(1, dt / SHRINK);
  sun.setHoleSize(holeSize);
  sun.update(angle, light);
  tunnel.update(dt, half, sun.object.position.x, sun.object.position.y, HOLE * holeSize);
  renderer.render(scene, camera);
});
