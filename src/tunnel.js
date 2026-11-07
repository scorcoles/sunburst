// =========================================================================================
// El modo túnel: anillos que caen hacia el agujero
// =========================================================================================
//
// Anillos negros y blancos, uno dentro de otro, pero no concéntricos: cada uno tiene el
// centro un poco más cerca del agujero que el anterior, y eso dibuja un embudo en
// perspectiva, un túnel. Los anillos fluyen hacia dentro, como tragados. Encima, el
// desgaste de una impresión vieja: motas blancas en el negro, fijas en el papel, que con
// el zoom se quedan casi quietas, como un fondo estrellado a lo lejos.
//
// Todo lo pinta un shader sobre un rectángulo que llena el recuadro. Los anillos son una
// familia de círculos: el de «t = 0» es el agujero y el de «t = 1» el borde de fuera; entre
// medias, centro y radio van de uno a otro en línea recta:
//     centro(t) = agujero + t · (fuera − agujero)      radio(t) = r₀ + t · (r₁ − r₀)
// Para cada píxel p buscamos su t: el círculo que pasa justo por p. Es decir,
// |p − centro(t)| = radio(t), que elevado al cuadrado es una ecuación de segundo grado en
// t. Con t, el color sale solo: franjas alternas, tantas como RINGS entre el agujero y el
// borde. Y t < 0 es dentro del agujero: negro.

import * as THREE from 'three';
import { HOLE } from './rays.js';

// Cuántos anillos hay del agujero al borde de fuera (no hace falta que sea entero: 23,6
// = las bandas un 10 % más anchas que con 26), y lo que avanzan hacia dentro por segundo
// (en anillos).
const RINGS = 23.6;
// En pantallas pequeñas, menos anillos (más anchos): RINGS es para un recuadro con el lado
// corto de REFERENCE píxeles o más; por debajo, en proporción, hasta FEWEST veces RINGS.
const REFERENCE = 650;
const FEWEST = 0.6;
const FLOW = 0.35;
// Lo fino que es el grano de las motas blancas (más = motas más pequeñas).
const GRAIN = 150;
// Cuánto se acerca el grano con el zoom (0 = nada, quieto como estrellas al fondo; 1 = como
// el túnel).
const STARS_DEPTH = 0.06;
// La perspectiva del embudo: cuánto se va el centro del borde de fuera al lado contrario
// del agujero (en proporción a lo que se aleja el agujero del centro) y cuánto sube (en
// partes de medio lado corto del recuadro).
const LEAN = 0.5;
const LIFT = 0.8;

export function createTunnel({ paper, ink }) {
  const uniforms = {
    hole: { value: new THREE.Vector2() },
    holeRadius: { value: 0.25 },
    outer: { value: new THREE.Vector2() },
    outerRadius: { value: 3 },
    phase: { value: 0 },
    zoom: { value: 1 },
    rings: { value: RINGS },
    paper: { value: new THREE.Color(paper) },
    ink: { value: new THREE.Color(ink) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 hole;
      uniform float holeRadius;
      uniform vec2 outer;
      uniform float outerRadius;
      uniform float phase;
      uniform float zoom;
      uniform float rings;
      uniform vec3 paper;
      uniform vec3 ink;
      varying vec2 vWorld;

      // Ruido: un número al azar por cada punto de una rejilla, y entre medias, suave.
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        // Su t: la ecuación A·t² + B·t + C = 0 (ver arriba). Como los anillos de fuera
        // crecen más deprisa de lo que se mueve su centro, A es negativo y hay una raíz
        // positiva (fuera del agujero) y otra negativa: nos quedamos con la buena.
        vec2 b = outer - hole;
        float dr = outerRadius - holeRadius;
        vec2 q = vWorld - hole;
        float A = dot(b, b) - dr * dr;
        float B = -2.0 * (dot(q, b) + holeRadius * dr);
        float C = dot(q, q) - holeRadius * holeRadius;
        float t = (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);

        // Las franjas: medio anillo negro, medio blanco, avanzando hacia dentro con
        // «phase». El borde, suavizado lo justo para que no salgan dientes (fwidth: cuánto
        // cambia de un píxel al de al lado).
        float x = t * rings + phase;
        float w = fwidth(x);
        float stripe = smoothstep(0.5 - w, 0.5 + w, abs(fract(x) - 0.5) * 2.0);
        float black = 1.0 - stripe;
        // Dentro del agujero, negro.
        black = max(black, step(C, 0.0));

        // El desgaste, fijo en el papel: solo en el negro, motas blancas, como tinta que no
        // ha llegado a agarrar. El blanco queda limpio. (Y fuera del agujero: dentro, negro
        // limpio.)
        // El grano es como un fondo estrellado muy lejos: con el zoom casi no se acerca (un
        // pelo, STARS_DEPTH, para que se note que está detrás), mientras el túnel sí.
        vec2 uv = hole + (vWorld - hole) / (1.0 + (zoom - 1.0) * ${STARS_DEPTH.toFixed(2)});
        // (GRAIN: lo fino que es el grano; más = motas más pequeñas.)
        float specks = step(0.88, noise(uv * ${GRAIN.toFixed(1)} + 11.0)) * step(0.66, noise(uv * 3.5 + 7.0));
        float outside = step(0.0, C);
        black = mix(black, 0.0, specks * black * outside);
        vec3 color = mix(paper, ink, black);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  // Un rectángulo de 2 × 2 que se estira para llenar el recuadro (update).
  const object = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  object.frustumCulled = false;
  object.visible = false;

  let phase = 0;

  // Cada fotograma (main.js): el tamaño del recuadro, dónde está el agujero y cuánto mide,
  // y el avance de los anillos. El borde de fuera, tan grande como para llegar a las
  // esquinas, con el centro por encima del agujero y hacia el lado contrario: así el
  // agujero queda al fondo de un embudo que se ve desde arriba, y el túnel se dobla cuando
  // el agujero se mueve.
  // «zoom»: cuánto se acerca todo, con el centro en el agujero (1 = nada): el agujero y el
  // borde de fuera crecen, y el centro de fuera se aleja del agujero, en esa proporción.
  // «shortSide»: el lado corto del recuadro, en píxeles (para cuántos anillos caben).
  function update(dt, half, holeX, holeY, zoom = 1, shortSide = REFERENCE) {
    phase += FLOW * dt;
    // (Un poco más grande que el recuadro: al inclinarse, que no se vean sus bordes.)
    object.scale.set(half.width * 1.5, half.height * 1.5, 1);
    uniforms.hole.value.set(holeX, holeY);
    uniforms.holeRadius.value = HOLE * zoom;
    const outerX = -holeX * LEAN;
    // (La subida, con el lado corto: en una pantalla alta, con la altura, sería exagerada.)
    const outerY = -holeY * LEAN + Math.min(half.width, half.height) * LIFT;
    uniforms.outer.value.set(holeX + (outerX - holeX) * zoom, holeY + (outerY - holeY) * zoom);
    uniforms.outerRadius.value = Math.hypot(half.width, half.height) * 1.6 * zoom;
    uniforms.zoom.value = zoom;
    uniforms.rings.value = RINGS * Math.min(1, Math.max(FEWEST, shortSide / REFERENCE));
    uniforms.phase.value = phase;
  }

  function dispose() {
    object.geometry.dispose();
    material.dispose();
  }

  return { object, update, dispose };
}
