# BananaVision AI · INTELIGENCIA VISUAL

Frontend en español con HTML, CSS y módulos JavaScript nativos. Sin build, fuentes remotas ni dependencias de ejecución. La API sirve esta carpeta en http://127.0.0.1:8000.

## Tres espacios de trabajo

- **Panel (`#dashboard`):** métricas del historial guardado, distribución de clasificaciones, actividad de 7/30 días, confianza de las últimas 12 lecturas y resultados recientes. Se actualiza después de cada análisis; no incluye datos de demostración. Las métricas representan hasta 1.000 registros, no un total histórico ilimitado.
- **Análisis (`#capturar`):** vista inicial con un selector **Cámara en vivo / Análisis por imágenes**. La cámara es el modo inicial, pero no solicita permiso al entrar: la persona pulsa **Iniciar cámara en vivo** y después puede comenzar el análisis continuo cuando el modelo está disponible. Cambiar a imágenes cancela el análisis pendiente y libera la cámara; puedes seleccionar archivos con el botón o arrastrarlos sobre el panel, en individual o por lotes. La vista previa no analiza automáticamente. El modo seleccionado se conserva al navegar entre las vistas durante la sesión. El historial guarda fotografías y respuestas de las tres clasificaciones de los análisis manuales y por imágenes; los resultados NO APTO continuos se guardan automáticamente en Historial, además de aparecer entre las 200 capturas recientes de la galería; los fotogramas APTO y NO CONCLUYENTE del continuo no se almacenan.
- **Historial (`#historial`):** conserva los últimos 1.000 registros y muestra 50 por página con Anterior/Siguiente. La búsqueda, los filtros y la exportación CSV incluyen todos los resultados coincidentes, no solo la página visible. El historial anterior se conserva al actualizar; al superar el límite se retiran los registros más antiguos.

Al pulsar una fila o su nombre se abre un diálogo con fotografía completa, clasificación, fecha, confianza, tiempo de análisis, recomendaciones y descarga de la imagen original. El nombre también funciona con teclado. Sin base de datos, los registros utilizan localStorage y sus fotos en IndexedDB. Con PostgreSQL y el bucket privado, se usa una sesión anónima por navegador (sin login). Los registros antiguos sin foto conservan sus datos. Al superar 1.000 entradas, se eliminan los registros y fotos más antiguos. Borrar todo el historial en la nube incluye sus capturas automáticas; borrar solo la galería quita esas capturas del historial.

Los gráficos SVG tienen descripciones, detalles por foco/puntero y dimensiones adaptadas al ancho disponible. La interfaz respeta movimiento reducido, ofrece navegación por teclado y utiliza **Manrope variable local**, con pesos 400–800 y fallback Inter/system-ui. La fuente está incluida en `assets/manrope-latin.woff2`, con su licencia SIL OFL; no se consulta Google Fonts al ejecutar la aplicación.

## Diseño desktop-first

- Sidebar verde profundo de 264 px y topbar blanco de 72 px en escritorio; Análisis es la ruta inicial. Panel e Historial siguen disponibles en el menú.
- Contenido centrado en un contenedor de hasta 1540 px, cabeceras separadas por una línea y tres tarjetas descriptivas compactas.
- Paneles de captura y resultados en proporción 46/54 y de altura fija de 760 px en escritorio: la cámara ocupa el espacio disponible sobre sus controles compactos sin cambiar de tamaño entre lecturas. Los resultados tienen desplazamiento interno si lo necesitan. En móvil se apilan con altura de cámara adaptada a la pantalla. La cámara muestra el encuadre sin cuadro guía; la guía central se conserva en la vista previa de imágenes.
- Tarjeta del archivo seleccionado con miniatura, nombre, tamaño y formato reales; estado de cámara y carga separado.
- Las capturas de cámara conservan el encuadre completo y su proporción, con un máximo de 1280 px en el lado mayor. El modelo mantiene su recorte central para la clasificación.
- Aviso de voz y acción principal agrupados al pie de la tarjeta de muestra.
- Cuatro tarjetas de recomendaciones breves provenientes de la API: destino, tiempo, manejo y acción. Los plazos dependen de variedad, madurez y conservación; no se infiere vida útil.
- Rail de iconos en escritorio compacto, paneles apilados en tablet y navegación horizontal en móvil.
- El JavaScript añadido solo actualiza la presentación, atributos accesibles y copias del estado de conexión. API, predicción, cancelación, cámara, avisos de voz y almacenamiento mantienen sus contratos.

Informe y capturas: [VERIFICACION_SAAS.md](../docs/VERIFICACION_SAAS.md).

## Identidad visual

- El lema **INTELIGENCIA VISUAL** aparece en mayúsculas en la marca del menú, en el pie de página y en el diálogo de conexión.
- `assets/logo-icono.png` es el único archivo de marca: se usa tal cual, sin copias ni conversiones. El CSS define su tamaño (42 px en la marca del menú, 34 px en el botón de guía, 52 px en los diálogos, 16 px en el pie) y el mismo archivo se referencia como icono y como apple-touch-icon del navegador.

## Superficies y jerarquía visual

- Fondo principal con la imagen botánica clara y tarjetas blancas con bordes suaves y sombras discretas. El verde identifica las acciones principales y el amarillo queda reservado a pequeños acentos.
- Navegación con hojas tropicales y una capa verde oscura para mantener la legibilidad; filtros del historial agrupados en una superficie diferenciada.
- Los fondos utilizan las imágenes originales `assets/Fondo principal.png` y `assets/Fondo Botánico de Hojas Tropicales.png`.

## Servir el frontend por separado

```bash
python -m http.server 5500 --directory frontend --bind 127.0.0.1
```

Abre http://127.0.0.1:5500. La API se busca en el puerto 8000 del mismo equipo; puede cambiarse en **Conexión y modelo**. CORS debe permitir el origen. La cámara requiere localhost o HTTPS. No abras `index.html` directamente desde el explorador.

## Organización

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Las tres vistas, navegación y diálogos. |
| `styles.css` | Sistema visual completo y responsive. |
| `app.js` | Navegación, operaciones de captura, resultados y presentación. |
| `api.js` | Transporte HTTP, timeout y cancelación por petición. |
| `voice.js` | Aviso de voz local con síntesis del navegador, habilitación por interacción y límite de frecuencia en cámara continua. |
| `rejections.js` | Persistencia de fotografías NO APTO de cámara en IndexedDB, lectura y borrado. |
| `history-images.js` | Fotografías y respuestas de las tres clases en IndexedDB, enlazadas al historial y limitadas a los registros retenidos. |
| `data.js` | Validación, persistencia, filtros, fechas y exportación. |
| `charts.js` | Actividad, distribución y evolución de confianza. |
| `config.js` | Configuración por defecto. |

`premium.css` se eliminó: los estilos están consolidados en `styles.css` y la página solo carga esa hoja. `assets/mark.svg` también se eliminó al sustituirlo el logotipo original.

## Pruebas reproducibles

Estas herramientas son opcionales para desarrollo. Node y Playwright **no son necesarios para ejecutar la aplicación**.

Desde la raíz:

```bash
node --test frontend/tests/data.test.mjs frontend/tests/api.test.mjs frontend/tests/voice.test.mjs frontend/tests/dom.test.mjs
```

Para navegador, instala Playwright y axe-core en una carpeta de herramientas. Ejemplo en PowerShell:

```powershell
npm install --prefix "$env:TEMP\bananavision-tests" playwright @axe-core/playwright parse5 css-tree
& "$env:TEMP\bananavision-tests\node_modules\.bin\playwright.cmd" install chromium
$env:NODE_PATH = "$env:TEMP\bananavision-tests\node_modules"
node frontend/tests/browser.mjs
node frontend/tests/live.mjs
node frontend/tests/markup.mjs
```

- `browser.mjs` inicia un servidor estático temporal y utiliza respuestas controladas para probar estados, cámara virtual, cancelación, gráficos, filtros, persistencia, CSV, responsive y comprobaciones automáticas WCAG A/AA.
- `live.mjs` inicia y detiene su propio servidor FastAPI en un puerto temporal y ejecuta imágenes individuales/lotes contra el modelo Keras incluido. Requiere el entorno Python instalado; `BANANA_PYTHON` permite elegir otro ejecutable.
- `browser.mjs --screenshots` genera las cuatro capturas del rediseño en `docs/`.
- `browser.mjs --premium-screenshots` genera las capturas `saas-capturar-*` del diseño actual a 1920, 2560 y 390 px, además del estado vacío. Usa una ilustración de prueba y respuestas controladas, no una evaluación real del fruto.
- `dom.test.mjs` comprueba IDs, referencias accesibles, contratos del DOM y rutas de recursos locales.
- `markup.mjs` valida la sintaxis HTML con parse5, CSS con css-tree y los seis módulos JavaScript con Node. Sus dependencias son herramientas opcionales, externas a la aplicación.

Para verificar los detalles del historial, instala también `fake-indexeddb` en la carpeta de herramientas y utiliza el mismo `NODE_PATH`:

```bash
node --test frontend/tests/history-images.test.mjs
node frontend/tests/history-browser.mjs
node frontend/tests/source-browser.mjs
```

Estas pruebas cubren persistencia de fotografías y respuestas de las tres clases, eliminación de imágenes antiguas, consulta tras recargar, descarga, navegación con teclado, registros anteriores y vista móvil.

`source-browser.mjs` verifica el selector de modos, la liberación de la cámara, selección de archivos, análisis individual y por lotes, regreso al modo cámara y cancelación de permisos pendientes.

Las imágenes sintéticas y la cámara virtual verifican integración, no precisión del clasificador. Evidencia: [VERIFICACION_BANANAVISION.md](../docs/VERIFICACION_BANANAVISION.md).

## Aviso de voz al rechazar para exportación

Las clasificaciones se muestran como APTO, NO APTO o NO CONCLUYENTE en resultados, historial, filtros, gráficas, anuncios de lectura y exportación CSV.

- Un nuevo resultado NO APTO reproduce automáticamente «Atención, producto no apto para exportación.». Un lote con resultados NO APTO produce un solo aviso; las alertas de la cámara continua respetan el intervalo mínimo de 5 segundos.
- APTO y NO CONCLUYENTE no emiten voz. Consultar historial o seleccionar lecturas de un lote tampoco habla.
- En cámara continua se permite como máximo un aviso cada 5 segundos. No se interrumpe ni se encola otro aviso mientras la síntesis esté hablando o tenga audio pendiente.
- El control Aviso de voz está activado por defecto y conserva la preferencia en el navegador, también desde la anterior Alarma sonora. Silenciar cancela el aviso pendiente sin ocultar las alertas visuales.
- La voz usa la síntesis del navegador y prioriza voces en español identificadas como naturales o de alta calidad, con velocidad ligeramente pausada. Se habilita al pulsar Analizar muestra, activar el análisis continuo o activar el aviso. Si el navegador no admite síntesis de voz, el control informa de ello y el análisis continúa con alertas visuales.

## Cámara principal y capturas de rechazo

1. Abre la aplicación y pulsa **Iniciar cámara en vivo** (no se solicita permiso al entrar). Permite la cámara: el análisis continuo puede comenzar automáticamente cuando el modelo está conectado.
2. Centra un solo plátano. Se analiza un fotograma por ciclo; la siguiente petición espera a que termine la anterior y luego un segundo. La imagen en vivo permanece visible durante la inferencia.
3. **APTO:** actualiza la lectura (lectura continua, no muestra del historial) sin guardar fotografías ni generar avisos de voz. **NO CONCLUYENTE:** tampoco guarda fotografías ni anuncia el rechazo. El análisis utiliza un fotograma temporal para enviarlo al modelo.
4. **NO APTO:** conserva exactamente el JPG enviado a la API, con fecha y confianza, en **Capturas no aptas**; activa alerta visual y aviso de voz, sujetos al control de silencio y al límite de 5 segundos.
5. Las fotografías se guardan en IndexedDB del navegador y permanecen tras recargar en la misma dirección. Se muestran las últimas 50 inicialmente; **Mostrar más capturas** permite consultar las anteriores. La galería tiene un máximo de 200 capturas: al superarlo se eliminan las más antiguas.
6. Puedes descargar cada JPG, eliminar una captura o borrar la galería mediante confirmación. En la nube, borrar capturas automáticas también las elimina del historial. En modo local, la galería e historial usan almacenes separados.
7. Desactiva **Análisis continuo** para pausar (también cancela la petición pendiente), o pulsa **Detener cámara** para liberar la cámara. Recargar no activa la cámara sin interacción.

La galería registra fotogramas rechazados, no frutos únicos: un mismo fruto puede generar varias fotografías si permanece delante de la cámara. El modelo no rastrea objetos ni analiza todas las imágenes del vídeo; evalúa las muestras enviadas por ciclo. Si el navegador no permite almacenamiento o agota su espacio, se muestra el error en el pie de la galería y en un aviso.

Las tres tarjetas descriptivas del encabezado se mantienen en **una sola fila**, también en móvil, con tamaños compactos.
