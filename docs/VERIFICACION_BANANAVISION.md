# BananaVision AI · Rediseño y verificación

Verificado el 2 de octubre de 2026 en Windows, Node 26.7.0, Chromium 153 y el entorno Python del proyecto.

## Identidad y organización

- Marca **BananaVision AI** con el logotipo original `assets/logo-icono.png`, sin versiones derivadas, y el lema **INTELIGENCIA VISUAL** en mayúsculas debajo.
- Vistas **Panel**, **Análisis** e **Historial**. Análisis es la ruta inicial y activa la cámara al entrar si no hay ninguna muestra pendiente.
- Se retiró el bloque de bienvenida del Panel para dejar las métricas como primer contenido.
- Panel independiente con métricas, actividad de 7/30 días, gráfico de anillo, evolución de confianza y lecturas recientes.
- Análisis reúne imagen/cámara, análisis, probabilidades y recomendaciones; la cámara se activa al entrar.
- Historial independiente con búsqueda, filtros por clase/fecha, CSV filtrado y borrado confirmado.
- Sistema visual verde/marfil con acentos dorados, tipografía de sistema, controles responsive y gráficos SVG locales.
- Navegación por hash, atrás/adelante, foco de contenido, estado activo y nombres accesibles de diálogos.

## Correcciones funcionales incluidas

- Cada resultado de cámara conserva el fotograma analizado como miniatura durante la sesión.
- Cancelar una inferencia aborta su petición y desbloquea controles; una respuesta antigua no registra lecturas.
- Un reintento fallido identifica expresamente la lectura anterior.
- Seleccionar un resultado de lote no altera las métricas agregadas del panel.
- Se verifica que la clase predicha corresponda a la probabilidad mayor.
- La guía de recorte se aplica tanto a archivos como a cámara.
- El historial anterior se conserva mediante la misma clave de almacenamiento.
- Se sincronizan cambios de historial entre pestañas mediante el evento `storage`.
- Timeout, cancelación y JSON inválido tienen tratamientos diferenciados.

## Pruebas de datos y transporte

```bash
node --test frontend/tests/data.test.mjs frontend/tests/api.test.mjs
```

**9 pruebas aprobadas:** migración y saneamiento de historial, límite de 50, validación de probabilidades/clase dominante, filtros y fecha local, CSV seguro, URL de API, cancelación externa y limpieza de controladores, JSON inválido y health con modelo no disponible.

## Navegador

```bash
node frontend/tests/browser.mjs --screenshots
```

Requiere Playwright y `@axe-core/playwright` disponibles en Node. Instrucciones de instalación: [frontend/README.md](../frontend/README.md).

**14 recorridos aprobados, cero errores JavaScript no controlados:**

1. Panel inicial sin datos simulados.
2. Imagen individual, miniatura y recomendaciones juntas; actualización de métricas.
3. Lote y selección sincronizada; métricas estables al consultar resultados.
4. Gráficos, periodo de actividad y detalles por teclado.
5. Historial, filtros combinados, CSV filtrado y persistencia.
6. Las tres vistas sin desbordamiento horizontal a 320, 390, 768, 1024 y 1440 px.
7. Error después de un éxito y cancelación con respuesta tardía.
8. Cámara virtual, miniatura de 672 px, continuo sin solicitudes solapadas y liberación de pistas.
9. Detención de cámara durante una inferencia y nueva selección inmediata.
10. Distinción de modelo no disponible/fallo de red y recuperación conservando la muestra.
11. Conexión y guía mediante diálogos nombrados.
12. Axe-core: sin infracciones automáticas detectadas en las reglas WCAG A/AA seleccionadas, en las tres vistas a 390 y 1440 px.
13. Borrado confirmado, actualización del panel y persistencia del borrado.
14. Lectura del historial anterior al rediseño.

La comprobación automatizada de accesibilidad no sustituye una evaluación manual con lectores de pantalla. Los recorridos usan respuestas de API controladas y cámara virtual para reproducir los distintos estados.

## Integración con el modelo real

```bash
node frontend/tests/live.mjs
```

**Dos recorridos aprobados:**

- Navegador → imagen PNG → FastAPI → modelo Keras incluido → recomendaciones → panel.
- Lote de dos imágenes → modelo real → selector de resultados → historial persistente tras recargar.

El script inicia un servidor temporal, comprueba que el modelo haya cargado y detiene su árbol de procesos al terminar. Las imágenes son sintéticas; esta evidencia comprueba integración, no precisión del clasificador.

## Capturas

Generadas por los recorridos controlados de navegador; muestran datos de esas pruebas, no un dataset de evaluación.

- [Panel de escritorio](bananavision-panel.png)
- [Análisis, resultado y recomendaciones](bananavision-capturar.png)
- [Historial de escritorio](bananavision-historial.png)
- [Panel móvil](bananavision-movil.png)

## Inicio

Ejecuta **python app.py**, espera «Modelo conectado» y abre **Análisis**: la cámara se activa sola y empieza a clasificar. No se necesita Node para utilizar BananaVision AI. Las herramientas Node solo se usan para repetir las pruebas del frontend.

## Evaluación para exportación y aviso de voz · 3 de octubre de 2026

La interfaz presenta chips de estado APTO, NO APTO y NO CONCLUYENTE, y mantiene las etiquetas largas APTO PARA EXPORTACIÓN y NO APTO PARA EXPORTACIÓN en el historial, los filtros, las gráficas, los anuncios de lectura y el CSV, con las etiquetas originales en la API y el almacenamiento. Los nuevos rechazos se anuncian por voz con la síntesis del navegador; los lotes generan un único aviso. NO CONCLUYENTE no habla.

El control Aviso de voz conserva la preferencia de silencio. La voz se habilita mediante interacción y el modo continuo limita los avisos a uno cada 5 segundos. El historial, la selección de resultados anteriores y las respuestas canceladas no producen locución.

Verificación ejecutada:

- Backend: **16 pruebas aprobadas**, incluida la carga del modelo real y la prueba de página actualizada a BananaVision AI.
- Frontend: **13 pruebas unitarias aprobadas**, incluyendo habilitación de la voz, límite temporal, silencio y voz ausente/bloqueada.
- Navegador: **15 recorridos aprobados**, cero errores JavaScript no controlados. Se verifican rechazo individual y lote, incertidumbre sin aviso, preferencia tras recargar, historial/selección sin nuevas locuciones, cancelación y cámara continua con separación de al menos 5 segundos.
- Integración con Keras real: **2 recorridos aprobados** (individual y lote).
- Axe-core: sin infracciones en las reglas WCAG A/AA seleccionadas para las tres vistas a 390 y 1440 px, con la alerta de rechazo visible. Se inspecciona la interfaz con movimiento reducido para evitar mediciones transitorias durante la animación de entrada. Se ajustó el contraste de los indicadores de paso.

```bash
node --test frontend/tests/data.test.mjs frontend/tests/api.test.mjs frontend/tests/voice.test.mjs
node frontend/tests/browser.mjs
node frontend/tests/live.mjs
```

Las comprobaciones de voz verifican la llamada a la síntesis del navegador dentro de Chromium; no comprueban el volumen físico de los altavoces ni la claridad de la voz del sistema. Las pruebas sintéticas siguen verificando integración, no precisión del clasificador.
