# BananaVision AI · Frontend desktop-first

Revisión del 3 de octubre de 2026, Windows, Node 26.7.0 y Chromium mediante Playwright.

## Referencia y alcance

No se recibió una imagen adjunta accesible en la conversación. El rediseño implementa las especificaciones textuales: Manrope, verdes profundos, crema y amarillo banana, sidebar de 264 px, topbar de 64 px, cabecera con tres feature cards y paneles centrales de captura/resultados en proporción 46/54. No se afirma una coincidencia píxel a píxel sin la imagen.

Se actualizó el frontend existente. No se creó otra aplicación ni se cambió la arquitectura. Las vistas Panel, Análisis e Historial conservan sus rutas por hash; Análisis es la vista inicial, se marca activo al abrirla y activa la cámara automáticamente.

## Archivos

Modificados:

- `frontend/index.html`: distribución semántica, iconos SVG de trazo consistente, sidebar, topbar, cabecera, resumen de archivo, fotografía analizada, datos y recomendaciones.
- `frontend/styles.css`: sistema consolidado de tokens, tipografía, componentes, estados, interacciones y breakpoints. Sustituye la hoja anterior en la misma ruta.
- `frontend/app.js`: presentación del archivo, barras basadas en probabilidades reales, atributos del progreso, estilos según clase y estado de conexión del sidebar. Se mantienen los IDs originales y los eventos funcionales.
- `frontend/tests/browser.mjs`: cobertura de drag & drop, escritorio grande, proporciones y alturas de paneles, cámara bloqueada, recursos, fuente y capturas.
- `frontend/README.md`: diseño, recursos y comprobaciones reproducibles.

Creados:

- `frontend/assets/manrope-latin.woff2`: Manrope variable, subconjunto latino obtenido de Google Fonts, servido localmente.
- `frontend/assets/Manrope-OFL.txt`: licencia SIL Open Font License 1.1 de la fuente.
- `frontend/tests/dom.test.mjs`: IDs únicos, elementos referenciados por JavaScript, referencias accesibles y recursos.
- `frontend/tests/markup.mjs`: análisis de sintaxis HTML/CSS/JavaScript con herramientas de desarrollo opcionales.
- Este informe y las cuatro capturas enlazadas abajo.

Archivos eliminados en la actualización posterior: `frontend/premium.css` (estilos consolidados en `styles.css`) y `frontend/assets/mark.svg` (sustituido por el logotipo original y sus versiones web).

## Datos y funciones preservados

No se modificaron backend, FastAPI, endpoints, rutas de API, schemas, modelo ni preprocesamiento. Tampoco se modificaron `api.js`, `data.js`, `config.js` o `charts.js`.

La clasificación permanece destinada a exportación. Los resultados continúan llegando del backend; no se introdujeron valores de demostración en la aplicación. Las cuatro tarjetas utilizan `probabilities`, `threshold` e `inference_time_ms`; las recomendaciones utilizan `recommendation.action` y `recommendation.storage`. La interfaz no muestra mediciones de color, textura, manchas, integridad o vida útil, porque esos campos no existen en la respuesta actual.

Arrastre de imágenes (individual y lotes), cámara, análisis continuo, cancelación, recuperación de errores, historial, filtros, CSV, claves de localStorage, conexión y aviso de rechazo se conservan.

## Validaciones ejecutadas

- **16 pruebas unitarias/contratos del frontend aprobadas**: datos, transporte, aviso de voz y DOM.
- **17 recorridos de navegador aprobados**, cero errores JavaScript no controlados y ningún recurso local con HTTP de error.
- **2 recorridos con FastAPI y el modelo Keras real aprobados**: fotografía individual y lote, con recomendaciones e historial después de recargar.
- HTML: parse5 sin errores de parseo.
- CSS: css-tree sin errores de sintaxis.
- JavaScript: los seis módulos pasan `node --check`.
- Fuente: Manrope se carga localmente y el peso 800 está disponible.
- Responsive: las tres vistas sin desbordamiento horizontal a 320, 390, 768, 1024, 1366, 1440, 1920 y 2560 px. Paneles centrales en la misma fila, proporción aproximada 46/54 y diferencia de altura inferior a 2 px desde 1366 px.
- Accesibilidad automática: reglas seleccionadas WCAG A/AA de axe-core sin infracciones en las tres vistas a 390 y 1440 px, incluyendo la alerta de rechazo visible. Las mediciones se hacen con movimiento reducido para evitar contrastes transitorios de la animación.
- Estados verificados: vacío, imagen seleccionada, carga, APTO, NO APTO, incertidumbre, error tras éxito, cancelación, cámara activa/bloqueada, modelo no disponible, red desconectada y recuperación.
- Drag & drop: cambio de estado, carga de vista previa, metadatos y ausencia de inferencia automática.
- Aviso de voz: silencio persistente, rechazo individual/lote, ausencia de locución al consultar lecturas o cancelar y separación mínima de 5 segundos en continuo.

Las pruebas automatizadas de accesibilidad no reemplazan una evaluación manual con lector de pantalla. Las imágenes sintéticas verifican integración y estados; no miden precisión del modelo.

## Ajustes realizados durante la revisión

- Se mantuvieron todos los elementos requeridos por JavaScript al mover la miniatura y los datos de resultados.
- Se redujo la altura mínima de la zona de carga para mejorar la densidad en 1920 × 1080, manteniendo paneles equilibrados.
- Se muestran KB para archivos pequeños y MB para archivos grandes; tamaño, formato y miniatura pertenecen a la muestra real seleccionada.
- Se sincronizó el estado del modelo en topbar y sidebar para evitar indicadores decorativos desconectados de la API.
- Las pruebas esperan la navegación por hash y la decodificación de imágenes antes de inspeccionar visibilidad.
- Las capturas restablecen el scroll y el foco para no desplazar el sidebar fijo ni mostrar accidentalmente el enlace de salto.

## Capturas revisadas

Se generaron con una ilustración PNG de prueba creada desde el SVG existente y respuestas controladas de la API. Los porcentajes visibles pertenecen al recorrido de prueba; no son constantes de la aplicación.

- [Análisis con resultado · 1920 × 1080](saas-capturar-1920.png)
- [Análisis con resultado · 2560 × 1440](saas-capturar-2560.png)
- [Análisis con resultado · móvil 390 px](saas-capturar-390.png)
- [Estado vacío · escritorio](saas-capturar-vacio.png)

Las capturas son de página completa; el contenido y el footer pueden superar el alto del viewport cuando crece la respuesta o se muestran controles adicionales.

## Repetir las comprobaciones

```powershell
node --test frontend/tests/data.test.mjs frontend/tests/api.test.mjs frontend/tests/voice.test.mjs frontend/tests/dom.test.mjs
node frontend/tests/markup.mjs
node frontend/tests/browser.mjs --premium-screenshots
node frontend/tests/live.mjs
```

Las tres últimas órdenes requieren las herramientas externas indicadas en `frontend/README.md`. No se necesitan para ejecutar el producto. `python app.py` inicia la aplicación tanto en `cmd` como en PowerShell 5.1, sin depender de la política de ejecución de scripts `.ps1`.
