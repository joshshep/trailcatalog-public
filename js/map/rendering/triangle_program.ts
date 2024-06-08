import { checkExists } from 'js/common/asserts';

import { RgbaU32, Vec2 } from '../common/types';

import { COLOR_OPERATIONS, Drawable, Program, ProgramData } from './program';

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
    halfViewportSize: WebGLUniformLocation;
    halfWorldSize: WebGLUniformLocation;
    z: WebGLUniformLocation;
  };
}

function createTriangleProgram(gl: WebGL2RenderingContext): TriangleProgramData {
  const programId = checkExists(gl.createProgram());

  const vs = `#version 300 es

      // Mercator coordinates range from -1 to 1 on both x and y
      // Pixels are in screen space (eg -320px to 320px for a 640px width)

      uniform highp vec2 cameraCenter; // Mercator
      uniform highp vec2 halfViewportSize; // pixels
      uniform highp float halfWorldSize; // pixels
      uniform highp float z;

      in uint fillColor;
      in highp vec2 position; // Mercator

      // See https://github.com/visgl/luma.gl/issues/1764
      invariant gl_Position;

      out mediump vec4 fragFillColor;

      ${COLOR_OPERATIONS}

      void main() {
        vec2 relativeCenter = position - cameraCenter;
        vec2 screenCoord = relativeCenter * halfWorldSize;
        gl_Position = vec4(screenCoord / halfViewportSize, z, 1);

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
      halfViewportSize: checkExists(gl.getUniformLocation(programId, 'halfViewportSize')),
      halfWorldSize: checkExists(gl.getUniformLocation(programId, 'halfWorldSize')),
      z: checkExists(gl.getUniformLocation(programId, 'z')),
    },
  };
}
