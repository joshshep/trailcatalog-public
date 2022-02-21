package org.trailcatalog.s2;

import com.google.common.geometry.S1Angle;
import com.google.common.geometry.S2CellId;
import com.google.common.geometry.S2CellUnion;
import com.google.common.geometry.S2LatLng;
import com.google.common.geometry.S2LatLngRect;
import com.google.common.geometry.S2RegionCoverer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import jsinterop.annotations.JsMethod;
import jsinterop.annotations.JsType;

@JsType
public final class SimpleS2 {

  public static final int HIGHEST_INDEX_LEVEL = 13;

  @JsMethod
  public static ArrayList<S2CellId> cover(S2LatLngRect viewport) {
    ArrayList<S2CellId> cells = new ArrayList<>();
    S2CellUnion union = new S2CellUnion();
    ArrayList<S2CellId> atLevel = new ArrayList<>();
    for (int level = HIGHEST_INDEX_LEVEL; level >= 0; --level) {
      S2RegionCoverer coverer =
          S2RegionCoverer.builder().setMaxCells(1000).setMinLevel(level).setMaxLevel(level).build();
      coverer.getCovering(viewport, union);
      union.expand(level);
      union.denormalize(level, /* levelMod= */ 1, atLevel);
      cells.addAll(atLevel);
    }
    return cells;
  }
}
