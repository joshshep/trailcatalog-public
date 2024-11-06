import { checkExists } from 'external/dev_april_corgi~/js/common/asserts';

import { RgbaU32, Vec2 } from '../common/types';

import { COLOR_OPERATIONS, Drawable, FP64_OPERATIONS, Program, ProgramData } from './program';

const VERTEX_STRIDE =
    4 * (
        /* position= */ 2
    );

export class TriangleProgram extends Program<TriangleProgramData> {
  static push(
      geometry: Float32Array|Float64Array,
      index: ArrayLike<number>,
      fill: RgbaU32,
      geometryBuffer: ArrayBuffer,
      geometryOffset: number,
      indexBuffer: ArrayBuffer,
      indexOffset: number,
  ): {
    geometryByteLength: number;
    geometryOffset: number;
    indexByteLength: number;
    indexOffset: number;
    elementCount: number,
  } {
    const indices = new Uint32Array(indexBuffer, indexOffset);
    indices.set(index, 0);

    const floats = new Float32Array(geometryBuffer, geometryOffset);
    // Values that may represent NaN floats (colors) cannot be written as floats due to NaN
    // canonicalization. So we have to write them as uints to the same buffer.
    const uint32s = new Uint32Array(geometryBuffer, geometryOffset);

    uint32s[0] = fill;
    floats.set(geometry, 1);

    return {
      geometryByteLength: 4 + geometry.byteLength,
      geometryOffset,
      indexByteLength: index.length * 4,
      indexOffset,
      elementCount: indices.length,
    };
  }

  constructor(gl: WebGL2RenderingContext) {
    super(createTriangleProgram(gl), gl, gl.TRIANGLES);
    // super(createTriangleProgram(gl), gl, gl.LINE_STRIP);
    this.registerDisposer(() => {
      gl.deleteProgram(this.program.handle);
    });
  }

  plan(
      geometry: Float32Array|Float64Array,
      index: ArrayLike<number>,
      fill: RgbaU32,
      z: number,
      geometryBuffer: ArrayBuffer,
      geometryOffset: number,
      indexBuffer: ArrayBuffer,
      indexOffset: number,
      glGeometryBuffer: WebGLBuffer,
      glIndexBuffer: WebGLBuffer,
  ): Drawable {
    const result =
        TriangleProgram.push(
            geometry,
            index,
            fill,
            geometryBuffer,
            geometryOffset,
            indexBuffer,
            indexOffset);

    return {
      elements: {
        count: result.elementCount,
        index: glIndexBuffer,
        offset: result.indexOffset,
      },
      geometry: glGeometryBuffer,
      geometryByteLength: result.geometryByteLength,
      geometryOffset: result.geometryOffset,
      instanced: undefined,
      program: this,
      texture: undefined,
      vertexCount: undefined,
      z,
    };
  }

  protected activate(): void {
    const gl = this.gl;

    gl.enableVertexAttribArray(this.program.attributes.fillColor);
    gl.vertexAttribDivisor(this.program.attributes.fillColor, 1);
    gl.enableVertexAttribArray(this.program.attributes.position);
    
    gl.uniform1f(
        this.program.uniforms.flatEartherFactor,
        (window as any).animating === true ? stickyEase() : 0
    );
  }

  protected bindAttributes(offset: number): void {
    const gl = this.gl;
    gl.vertexAttribIPointer(
        this.program.attributes.fillColor,
        1,
        gl.UNSIGNED_INT,
        /* stride= */ 0,
        /* offset= */ offset + 0);
    gl.vertexAttribPointer(
        this.program.attributes.position,
        2,
        gl.FLOAT,
        /* normalize= */ false,
        /* stride= */ VERTEX_STRIDE,
        /* offset= */ offset + 4);
  }

  protected deactivate(): void {
    const gl = this.gl;

    gl.vertexAttribDivisor(this.program.attributes.fillColor, 0);
    gl.disableVertexAttribArray(this.program.attributes.fillColor);
    gl.disableVertexAttribArray(this.program.attributes.position);
  }
}

interface TriangleProgramData extends ProgramData {
  attributes: {
    fillColor: number;
    position: number;
  };

  uniforms: {
    cameraCenter: WebGLUniformLocation;
    flatEartherFactor: WebGLUniformLocation;
    halfWorldSize: WebGLUniformLocation;
    inverseHalfViewportSize: WebGLUniformLocation;
    mvpMatrix: WebGLUniformLocation;
    z: WebGLUniformLocation;
  };
}

function createTriangleProgram(gl: WebGL2RenderingContext): TriangleProgramData {
  const programId = checkExists(gl.createProgram());

  const vs = `#version 300 es

// Mercator coordinates range from -1 to 1 on both x and y
// Pixels are in screen space (eg -320px to 320px for a 640px width)

uniform highp mat4 mvpMatrix;
uniform highp vec4 cameraCenter; // Mercator
uniform highp vec2 inverseHalfViewportSize; // pixels
uniform highp float halfWorldSize; // pixels
uniform highp float z;
uniform highp float flatEartherFactor;

in uint fillColor;
in highp vec2 position; // Mercator

// See https://github.com/visgl/luma.gl/issues/1764
invariant gl_Position;

out mediump vec4 fragFillColor;

const float PI = 3.141592653589793;

${COLOR_OPERATIONS}
${FP64_OPERATIONS}

void main() {
  vec4 relativeCenter = sub_fp64(split(position), cameraCenter);
  vec4 screenCoord =
      mul_fp64(relativeCenter, vec4(split(halfWorldSize), split(halfWorldSize)));
  vec4 p = mul_fp64(screenCoord, split(inverseHalfViewportSize));
  vec4 flatEartherPos = vec4(p.x + p.y, p.z + p.w, z, 1);

  // Aaaaand we're back to latlng. It's great to be back.
  float sinLat = tanh(position.y * PI);
  float lat = asin(sinLat);
  float cosLat = cos(lat);
  float lng = position.x * PI;

  // Convert lat/lng to 3D Cartesian coordinates on a sphere
  vec4 worldPosition = vec4(
      cosLat * cos(lng), // x
      sinLat,            // y
      cosLat * sin(lng), // z
      1.0                // w
  );

  vec4 sphereEartherPos = mvpMatrix * worldPosition;

  gl_Position = mix(sphereEartherPos, flatEartherPos, flatEartherFactor);

  fragFillColor = uint32ToVec4(fillColor);
  fragFillColor = vec4(fragFillColor.rgb * fragFillColor.a, fragFillColor.a);
}
    `;
  const fs = `#version 300 es

in mediump vec4 fragFillColor;

out mediump vec4 fragColor;

void main() {
  fragColor = fragFillColor;
}
  `;

  const vertexId = checkExists(gl.createShader(gl.VERTEX_SHADER));
  gl.shaderSource(vertexId, vs);
  gl.compileShader(vertexId);
  if (!gl.getShaderParameter(vertexId, gl.COMPILE_STATUS)) {
    throw new Error(`Unable to compile triangle vertex shader: ${gl.getShaderInfoLog(vertexId)}`);
  }
  gl.attachShader(programId, vertexId);

  const fragmentId = checkExists(gl.createShader(gl.FRAGMENT_SHADER));
  gl.shaderSource(fragmentId, fs);
  gl.compileShader(fragmentId);
  if (!gl.getShaderParameter(fragmentId, gl.COMPILE_STATUS)) {
    throw new Error(`Unable to compile triangle fragment shader: ${gl.getShaderInfoLog(fragmentId)}`);
  }
  gl.attachShader(programId, fragmentId);

  gl.linkProgram(programId);
  if (!gl.getProgramParameter(programId, gl.LINK_STATUS)) {
    throw new Error(`Unable to link triangle program: ${gl.getProgramInfoLog(programId)}`);
  }

  return {
    handle: programId,
    attributes: {
      fillColor: gl.getAttribLocation(programId, 'fillColor'),
      position: gl.getAttribLocation(programId, 'position'),
    },
    uniforms: {
      cameraCenter: checkExists(gl.getUniformLocation(programId, 'cameraCenter')),
      flatEartherFactor: checkExists(gl.getUniformLocation(programId, 'flatEartherFactor')),
      halfWorldSize: checkExists(gl.getUniformLocation(programId, 'halfWorldSize')),
      inverseHalfViewportSize: checkExists(gl.getUniformLocation(programId, 'inverseHalfViewportSize')),
      mvpMatrix: checkExists(gl.getUniformLocation(programId, 'mvpMatrix')),
      z: checkExists(gl.getUniformLocation(programId, 'z')),
    },
  };
}

function easeInOutCubic(t: number) {
  let eased;
  if (t < 0.5) {
    eased = 4 * t * t * t;
  } else {
    t = -2 * t + 2;
    eased = 1 - t * t * t / 2;
  }
  return Math.min(1, Math.max(0, eased));
}

const animationStartMs = window.performance.now();
function stickyEase() {
  const cycleDuration = 4000;
  let t = (window.performance.now() - animationStartMs) % cycleDuration;
  const d = cycleDuration / 2;
  const stopTime = 500;
  if (t < stopTime) {
    return 0;
  } else if (t < d) {
    t = (t - stopTime) / (d - stopTime);
    return easeInOutCubic(t);
  } else if (t < d + stopTime) {
    return 1;
  }
  t = (t - d - stopTime) / (d - stopTime);
  return 1 - easeInOutCubic(t);
}
