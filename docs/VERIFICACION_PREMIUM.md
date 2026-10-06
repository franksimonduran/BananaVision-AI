# Reparación y experiencia premium

Verificado el 2 de octubre de 2026 en Windows, Python 3.11 de 64 bits y Chromium automatizado.

## Causa del fallo de «Analizar muestra»

El entorno anterior mezclaba `tensorflow-cpu 2.16.1`, `tensorflow-intel 2.15.1` y Keras 2.15. El modelo incluido fue guardado con Keras 3.15.1. La carga fallaba al deserializar `InputLayer` y `/health` respondía 503.

Se creó un entorno limpio con `scripts/bootstrap.py --rebuild`. La comprobación de dependencias terminó con `No broken requirements found` y el modelo incluido cargó correctamente. El entorno anterior se conservó como respaldo. La arquitectura y los pesos del modelo incluido siguen siendo los utilizados por la aplicación.

## Cambios aplicados

- El instalador comprueba Python de 64 bits, dependencias y carga real del modelo.
- `python app.py --rebuild` permite reparar una instalación mezclada conservando el entorno anterior.
- La interfaz distingue «Modelo conectado», «Modelo no disponible» y «Sin conexión».
- Se bloquea el análisis mientras el modelo no está disponible y se permite comprobar de nuevo la conexión.
- Los errores de análisis conservan la muestra para reintentar.
- Se corrigió el cambio de archivo a cámara, la cancelación de permisos y el estado mostrado al detener la cámara durante una inferencia.
- Cada resultado de un lote se puede seleccionar; su fotografía y su lectura se muestran juntas.
- Se verifica la coherencia de las probabilidades y la clasificación antes de registrar un resultado.
- Estética verde/marfil, acentos dorados, tipografía local, controles más cómodos, mensajes integrados e historial en tarjetas en móvil.

## Pruebas del backend

```bat
bakend\.venv\Scripts\python.exe -m pytest bakend\tests -q
bakend\.venv\Scripts\python.exe -m pip check
```

Resultado: **16 pruebas aprobadas**. Hubo un aviso de deprecación de Starlette/AnyIO, sin fallo funcional.

Se comprobaron API multipart/Base64, lotes y límites, CORS, preprocesamiento, métricas de evaluación, pesos del modelo original frente al guardado y predicciones consistentes.

## Comprobaciones de navegador

Un servidor temporal en el puerto 8017 y Chromium con Playwright comprobaron:

1. Imagen individual con inferencia del modelo real.
2. Lote, selección de cada resultado y vista previa correspondiente.
3. Persistencia del historial tras recargar y descarga de CSV con resultados.
4. Imagen corrupta: error legible, fin del estado de carga y posibilidad de reintento.
5. Respuesta 503 de disponibilidad: aviso de modelo no disponible y recuperación.
6. Fallo de red: aviso de servidor desconectado y recuperación sin perder la selección.
7. Captura y análisis continuo con cámara virtual, y detención de sus pistas.
8. Detención de cámara durante una inferencia, sin estado «Analizando» bloqueado.
9. Borrado persistente del historial.
10. Cancelación de una solicitud de cámara pendiente.
11. Permiso de cámara denegado y retorno a carga de archivos.
12. Guardado y comprobación de la dirección del servidor.
13. Anchos 320, 390, 768, 1024 y 1440 px: sin desbordamiento horizontal de la página ni texto de límites recortado en el área de carga.

Resultado: **13 comprobaciones completadas y cero errores JavaScript no controlados**.

Las imágenes sintéticas utilizadas comprueban el flujo de la aplicación, no la precisión del clasificador. La cámara se probó con un dispositivo virtual; no con una cámara física del usuario. Las condiciones reales de iluminación y clasificación requieren fotografías independientes.

## Capturas de la interfaz verificada

Estas capturas se eliminaron alActualizar el diseño: la versión vigente se encuentra en [VERIFICACION_SAAS.md](VERIFICACION_SAAS.md) y en [VERIFICACION_BANANAVISION.md](VERIFICACION_BANANAVISION.md).

## Inicio

En el entorno reparado basta con ejecutar **python app.py**, esperar «Modelo conectado», seleccionar una fotografía y pulsar **Analizar muestra**. La ventana del servidor debe permanecer abierta.
