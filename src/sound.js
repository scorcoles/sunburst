// =========================================================================================
// El sonido: una nave a la deriva
// =========================================================================================
//
// Todo se genera aquí, con la Web Audio API: no hay archivos de audio. Distinto del de
// vortik (que es un grave de disco y scratches): esto suena a metal y a espacio.
//   - el ZUMBIDO: dos ondas en diente de sierra, a una quinta, un pelo desafinadas, por un
//     filtro resonante que se abre y se cierra despacio, como si respirara. Debajo, una
//     onda pura una octava más grave. Como la sala de máquinas de una nave;
//   - el BRILLO: tres notas agudas en las proporciones de una campana de metal (1, 2,76 y
//     5,40: no son armónicos, por eso suena a metal y no a instrumento), muy bajas. Laten
//     cada vez que una banda pasa por la franja de luz (main.js le pasa el giro): el ritmo
//     lo marca lo que se ve;
//   - de vez en cuando, o un GOLPE de metal (las mismas proporciones, con una nota grave al
//     azar, que se apaga en unos segundos, como un casco que cruje) o ESTÁTICA de radio
//     (ruido filtrado que se corta y vuelve, como una transmisión perdida), cada uno en un
//     sitio distinto entre los dos altavoces;
//   - al mover el cursor deprisa, un SOPLO: ruido por un filtro que sube y baja, en el
//     altavoz del lado del cursor;
//   - el AGUJERO manda en el tono: subirlo o bajarlo sube o baja todo (hasta 3 semitonos),
//     llevarlo a un lado o al otro lo hace más brillante o más apagado; y con el zoom
//     (manteniendo pulsado), todo baja y se cierra, como tragado.
//
// Los navegadores no dejan sonar nada sin que se toque algo: empieza con el botón de arriba.

// El zumbido: su nota (Hz), la quinta, y cuánto se desafinan (céntimos).
const HUM = 55;
const FIFTH = 1.5;
const DETUNE = 7;

// El filtro del zumbido: por dónde corta (Hz), lo resonante que es, y su respiración (una
// vuelta cada BREATH segundos, abriendo y cerrando BREATH_DEPTH Hz).
const FILTER = 320;
const RESONANCE = 7;
const BREATH = 11;
const BREATH_DEPTH = 140;

// El brillo: la nota de la campana (Hz), sus proporciones y su volumen.
const BELL = 330;
const BELL_RATIOS = [1, 2.76, 5.4];
const SHIMMER = 0.035;
// Cuántas bandas hay (rays.js): el brillo late una vez por banda que pasa.
const BANDS = 28;

// Lo que cambia con el agujero (de -1 a 1 en cada eje): el tono, hasta PLACE_PITCH
// céntimos arriba o abajo; el filtro, hasta PLACE_FILTER octavas. Y con el zoom: por cada
// vez su tamaño, el tono baja GROW_PITCH céntimos y el filtro se cierra en proporción.
const PLACE_PITCH = 300;
const PLACE_FILTER = 1;
const GROW_PITCH = 200;

// Volumen general, y lo que tarda en entrar y en irse (segundos).
const VOLUME = 0.4;
const FADE = 2;

// Cada cuánto sale un golpe o un trozo de estática (segundos), y su volumen.
const EVENT_EVERY = [6, 15];
const CLANK_VOLUME = 0.22;
const STATIC_VOLUME = 0.06;

// El soplo del cursor: lo deprisa que tiene que ir (recuadros por segundo), lo menos que
// pasa entre uno y el siguiente (segundos) y su volumen.
const WHOOSH_SPEED = 1.5;
const WHOOSH_GAP = 1.2;
const WHOOSH_VOLUME = 0.12;

function random(a, b) {
  return a + Math.random() * (b - a);
}

export function createSound() {
  let ctx = null;
  let master = null;
  // Todo pasa por aquí antes del volumen general.
  let bed = null;
  let noise = null;
  // Lo que cambia con el agujero: las ondas del zumbido y del brillo, y el filtro.
  const tuned = [];
  let lowpass = null;
  let shimmer = null;
  let on = false;
  let timer = 0;
  let lastWhoosh = 0;

  // Monta el zumbido y el brillo y los deja sonando (con el volumen general a 0).
  function build() {
    ctx = new AudioContext();

    // El volumen general y, antes de los altavoces, un compresor: que nada sature.
    master = ctx.createGain();
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor).connect(ctx.destination);
    bed = ctx.createGain();
    bed.connect(master);

    // El filtro resonante y su respiración.
    lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = FILTER;
    lowpass.Q.value = RESONANCE;
    const breath = ctx.createOscillator();
    breath.frequency.value = 1 / BREATH;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = BREATH_DEPTH;
    breath.connect(breathDepth).connect(lowpass.frequency);
    breath.start();
    lowpass.connect(bed);

    // El zumbido: la nota y la quinta en diente de sierra, cada una desafinada hacia un
    // lado; y la octava de abajo, pura. (El desafinado va en la frecuencia: «detune» lo
    // usa el agujero.)
    for (const [frequency, type, gain] of [
      [HUM * 2 ** (-DETUNE / 1200), 'sawtooth', 0.16],
      [HUM * FIFTH * 2 ** (DETUNE / 1200), 'sawtooth', 0.1],
      [HUM / 2, 'sine', 0.5],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;
      const level = ctx.createGain();
      level.gain.value = gain;
      osc.connect(level).connect(lowpass);
      osc.start();
      tuned.push(osc);
    }

    // El brillo: las tres notas de la campana, juntas en un volumen que late con el giro.
    shimmer = ctx.createGain();
    shimmer.gain.value = 0;
    shimmer.connect(bed);
    BELL_RATIOS.forEach((ratio, k) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = BELL * ratio;
      const level = ctx.createGain();
      level.gain.value = 1 / (k + 1);
      osc.connect(level).connect(shimmer);
      osc.start();
      tuned.push(osc);
    });

    // Un segundo de ruido blanco, para la estática y el soplo.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // La salida de algo que suena en un sitio entre los dos altavoces (-1 izquierda, 1
  // derecha).
  function panned(pan) {
    const side = ctx.createStereoPanner();
    side.pan.value = pan;
    side.connect(bed);
    return side;
  }

  // Un golpe de metal: las proporciones de la campana sobre una nota grave al azar, cada
  // una apagándose a su ritmo (las agudas, antes).
  function clank() {
    const now = ctx.currentTime;
    const base = random(70, 160);
    const out = panned(random(-0.8, 0.8));
    [1, 2.76, 5.4, 8.93].forEach((ratio, k) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = base * ratio;
      const level = ctx.createGain();
      const decay = random(1.5, 3.5) / (k + 1);
      level.gain.setValueAtTime(0, now);
      level.gain.linearRampToValueAtTime(CLANK_VOLUME / (k + 1), now + 0.004);
      level.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(level).connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    });
  }

  // Estática de radio: ruido por un filtro estrecho en los agudos, que se corta y vuelve a
  // trozos al azar, durante un segundo más o menos.
  function radio() {
    const now = ctx.currentTime;
    const length = random(0.6, 1.4);
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = random(900, 2600);
    band.Q.value = 4;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, now);
    for (let t = 0; t < length; t += random(0.03, 0.12)) {
      level.gain.setValueAtTime(Math.random() < 0.6 ? STATIC_VOLUME * random(0.4, 1) : 0, now + t);
    }
    level.gain.setValueAtTime(0, now + length);
    source.connect(band).connect(level).connect(panned(random(-0.9, 0.9)));
    source.start(now, random(0, 0.9));
    source.stop(now + length + 0.05);
  }

  // Un soplo: ruido por un filtro que sube y vuelve a bajar, en el lado del cursor.
  function whoosh(strength, pan) {
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.5;
    band.frequency.setValueAtTime(300, now);
    band.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
    band.frequency.exponentialRampToValueAtTime(400, now + 0.5);
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(WHOOSH_VOLUME * strength, now + 0.12);
    level.gain.linearRampToValueAtTime(0, now + 0.5);
    source.connect(band).connect(level).connect(panned(pan));
    source.start(now, random(0, 0.9));
    source.stop(now + 0.55);
  }

  // El siguiente golpe o trozo de estática, dentro de unos segundos al azar.
  function schedule() {
    timer = setTimeout(() => {
      if (!on) return;
      if (Math.random() < 0.55) clank();
      else radio();
      schedule();
    }, random(...EVENT_EVERY) * 1000);
  }

  function start() {
    if (!ctx) build();
    ctx.resume();
    on = true;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(VOLUME, now + FADE);
    schedule();
  }

  function stop() {
    on = false;
    clearTimeout(timer);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + FADE / 2);
    // Cuando ya no suena, a dormir: que no gaste.
    setTimeout(() => !on && ctx.suspend(), (FADE / 2) * 1000 + 100);
  }

  // Cada fotograma, con lo deprisa que va el cursor (recuadros por segundo) y en qué lado
  // está (-1 a 1): si va deprisa, un soplo (como mucho uno cada WHOOSH_GAP segundos).
  function update(speed, pan = 0) {
    if (!on) return;
    const now = ctx.currentTime;
    if (speed > WHOOSH_SPEED && now - lastWhoosh > WHOOSH_GAP) {
      lastWhoosh = now;
      whoosh(Math.min(1, speed / (WHOOSH_SPEED * 2)), Math.max(-1, Math.min(1, pan)));
    }
  }

  // Cada fotograma, con dónde está el agujero (de -1 a 1 en cada eje), su tamaño (1 = el
  // de siempre) y el giro (radianes): el tono, el filtro y el latido del brillo. Con una
  // transición muy corta (setTargetAtTime), para que no dé saltos de un fotograma a otro.
  function setShape(x, y, size = 1, angle = 0) {
    if (!on) return;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const now = ctx.currentTime;
    const cents = clamp(y) * PLACE_PITCH - (size - 1) * GROW_PITCH;
    for (const osc of tuned) osc.detune.setTargetAtTime(cents, now, 0.1);
    lowpass.frequency.setTargetAtTime((FILTER * 2 ** (clamp(x) * PLACE_FILTER)) / size, now, 0.1);
    // El brillo: más fuerte cuando una banda está justo en la franja de luz.
    const pass = Math.pow(0.5 + 0.5 * Math.cos(angle * BANDS), 3);
    shimmer.gain.setTargetAtTime((SHIMMER * (0.25 + 0.75 * pass)) / size, now, 0.03);
  }

  return {
    toggle: () => (on ? stop() : start(), on),
    update,
    setShape,
  };
}
