// =========================================================================================
// El modo dots: un pozo de gravedad dibujado con puntos
// =========================================================================================
//
// Sobre un rosa intenso, una tela de puntos negros vista en ángulo, con un solo agujero:
//   - el POZO: anillos concéntricos que se hunden cada vez más deprisa hacia el centro (por
//     el ángulo salen como elipses apiladas) y, al llegar al agujero, la tela se pliega
//     sobre sí misma hacia abajo, en una garganta estrecha por la que los anillos caen hasta
//     perderse. Los anillos no paran de caer; hacia fuera, los puntos se esparcen hasta
//     desaparecer, como un punteado a mano;
//   - lo que ALTERAMOS al pasar: el cursor es una masa pequeña que hunde la tela donde está
//     y atrae hacia sí los puntos de alrededor; al moverse, deja una estela de ondas
//     (main.js las lanza); y cada toque o clic lanza una onda grande, como una piedra en el
//     agua. Varias ondas a la vez se cruzan.
//
// Cada anillo tiene su densidad: unos muy marcados, otros tenues. Así se puede seguir uno
// con la vista mientras se encoge y el pozo se lo traga (si todos fueran iguales, uno
// ocuparía el sitio del otro y parecería quieto).
//
// Todo lo mueve un shader. Cada punto sabe en qué anillo está («u», de 0 al fondo de la
// garganta a 1 en el borde de fuera) y en qué ángulo; con el tiempo, u baja (cae) y, al
// llegar al fondo, vuelve a empezar por fuera. De ahí salen su radio y su altura, y luego
// se suman las ondas y lo que hace el cursor.

import * as THREE from 'three';
import { HOLE } from './rays.js';

// La tela: hasta dónde llegan sus anillos (en radios: el recuadro mide unos 1,4 de alto),
// cuántos hay, lo hondo que es el pozo a la altura del agujero, y lo que caen los anillos
// por segundo (en partes del camino entero).
const OUTER = 5;
const RINGS = 80;
const DEPTH = 0.9;
const FALL = 0.04;
// La garganta: qué parte de los anillos está en ella (los de más abajo), lo estrecha que
// llega a ser (en partes del agujero) y lo que baja.
const THROAT = 0.14;
const NARROW = 0.55;
const THROAT_DEPTH = 1.4;
// Lo separados que van los puntos en cada anillo (en radios).
const SPACING = 0.03;
// El tamaño de cada punto (píxeles, a la distancia del plano) y cuánto se desvían de su
// anillo (en partes de su radio): un punteado, no una máquina.
const SIZE = 2.6;
const JITTER = 0.005;
// Qué parte del giro de los otros modos gira aquí (poco: lo que manda es la caída).
const SPIN_SHARE = 0.15;
// Lo inclinado que está, para verlo en ángulo (radianes; el de arriba, más lejos).
export const DOTS_TILT = -1.0;

// Las ondas: cuántas a la vez como mucho, lo deprisa que se abren (radios por segundo),
// lo que tardan en apagarse (segundos), su altura (la de un toque; la estela, menos) y lo
// ancho de su frente.
const MAX_RIPPLES = 10;
const RIPPLE_SPEED = 1.4;
const RIPPLE_LIFE = 3;
const RIPPLE_HEIGHT = 0.22;
const RIPPLE_WIDTH = 0.35;

// La masa del cursor: lo que hunde la tela, lo ancho de su hoyo (radios), lo que atrae los
// puntos de alrededor (en partes de su distancia) y lo que tarda en aparecer o irse (s).
const MASS_DEPTH = 0.1;
const MASS_WIDTH = 0.5;
const MASS_PULL = 0.08;
const MASS_EASE = 0.25;

export function createDots({ ink }) {
  // Por cada punto: su anillo, su ángulo, un número al azar (para cuáles se ven) y su desvío.
  const us = [];
  const angles = [];
  const seeds = [];
  const jitters = [];
  // La densidad del anillo de cada punto (de 0 a 1).
  const weights = [];

  // Los anillos, en partes iguales del camino; el radio de cada uno lo pone el shader.
  for (let k = 0; k < RINGS; k++) {
    const u = k / RINGS;
    // Cuántos puntos: los que caben en el anillo más grande que llega a ser (fuera de la
    // garganta, crece; lo hacemos para su tamaño de fuera).
    const r = HOLE * (OUTER / HOLE) ** Math.max(0, (u - THROAT) / (1 - THROAT));
    const count = Math.max(24, Math.round((Math.PI * 2 * Math.max(r, HOLE)) / SPACING));
    const start = Math.random() * Math.PI * 2;
    // Uno de cada pocos, muy marcado; el resto, entre tenue y normal.
    const weight = Math.random() < 0.18 ? 1 : 0.25 + Math.random() * 0.4;
    for (let i = 0; i < count; i++) {
      us.push(u);
      weights.push(weight);
      angles.push(start + (i / count) * Math.PI * 2);
      seeds.push(Math.random());
      jitters.push((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  // (La posición la calcula el shader; Three.js necesita igualmente un atributo «position».)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(us.length * 3), 3));
  geometry.setAttribute('u', new THREE.Float32BufferAttribute(us, 1));
  geometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('jitter', new THREE.Float32BufferAttribute(jitters, 2));
  geometry.setAttribute('weight', new THREE.Float32BufferAttribute(weights, 1));

  const uniforms = {
    ink: { value: new THREE.Color(ink) },
    phase: { value: 0 },
    pixelRatio: { value: 1 },
    distance: { value: 10 },
    // Cada onda: x, y, su edad (segundos; muy grande: apagada) y su fuerza.
    ripples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 1e3, 0)) },
    // La masa del cursor: x, y y cuánto está (0: no está; 1: del todo).
    mass: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float u;
      attribute float angle;
      attribute float seed;
      attribute vec2 jitter;
      attribute float weight;
      uniform float phase;
      uniform float pixelRatio;
      uniform float distance;
      uniform vec4 ripples[${MAX_RIPPLES}];
      uniform vec3 mass;
      varying float vKeep;

      // El pozo, fuera de la garganta: cada vez más hondo cuanto más cerca del agujero.
      float well(float r) {
        return -${DEPTH.toFixed(2)} * pow(${HOLE.toFixed(3)} / r, 1.4);
      }

      void main() {
        // El anillo cae con el tiempo y vuelve a empezar por fuera.
        float uu = fract(u - phase);
        float r;
        float z;
        if (uu < ${THROAT.toFixed(2)}) {
          // La garganta: la tela se pliega hacia abajo, estrechándose, hasta perderse.
          float t = uu / ${THROAT.toFixed(2)};
          r = ${HOLE.toFixed(3)} * mix(${NARROW.toFixed(2)}, 1.0, t * t);
          z = well(${HOLE.toFixed(3)}) - (1.0 - t) * ${THROAT_DEPTH.toFixed(2)};
        } else {
          r = ${HOLE.toFixed(3)} * pow(${(OUTER / HOLE).toFixed(3)}, (uu - ${THROAT.toFixed(2)}) / ${(1 - THROAT).toFixed(2)});
          z = well(r);
        }
        vec2 p = vec2(cos(angle), sin(angle)) * r + jitter * r * ${JITTER.toFixed(3)};

        // La masa del cursor: atrae los puntos de alrededor y hunde la tela donde está.
        vec2 toMass = mass.xy - p;
        float near = exp(-dot(toMass, toMass) / ${(MASS_WIDTH * MASS_WIDTH).toFixed(3)}) * mass.z;
        p += toMass * near * ${MASS_PULL.toFixed(2)};
        z -= near * ${MASS_DEPTH.toFixed(2)};

        // Las ondas.
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 w = ripples[i];
          float front = length(p - w.xy) - w.z * ${RIPPLE_SPEED.toFixed(2)};
          float fade = exp(-w.z * ${(3 / RIPPLE_LIFE).toFixed(3)}) * w.w;
          z += ${RIPPLE_HEIGHT.toFixed(3)} * fade * exp(-pow(front / ${RIPPLE_WIDTH.toFixed(2)}, 2.0)) * cos(front * 14.0);
        }

        vec4 view = modelViewMatrix * vec4(p, z, 1.0);
        gl_Position = projectionMatrix * view;
        // Más cerca, un pelo más grandes.
        gl_PointSize = ${SIZE.toFixed(1)} * pixelRatio * distance / -view.z;
        // Cuántos puntos se quedan: hacia fuera, cada vez menos (el punteado se deshace);
        // al fondo de la garganta, también (se pierde); y al nacer por fuera, poco a poco.
        float keep = weight * (1.0 - smoothstep(0.55, 1.0, uu)) * smoothstep(0.0, ${THROAT.toFixed(2)}, uu);
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
  // La masa: dónde quiere estar y cuánto está ahora (de 0 a 1).
  let massAt = null;
  let massLevel = 0;

  // Dónde cae un punto de la pantalla (x, y de -1 a 1) sobre el plano de la tela, en sus
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

  // Una onda desde (x, y) de la pantalla, con su fuerza (1, la de un toque; la estela, menos).
  // Reemplaza a la más vieja.
  function ripple(x, y, camera, strength = 1) {
    const at = toPlane(x, y, camera);
    if (!at) return;
    uniforms.ripples.value[nextRipple].set(at.x, at.y, 0, strength);
    nextRipple = (nextRipple + 1) % MAX_RIPPLES;
  }

  // Dónde está el cursor (x, y de la pantalla), o null si no está: la masa lo sigue.
  function setCursor(x, y, camera) {
    massAt = x === null ? null : toPlane(x, y, camera);
  }

  // Cada fotograma (main.js): el avance, el giro, la densidad de píxeles y lo lejos que está
  // la cámara (para el tamaño de los puntos).
  function update(dt, angle, pixelRatio, distance) {
    phase = (phase + FALL * dt) % 1;
    uniforms.phase.value = phase;
    uniforms.pixelRatio.value = pixelRatio;
    uniforms.distance.value = distance;
    // Gira, pero mucho menos que los rayos: aquí lo que se tiene que ver es la caída.
    spin.rotation.z = angle * SPIN_SHARE;
    for (const w of uniforms.ripples.value) w.z += dt;
    massLevel += ((massAt ? 1 : 0) - massLevel) * Math.min(1, dt / MASS_EASE);
    if (massAt) uniforms.mass.value.set(massAt.x, massAt.y, massLevel);
    else uniforms.mass.value.z = massLevel;
  }

  // Al empezar de nuevo (doble toque): sin ondas.
  function regenerate() {
    for (const w of uniforms.ripples.value) w.set(0, 0, 1e3, 0);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { object, update, ripple, setCursor, regenerate, dispose };
}
