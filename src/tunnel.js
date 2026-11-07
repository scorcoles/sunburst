// =========================================================================================
// El modo túnel: anillos que caen hacia el agujero
// =========================================================================================
//
// Anillos negros y blancos, uno dentro de otro, como en la portada de «Dead Flag
// Contracts»: los de fuera, casi concéntricos y quietos; solo los más cercanos al agujero
// se desplazan hacia él, cada vez más cuanto más cerca, y eso dibuja un embudo en
// perspectiva, un túnel. Al mover el agujero, los anillos no lo siguen a la vez: cuanto
// más lejos, más tarde (como si cada uno recordara dónde estaba el agujero un momento
// antes), así que por delante del movimiento se apretujan y por detrás se abren, como el
// efecto Doppler. Los anillos fluyen hacia dentro, como tragados. Encima, el
// desgaste de una impresión vieja: motas blancas en el negro, fijas en el papel, que con
// el zoom se quedan casi quietas, como un fondo estrellado a lo lejos.
//
// Todo lo pinta un shader sobre un rectángulo que llena el recuadro. Los anillos son una
// familia de círculos: el de «t = 0» es el agujero y el de «t = 1» el borde de fuera. El
// radio crece en línea recta, de uno a otro. El centro es el del borde de fuera, más un
// tirón hacia el agujero que solo notan los de dentro:
//     radio(t) = r₀ + t · (r₁ − r₀)
//     centro(t) = fuera + (agujero(t) − fuera) · (1 − t / PULL_REACH)^1,2   (0 más allá)
// donde agujero(t) es dónde estaba el agujero hace t · LAG segundos (el retraso). Para cada
// píxel p buscamos su t: el círculo que pasa justo por p, |p − centro(t)| = radio(t). Ya no
// es una ecuación que se resuelva de una vez: la buscamos partiendo el intervalo por la
// mitad unas cuantas veces (bisección). Con t, el color sale solo: franjas alternas, tantas
// como RINGS entre el agujero y el borde. Y dentro del agujero: negro.

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
// El centro de los anillos de fuera: quieto, un poco por encima del centro del recuadro
// (en partes de medio lado corto): así el agujero queda al fondo de un embudo visto desde
// arriba.
const LIFT = 1.3;
// Hasta qué anillo llega el tirón del agujero (en partes del camino: 0,55 = los de dentro,
// cada vez menos; los de fuera, quietos; si el agujero se aleja mucho, más, para que los
// anillos no se crucen) y el retraso de los de fuera al mover el agujero (segundos
// por cada camino entero: el efecto Doppler).
const PULL_REACH = 0.55;
const LAG = 1.4;

export function createTunnel({ paper, ink }) {
  const uniforms = {
    hole: { value: new THREE.Vector2() },
    // A qué velocidad se mueve el agujero (para el retraso de los anillos).
    holeVelocity: { value: new THREE.Vector2() },
    // Hasta qué anillo llega el tirón (lo calcula «update»).
    pullReach: { value: PULL_REACH },
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
      uniform vec2 holeVelocity;
      uniform float pullReach;
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

      // El centro del anillo t: el de fuera, más el tirón hacia el agujero (dónde estaba hace
      // t · LAG segundos), que solo notan los de dentro.
      vec2 centerOf(float t) {
        float pull = pow(max(1.0 - t / pullReach, 0.0), 1.2);
        vec2 then = hole - holeVelocity * t * ${LAG.toFixed(2)};
        return outer + (then - outer) * pull;
      }

      // Lo lejos que está este píxel del anillo t: positivo, fuera de él; negativo, dentro.
      float ringGap(float t) {
        return length(vWorld - centerOf(t)) - (holeRadius + t * (outerRadius - holeRadius));
      }

      void main() {
        // Su t, por bisección: f(t) = |p − centro(t)| − radio(t) es positivo en el agujero
        // (t = 0, si el píxel está fuera de él) y negativo lejos; buscamos dónde se hace 0.
        float lo = 0.0;
        float hi = 1.3;
        for (int i = 0; i < 20; i++) {
          float mid = 0.5 * (lo + hi);
          if (ringGap(mid) > 0.0) lo = mid; else hi = mid;
        }
        float t = 0.5 * (lo + hi);
        // C < 0: dentro del agujero.
        float C = ringGap(0.0);

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
  // «velocityX, velocityY»: a qué velocidad se mueve el agujero (para el retraso).
  function update(dt, half, holeX, holeY, zoom = 1, shortSide = REFERENCE, velocityX = 0, velocityY = 0) {
    phase += FLOW * dt;
    // (Un poco más grande que el recuadro: al inclinarse, que no se vean sus bordes.)
    object.scale.set(half.width * 1.5, half.height * 1.5, 1);
    uniforms.hole.value.set(holeX, holeY);
    uniforms.holeVelocity.value.set(velocityX, velocityY);
    uniforms.holeRadius.value = HOLE * zoom;
    // El centro de fuera, quieto (con el zoom, se aleja del agujero en esa proporción). La
    // subida, con el lado corto: en una pantalla alta, con la altura, sería exagerada.
    const outerX = 0;
    const outerY = Math.min(half.width, half.height) * LIFT;
    uniforms.outer.value.set(holeX + (outerX - holeX) * zoom, holeY + (outerY - holeY) * zoom);
    // Que los anillos no se crucen: el centro no puede moverse de un anillo al siguiente más
    // de lo que crece su radio. Junto al agujero, el centro cambia 1,2 · d / alcance por
    // cada t (d: lo lejos que está el agujero del centro de fuera, contando el retraso), y
    // el radio, r₁ − r₀. Si el agujero está muy lejos, el tirón llega más lejos (más suave).
    const reachOut = Math.hypot(half.width, half.height) * 1.6 - HOLE;
    const away = Math.hypot(outerX - holeX, outerY - holeY) + Math.hypot(velocityX, velocityY) * LAG;
    uniforms.pullReach.value = Math.max(PULL_REACH, (1.2 * away) / (0.85 * reachOut));
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
