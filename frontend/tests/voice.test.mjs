import test from 'node:test';
import assert from 'node:assert/strict';
import ExportAlert from '../voice.js';

class UtteranceStub {
  constructor(text) { this.text = text; this.lang = ''; }
}

const speechStub = (voices = [{ lang: 'es-PE', name: 'Prueba' }]) => {
  const stub = { spoken: [], cancelled: 0, resumed: 0,
    speak(utterance) { stub.spoken.push(utterance); },
    cancel() { stub.cancelled++; },
    resume() { stub.resumed++; },
    getVoices: () => voices };
  return stub;
};

test('aviso activado por defecto selecciona una voz española y permite preparar audio', () => {
  const speech = speechStub();
  const alert = new ExportAlert({ speech, Utterance: UtteranceStub });
  assert.equal(alert.speak('Muestra no apta para exportación.'), true);
  assert.equal(speech.spoken.length, 1);
  assert.equal(speech.spoken[0].text, 'Muestra no apta para exportación.');
  assert.equal(speech.spoken[0].lang, 'es-PE');
  assert.equal(alert.unlock(), true);
  assert.equal(speech.resumed, 2);
  assert.equal(speech.spoken[0].voice.name, 'Prueba');
});

test('prioriza voces naturales en español sobre voces básicas o de otro idioma', () => {
  const speech = speechStub([
    { lang: 'es-ES', name: 'Básica', default: true },
    { lang: 'en-US', name: 'Natural English' },
    { lang: 'es-MX', name: 'Español Natural' },
  ]);
  const alert = new ExportAlert({ speech, Utterance: UtteranceStub });
  alert.speak('Atención, producto no apto para exportación.');
  assert.equal(speech.spoken[0].voice.name, 'Español Natural');
  assert.equal(speech.spoken[0].lang, 'es-MX');
  assert.equal(speech.spoken[0].rate, 0.95);
  assert.equal(speech.spoken[0].pitch, 1);
});

test('no interrumpe ni encola avisos mientras otra advertencia está sonando', () => {
  const speech = speechStub();
  const alert = new ExportAlert({ speech, Utterance: UtteranceStub });
  speech.speaking = true;
  assert.equal(alert.speak('Advertencia: producto no apto para exportación.'), false);
  speech.speaking = false;
  speech.pending = true;
  assert.equal(alert.speak('Advertencia: producto no apto para exportación.'), false);
  speech.pending = false;
  assert.equal(alert.speak('Advertencia: producto no apto para exportación.'), true);
  assert.equal(speech.spoken.length, 1);
  assert.equal(speech.cancelled, 0);
});

test('en continuo respeta 5 segundos incluso después de un análisis manual', () => {
  let now = 0;
  const speech = speechStub();
  const alert = new ExportAlert({ speech, Utterance: UtteranceStub, now: () => now });
  assert.equal(alert.speak('Muestra no apta para exportación.'), true);
  now = 4999; assert.equal(alert.speak('Muestra no apta para exportación.', { continuous: true }), false);
  now = 5000; assert.equal(alert.speak('Muestra no apta para exportación.', { continuous: true }), true);
  now = 5001; assert.equal(alert.speak('Muestra no apta para exportación.'), true);
  assert.equal(speech.spoken.length, 3);
});

test('silenciar cancela el aviso pendiente y bloquea nuevos mensajes', () => {
  const speech = speechStub();
  const alert = new ExportAlert({ speech, Utterance: UtteranceStub });
  alert.speak('Muestra no apta para exportación.');
  const cancelled = speech.cancelled;
  alert.setEnabled(false);
  assert.equal(speech.cancelled, cancelled + 1);
  assert.equal(alert.speak('Muestra no apta para exportación.'), false);
  assert.equal(speech.spoken.length, 1);
  alert.setEnabled(true);
  assert.equal(alert.speak('Muestra no apta para exportación.'), true);
});

test('voz ausente o bloqueada falla de forma controlada', () => {
  const absent = new ExportAlert({ speech: null, Utterance: null });
  assert.equal(absent.available, false);
  assert.equal(absent.unlock(), false);
  assert.equal(absent.speak('Muestra no apta para exportación.'), false);
  class Blocked { resume() { throw new Error('blocked'); } getVoices() { return []; } }
  const blocked = new ExportAlert({ speech: new Blocked(), Utterance: UtteranceStub });
  assert.equal(blocked.unlock(), false);
  assert.equal(blocked.speak('Muestra no apta para exportación.'), false);
});

test('sin voces cargadas se usa el idioma configurado', () => {
  const speech = speechStub([]);
  const alert = new ExportAlert({ speech, Utterance: UtteranceStub });
  assert.equal(alert.voice(), null);
  alert.speak('Muestra no apta para exportación.');
  assert.equal(speech.spoken[0].lang, 'es-ES');
});
