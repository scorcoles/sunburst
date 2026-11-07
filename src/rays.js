// =========================================================================================
// Los rayos: bandas planas de metal que salen de un agujero
// =========================================================================================
//
// Todo es un plano, como la portada de un libro: unas bandas que salen del agujero, se
// tuercen un poco en espiral y se quiebran en zigzag, todas en paralelo (no se cruzan
// nunca), hasta salirse del recuadro. Su anchura es un ángulo fijo, así que se ensanchan
// hacia fuera, como los rayos de un sol.
//
// Cada banda es una tira de triángulos: a cada radio, dos puntos, uno a cada lado de su
// línea central.
//
// El color, METÁLICO (un shader propio, abajo): como un disco de aluminio torneado, la luz
// se refleja en una franja que no se mueve de la pantalla, y las bandas, al girar, pasan
// por ella y se encienden. Cada tramo del zigzag es una «faceta» con su propia
// inclinación, como un papel metalizado doblado: cada una destella en un momento distinto
// del giro. Encima, un cepillado finísimo (rayitas a lo largo de la banda) y un punto
// irisado en los brillos.
//
// Eso es el modo «folds». En el modo «flat», sin facetas ni torneado: todas las bandas
// están recortadas de UNA lámina de metal plana. La luz es un degradado que cruza la
// pantalla en línea recta, con su arcoíris, y la lámina gira por debajo: las bandas entran
// y salen del brillo todas a la vez, como un solo plano.
//
// Y el modo «wire», para ver cómo está hecho (como el de vertikis: gris y negro, sobre
// papel gris claro): las bandas, solo con su contorno; y fijas, en discontinua, las guías:
// el radio 1 (donde la espiral deja de torcerse), los anillos donde se quiebra el zigzag,
// el borde del agujero y una cruz en su centro.

import * as THREE from 'three';

// Una vuelta entera, en radianes.
const TAU = Math.PI * 2;

// Las medidas, en «radios»: el agujero mide HOLE, y la espiral y el zigzag se dibujan
// sobre un radio de 1 (más allá siguen igual).
export const HOLE = 0.25;
const RADIUS = 1;

// Cuántas bandas, y qué parte de su hueco ocupa cada una (el resto, negro entre medias).
const COUNT = 28;
const FILL = 0.55;
// Los colores del modo wire: el papel y la línea.
export const WIRE_PAPER = '#eeeeee';
const WIRE_LINE = '#333333';

// Cuánto se tuercen en espiral (0 = rectas).
const TWIST = 0.48;
// El zigzag: cuántos quiebros por cada radio de largo, y cuánto se desvía (radianes).
const ZIGS = 2;
const ZAG = 0.09;
// Hasta dónde llegan (en radios): más allá de cualquier esquina del recuadro, aunque el
// agujero esté desplazado y la pantalla sea muy apaisada.
const REACH = 7;
// Cuántos tramos tiene cada banda por cada radio de largo (más = quiebros más limpios).
const STEPS = 64;

// La espiral: cada vez que el radio se reduce a la mitad, la banda gira el mismo ángulo
// (una espiral logarítmica, la de las galaxias y los desagües). Pasado el radio 1, recta.
function spiralAngle(r) {
  return TWIST * Math.log(RADIUS / Math.min(r, RADIUS));
}

// El zigzag: un triángulo que va de 0 a 1 y vuelve. Va con el radio (no con el largo de
// cada banda): así todas se quiebran en los mismos anillos.
function zigzag(u) {
  const x = (u * ZIGS) % 2;
  return x < 1 ? x : 2 - x;
}

// Los números, para la ficha del modo wire (main.js).
export const INFO = { count: COUNT, fill: FILL, twist: TWIST, zigs: ZIGS, zag: ZAG, hole: HOLE };

// Una línea discontinua: un círculo de radio r, o una lista de puntos.
const dashed = new THREE.LineDashedMaterial({ color: WIRE_LINE, dashSize: 0.025, gapSize: 0.025 });
function circle(r, material, segments = 128) {
  const points = Array.from({ length: segments }, (_, k) => {
    const a = (k / segments) * TAU;
    return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0.02);
  });
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
  line.computeLineDistances();
  return line;
}

export function createRays({ background }) {
  const slot = TAU / COUNT;
  const half = (slot * FILL) / 2;
  const positions = [];
  // La inclinación de la faceta de cada punto (radianes): una al azar por banda, y otra
  // distinta en cada tramo del zigzag.
  const facets = [];
  const index = [];
  // El contorno de cada banda, para el modo wire: sus dos bordes, tramo a tramo.
  const edges = [];

  for (let k = 0; k < COUNT; k++) {
    const base = k * slot;
    const tilt = Math.random() * Math.PI;
    const first = positions.length / 3;
    const steps = STEPS * REACH;

    for (let s = 0; s <= steps; s++) {
      // Desde un pelo dentro del agujero (que lo tapa) hasta fuera del recuadro.
      const r = HOLE * 0.95 + (REACH - HOLE * 0.95) * (s / steps);
      const u = (r - HOLE) / (RADIUS - HOLE);
      const a = base + spiralAngle(r) + ZAG * zigzag(u);
      // De un tramo al siguiente, la faceta gira: así cada tramo brilla a su hora.
      const facet = tilt + Math.floor(u * ZIGS) * 1.1;
      for (const side of [-1, 1]) {
        const b = a + side * half;
        positions.push(r * Math.cos(b), r * Math.sin(b), 0);
        facets.push(facet);
      }
      if (s > 0) {
        const p = first + (s - 1) * 2;
        index.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
        edges.push(p, p + 2, p + 1, p + 3);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('facet', new THREE.Float32BufferAttribute(facets, 1));
  geometry.setIndex(index);

  // El metal. «paint»: su color. «center»: dónde está el agujero en la pantalla. «light»:
  // hacia dónde está la luz (un ángulo).
  const uniforms = {
    paint: { value: new THREE.Color('#ece8df') },
    center: { value: new THREE.Vector2() },
    light: { value: 0.8 },
    // 1 = folds (cada tramo, una faceta); 0 = flat (una sola lámina).
    folds: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    // Los triángulos de las bandas no van todos en el mismo sentido: que se pinten por las
    // dos caras.
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float facet;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vFacet;
      void main() {
        vFacet = facet;
        vLocal = position.xy;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 paint;
      uniform vec2 center;
      uniform float light;
      uniform float folds;
      varying vec3 vWorld;
      varying vec2 vLocal;
      varying float vFacet;

      // Un número al azar (pero siempre el mismo) para cada valor de x.
      float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }

      void main() {
        // Dónde está este punto alrededor del agujero, en la pantalla (no gira) y en la
        // banda (gira con ella).
        vec2 d = vWorld.xy - center;
        float screen = atan(d.y, d.x);
        float r = length(d);
        float local = atan(vLocal.y, vLocal.x);

        // El torneado: una franja de brillo que cruza el agujero (dos lóbulos opuestos,
        // como en un CD), fija en la pantalla, y un brillo más suave a 90°.
        float sheen = pow(abs(cos(screen - light)), 18.0);
        float soft = pow(abs(sin(screen - light)), 4.0) * 0.25;
        // El destello de cada faceta: cuando su inclinación y la luz se alinean, al girar.
        float glint = pow(max(cos(2.0 * (screen - light) + vFacet), 0.0), 30.0);
        // El cepillado: rayitas a lo largo de la banda, cada una un pelo más clara u oscura.
        float brush = hash(floor(local * 900.0)) - 0.5;

        float shade = 0.32 + 0.55 * sheen + soft + 0.8 * glint + 0.1 * brush;
        // El punto irisado: un arcoíris que cambia con el ángulo y la distancia, solo en
        // los brillos.
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (screen / 3.1416 + r * 0.25 + vec3(0.0, 0.33, 0.67)));
        vec3 folded = paint * shade;
        folded = mix(folded, rainbow * (shade + 0.2), 0.35 * clamp(sheen + glint, 0.0, 1.0));

        // El plano: «along», dónde está el punto a lo largo de la dirección de la luz, en
        // la pantalla (en línea recta, no alrededor del agujero). El brillo, una franja
        // ancha y suave que cruza la pantalla; el arcoíris, bandas paralelas a ella. El
        // cepillado, rayitas rectas y paralelas sobre la lámina (giran con ella).
        vec2 toward = vec2(cos(light), sin(light));
        float along = dot(vWorld.xy, toward);
        float flatSheen = pow(0.5 + 0.5 * cos(along * 1.4), 5.0);
        float flatBrush = hash(floor(vLocal.x * 260.0)) - 0.5;
        float flatShade = 0.34 + 0.62 * flatSheen + 0.07 * flatBrush;
        vec3 flatRainbow = 0.5 + 0.5 * cos(6.2831 * (along * 0.3 + vec3(0.0, 0.33, 0.67)));
        vec3 plane = mix(paint * flatShade, flatRainbow * (flatShade + 0.15), 0.25 + 0.3 * flatSheen);

        gl_FragColor = vec4(mix(plane, folded, folds), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  // «spin»: las bandas, que giran. El agujero, fuera de «spin» (no hace falta que gire):
  // un círculo del color del fondo, encima de todo.
  const spin = new THREE.Mesh(geometry, material);
  spin.frustumCulled = false;
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(HOLE, 128),
    new THREE.MeshBasicMaterial({ color: background }),
  );
  hole.position.z = 0.01;

  // El modo wire. El contorno de las bandas: los mismos puntos, unidos con líneas, y girando
  // con ellas (dentro de «spin»).
  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute('position', geometry.getAttribute('position'));
  outlineGeometry.setIndex(edges);
  const outline = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: WIRE_LINE }));
  outline.frustumCulled = false;
  outline.visible = false;
  spin.add(outline);
  // Las guías, que no giran: el radio 1, los anillos del zigzag (hasta bien fuera del
  // recuadro), y en el agujero (crecen con él), su borde y una cruz.
  const guides = new THREE.Group();
  guides.add(circle(RADIUS, dashed));
  for (let k = 1; k <= ZIGS * 6; k++) if (k !== ZIGS) guides.add(circle(HOLE + (k * (RADIUS - HOLE)) / ZIGS, dashed));
  const holeLine = new THREE.LineBasicMaterial({ color: WIRE_LINE });
  hole.add(circle(HOLE, holeLine));
  const cross = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(
      [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([x, y]) => new THREE.Vector3(x * HOLE * 0.3, y * HOLE * 0.3, 0.02)),
    ),
    holeLine,
  );
  hole.add(cross);
  const wireParts = [guides, ...hole.children];
  for (const part of wireParts) part.visible = false;

  const object = new THREE.Group();
  object.add(spin, hole, guides);

  // Cada fotograma (main.js): el giro y hacia dónde está la luz.
  function update(angle, light) {
    spin.rotation.z = angle;
    uniforms.center.value.set(object.position.x, object.position.y);
    uniforms.light.value = light;
  }

  // Para tirarlo (al crear uno nuevo): libera lo que ocupa en la tarjeta gráfica.
  function dispose() {
    object.traverse((child) => {
      child.geometry?.dispose();
      if (child.material !== dashed) child.material?.dispose();
    });
  }

  // El modo: «folds» (cada tramo, una faceta), «flat» (una sola lámina) o «wire» (el
  // contorno y las guías, sobre el papel).
  function setLook(look) {
    const wire = look === 'wire';
    uniforms.folds.value = look === 'folds' ? 1 : 0;
    material.visible = !wire;
    outline.visible = wire;
    for (const part of wireParts) part.visible = wire;
    hole.material.color.set(wire ? WIRE_PAPER : background);
  }

  return { object, update, setLook, dispose };
}
