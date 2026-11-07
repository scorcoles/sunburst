// =========================================================================================
// Sunburst: un sol de rayos metálicos que gira alrededor de un agujero
// =========================================================================================
//
// Un experimento de VERTIK, en homenaje a la portada de «Death in Space» (2021). Todo es un
// plano, como un cartel: arriba el símbolo y una línea; en medio, el recuadro con los
// rayos; abajo, el pie entre dos líneas.
//
//   rays.js  → las bandas, su metal (un shader) y el agujero
//   main.js  → el escenario, el giro, la luz y el doble toque (este archivo)
//
// El agujero cae en un sitio al azar del recuadro; con doble clic o doble toque, sale un
// sol nuevo (otro sitio, otros destellos). Mover el ratón o el dedo mueve la luz.

import * as THREE from 'three';
import { createRays } from './rays.js';
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

// El sol: sus rayos y, al azar, dónde está su agujero.
let sun = null;
let offset = { x: 0, y: 0 };
function newSun() {
  if (sun) {
    scene.remove(sun.object);
    sun.dispose();
  }
  sun = createRays({ background: BACKGROUND });
  const random = () => (Math.random() * 2 - 1) * OFFSET;
  offset = { x: random(), y: random() };
  scene.add(sun.object);
}
newSun();

// La luz sigue al ratón o al dedo (de lado a lado: -1 a 1), sin prisa.
let pointerX = 0;
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
});

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
  sun.object.position.set(offset.x * half.width, offset.y * half.height, 0);
  sun.update(angle, light);
  renderer.render(scene, camera);
});
