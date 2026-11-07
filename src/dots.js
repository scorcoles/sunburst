// =========================================================================================
// El modo dots: un paisaje dibujado con puntos
// =========================================================================================
//
// Sobre un rosa intenso, un terreno en 3D hecho solo de puntos negros, visto en ángulo:
//   - el EMBUDO del agujero: anillos concéntricos que se hunden hacia el centro (por el
//     ángulo salen como elipses apiladas) y caen sin parar hacia el agujero; hacia fuera,
//     los puntos se esparcen hasta desaparecer, como un punteado a mano;
//   - dos o tres MONTAÑAS con cráter, en sitios al azar: el terreno sube con ellas, y cada
//     una lleva además sus propios anillos apilados, del borde de la falda al del cráter.
//     Con el doble toque, un paisaje nuevo (main.js llama a «regenerate»);
//   - ONDAS: cada toque o clic lanza una onda que recorre la superficie desde ese punto,
//     como una piedra en el agua; varias a la vez se cruzan;
//   - el CURSOR levanta un bulto suave en el terreno, que lo sigue.
//
// Todo lo mueve un shader. Cada punto sabe de qué es (del embudo o de una montaña), en qué
// anillo está («u») y en qué ángulo. Su sitio en el plano sale de ahí, y su altura es la
// suma de todo: el embudo, las montañas, las ondas y el bulto del cursor. Así los anillos
// del embudo también suben al pasar por una montaña, y las ondas mueven todos los puntos.

import * as THREE from 'three';
import { HOLE } from './rays.js';

// El embudo: hasta dónde llegan sus anillos (en radios: el recuadro mide unos 1,4 de
// alto), cuántos hay, lo hondo que es y lo que caen los anillos por segundo (en partes del
// camino entero).
const OUTER = 5;
const RINGS = 70;
const DEPTH = 1.1;
const FALL = 0.012;
// Lo separados que van los puntos en cada anillo (en radios).
const SPACING = 0.03;
// El tamaño de cada punto (píxeles, a la distancia del plano) y cuánto se desvían de su
// anillo (en partes de su radio): un punteado, no una máquina.
const SIZE = 2.6;
const JITTER = 0.005;
// Lo inclinado que está, para verlo en ángulo (radianes; el de arriba, más lejos).
export const DOTS_TILT = -1.0;

// Las montañas: cuántas (entre y), a qué distancia del agujero, lo anchas (radio de la
// falda) y lo altas que son, el cráter (en partes de su radio) y cuántos anillos llevan.
const MOUNTAINS = [2, 3];
const MOUNTAIN_DISTANCE = [1.2, 2.8];
const MOUNTAIN_RADIUS = [0.45, 0.8];
const MOUNTAIN_HEIGHT = [0.45, 0.85];
const CRATER = 0.28;
const MOUNTAIN_RINGS = 22;
const MAX_MOUNTAINS = 3;

// Las ondas: cuántas a la vez como mucho, lo deprisa que se abren (radios por segundo),
// lo que tardan en apagarse (segundos), su altura y lo ancho de su frente.
const MAX_RIPPLES = 6;
const RIPPLE_SPEED = 1.4;
const RIPPLE_LIFE = 3;
const RIPPLE_HEIGHT = 0.22;
const RIPPLE_WIDTH = 0.35;

// El bulto del cursor: su altura, lo ancho que es (radios) y lo que tarda en aparecer o
// irse (segundos).
const BUMP_HEIGHT = 0.35;
const BUMP_WIDTH = 0.45;
const BUMP_EASE = 0.25;

function random(a, b) {
  return a + Math.random() * (b - a);
}

// Las montañas de un paisaje nuevo: repartidas alrededor del agujero, sin pisarse.
function newMountains() {
  const count = Math.round(random(...MOUNTAINS));
  const start = Math.random() * Math.PI * 2;
  return Array.from({ length: MAX_MOUNTAINS }, (_, k) => {
    if (k >= count) return new THREE.Vector4(0, 0, 0, 1);
    const a = start + (k / count) * Math.PI * 2 + random(-0.4, 0.4);
    const d = random(...MOUNTAIN_DISTANCE);
    return new THREE.Vector4(Math.cos(a) * d, Math.sin(a) * d, random(...MOUNTAIN_HEIGHT), random(...MOUNTAIN_RADIUS));
  });
}

export function createDots({ ink }) {
  // Por cada punto: de qué es (-1, el embudo; 0, 1, 2, la montaña de ese número), su
  // anillo, su ángulo, un número al azar (para cuáles se ven) y su desvío.
  const owners = [];
  const us = [];
  const angles = [];
  const seeds = [];
  const jitters = [];

  function ring(owner, u, r) {
    const count = Math.max(24, Math.round((Math.PI * 2 * r) / SPACING));
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      owners.push(owner);
      us.push(u);
      angles.push(start + (i / count) * Math.PI * 2);
      seeds.push(Math.random());
      jitters.push((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    }
  }

  // El embudo: los anillos, más juntos cerca del agujero (cada uno, un tanto por ciento
  // más grande que el anterior).
  for (let k = 0; k < RINGS; k++) ring(-1, k / RINGS, HOLE * (OUTER / HOLE) ** (k / RINGS));
  // Las montañas: sus anillos (del cráter a la falda), para la más grande posible; las más
  // pequeñas los encogen en el shader.
  for (let m = 0; m < MAX_MOUNTAINS; m++) {
    for (let k = 0; k < MOUNTAIN_RINGS; k++) ring(m, k / (MOUNTAIN_RINGS - 1), MOUNTAIN_RADIUS[1] * (CRATER + (1 - CRATER) * (k / (MOUNTAIN_RINGS - 1))));
  }

  const geometry = new THREE.BufferGeometry();
  // (La posición la calcula el shader; Three.js necesita igualmente un atributo «position».)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(us.length * 3), 3));
  geometry.setAttribute('owner', new THREE.Float32BufferAttribute(owners, 1));
  geometry.setAttribute('u', new THREE.Float32BufferAttribute(us, 1));
  geometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('jitter', new THREE.Float32BufferAttribute(jitters, 2));

  const uniforms = {
    ink: { value: new THREE.Color(ink) },
    phase: { value: 0 },
    pixelRatio: { value: 1 },
    distance: { value: 10 },
    // Cada montaña: x, y (en el plano), altura y radio (altura 0: no hay).
    mountains: { value: newMountains() },
    // Cada onda: x, y, su edad (segundos; muy grande: apagada) y su fuerza.
    ripples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 1e3, 0)) },
    // El bulto del cursor: x, y y su altura ahora (0: no está).
    bump: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float owner;
      attribute float u;
      attribute float angle;
      attribute float seed;
      attribute vec2 jitter;
      uniform float phase;
      uniform float pixelRatio;
      uniform float distance;
      uniform vec4 mountains[${MAX_MOUNTAINS}];
      uniform vec4 ripples[${MAX_RIPPLES}];
      uniform vec3 bump;
      varying float vKeep;

      // La altura de una montaña con cráter a una distancia d de su centro: sube desde la
      // falda hasta el borde del cráter y, dentro, baja un poco (el cráter).
      float mountain(vec4 m, vec2 p) {
        float s = length(p - m.xy) / m.w;
        if (s >= 1.0) return 0.0;
        float rise = pow(1.0 - max(s - ${CRATER.toFixed(2)}, 0.0) / ${(1 - CRATER).toFixed(2)}, 1.6);
        float crater = mix(0.65, 1.0, smoothstep(0.0, ${CRATER.toFixed(2)}, s));
        return m.z * rise * crater;
      }

      // La altura del terreno en un punto del plano: el embudo, las montañas, las ondas y
      // el bulto del cursor.
      float height(vec2 p) {
        float r = max(length(p), ${HOLE.toFixed(3)});
        float z = -${DEPTH.toFixed(2)} * ${HOLE.toFixed(3)} / r;
        for (int i = 0; i < ${MAX_MOUNTAINS}; i++) z += mountain(mountains[i], p);
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 w = ripples[i];
          float front = length(p - w.xy) - w.z * ${RIPPLE_SPEED.toFixed(2)};
          float fade = exp(-w.z * ${(3 / RIPPLE_LIFE).toFixed(3)}) * w.w;
          z += ${RIPPLE_HEIGHT.toFixed(3)} * fade * exp(-pow(front / ${RIPPLE_WIDTH.toFixed(2)}, 2.0)) * cos(front * 14.0);
        }
        z += bump.z * exp(-pow(length(p - bump.xy) / ${BUMP_WIDTH.toFixed(2)}, 2.0));
        return z;
      }

      void main() {
        vec2 p;
        float keep;
        if (owner < 0.0) {
          // El embudo: el anillo cae hacia el agujero con el tiempo y vuelve a empezar por
          // fuera; hacia fuera, cada vez menos puntos (el punteado se deshace).
          float uu = fract(u - phase);
          float r = ${HOLE.toFixed(3)} * pow(${(OUTER / HOLE).toFixed(3)}, uu);
          p = vec2(cos(angle), sin(angle)) * r + jitter * r * ${JITTER.toFixed(3)};
          keep = (1.0 - smoothstep(0.55, 1.0, uu)) * smoothstep(0.0, 0.03, uu);
        } else {
          // Una montaña: su anillo, del cráter a la falda, a su tamaño. Hacia la falda,
          // menos puntos (se funde con el terreno). Si no hay montaña, ninguno.
          vec4 m = mountains[int(owner)];
          float r = m.w * (${CRATER.toFixed(2)} + ${(1 - CRATER).toFixed(2)} * u);
          p = m.xy + vec2(cos(angle), sin(angle)) * r + jitter * 0.004;
          keep = step(0.001, m.z) * (1.0 - 0.7 * smoothstep(0.5, 1.0, u));
        }
        vec4 view = modelViewMatrix * vec4(p, height(p), 1.0);
        gl_Position = projectionMatrix * view;
        // Más cerca, un pelo más grandes.
        gl_PointSize = ${SIZE.toFixed(1)} * pixelRatio * distance / -view.z;
        vKeep = step(seed, keep);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      varying float vKeep;
      void main() {
        // Redondos: lo que cae fuera del círculo no se pinta.
        if (vKeep < 0.5 || length(gl_PointCoord - 0.5) > 0.5) discard;
        gl_FragColor = vec4(ink, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  // «spin» gira en su plano; «object», que lo contiene, va donde el agujero y se inclina.
  const spin = new THREE.Points(geometry, material);
  spin.frustumCulled = false;
  const object = new THREE.Group();
  object.add(spin);
  object.visible = false;

  let phase = 0;
  let nextRipple = 0;
  // El bulto: dónde quiere estar y cuánto está ahora (de 0 a 1).
  let bumpAt = null;
  let bumpLevel = 0;

  // Dónde cae un punto de la pantalla (x, y de -1 a 1) sobre el plano del terreno, en sus
  // coordenadas (las de «spin»). Null si no cae (mirando de canto).
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const hit = new THREE.Vector3();
  function toPlane(x, y, camera) {
    spin.updateWorldMatrix(true, false);
    normal.set(0, 0, 1).transformDirection(spin.matrixWorld);
    origin.setFromMatrixPosition(spin.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, origin);
    raycaster.setFromCamera({ x, y }, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    spin.worldToLocal(hit);
    return { x: hit.x, y: hit.y };
  }

  // Un toque en (x, y) de la pantalla: una onda desde ahí (reemplaza a la más vieja).
  function ripple(x, y, camera) {
    const at = toPlane(x, y, camera);
    if (!at) return;
    uniforms.ripples.value[nextRipple].set(at.x, at.y, 0, 1);
    nextRipple = (nextRipple + 1) % MAX_RIPPLES;
  }

  // Dónde está el cursor (x, y de la pantalla), o null si no está: el bulto lo sigue.
  function setCursor(x, y, camera) {
    bumpAt = x === null ? null : toPlane(x, y, camera);
  }

  // Cada fotograma (main.js): el avance, el giro, la densidad de píxeles y lo lejos que está
  // la cámara (para el tamaño de los puntos).
  function update(dt, angle, pixelRatio, distance) {
    phase = (phase + FALL * dt) % 1;
    uniforms.phase.value = phase;
    uniforms.pixelRatio.value = pixelRatio;
    uniforms.distance.value = distance;
    spin.rotation.z = angle;
    for (const w of uniforms.ripples.value) w.z += dt;
    bumpLevel += ((bumpAt ? 1 : 0) - bumpLevel) * Math.min(1, dt / BUMP_EASE);
    if (bumpAt) uniforms.bump.value.set(bumpAt.x, bumpAt.y, bumpLevel * BUMP_HEIGHT);
    else uniforms.bump.value.z = bumpLevel * BUMP_HEIGHT;
  }

  // Un paisaje nuevo: otras montañas, y sin ondas.
  function regenerate() {
    uniforms.mountains.value = newMountains();
    for (const w of uniforms.ripples.value) w.set(0, 0, 1e3, 0);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { object, update, ripple, setCursor, regenerate, dispose };
}
