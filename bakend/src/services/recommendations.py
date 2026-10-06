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
    'NO CONCLUYENTE': {
        'message': 'La confianza es insuficiente para emitir una clasificación.',
        'destination': 'Pendiente de clasificación.',
        'timing': 'Repetir el análisis de inmediato.',
        'action': 'Mejorar la captura; si persiste, revisar manualmente.',
        'storage': 'Mantener separado e identificado.'}}

def get_recommendation(label):
    return RECOMMENDATIONS[label].copy()
