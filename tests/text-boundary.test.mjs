import test from 'node:test'
import assert from 'node:assert/strict'
import { pyStrip, textBudget, utf8Bytes } from '../src/text-boundary.js'

test('pyStrip matches Python-only control whitespace behavior', () => {
  assert.equal(pyStrip('\u001c\u0085 value \u001f'), 'value')
  assert.equal(pyStrip('\ufeffvalue\ufeff'), '\ufeffvalue\ufeff')
})

test('UTF-8 budget counts bytes rather than JavaScript code units', () => {
  assert.equal(utf8Bytes('abc'), 3)
  assert.equal(utf8Bytes('é'), 2)
  assert.equal(textBudget('x'.repeat(150)).ok, true)
  assert.equal(textBudget('x'.repeat(151)).ok, false)
})
