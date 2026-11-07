# sunburst

Un sol de rayos de metal que gira alrededor de un agujero negro. Un experimento de [VERTIK](https://www.vertik.net), en homenaje a la portada de *Death in Space* (2021).

Demo: [scorcoles.github.io/sunburst](https://scorcoles.github.io/sunburst/) · En la web: [vertik.net/sunburst](https://www.vertik.net/sunburst/)

- Todo es un plano, como un cartel: arriba el símbolo y una línea; en medio, los rayos; abajo, el pie entre dos líneas.
- 28 bandas que salen del agujero, se tuercen en espiral y se quiebran en zigzag, todas en paralelo, hasta salirse del recuadro.
- El metal es un shader propio: una franja de brillo fija por la que pasan las bandas al girar, una faceta distinta en cada tramo del zigzag (cada una destella a su hora), un cepillado fino y un punto irisado en los brillos.
- El cursor mueve la luz. Doble clic o doble toque: un sol nuevo, con el agujero en otro sitio.

## Cómo está hecho

[Three.js](https://threejs.org) y [Vite](https://vite.dev).

| Archivo | Qué hace |
| --- | --- |
| `index.html` · `style.css` | La página: el cartel (cabecera, recuadro y pie). |
| `src/main.js` | El escenario (cámara ortográfica), el giro, la luz y el doble toque. |
| `src/rays.js` | Las bandas, el shader del metal y el agujero. |

```sh
npm install
npm run dev     # para trabajar
npm run build   # dist/sunburst.js y dist/sunburst.css, para la web de VERTIK
```
