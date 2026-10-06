# Cámara en vivo y capturas exclusivas de rechazo

Actualización del 3 de octubre de 2026.

## Comportamiento

- Análisis es la vista inicial, activa la cámara al entrar y Cámara en vivo es el modo principal.
- La cámara se solicita automáticamente al entrar en Análisis si no hay ninguna muestra pendiente. Si el modelo todavía no responde, el análisis continuo arranca en cuanto `/health` confirma que está disponible.
- Si el navegador deniega el permiso, se mantiene el panel de cámara inactiva con un aviso accesible y el botón para reintentarlo.
- Cada ciclo espera su respuesta y después un segundo. No se solapan solicitudes y el vídeo permanece visible mientras se analiza.
- APTO actualiza la lectura, sin almacenar fotografías ni activar el aviso de voz.
- NO CONCLUYENTE tampoco almacena fotografías ni anuncia el rechazo.
- NO APTO de cámara almacena el JPG exacto enviado a la API, su fecha y confianza. Se emite el aviso de voz respetando la preferencia de silencio y el límite de una locución cada 5 segundos.
- Pausar cancela una solicitud pendiente. Detener cámara libera las pistas. Las respuestas canceladas no añaden fotografías ni emiten avisos.
- Las imágenes arrastradas sobre el panel de la cámara o sobre el área de la muestra se analizan en individual o por lotes; sus fotografías no se incorporan automáticamente a la galería de cámara.

## Conservación de fotografías

`frontend/rejections.js` utiliza IndexedDB, base `bananaVisionRejections`, para almacenar Blobs JPEG. Es independiente del historial de lecturas y de sus claves de localStorage.

La galería muestra las últimas 50 capturas inicialmente y permite mostrar más. No elimina fotografías automáticamente cuando supera 50. Incluye descarga individual JPG, eliminación individual y borrado confirmado de la galería. Las fotografías sobreviven a una recarga en el mismo navegador y origen; borrar el historial no las elimina.

Si el almacenamiento falla se informa en el aviso y en el pie de la galería. Los fotogramas APTO se utilizan temporalmente para inferir y presentar la lectura, pero no se guardan como capturas persistentes.

Los registros corresponden a fotogramas analizados, no a frutos identificados de forma única. Un mismo plátano puede producir varias capturas si permanece en cámara. El modelo sigue clasificando el recorte central de una muestra por ciclo; no se añadió detección/rastreo de varios objetos.

## Tarjetas descriptivas

Análisis con IA, Evaluación visual y Respuesta rápida se mantienen en una sola fila, incluidos 320 y 390 px. En móvil se compactan iconos, tipografía y espaciado sin suprimir las descripciones.

## Archivos

- Modificados: `frontend/app.js`, `frontend/index.html`, `frontend/styles.css`, `frontend/tests/browser.mjs`, `frontend/tests/live.mjs`, `frontend/tests/markup.mjs`, `frontend/README.md` y `README.md`.
- Creado: `frontend/rejections.js` y este informe.
- Eliminados: ninguno.
- Backend, modelo, preprocesamiento, endpoints y formatos de respuesta: sin cambios.

## Verificación ejecutada

- 16 pruebas unitarias/contratos del frontend aprobadas.
- 18 recorridos de navegador aprobados, sin errores JavaScript no controlados ni recursos locales fallidos.
- Se comprueba cámara automática con APTO sin fotografías guardadas ni avisos de voz, cancelación de una respuesta NO APTO sin guardar, recolección de varios rechazos, descarga JPEG válida, persistencia tras recargar y borrado independiente del historial.
- Se comprueba fila única de las tres tarjetas en 320, 390, 768, 1024, 1366, 1440, 1920 y 2560 px; las tres vistas permanecen sin desbordamiento horizontal.
- Axe-core: sin infracciones en las reglas WCAG A/AA seleccionadas, escritorio y móvil, incluida la galería de rechazo visible.
- 3 recorridos con FastAPI y Keras real aprobados: imagen individual, lote y cámara virtual con análisis automático, pausa y detención.
- parse5 y css-tree sin errores de sintaxis; los siete módulos JavaScript pasan `node --check`.

La cámara virtual y las imágenes sintéticas verifican integración, no exactitud del modelo. La comprobación automática de accesibilidad no reemplaza una revisión manual.

## Uso

```powershell
python app.py
```

Abre `http://127.0.0.1:8000`, pulsa Iniciar cámara en vivo y permite el acceso. Recargar la página no reactiva la cámara sin interacción. Para ver el código nuevo en una página abierta, recarga con Ctrl+F5.
