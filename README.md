# sunburst

Un sol de rayos de metal que gira alrededor de un agujero negro. Un experimento de [VERTIK](https://www.vertik.net), en homenaje a la portada de *Death in Space* (2021).

Demo: [scorcoles.github.io/sunburst](https://scorcoles.github.io/sunburst/) · En la web: [vertik.net/sunburst](https://www.vertik.net/sunburst/)

- Todo es un plano, como un cartel: arriba el símbolo; en medio, los rayos; abajo, el pie entre dos líneas.
- 28 bandas que salen del agujero, se tuercen en espiral y se quiebran en zigzag, todas en paralelo, hasta salirse del recuadro.
- El metal es un shader propio: una franja de brillo fija por la que pasan las bandas al girar, una faceta distinta en cada tramo del zigzag (cada una destella a su hora), un cepillado fino y un punto irisado en los brillos.
- Cuatro modos (← Prev · Next → en el pie, las flechas del teclado o `#flat`, `#tunnel`, `#wire` en la dirección): **folds**, cada tramo del zigzag una faceta que destella a su hora; **flat**, todas las bandas recortadas de una sola lámina de metal, con un brillo y un arcoíris que la cruzan en línea recta; **tunnel**, sin rayos: anillos blancos y negros que caen hacia el agujero como un embudo, con motas blancas en el negro, como una impresión vieja; y **wire**, para ver cómo está hecho: contornos, guías y los números, en gris y negro.
- Con el ratón pulsado o el dedo puesto, todo se acerca: un zoom con el centro en el agujero; al soltar, vuelve.
- Al seguir al cursor, el plano se inclina hacia donde va (con muy poca perspectiva: quieto, se ve plano).
- Sonido (el altavoz de arriba): una nave a la deriva. Un zumbido de máquina, un brillo de metal que late cada vez que una banda pasa por la luz, golpes de metal y estática de radio de vez en cuando, y un soplo al mover el cursor deprisa. El agujero cambia el tono; con el zoom, todo baja. Y compartir: una foto del cartel.
- El agujero sigue al cursor, con pereza: tarda en arrancar, no llega del todo y frena sin rebotar; si el cursor se va, se queda donde esté. Con el dedo, casi sin resistencia. El cursor también mueve la luz. Doble clic o doble toque: un sol nuevo, con el agujero en otro sitio.

## Cómo está hecho

[Three.js](https://threejs.org) y [Vite](https://vite.dev).

| Archivo | Qué hace |
| --- | --- |
| `index.html` · `style.css` | La página: el cartel (cabecera, recuadro y pie). |
| `src/main.js` | El escenario (cámara con muy poca perspectiva), el giro, la luz y el doble toque. |
| `src/rays.js` | Las bandas, el shader del metal, el agujero y lo del modo wire. |
| `src/tunnel.js` | El modo tunnel: los anillos, con su shader. |
| `src/sound.js` · `src/share.js` | El sonido y compartir. |

```sh
npm install
npm run dev     # para trabajar
npm run build   # dist/sunburst.js y dist/sunburst.css, para la web de VERTIK
```
