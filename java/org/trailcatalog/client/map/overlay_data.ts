import { S2LatLng, S2Polygon } from 'java/org/trailcatalog/s2';
import { SimpleS2 } from 'java/org/trailcatalog/s2/SimpleS2';
import { Layer } from 'js/map/layer';
import { projectS2LatLng } from 'js/map/models/camera';
import { Line } from 'js/map/rendering/geometry';
import { RenderPlanner } from 'js/map/rendering/render_planner';
import { Renderer } from 'js/map/rendering/renderer';
import { TexturePool } from 'js/map/rendering/texture_pool';

import { LatLng, Vec2 } from '../common/types';
import { BOUNDARY_PALETTE } from './colors';

export interface Overlays {
  point?: LatLng;
  polygon?: S2Polygon;
}

const BOUNDARY_RADIUS_PX = 3;
const NO_OFFSET: Vec2 = [0, 0];

export class OverlayData extends Layer {

  private readonly billboards: Array<{
    center: Vec2;
    size: Vec2;
    texture: WebGLTexture;
  }>;
  private readonly lines: Line[];
  private bearIcon: WebGLTexture|undefined;
  private lastChange: number;

  constructor(overlays: Overlays, renderer: Renderer) {
    super();
    this.billboards = [];
    this.lastChange = Date.now();
    this.lines = [];

    fetch("/static/images/icons/bear-face.png")
        .then(response => {
          if (response.ok) {
            return response.blob()
                .then(blob => createImageBitmap(blob))
                .then(bitmap => {
                  const pool = new TexturePool(renderer);
                  this.bearIcon = pool.acquire();
                  renderer.uploadTexture(bitmap, this.bearIcon);
                });
          }
        });

    this.setOverlay(overlays);
  }

  setOverlay(overlays: Overlays) {
    this.billboards.length = 0;
    // TODO(april): need to have listeners for icon loads or else this can get lost
    if (overlays.point && this.bearIcon) {
      const center = projectS2LatLng(S2LatLng.fromDegrees(overlays.point[0], overlays.point[1]));
      this.billboards.push({
        center,
        size: [32, 32],
        texture: this.bearIcon,
      });
    }

    this.lines.length = 0;
    if (overlays.polygon) {
      for (let l = 0; l < overlays.polygon.numLoops(); ++l) {
        const loop = overlays.polygon.loop(l);
        const vertexCount = loop.numVertices();
        const vertices = new Float32Array(loop.numVertices() * 2 + 2);
        for (let v = 0; v < vertexCount; ++v) {
          const projected = projectS2LatLng(SimpleS2.pointToLatLng(loop.vertex(v)));
          vertices[v * 2 + 0] = projected[0];
          vertices[v * 2 + 1] = projected[1];
        }
        const projected = projectS2LatLng(SimpleS2.pointToLatLng(loop.vertex(0)));
        vertices[vertexCount * 2 + 0] = projected[0];
        vertices[vertexCount * 2 + 1] = projected[1];

        this.lines.push({
          colorFill: BOUNDARY_PALETTE.fill,
          colorStroke: BOUNDARY_PALETTE.stroke,
          stipple: false,
          vertices,
        });
      }
    }

    this.lastChange = Date.now();
  }

  hasDataNewerThan(time: number): boolean {
    return this.lastChange > time;
  }

  plan(viewportSize: Vec2, zoom: number, planner: RenderPlanner): void {
    for (const billboard of this.billboards) {
      planner.addBillboard(
          billboard.center, NO_OFFSET, billboard.size, billboard.texture, /* z= */ 10);
    }
    planner.addLines(this.lines, BOUNDARY_RADIUS_PX, 0);
  }

  viewportBoundsChanged(viewportSize: Vec2, zoom: number): void {}
}
