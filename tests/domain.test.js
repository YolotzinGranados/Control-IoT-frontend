import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDirections,findStopCommand, getSecondaryCommands,
} from '../assets/js/domain/command-catalog.js';

import {
  CommandDispatcher,
} from '../assets/js/domain/command-dispatcher.js';

import { DemoController,} from '../assets/js/domain/demo-controller.js';

const pause = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test('el catálogo solo asigna direcciones y DETENER presentes y activos', () => {
  const commands = [
    { id_comando: 1, nombre: 'RETROCEDER', codigo: 2, activo: true },
    { id_comando: 2, nombre: 'GIRAR_DERECHA', codigo: 4, activo: true },
    { id_comando: 3, nombre: 'DETENER', codigo: 9, activo: true },
    { id_comando: 4, nombre: 'AVANZAR', codigo: 1, activo: false },
    { id_comando: 5, nombre: 'SUBIR_BRAZO', codigo: 5, activo: true },
  ];
  const directions = resolveDirections(commands);
  assert.equal(directions.up, null);
  assert.equal(directions.down.id_comando, 1);
  assert.equal(directions.right.id_comando, 2);
  assert.equal(directions.left, null);
  assert.equal(findStopCommand(commands).id_comando, 3);
  assert.deepEqual(getSecondaryCommands(commands).map((item) => item.id_comando), [5]);
});

test('DETENER se procesa después de la solicitud en curso y elimina órdenes joystick pendientes', async () => {
  const calls = [];
  let releaseMovement;
  const api = {
    executeMovement: async (id) => {
      calls.push(id);
      if (id === 10) await new Promise((resolve) => { releaseMovement = resolve; });
      return { id_comando: id, comando: String(id), clientes_notificados: 1 };
    },
  };
  const dispatcher = new CommandDispatcher({ commandApi: api, hasAccess: () => true, hasStopAccess: () => true });
  dispatcher.setStopCommand({ id_comando: 99, nombre: 'DETENER' });

  const movement = dispatcher.send({ id_comando: 10, nombre: 'AVANZAR' }, { source: 'joystick' });
  await pause();
  dispatcher.send({ id_comando: 11, nombre: 'DERECHA' }, { source: 'joystick' });
  const stopPromise = dispatcher.stop();
  dispatcher.send({ id_comando: 12, nombre: 'RETROCEDER' }, { source: 'joystick' });
  releaseMovement();
  await Promise.all([movement, stopPromise]);
  assert.deepEqual(calls, [10, 99]);
  const duplicateStop = await dispatcher.stop();
  assert.equal(duplicateStop.alreadyStopped, true);
  assert.deepEqual(calls, [10, 99]);
});


test('si el joystick vuelve a la dirección en curso, descarta la dirección intermedia pendiente', async () => {
  const calls = [];
  let release;
  const api = {
    executeMovement: async (id) => {
      calls.push(id);
      if (id === 20) await new Promise((resolve) => { release = resolve; });
      return { id_comando: id };
    },
  };
  const dispatcher = new CommandDispatcher({ commandApi: api, hasAccess: () => true, hasStopAccess: () => true });
  dispatcher.setStopCommand({ id_comando: 99, nombre: 'DETENER' });
  const first = dispatcher.send({ id_comando: 20 }, { source: 'joystick' });
  await pause();
  dispatcher.send({ id_comando: 21 }, { source: 'joystick' });
  dispatcher.send({ id_comando: 20 }, { source: 'joystick' });
  release();
  await first;
  assert.deepEqual(calls, [20]);
});

test('una pulsación repetida de un botón después de completar la primera se permite', async () => {
  const calls = [];
  const api = { executeMovement: async (id) => { calls.push(id); return { id_comando: id }; } };
  const dispatcher = new CommandDispatcher({ commandApi: api, hasAccess: () => true, hasStopAccess: () => true });
  dispatcher.setStopCommand({ id_comando: 99, nombre: 'DETENER' });
  await dispatcher.send({ id_comando: 7, nombre: 'LUCES' }, { source: 'button' });
  await dispatcher.send({ id_comando: 7, nombre: 'LUCES' }, { source: 'button' });
  assert.deepEqual(calls, [7, 7]);
});

test('si se solicita cancelar mientras inicia una DEMO, la cancelación espera al POST de inicio', async () => {
  let resolveStart;
  const calls = [];
  const api = {
    startDemo: async (id) => { calls.push(`start:${id}`); return new Promise((resolve) => { resolveStart = resolve; }); },
    cancelDemo: async () => { calls.push('cancel'); return { mensaje: 'DEMO cancelada', id: 1 }; },
  };
  const controller = new DemoController({ demoApi: api, hasAccess: () => true, hasCancelAccess: () => true });
  controller.demos = [{ id_demo: 4, nombre: 'Prueba', activo: true }];
  controller.selectedId = 4;
  const startPromise = controller.start();
  await pause();
  const queuedCancel = await controller.cancel();
  assert.equal(queuedCancel.queued, true);
  assert.deepEqual(calls, ['start:4']);
  resolveStart({ id_demo: 4, total_movimientos: 3 });
  await startPromise;
  assert.deepEqual(calls, ['start:4', 'cancel']);
  assert.equal(controller.isActive(), false);
});
