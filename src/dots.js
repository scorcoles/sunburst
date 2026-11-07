// =========================================================================================
// El modo dots: el embudo, dibujado con puntos
// =========================================================================================
//
// Sobre un rosa intenso, el agujero como un embudo en 3D hecho solo de puntos negros:
// anillos concéntricos que se hunden hacia el centro, vistos en ángulo (por eso salen como
// elipses apiladas). Los anillos caen sin parar hacia el agujero, y hacia fuera los puntos
// se van esparciendo hasta desaparecer, como un punteado a mano.
//
// Todo lo mueve un shader: cada punto sabe en qué anillo está («u», de 0 en el agujero a
// 1 en el borde de fuera) y en qué ángulo. Con el tiempo, u baja (cae hacia el agujero) y,
// al llegar a 0, vuelve a empezar por fuera. Su radio y su profundidad salen de u.

import * as THREE from 'three';
import { HOLE } from './rays.js';

// Hasta dónde llegan los anillos (en radios: el recuadro mide unos 1,4 de alto) y cuántos
// hay entre el agujero y el borde.
const OUTER = 5;
const RINGS = 70;
// Lo separados que van los puntos en cada anillo (en radios), lo hondo que es el embudo y
// lo que caen los anillos por segundo (en partes del camino entero).
const SPACING = 0.03;
const DEPTH = 1.1;
const FALL = 0.012;
// El tamaño de cada punto (píxeles, a la distancia del plano) y cuánto se desvían de su
// anillo (en partes de su radio): un punteado, no una máquina.
const SIZE = 2.6;
const JITTER = 0.005;
// Lo inclinado que está, para verlo en ángulo (radianes; el de arriba, más lejos).
export const DOTS_TILT = -1.0;

export function createDots({ ink }) {
  const us = [];
  const angles = [];
  const seeds = [];
  const jitters = [];

  for (let k = 0; k < RINGS; k++) {
    const u = k / RINGS;
    // Los anillos, más juntos cerca del agujero (cada uno, un tanto por ciento más grande
    // que el anterior), como en un embudo de verdad.
    const r = HOLE * (OUTER / HOLE) ** u;
    const count = Math.max(24, Math.round((Math.PI * 2 * r) / SPACING));
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      us.push(u);
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

  const uniforms = {
    ink: { value: new THREE.Color(ink) },
    phase: { value: 0 },
    pixelRatio: { value: 1 },
    distance: { value: 10 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float u;
      attribute float angle;
      attribute float seed;
      attribute vec2 jitter;
      uniform float phase;
      uniform float pixelRatio;
      uniform float distance;
      varying float vKeep;
      void main() {
        // El anillo cae hacia el agujero con el tiempo, y vuelve a empezar por fuera.
        float uu = fract(u - phase);
        float r = ${HOLE.toFixed(3)} * pow(${(OUTER / HOLE).toFixed(3)}, uu);
        // El embudo: hondo junto al agujero, plano lejos.
        float z = -${DEPTH.toFixed(2)} * ${HOLE.toFixed(3)} / r;
        vec3 p = vec3(cos(angle) * r, sin(angle) * r, z);
        p.xy += jitter * r * ${JITTER.toFixed(3)};
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        // Más cerca, un pelo más grandes.
        gl_PointSize = ${SIZE.toFixed(1)} * pixelRatio * distance / -view.z;
        // Cuántos puntos se quedan: casi todos cerca del agujero; hacia fuera, cada vez
        // menos (el punteado se deshace). Y al nacer por fuera, poco a poco.
        vKeep = step(seed, (1.0 - smoothstep(0.55, 1.0, uu)) * smoothstep(0.0, 0.03, uu));
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

  // Cada fotograma (main.js): el avance, el giro, la densidad de píxeles y lo lejos que está
  // la cámara (para el tamaño de los puntos).
  function update(dt, angle, pixelRatio, distance) {
    phase = (phase + FALL * dt) % 1;
    uniforms.phase.value = phase;
    uniforms.pixelRatio.value = pixelRatio;
    uniforms.distance.value = distance;
    spin.rotation.z = angle;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { object, update, dispose };
}
