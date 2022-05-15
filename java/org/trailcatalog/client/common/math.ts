import { Long } from 'java/org/trailcatalog/s2';

import { Vec2, Vec4 } from './types';

export function metersToMiles(meters: number): number {
  return meters * 0.00062137119224;
}

const reinterpretIntBuffer = new ArrayBuffer(4);
const reinterpretLongBuffer = new ArrayBuffer(8);

/** Reads a float using the bits of a Closure Long. */
export function reinterpretLong(v: Long): number {
  const floats = new Int32Array(reinterpretLongBuffer);
  floats[0] = v.getHighBits();
  floats[1] = v.getLowBits();
  return new Float64Array(reinterpretLongBuffer)[0];
}

/**
 * Converts an rgba color in the range [0, 1] to an int, and then casts the int's bits to float.
 */
export function rgbaToUint32F(r: number, g: number, b: number, a: number): number {
  const v = ((255 * r) << 24) | ((255 * g) << 16) | ((255 * b) << 8) | (255 * a);
  const ints = new Int32Array(reinterpretIntBuffer);
  ints[0] = v;
  return new Float32Array(reinterpretIntBuffer)[0];
}

export function splitVec2(v: Vec2): Vec4 {
  const x = v[0];
  const xF = Math.fround(x);
  const y = v[1];
  const yF = Math.fround(y);
  return [xF, x - xF, yF, y - yF];
}

