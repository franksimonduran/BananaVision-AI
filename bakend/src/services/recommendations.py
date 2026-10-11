RECOMMENDATIONS = {
    'APTO': {
        'message': 'La apariencia coincide con los plátanos aptos para exportación del modelo.',
        'destination': 'Exportación, según requisitos del comprador.',
        'timing': 'Despacho según madurez y duración del viaje.',
        'action': 'Registrar y preparar el lote.',
        'storage': 'Proteger de golpes, presión y sol directo.'},
    'NO APTO': {
        'message': 'La apariencia coincide con los plátanos no aptos para exportación del modelo.',
        'destination': 'Mercado local o procesamiento, si es apto para consumo.',
        'timing': 'Priorizar su salida si está maduro.',
        'action': 'Canalizar según su estado; descartar si no es consumible.',
        'storage': 'Separar e identificar fuera del lote de exportación.'},
    'SIN PLÁTANO': {
        'message': 'No se detectó un plátano en la imagen.',
        'destination': 'Sin clasificación de exportación.',
        'timing': 'Coloca una muestra y repite el análisis.',
        'action': 'Centra un plátano frente a la cámara o selecciona una imagen que contenga uno.',
        'storage': 'No se registra como producto APTO ni NO APTO.'}}

def get_recommendation(label):
    return RECOMMENDATIONS[label].copy()
