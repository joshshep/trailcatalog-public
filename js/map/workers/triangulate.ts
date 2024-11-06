import earcut from 'earcut';

import { S2Polygon } from 'java/org/trailcatalog/s2';
import { checkExists } from 'external/dev_april_corgi~/js/common/asserts';

import { projectS2Loop } from '../camera';

export interface Triangles {
  geometry: ArrayLike<number>;
  index: number[];
}

export function triangulateMb(geometry: number[], starts: number[], maxTriangleLengthMeters?: number): Triangles {
  // We need to figure out what's an exterior and what's a ring. We do so by calculating the sign of
  // the polygon's area.
  starts.push(geometry.length);
  const groupedStarts = [];
  for (let i = 1; i < starts.length; ++i) {
    const begin = starts[i - 1];
    const end = starts[i];

    let area = 0;
    for (let i = begin + 2; i < end; i += 2) {
      area += (geometry[i + 0] - geometry[i - 2]) * (geometry[i - 1] + geometry[i + 1]);
    }
    area +=
        (geometry[begin + 0] - geometry[end - 2])
            * (geometry[end - 1] + geometry[begin + 1]);

    if (area > 0) {
      // close the last exterior group
      if (groupedStarts.length > 0) {
        groupedStarts[groupedStarts.length - 1].push(begin);
      }
      // push on a new exterior ring
      groupedStarts.push([begin]);
    } else if (groupedStarts.length > 0 && area < 0) {
      // if we haven't pushed any starts then there's no point making a hole
      groupedStarts[groupedStarts.length - 1].push(begin);
    }
  }

  if (groupedStarts.length === 0) {
    return {geometry: [], index: []};
  }

  // close the last exterior group
  groupedStarts[groupedStarts.length - 1].push(geometry.length);

  // Earcut each exterior and its holes. We have to do a bunch of indice mapping and unmapping to
  // reuse the geometry.
  const allIndices = [];
  for (const starts of groupedStarts) {
    const begin = checkExists(starts.shift());
    const end = checkExists(starts.pop());
    for (let i = 0; i < starts.length; ++i) {
      starts[i] = (starts[i] - begin) / 2;
    }

    const index = earcut(geometry.slice(begin, end), starts);
    for (const i of index) {
      allIndices.push(begin / 2 + i);
    }
  }

  if (maxTriangleLengthMeters !== undefined) {
    const maxLengthRadians = maxTriangleLengthMeters / 6378137;
    return subdivideTriangles2D(
      geometry,
      allIndices,
      maxLengthRadians * maxLengthRadians,
    );
  } else {
    return {
      geometry,
      index: allIndices,
    };
  }
}


// Helper function to subdivide triangles in 2D space
function subdivideTriangles2D(
  geometry: number[],
  indices: number[],
  maxLengthRadiansSq: number
): Triangles {
  const newIndices: number[] = [];
  const midpointIndices = new Map<number, number>();

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    subdivideTriangle2D(i0, i1, i2, geometry, newIndices, maxLengthRadiansSq, midpointIndices);
  }

  return {
    geometry,
    index: newIndices,
  };
}

function subdivideTriangle2D(
  i0: number,
  i1: number,
  i2: number,
  geometry: number[],
  indices: number[],
  maxLengthRadiansSq: number,
  midpointIndices: Map<number, number>
) {
  const p0 = [geometry[2 * i0], geometry[2 * i0 + 1]] as [number, number];
  const p1 = [geometry[2 * i1], geometry[2 * i1 + 1]] as [number, number];
  const p2 = [geometry[2 * i2], geometry[2 * i2 + 1]] as [number, number];

  // prefer to split too many triangles rather than too few
  const y = Math.min(Math.abs(p0[1]), Math.abs(p1[1]), Math.abs(p2[1]));
  // project then unproject then unproject *again* in the shader
  const lat = Math.asin(Math.tanh(y * Math.PI));
  const scale = Math.PI * Math.cos(lat); // bigger near the equator
  const scaledMaxLengthRadiansSq = maxLengthRadiansSq / (scale * scale); // Maybe pass this along recursively

  const d0 = distSq(p0, p1);
  const d1 = distSq(p1, p2);
  const d2 = distSq(p2, p0);

  const edge0TooLong = d0 > scaledMaxLengthRadiansSq;
  const edge1TooLong = d1 > scaledMaxLengthRadiansSq;
  const edge2TooLong = d2 > scaledMaxLengthRadiansSq;

  // If none of the edges are too long, keep the triangle as it is
  if (!edge0TooLong && !edge1TooLong && !edge2TooLong) {
    indices.push(i0, i1, i2);
    return;
  }

  function getMidpointIndex(iA: number, iB: number): number {
    const key = pair(iA, iB);
    const midpointIndex = midpointIndices.get(key);
    if (midpointIndex === undefined) {
      const xMid = (geometry[2 * iA] + geometry[2 * iB]) / 2;
      const yMid = (geometry[2 * iA + 1] + geometry[2 * iB + 1]) / 2;
      const index = geometry.length / 2;
      geometry.push(xMid, yMid);
      midpointIndices.set(key, index);
      return index;
    } else {
      return midpointIndex;
    }
  }

  // Subdivide edges as needed
  let a = i0;
  let b = i1;
  let c = i2;

  if (edge0TooLong && edge1TooLong && edge2TooLong) {
    const ab = getMidpointIndex(a, b);
    const bc = getMidpointIndex(b, c);
    const ca = getMidpointIndex(c, a);
    subdivideTriangle2D(a, ab, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(ab, b, bc, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(bc, c, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(ab, bc, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
  } else if (edge0TooLong && edge1TooLong) {
    const ab = getMidpointIndex(a, b);
    const bc = getMidpointIndex(b, c);
    subdivideTriangle2D(a, ab, c, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(ab, bc, c, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(ab, b, bc, geometry, indices, maxLengthRadiansSq, midpointIndices);
  } else if (edge0TooLong && edge2TooLong) {
    const ab = getMidpointIndex(a, b);
    const ca = getMidpointIndex(c, a);
    subdivideTriangle2D(a, ab, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(ab, b, c, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(ca, c, ab, geometry, indices, maxLengthRadiansSq, midpointIndices);
  } else if (edge1TooLong && edge2TooLong) {
    const bc = getMidpointIndex(b, c);
    const ca = getMidpointIndex(c, a);
    subdivideTriangle2D(a, b, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(b, bc, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(bc, c, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
  } else if (edge0TooLong) {
    const ab = getMidpointIndex(a, b);
    subdivideTriangle2D(a, ab, c, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(ab, b, c, geometry, indices, maxLengthRadiansSq, midpointIndices);
  } else if (edge1TooLong) {
    const bc = getMidpointIndex(b, c);
    subdivideTriangle2D(a, b, bc, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(a, bc, c, geometry, indices, maxLengthRadiansSq, midpointIndices);
  } else if (edge2TooLong) {
    const ca = getMidpointIndex(c, a);
    subdivideTriangle2D(a, b, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
    subdivideTriangle2D(b, c, ca, geometry, indices, maxLengthRadiansSq, midpointIndices);
  } else {
    // Should not reach here
    indices.push(a, b, c);
  }
}

// Map non-negative pairs of integers to non-negative integers. pair(a, b) = pair(b, a)
function pair(a: number, b: number): number {
  let max = Math.max(a, b);
  let min = Math.min(a, b);
  return max * (max + 1) / 2 + min;
}

function distSq(p1: number[], p2: number[]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return dx * dx + dy * dy;
}

export function triangulateS2(polygon: S2Polygon): Triangles {
  const loopsList = polygon.getLoops();
  const loops = [];
  for (let i = 0; i < loopsList.size(); ++i) {
    loops.push(loopsList.getAtIndex(i));
  }

  const exteriors = [];
  const holes = [];
  for (const loop of loops) {
    if (loop.isHole()) {
      holes.push(loop);
    } else {
      exteriors.push(loop);
    }
  }

  // Let's play a fun game: https://github.com/mapbox/earcut/issues/161
  // ... so it turns out we need to filter loops by what holes actually intersect.
  const relevantHoles = [];
  for (const exterior of exteriors) {
    const intersecting = [];
    for (let i = 0; i < holes.length; ++i) {
      if (exterior.intersects(holes[i])) {
        intersecting.push(i);
      }
    }
    relevantHoles.push(intersecting);
  }

  // Project all the exteriors. We track the offset because at the end we're going to jam all the
  // exteriors into the same array and we need to know where it will end up.
  let exteriorVertexLength = 0;
  const projectedExteriors = [];
  for (const exterior of exteriors) {
    const projected = projectS2Loop(exterior);
    projectedExteriors.push({
      offset: exteriorVertexLength,
      ...projected,
    });
    exteriorVertexLength += projected.vertices.length;
  }

  // Project all the holes. Track the offset for the same reason as above.
  let holeVertexLength = 0;
  const projectedHoles = [];
  for (const hole of holes) {
    const projected = projectS2Loop(hole);
    projectedHoles.push({
      offset: holeVertexLength,
      ...projected,
    });
    holeVertexLength += projected.vertices.length;
  }

  // We need to earcut *per* split *per* exterior ring. Lord have mercy on us if there's some
  // degenerate nonsense.
  const geometry = new Float32Array(exteriorVertexLength + holeVertexLength);
  let geometryOffset = 0;
  const index = [];
  for (let i = 0; i < projectedExteriors.length; ++i) {
    const {offset, splits, vertices} = projectedExteriors[i];

    // Jam all relevant holes into one buffer. Note that this is not necessarily sufficient to avoid
    // the earcut bug: we may have a multipolygon where the exterior has two disjoint loops (if it
    // crosses the meridian for example) and then there are two disjoint holes.
    let holesToCheck = [];
    let holeSize = 0;
    for (const holeI of relevantHoles[i]) {
      const hole = projectedHoles[holeI];
      holesToCheck.push(hole);
      holeSize += hole.vertices.length;
    }
    const holes = [];
    const holeVertices = new Float32Array(holeSize);
    holeSize = 0;
    for (const {splits, vertices} of holesToCheck) {
      holes.push(holeSize);
      for (const split of splits) {
        holes.push(holeSize + split);
      }
      // earcut doesn't need the last vertex since it assumes everything but the first loop is a
      // hole.
      holes.pop();
      holeVertices.set(vertices, holeSize);
      holeSize += vertices.length;
    }

    // Now we can check each exterior split against the holes.
    let start = 0;
    for (const split of splits) {
      const length = split - start;
      const allVertices = new Float32Array(length + holeSize);
      allVertices.set(vertices.subarray(start, length), 0);
      allVertices.set(holeVertices, length);

      // Figure out the hole positions relative to the loop vertices.
      const offsetHoles = [];
      for (const offset of holes) {
        offsetHoles.push((length + offset) / 2);
      }

      const triangulatedIndices = earcut(allVertices, offsetHoles);
      for (const indice of triangulatedIndices) {
        let trueIndice = -1;
        if (indice < length / 2) {
          trueIndice = (geometryOffset + start) / 2 + indice;
        } else {
          const offsetInHoles = 2 * indice - length;
          let holeOffset = 0;
          for (const {offset, vertices} of holesToCheck) {
            if (offsetInHoles < holeOffset + vertices.length) {
              trueIndice = (exteriorVertexLength + offset + offsetInHoles - holeOffset) / 2;
              break;
            }
            holeOffset += vertices.length;
          }

          if (trueIndice < 0) {
            throw new Error('Failed to find correct hole offset');
          }
        }
        index.push(trueIndice);
      }

      start = split;
    }

    geometry.set(vertices, geometryOffset);
    geometryOffset += vertices.length;
  }

  for (const {vertices} of projectedHoles) {
    geometry.set(vertices, geometryOffset);
    geometryOffset += vertices.length;
  }

  return {
    geometry,
    index,
  };
}
