# Cambios y verificación · Banana Studio 2.0

## Correcciones principales

| Área | Resultado |
|---|---|
| Interfaz | Rediseño responsive marfil/verde, ilustración local SVG, estados de carga, errores y controles reales |
| JavaScript | Módulos válidos; plantillas rotas reemplazadas; contenido dinámico insertado mediante textContent |
| Modelo | Reconstrucción estricta del grafo y de cada peso del modelo TF.js original; formato Keras 3 .keras |
| Entrada | Orientación EXIF, formatos JPG/PNG/WebP, transparencia sobre blanco, recorte central, RGB y normalización [-1,1] |
| Cámara | Recorte central cuadrado sin deformar, guía alineada con el recorte y liberación de pistas al detener |
| Tiempo real | Espera cada respuesta y un segundo adicional; pausa de inferencias si la pestaña está oculta |
| API | Multipart, JSON Base64/data URL, respuestas documentadas, inferencia fuera del event loop y bloqueo del modelo |
| Umbral | NO CONCLUYENTE por debajo de la confianza mínima; conserva las probabilidades de ambas clases |
| Archivos | Límites por archivo, lote, cuerpo de solicitud y píxeles; validación por el decodificador de imagen |
| Historial | Hasta 50 resultados locales sin imágenes; validación al leer; exportación CSV y borrado |
| Ejecución | Un único servidor con frontend/API; rutas relativas, .env.example y scripts Windows sin activar PowerShell |
| Evaluación | Script para dataset independiente; matriz de confusión, métricas por clase y cobertura del umbral |
| Entrega | Se retiraron cachés y carpetas vacías sin función; se conservan intactos los tres archivos TF.js originales |

## Hallazgo del modelo anterior

El SavedModel recibido no correspondía al grafo de Teachable Machine: sus variables eran un kernel Dense de forma `(150528,2)` y un bias de forma `(2,)`. El original contiene una red MobileNetV2 y su clasificador con **538 508 parámetros**. Se retiró ese SavedModel y se generó `banana.keras` desde `Modelo/model.json` y `weights.bin`, comprobando que cada peso del manifiesto se asignó sin sobrantes ni ausencias. No se entrenó un modelo nuevo ni se sustituyeron sus pesos por valores aleatorios.

## Verificación realizada

Entorno: Linux x86-64, Python 3.12, TensorFlow CPU 2.16.1, Keras 3.15.1; Chromium headless para la interfaz. Windows no estuvo disponible para ejecutar los archivos .bat o .ps1; se revisaron sus rutas y comandos, y el comportamiento Python de instalación/lanzamiento se diseñó sin activación de shell.

**16 pruebas pytest aprobadas.** Cubren inferencia del modelo real, equivalencia entre multipart y Base64, datos inválidos, formatos, umbral, límites de archivos/cuerpo/lote/píxeles, lotes y su orden, CORS, modelo no disponible, normalización, recorte, EXIF, transparencia, pesos reconstruidos y cálculo de métricas del evaluador.

**Comparación independiente TensorFlow.js/Python aprobada.** Se cargó el modelo original con TensorFlow.js 4.22.0 en CPU, y el .keras con TensorFlow 2.16.1. Se usaron dos tensores idénticos: ceros y ruido reproducible en [-1,1]. La diferencia absoluta máxima entre las dos probabilidades fue **0.000006020069**; pasó una tolerancia de 1e-5. Esto valida la reconstrucción/integración; no demuestra exactitud con fotografías reales.

**10 recorridos/verificaciones del navegador aprobados:**

1. Diseño sin desbordamiento del documento en 1440, 1024, 768, 390 y 320 px.
2. Subida real de una imagen → API → modelo → resultado → historial.
3. Análisis por lote y registro ordenado de resultados.
4. CSV descargado con las tres lecturas de la prueba.
5. Persistencia después de recargar y reinicio de contadores de sesión.
6. Error visible al seleccionar un formato inválido.
7. Guía de uso y diálogo de conexión con información del modelo real.
8. Captura con cámara simulada y modo continuo con API demorada 1.4 s: máximo una solicitud simultánea, pistas liberadas al detener.
9. Error de servidor visible y botón recuperado tras la respuesta.
10. Borrado del historial.

No hubo errores JavaScript en la página. Registro de recorridos: `verificacion-navegador.json`. Las imágenes usadas para las pruebas de integración eran sintéticas y la cámara era simulada: no representan un conjunto de prueba de plátanos ni validación alimentaria.

También se comprobó sintaxis de los tres módulos JS, `app.py` y los archivos Python.

## Vista del diseño

Estas capturas se eliminaron al actualizar el diseño. Las vigentes están en [VERIFICACION_BANANAVISION.md](VERIFICACION_BANANAVISION.md) y [VERIFICACION_SAAS.md](VERIFICACION_SAAS.md).

## Límites pendientes que necesitan datos o dispositivos reales

- No se proporcionó un dataset independiente; no hay una accuracy/precision/F1 real que pueda certificarse. Ejecuta `scripts/evaluate.py` con imágenes nuevas, etiquetadas y revisadas manualmente.
- Solo existen dos clases entrenadas. El sistema no tiene detector de objetos ajenos, contaminación invisible ni evaluación microbiológica.
- La normalización sigue el ejemplo oficial **Python/Keras** (`/127.5 - 1`). Algunas versiones de la biblioteca TF.js usan `/127 - 1`; no se afirma igualdad bit a bit entre todos los pipelines de cámara. La comparación documentada usó tensores de entrada idénticos.
- La cámara física, los permisos del navegador del usuario y la ejecución de Windows deben probarse en ese equipo. Las pruebas automáticas utilizaron una cámara simulada.
- Se incluye historial local, no una base de datos multiusuario. No es un despliegue de producción público ni incorpora autenticación/rate limiting.

## Referencias técnicas

- Ejemplo oficial Python/Keras de Teachable Machine (recorte y normalización): https://github.com/googlecreativelab/teachablemachine-community/blob/master/snippets/markdown/image/tensorflow/keras.md
- Migración oficial Keras 3 (formato de carga): https://keras.io/guides/migrating_to_keras_3/
- Formato y carga de modelos TensorFlow.js: https://www.tensorflow.org/js/guide/save_load
