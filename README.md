# sunburst

Un sol de rayos de metal que gira alrededor de un agujero negro. Un experimento de [VERTIK](https://www.vertik.net), en homenaje a la portada de *Death in Space* (2021).

Demo: [scorcoles.github.io/sunburst](https://scorcoles.github.io/sunburst/) · En la web: [vertik.net/sunburst](https://www.vertik.net/sunburst/)

- Todo es un plano, como un cartel: arriba el símbolo; en medio, los rayos; abajo, el pie entre dos líneas.
- 28 bandas que salen del agujero, se tuercen en espiral y se quiebran en zigzag, todas en paralelo, hasta salirse del recuadro.
- El metal es un shader propio: una franja de brillo fija por la que pasan las bandas al girar, una faceta distinta en cada tramo del zigzag (cada una destella a su hora), un cepillado fino y un punto irisado en los brillos.
- Cuatro modos (← Prev · Next → en el pie, las flechas del teclado o `#flat`, `#tunnel`, `#wire` en la dirección): **folds**, cada tramo del zigzag una faceta que destella a su hora; **flat**, todas las bandas recortadas de una sola lámina de metal, con un brillo y un arcoíris que la cruzan en línea recta; **tunnel**, sin rayos: anillos blancos y negros que caen hacia el agujero como un embudo, con el desgaste de una impresión vieja; y **wire**, para ver cómo está hecho: contornos, guías y los números, en gris y negro.
- Con el ratón pulsado o el dedo puesto, el agujero crece y se traga los rayos; al soltar, vuelve a su tamaño.
- El agujero sigue al cursor, con pereza: tarda en arrancar, no llega del todo y frena sin rebotar; si el cursor se va, vuelve a su sitio. El cursor también mueve la luz. Doble clic o doble toque: un sol nuevo, con el agujero en otro sitio.

## Cómo está hecho

[Three.js](https://threejs.org) y [Vite](https://vite.dev).

| Archivo | Qué hace |
| --- | --- |
| `index.html` · `style.css` | La página: el cartel (cabecera, recuadro y pie). |
| `src/main.js` | El escenario (cámara ortográfica), el giro, la luz y el doble toque. |
| `src/rays.js` | Las bandas, el shader del metal, el agujero y lo del modo wire. |
| `src/tunnel.js` | El modo tunnel: los anillos, con su shader. |

```sh
npm install
npm run dev     # para trabajar
npm run build   # dist/sunburst.js y dist/sunburst.css, para la web de VERTIK
```
