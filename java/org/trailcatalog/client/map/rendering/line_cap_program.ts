import { checkExists } from '../../common/asserts';
import { VERTEX_STRIDE } from './line_program';
import { COLOR_OPERATIONS, Drawable, FP64_OPERATIONS, Program, ProgramData } from './program';

const CIRCLE_STEPS = 8;
const CIRCLE_VERTEX_COUNT = /* center */ 1 + CIRCLE_STEPS + /* end */ 1;

/** Renders lines caps as instanced circles. */
export class LineCapProgram extends Program<LineCapProgramData> {

  private readonly circleBuffer: WebGLBuffer;

  constructor(gl: WebGL2RenderingContext) {
    super(createLineCapProgram(gl), gl, gl.TRIANGLE_FAN);
    const vertices = [0, 0];
    const theta = 2 * Math.PI / CIRCLE_STEPS;
    for (let i = 0; i <= CIRCLE_STEPS; i++) {
      const x = Math.cos(i * theta);
      const y = Math.sin(i * theta);
      vertices.push(x, y);
    }
    this.circleBuffer = this.createStaticBuffer(new Float32Array(vertices));
  }

  protected activate(): void {
    const gl = this.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.useProgram(this.program.id);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleBuffer);
    gl.enableVertexAttribArray(this.program.attributes.position);
    gl.vertexAttribPointer(
        this.program.attributes.position,
        2,
        gl.FLOAT,
        /* normalize= */ false,
        /* stride= */ 0,
        /* offset= */ 0);

    gl.enableVertexAttribArray(this.program.attributes.colorFill);
    gl.vertexAttribDivisor(this.program.attributes.colorFill, 1);
    gl.enableVertexAttribArray(this.program.attributes.colorStroke);
    gl.vertexAttribDivisor(this.program.attributes.colorStroke, 1);
    gl.enableVertexAttribArray(this.program.attributes.next);
    gl.vertexAttribDivisor(this.program.attributes.next, 1);
    gl.enableVertexAttribArray(this.program.attributes.previous);
    gl.vertexAttribDivisor(this.program.attributes.previous, 1);
    gl.enableVertexAttribArray(this.program.attributes.radius);
    gl.vertexAttribDivisor(this.program.attributes.radius, 1);
  }

  protected bind(offset: number): void {
    const gl = this.gl;

    // These must match LineProgram, because we parasitize that geometry
    gl.vertexAttribPointer(
        this.program.attributes.previous,
        4,
        gl.FLOAT,
        /* normalize= */ false,
        VERTEX_STRIDE,
        /* offset= */ offset + 0);
    gl.vertexAttribPointer(
        this.program.attributes.next,
        4,
        gl.FLOAT,
        /* normalize= */ false,
        VERTEX_STRIDE,
        /* offset= */ offset + 16);
    gl.vertexAttribPointer(
        this.program.attributes.colorFill,
        1,
        gl.FLOAT,
        /* normalize= */ false,
        VERTEX_STRIDE,
        /* offset= */ offset + 32);
    gl.vertexAttribPointer(
        this.program.attributes.colorStroke,
        1,
        gl.FLOAT,
        /* normalize= */ false,
        VERTEX_STRIDE,
        /* offset= */ offset + 36);
    gl.vertexAttribPointer(
        this.program.attributes.radius,
        1,
        gl.FLOAT,
        /* normalize= */ false,
        VERTEX_STRIDE,
        /* offset= */ offset + 40);
  }

  protected draw(drawable: Drawable): void {
    if (drawable.instances === undefined) {
      throw new Error('Expecting instances');
    }

    const gl = this.gl;

    // Draw without the border, always replacing the stencil buffer
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilMask(0xff);
    gl.uniform1i(this.program.uniforms.renderBorder, 0);
    gl.uniform1ui(this.program.uniforms.side, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, this.program.vertexCount, drawable.instances);
    gl.uniform1ui(this.program.uniforms.side, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, this.program.vertexCount, drawable.instances);

    // Draw with the border only where we didn't already draw
    gl.stencilFunc(gl.NOTEQUAL, 1, 0xff);
    // Don't write to the stencil buffer so we don't overlap other lines
    gl.stencilMask(0x00);
    gl.uniform1i(this.program.uniforms.renderBorder, 1);
    // side 1 was already set, so no need for uniform1ui
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, this.program.vertexCount, drawable.instances);
    gl.uniform1ui(this.program.uniforms.side, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, this.program.vertexCount, drawable.instances);
  }

  protected deactivate(): void {
    const gl = this.gl;

    gl.disableVertexAttribArray(this.program.attributes.position);

    gl.vertexAttribDivisor(this.program.attributes.colorFill, 0);
    gl.disableVertexAttribArray(this.program.attributes.colorFill);
    gl.vertexAttribDivisor(this.program.attributes.colorStroke, 0);
    gl.disableVertexAttribArray(this.program.attributes.colorStroke);
    gl.vertexAttribDivisor(this.program.attributes.next, 0);
    gl.disableVertexAttribArray(this.program.attributes.next);
    gl.vertexAttribDivisor(this.program.attributes.previous, 0);
    gl.disableVertexAttribArray(this.program.attributes.previous);
    gl.vertexAttribDivisor(this.program.attributes.radius, 0);
    gl.disableVertexAttribArray(this.program.attributes.radius);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);
    gl.disable(gl.STENCIL_TEST);
  }
}

interface LineCapProgramData extends ProgramData {
  attributes: {
    colorFill: number;
    colorStroke: number;
    next: number;
    position: number;
    previous: number;
    radius: number;
  };
  uniforms: {
    cameraCenter: WebGLUniformLocation;
    halfViewportSize: WebGLUniformLocation;
    halfWorldSize: WebGLUniformLocation;
    side: WebGLUniformLocation;
    renderBorder: WebGLUniformLocation;
  };
}

function createLineCapProgram(gl: WebGL2RenderingContext): LineCapProgramData {
  const programId = checkExists(gl.createProgram());

  const vs = `#version 300 es
      // This is a Mercator coordinate ranging from -1 to 1 on both x and y
      uniform highp vec4 cameraCenter;
      uniform highp vec2 halfViewportSize;
      uniform highp float halfWorldSize;
      uniform bool renderBorder;
      uniform uint side;

      // The position of the vertex in the unit circle
      in highp vec2 position;

      // These are Mercator coordinates ranging from -1 to 1 on both x and y
      in highp vec4 next;
      in highp vec4 previous;

      in highp float colorFill;
      in highp float colorStroke;
      // This is a radius in pixels
      in highp float radius;

      out lowp vec4 fragColorFill;
      out lowp vec4 fragColorStroke;
      out lowp float fragRadius;
      out lowp float fragDistanceOrtho;

      ${COLOR_OPERATIONS}
      ${FP64_OPERATIONS}

      void main() {
        vec4 center = side == 0u ? previous : next;
        vec4 location = -cameraCenter + center;
        highp float actualRadius = radius - (renderBorder ? 0. : 2.);
        vec4 worldCoord =
            location * halfWorldSize
                + vec4(position.x, 0, position.y, 0) * actualRadius;
        gl_Position = vec4(reduce64(divide2Into64(worldCoord, halfViewportSize)), 0, 1);

        fragColorFill = uint32FToVec4(colorFill);
        fragColorStroke = uint32FToVec4(colorStroke);
        fragRadius = radius;
        fragDistanceOrtho = gl_VertexID == 0 ? 0. : actualRadius;
      }
    `;
  const fs = `#version 300 es

      uniform bool renderBorder;

      in lowp vec4 fragColorFill;
      in lowp vec4 fragColorStroke;
      in lowp float fragRadius;
      in lowp float fragDistanceOrtho;

      out lowp vec4 fragColor;

      void main() {
        mediump float o = abs(fragDistanceOrtho);
        lowp float blend = (o - 2.);
        lowp vec4 color = mix(fragColorFill, fragColorStroke, blend);
        fragColor = vec4(color.rgb, color.a * (1. - clamp(o - 3., 0., 1.)));
      }
  `;

  const vertexId = checkExists(gl.createShader(gl.VERTEX_SHADER));
  gl.shaderSource(vertexId, vs);
  gl.compileShader(vertexId);
  if (!gl.getShaderParameter(vertexId, gl.COMPILE_STATUS)) {
    throw new Error(`Unable to compile line vertex shader: ${gl.getShaderInfoLog(vertexId)}`);
  }
  gl.attachShader(programId, vertexId);

  const fragmentId = checkExists(gl.createShader(gl.FRAGMENT_SHADER));
  gl.shaderSource(fragmentId, fs);
  gl.compileShader(fragmentId);
  if (!gl.getShaderParameter(fragmentId, gl.COMPILE_STATUS)) {
    throw new Error(`Unable to compile line fragment shader: ${gl.getShaderInfoLog(fragmentId)}`);
  }
  gl.attachShader(programId, fragmentId);

  gl.linkProgram(programId);
  if (!gl.getProgramParameter(programId, gl.LINK_STATUS)) {
    throw new Error(`Unable to link line program: ${gl.getProgramInfoLog(programId)}`);
  }

  return {
    id: programId,
    // These must match LineProgram, because we parasitize that geometry
    instanceSize: VERTEX_STRIDE,
    vertexCount: CIRCLE_VERTEX_COUNT,
    attributes: {
      colorFill: checkExists(gl.getAttribLocation(programId, 'colorFill')),
      colorStroke: checkExists(gl.getAttribLocation(programId, 'colorStroke')),
      next: checkExists(gl.getAttribLocation(programId, 'next')),
      position: checkExists(gl.getAttribLocation(programId, 'position')),
      previous: checkExists(gl.getAttribLocation(programId, 'previous')),
      radius: checkExists(gl.getAttribLocation(programId, 'radius')),
    },
    uniforms: {
      cameraCenter: checkExists(gl.getUniformLocation(programId, 'cameraCenter')),
      halfViewportSize: checkExists(gl.getUniformLocation(programId, 'halfViewportSize')),
      halfWorldSize: checkExists(gl.getUniformLocation(programId, 'halfWorldSize')),
      renderBorder: checkExists(gl.getUniformLocation(programId, 'renderBorder')),
      side: checkExists(gl.getUniformLocation(programId, 'side')),
    },
  };
}

