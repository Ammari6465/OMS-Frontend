import { JSDOM } from 'jsdom';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'HTMLElement', 'CustomEvent', 'customElements', 'Option', 'AbortController']) {
  globalThis[key] = dom.window[key] ?? globalThis[key];
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.devicePixelRatio = 2;
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; }
  observe() { this.callback(); }
  disconnect() {}
};
Object.defineProperties(dom.window.HTMLElement.prototype, {
  clientWidth: { configurable: true, get() { return 1440; } },
  clientHeight: { configurable: true, get() { return 760; } },
});
const noop = () => {};
const context = {
  setTransform: noop, fillRect: noop, save: noop, restore: noop, translate: noop, scale: noop,
  beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, arc: noop, arcTo: noop, rect: noop,
  quadraticCurveTo: noop, closePath: noop, setLineDash: noop, fillText: noop, strokeRect: noop,
  measureText: (text) => ({ width: String(text).length * 7 }),
};
dom.window.HTMLCanvasElement.prototype.getContext = () => context;

await import('../../organogram-frontend-library/organogram.js');

const schema = JSON.parse(await fs.readFile('../organogram-frontend-library/organogram.schema.json', 'utf8'));
const example = JSON.parse(await fs.readFile('../organogram-frontend-library/organogram.example.json', 'utf8'));
const validateSchema = new Ajv2020({ strict: false, validateFormats: false }).compile(schema);
const schemaValidation = [
  { scenario: 'provided example matches JSON Schema', pass: validateSchema(example), errors: validateSchema.errors },
  { scenario: 'schema rejects missing company', pass: !validateSchema({ schemaVersion: '1.0', view: 'EMPLOYEE', nodes: [] }), errors: validateSchema.errors },
  { scenario: 'schema rejects unsupported view', pass: !validateSchema({ ...example, view: 'INVALID' }), errors: validateSchema.errors },
  { scenario: 'schema rejects unknown top-level fields', pass: !validateSchema({ ...example, unexpected: true }), errors: validateSchema.errors },
];

const waitForDraw = () => new Promise((resolve) => setTimeout(resolve, 5));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const round = (value) => Math.round(value * 100) / 100;
function data(size) {
  return {
    company: { id: 1, name: `Load Test ${size}` },
    departments: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Department ${i + 1}` })),
    rootIds: [1],
    nodes: Array.from({ length: size }, (_, i) => ({
      id: i + 1,
      parentId: i === 0 ? null : Math.floor((i - 1) / 4) + 1,
      companyId: 1,
      departmentId: (i % 20) + 1,
      employeeCode: `EMP-${String(i + 1).padStart(5, '0')}`,
      name: `Employee ${i + 1}`,
      title: i === 0 ? 'Chief Executive Officer' : `Position ${i + 1}`,
      version: 1,
      vacant: false,
    })),
  };
}

const validation = [];
for (const [name, value, expected] of [
  ['null payload', null, 'JSON object'],
  ['missing nodes', {}, 'nodes array'],
  ['duplicate id', { nodes: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }] }, 'Duplicate node id'],
  ['missing name', { nodes: [{ id: 1, name: '' }] }, 'name is required'],
]) {
  const element = document.createElement('oms-organogram');
  document.body.append(element);
  let message = '';
  try { element.setData(value); } catch (error) { message = error.message; }
  validation.push({ scenario: name, pass: message.includes(expected), message });
  element.remove();
}

const results = [];
for (const size of [800, 1000, 1300]) {
  const timings = [];
  const expandTimings = [];
  let lastStats;
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  for (let run = 0; run < 12; run++) {
    const element = document.createElement('oms-organogram');
    document.body.append(element);
    const payload = data(size);
    const started = performance.now();
    element.setData(payload);
    await waitForDraw();
    timings.push(performance.now() - started);
    const expandStarted = performance.now();
    element.expandAll();
    await waitForDraw();
    expandTimings.push(performance.now() - expandStarted);
    lastStats = element.getStats();
    if (element.getData() !== payload) throw new Error('The component duplicated or replaced the input object.');
    if (!element.focusNode(size)) throw new Error(`Unable to focus node ${size}.`);
    element.remove();
  }
  globalThis.gc?.();
  const heapAfter = process.memoryUsage().heapUsed;
  results.push({
    employees: size,
    iterations: timings.length,
    setDataP50Ms: round(percentile(timings, .50)),
    setDataP95Ms: round(percentile(timings, .95)),
    setDataMaxMs: round(Math.max(...timings)),
    expandAllP50Ms: round(percentile(expandTimings, .50)),
    expandAllP95Ms: round(percentile(expandTimings, .95)),
    layoutMs: round(lastStats.layoutMs),
    renderMs: round(lastStats.renderMs),
    layoutNodes: lastStats.layoutNodes,
    drawnNodes: lastStats.drawnNodes,
    domElements: lastStats.domElements,
    retainedHeapDeltaMB: round((heapAfter - heapBefore) / 1024 / 1024),
    pass: percentile(timings, .95) < 250 && percentile(expandTimings, .95) < 250 && lastStats.domElements < 100,
  });
}

const report = { timestamp: new Date().toISOString(), environment: { node: process.version, viewport: '1440x760', dpr: 2 }, schemaValidation, validation, results };
console.log(JSON.stringify(report, null, 2));
if (schemaValidation.some((x) => !x.pass) || validation.some((x) => !x.pass) || results.some((x) => !x.pass)) process.exitCode = 1;
