goog.module('org.trailcatalog.s2.externs');

const ArrayList = goog.require('java.util.ArrayList');
goog.exportSymbol('java.util.ArrayList', ArrayList);

const S1Angle = goog.require('com.google.common.geometry.S1Angle');
goog.exportSymbol('com.google.common.geometry.S1Angle', S1Angle);

const S2CellId = goog.require('com.google.common.geometry.S2CellId');
goog.exportSymbol('com.google.common.geometry.S2CellId', S2CellId);

const S2LatLng = goog.require('com.google.common.geometry.S2LatLng');
goog.exportSymbol('com.google.common.geometry.S2LatLng', S2LatLng);

const S2LatLngRect = goog.require('com.google.common.geometry.S2LatLngRect');
goog.exportSymbol('com.google.common.geometry.S2LatLngRect', S2LatLngRect);

const SimpleS2 = goog.require('org.trailcatalog.s2.SimpleS2');
goog.exportSymbol('org.trailcatalog.s2.SimpleS2', SimpleS2);
