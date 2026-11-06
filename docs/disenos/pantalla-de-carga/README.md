# Pantalla de carga: lo que está en producción y lo que se guardó

La pantalla que se ve al abrir la app mientras se comprueba la sesión (regla 87
de `CLAUDE.md`). Salió de un lienzo con siete propuestas (6 nov 2026):
https://claude.ai/artifact/HoBrU9KgYJznpVXcvaNsiN

| Propuesta | Estado | Dónde |
|---|---|---|
| **G · Monumental** — la «A» enorme saliéndose por la derecha, el logotipo abajo a la izquierda | **En producción** | `app/components/auth/PantallaCarga.tsx` y sus animaciones en `app/pantalla-carga.css` |
| **A · Emblema** — la «A» con un anillo dorado que gira, un destello y el logotipo debajo | Guardada, sin usar | [`a-emblema.html`](a-emblema.html) |
| **E · Claro** — fondo hueso, la «A» en un icono marino, el nombre en texto | Guardada, sin usar | [`e-claro.html`](e-claro.html) |

Las dos guardadas se abren en el navegador desde el repo: cogen la «A» y el
logotipo de `public/marca/`, los mismos ficheros que usa la G. Sírvelas desde
la raíz del repo (`python3 -m http.server` y abrir
`http://localhost:8000/docs/disenos/pantalla-de-carga/a-emblema.html`): con
doble clic (`file://`) el navegador no deja cargar la máscara y el destello no
se ve.

## Cambiar a la A o a la E

Basta con reescribir `PantallaCarga.tsx` con el marcado de la que se elija.
Ni `AppShell` ni nada más tiene que cambiar.

1. Pasar el HTML a JSX con Tailwind donde se pueda. Las animaciones van a
   `app/pantalla-carga.css` con el prefijo `carga-`, y las de la G que dejen de
   usarse se borran.
2. La ruta de la máscara del destello va en el componente
   (`url(${MARCA.isotipo})`), no en el CSS, como hace la G.
3. **Para la E** (fondo claro): la pantalla de arranque de Android es marina
   (`background_color` en `app/manifest.ts`), y al fundirse con una pantalla
   clara sale el gris del principio. Si se elige la E, ese color tiene que pasar
   a ser `#f6f4ee`.
4. Mirarla en el banco de pruebas: `node .banco-pruebas/construir.mjs`,
   `node .banco-pruebas/compilar-css.mjs` y abrir `index.html?vista=carga`.
