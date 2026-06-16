/****************************************************************************************
FINAL UPDATED REPRODUCIBLE GOOGLE EARTH ENGINE SCRIPT
Manuscript: SUSGEO-D-26-00056R2

Remote Sensing-Based Uncertainty-Aware Flood Hazard Assessment
in the Volta River Basin Using Extreme Rainfall and Multi-Source Satellite Data

IMPORTANT CORRECTIONS FOR RESUBMISSION
1. Figure 7 is generated from the corrected AHP/FHI model in Eq. 14.
2. Table 6 is generated from the corrected AHP/FHI hazard classes.
3. Raster exports use the corrected AHP/FHI model.
4. Validation is re-run using the corrected hazard map.
5. The old statement that "Figure 7 remains the original map" has been removed.

Corrected Eq. 14:
FHI = 0.419(Rx1day+) + 0.292(Rx5day+) + 0.113(NDVI-)
    + 0.090(ET-) + 0.048(LST+) + 0.038(CWSI+)

Validation rule used in this public reproducibility script:
Moderate and high hazard classes 2 and 3 = predicted flood-prone
Low hazard class 1 = predicted non-flood

Public validation reference:
Global Flood Database / DFO-based flood inventory
****************************************************************************************/


/****************************************************************************************
1. STUDY AREA AND SETTINGS
****************************************************************************************/

var basin = ee.FeatureCollection('projects/ee-owusugeorge946/assets/VOLTA_RIVER_BASIN');
var basinGeom = basin.geometry();
var basinBounds = basinGeom.bounds();

Map.centerObject(basin, 6);

var indexYear = 2020;
var mainYears = [2000, 2010, 2020, 2024];

var exportScale = 1000;
var exportCRS = 'EPSG:4326';
var exportFolder = 'Volta_Flood_Hazard_Corrected_AHP_GFD_FINAL';

// Set this to false if you only want CSV outputs.
var RUN_RASTER_EXPORTS = true;


/****************************************************************************************
2. DATASETS
****************************************************************************************/

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterBounds(basinGeom);

var modisNDVI = ee.ImageCollection('MODIS/061/MOD13Q1')
  .filterBounds(basinGeom);

var modisET = ee.ImageCollection('MODIS/061/MOD16A2GF')
  .filterBounds(basinGeom);

var modisLST = ee.ImageCollection('MODIS/061/MOD11A2')
  .filterBounds(basinGeom);

var srtm = ee.Image('USGS/SRTMGL1_003')
  .clip(basinGeom);

var waterOccurrence = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .clip(basinGeom);

var mainWater = waterOccurrence.gte(85)
  .selfMask()
  .rename('Main_River_Water');


/****************************************************************************************
3. GRID, BOUNDARY, AND VISUALISATION SETTINGS
****************************************************************************************/

var lonList = ee.List.sequence(-8, 4, 4);
var latList = ee.List.sequence(6, 14, 4);

var lonLines = ee.FeatureCollection(lonList.map(function(lon) {
  lon = ee.Number(lon);
  return ee.Feature(
    ee.Geometry.LineString([[lon, 5], [lon, 16]]),
    {type: 'longitude'}
  );
}));

var latLines = ee.FeatureCollection(latList.map(function(lat) {
  lat = ee.Number(lat);
  return ee.Feature(
    ee.Geometry.LineString([[-9, lat], [5, lat]]),
    {type: 'latitude'}
  );
}));

var gridLines = lonLines.merge(latLines);

var basinOutline = ee.Image().byte().paint({
  featureCollection: basin,
  color: 1,
  width: 2
});

var gridImage = ee.Image().byte().paint({
  featureCollection: gridLines,
  color: 1,
  width: 1
});

var rainVis = {
  min: 400,
  max: 1800,
  palette: ['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e']
};

var rxVis = {
  min: 0,
  max: 120,
  palette: ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#225ea8']
};

var cddVis = {
  min: 0,
  max: 180,
  palette: ['#fff5f0', '#fcbba1', '#fc9272', '#ef3b2c', '#99000d']
};

var cwdVis = {
  min: 0,
  max: 30,
  palette: ['#f7fcf0', '#ccebc5', '#7bccc4', '#2b8cbe', '#084081']
};

var ndviVis = {
  min: 0.1,
  max: 0.7,
  palette: ['#d73027', '#fdae61', '#ffffbf', '#a6d96a', '#1a9850']
};

var etVis = {
  min: 200,
  max: 900,
  palette: ['#f7fcfd', '#ccece6', '#66c2a4', '#238b45', '#00441b']
};

var lstVis = {
  min: 20,
  max: 45,
  palette: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#f46d43', '#d73027']
};

var cwsiVis = {
  min: 0,
  max: 1,
  palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c']
};

var elevVis = {
  min: 0,
  max: 800,
  palette: ['#f7fcf5', '#c7e9c0', '#74c476', '#238b45', '#00441b']
};

var hazardVis = {
  min: 1,
  max: 3,
  palette: ['#cfe3f5', '#67add8', '#08519c']
};

var fhiVis = {
  min: 0,
  max: 1,
  palette: ['#eff3ff', '#bdd7e7', '#6baed6', '#2171b5', '#08306b']
};

var waterVis = {
  palette: ['#08306b']
};


/****************************************************************************************
4. HYDRO-CLIMATIC INDICATOR FUNCTIONS
****************************************************************************************/

function annualRainfall(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return chirps
    .filterDate(start, end)
    .sum()
    .rename('Rainfall')
    .clip(basinGeom);
}

function rx1day(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return chirps
    .filterDate(start, end)
    .max()
    .rename('Rx1day')
    .clip(basinGeom);
}

function rx5day(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  var nDays = end.difference(start, 'day');
  var offsets = ee.List.sequence(0, nDays.subtract(5));

  var rolling5 = ee.ImageCollection.fromImages(
    offsets.map(function(d) {
      d = ee.Number(d);
      var s = start.advance(d, 'day');
      var e = s.advance(5, 'day');

      return chirps
        .filterDate(s, e)
        .sum()
        .rename('Rx5day')
        .set('system:time_start', s.millis());
    })
  );

  return rolling5
    .max()
    .rename('Rx5day')
    .clip(basinGeom);
}

function calcCDD(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  var daily = chirps.filterDate(start, end).sort('system:time_start');
  var list = daily.toList(daily.size());
  var size = daily.size();

  var init = ee.Dictionary({
    current: ee.Image.constant(0).clip(basinGeom),
    max: ee.Image.constant(0).clip(basinGeom)
  });

  var result = ee.List.sequence(0, size.subtract(1)).iterate(function(i, state) {
    state = ee.Dictionary(state);
    var img = ee.Image(list.get(i)).clip(basinGeom);
    var isDry = img.lt(1);

    var current = ee.Image(state.get('current'));
    var maxRun = ee.Image(state.get('max'));

    var newCurrent = current.add(1).where(isDry.not(), 0);
    var newMax = maxRun.max(newCurrent);

    return ee.Dictionary({
      current: newCurrent,
      max: newMax
    });
  }, init);

  return ee.Image(ee.Dictionary(result).get('max'))
    .rename('CDD')
    .clip(basinGeom);
}

function calcCWD(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  var daily = chirps.filterDate(start, end).sort('system:time_start');
  var list = daily.toList(daily.size());
  var size = daily.size();

  var init = ee.Dictionary({
    current: ee.Image.constant(0).clip(basinGeom),
    max: ee.Image.constant(0).clip(basinGeom)
  });

  var result = ee.List.sequence(0, size.subtract(1)).iterate(function(i, state) {
    state = ee.Dictionary(state);
    var img = ee.Image(list.get(i)).clip(basinGeom);
    var isWet = img.gte(1);

    var current = ee.Image(state.get('current'));
    var maxRun = ee.Image(state.get('max'));

    var newCurrent = current.add(1).where(isWet.not(), 0);
    var newMax = maxRun.max(newCurrent);

    return ee.Dictionary({
      current: newCurrent,
      max: newMax
    });
  }, init);

  return ee.Image(ee.Dictionary(result).get('max'))
    .rename('CWD')
    .clip(basinGeom);
}

function annualNDVI(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return modisNDVI
    .filterDate(start, end)
    .select('NDVI')
    .mean()
    .multiply(0.0001)
    .rename('NDVI')
    .clip(basinGeom);
}

function annualET(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return modisET
    .filterDate(start, end)
    .select('ET')
    .sum()
    .multiply(0.1)
    .rename('ET')
    .clip(basinGeom);
}

function annualLST(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return modisLST
    .filterDate(start, end)
    .select('LST_Day_1km')
    .mean()
    .multiply(0.02)
    .subtract(273.15)
    .rename('LST')
    .clip(basinGeom);
}

function annualCWSI(year) {
  var lst = annualLST(year);

  var stats = lst.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: basinGeom,
    scale: exportScale,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale: 8
  });

  var tmin = ee.Number(stats.get('LST_min'));
  var tmax = ee.Number(stats.get('LST_max'));
  var range = tmax.subtract(tmin);
  var safeRange = ee.Number(ee.Algorithms.If(range.eq(0), 1, range));

  return lst
    .subtract(tmin)
    .divide(safeRange)
    .clamp(0, 1)
    .rename('CWSI')
    .clip(basinGeom);
}


/****************************************************************************************
5. NORMALISATION FUNCTIONS
****************************************************************************************/

function normalizePositive(img, scale) {
  img = ee.Image(img);
  var band = ee.String(img.bandNames().get(0));

  var stats = img.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: basinGeom,
    scale: scale,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale: 8
  });

  var min = ee.Number(stats.get(band.cat('_min')));
  var max = ee.Number(stats.get(band.cat('_max')));
  var range = max.subtract(min);
  var safeRange = ee.Number(ee.Algorithms.If(range.eq(0), 1, range));

  return img
    .subtract(min)
    .divide(safeRange)
    .clamp(0, 1);
}

function normalizeInverse(img, scale) {
  img = ee.Image(img);
  var band = ee.String(img.bandNames().get(0));

  var stats = img.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: basinGeom,
    scale: scale,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale: 8
  });

  var min = ee.Number(stats.get(band.cat('_min')));
  var max = ee.Number(stats.get(band.cat('_max')));
  var range = max.subtract(min);
  var safeRange = ee.Number(ee.Algorithms.If(range.eq(0), 1, range));

  return ee.Image(max)
    .subtract(img)
    .divide(safeRange)
    .clamp(0, 1);
}


/****************************************************************************************
6. CORRECTED AHP FLOOD HAZARD MODEL
****************************************************************************************/

var wRx1day = 0.419;
var wRx5day = 0.292;
var wNDVI = 0.113;
var wET = 0.090;
var wLST = 0.048;
var wCWSI = 0.038;

function floodHazardIndex_AHP(year) {
  var rx1Pos = normalizePositive(rx1day(year), 5000);
  var rx5Pos = normalizePositive(rx5day(year), 5000);
  var ndviInv = normalizeInverse(annualNDVI(year), 1000);
  var etInv = normalizeInverse(annualET(year), 500);
  var lstPos = normalizePositive(annualLST(year), 1000);
  var cwsiPos = normalizePositive(annualCWSI(year), 1000);

  return rx1Pos.multiply(wRx1day)
    .add(rx5Pos.multiply(wRx5day))
    .add(ndviInv.multiply(wNDVI))
    .add(etInv.multiply(wET))
    .add(lstPos.multiply(wLST))
    .add(cwsiPos.multiply(wCWSI))
    .rename('FHI_AHP')
    .clip(basinGeom);
}

function floodHazardClass_AHP(year) {
  var fhi = floodHazardIndex_AHP(year);

  return ee.Image(1)
    .where(fhi.gte(0.33), 2)
    .where(fhi.gte(0.66), 3)
    .rename('FloodHazardClass_AHP')
    .clip(basinGeom);
}


/****************************************************************************************
7. MAP DISPLAY LAYERS
****************************************************************************************/

Map.addLayer(floodHazardClass_AHP(2000), hazardVis, 'Corrected AHP Flood Hazard 2000', false);
Map.addLayer(floodHazardClass_AHP(2010), hazardVis, 'Corrected AHP Flood Hazard 2010', false);
Map.addLayer(floodHazardClass_AHP(2020), hazardVis, 'Corrected AHP Flood Hazard 2020', false);
Map.addLayer(floodHazardClass_AHP(2024), hazardVis, 'Corrected AHP Flood Hazard 2024', true);
Map.addLayer(mainWater, waterVis, 'Main river / water bodies', true);
Map.addLayer(gridImage, {palette: ['#bdbdbd']}, 'Grid lines', true);
Map.addLayer(basinOutline, {palette: ['#000000']}, 'Volta Basin Boundary', true);


/****************************************************************************************
8. FIGURE RENDERING FUNCTIONS
****************************************************************************************/

function renderImage(image, vis) {
  var white = ee.Image.constant(1)
    .clip(basinBounds.buffer(300000))
    .visualize({
      palette: ['ffffff'],
      forceRgbOutput: true
    });

  var data = ee.Image(image).visualize(vis);

  var gridLayer = gridImage
    .clip(basinBounds.buffer(300000))
    .visualize({
      palette: ['bdbdbd'],
      opacity: 0.65,
      forceRgbOutput: true
    });

  var waterLayer = mainWater
    .visualize({
      palette: ['08306b'],
      opacity: 1.0,
      forceRgbOutput: true
    });

  var boundary = basinOutline
    .visualize({
      palette: ['000000'],
      forceRgbOutput: true
    });

  return ee.ImageCollection([
    white,
    data,
    gridLayer,
    waterLayer,
    boundary
  ]).mosaic();
}

function makeThumbPanel(image, vis, labelText) {
  var rendered = renderImage(image, vis);

  var thumb = ui.Thumbnail({
    image: rendered,
    params: {
      region: basinBounds,
      dimensions: 420,
      format: 'png'
    },
    style: {
      width: '420px',
      height: '245px',
      border: '1px solid #bfbfbf',
      backgroundColor: '#ffffff',
      margin: '0px',
      padding: '0px'
    }
  });

  var label = ui.Label(labelText, {
    fontWeight: 'bold',
    fontSize: '16px',
    textAlign: 'center',
    stretch: 'horizontal',
    margin: '4px 0 0 0',
    padding: '0px',
    color: 'black',
    backgroundColor: '#efefef'
  });

  return ui.Panel(
    [thumb, label],
    ui.Panel.Layout.flow('vertical'),
    {
      width: '425px',
      margin: '0px 6px 6px 0px',
      padding: '0px',
      backgroundColor: '#efefef'
    }
  );
}

function makeSinglePanel(image, vis, labelText) {
  var rendered = renderImage(image, vis);

  var thumb = ui.Thumbnail({
    image: rendered,
    params: {
      region: basinBounds,
      dimensions: 720,
      format: 'png'
    },
    style: {
      width: '720px',
      height: '430px',
      border: '1px solid #bfbfbf',
      backgroundColor: '#ffffff',
      margin: '0px',
      padding: '0px'
    }
  });

  var label = ui.Label(labelText, {
    fontWeight: 'bold',
    fontSize: '18px',
    textAlign: 'center',
    stretch: 'horizontal',
    margin: '6px 0 0 0',
    padding: '0px',
    color: 'black',
    backgroundColor: '#efefef'
  });

  return ui.Panel(
    [thumb, label],
    ui.Panel.Layout.flow('vertical'),
    {
      width: '725px',
      margin: '0px auto',
      padding: '0px',
      backgroundColor: '#efefef'
    }
  );
}

function makeLegend(items) {
  var panel = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      stretch: 'horizontal',
      backgroundColor: '#efefef',
      margin: '6px 0 0 0',
      padding: '2px 4px'
    }
  });

  items.forEach(function(item) {
    var colorBox = ui.Label('', {
      backgroundColor: item.color,
      padding: '8px',
      margin: '0 4px 0 8px',
      border: '1px solid #999999'
    });

    var text = ui.Label(item.label, {
      margin: '0 10px 0 0',
      fontSize: '14px',
      color: 'black'
    });

    panel.add(colorBox);
    panel.add(text);
  });

  return panel;
}

function showFigure(mainTitle, panels, legendItems) {
  ui.root.clear();

  var title = ui.Label(mainTitle, {
    fontWeight: 'bold',
    fontSize: '18px',
    textAlign: 'center',
    stretch: 'horizontal',
    margin: '4px 0 8px 0',
    padding: '0px',
    color: 'black',
    backgroundColor: '#efefef'
  });

  var row1 = ui.Panel(
    [panels[0], panels[1]],
    ui.Panel.Layout.flow('horizontal'),
    {
      backgroundColor: '#efefef',
      margin: '0px',
      padding: '0px'
    }
  );

  var row2 = ui.Panel(
    [panels[2], panels[3]],
    ui.Panel.Layout.flow('horizontal'),
    {
      backgroundColor: '#efefef',
      margin: '0px',
      padding: '0px'
    }
  );

  var widgets = [title, row1, row2];

  if (legendItems && Array.isArray(legendItems)) {
    if (legendItems.length > 0 && Array.isArray(legendItems[0])) {
      legendItems.forEach(function(oneLegend) {
        widgets.push(makeLegend(oneLegend));
      });
    } else {
      widgets.push(makeLegend(legendItems));
    }
  }

  ui.root.add(
    ui.Panel(
      widgets,
      ui.Panel.Layout.flow('vertical'),
      {
        backgroundColor: '#efefef',
        padding: '4px',
        margin: '0px',
        stretch: 'both'
      }
    )
  );
}

function showSingleFigure(mainTitle, panel, legendItems) {
  ui.root.clear();

  var title = ui.Label(mainTitle, {
    fontWeight: 'bold',
    fontSize: '18px',
    textAlign: 'center',
    stretch: 'horizontal',
    margin: '4px 0 8px 0',
    padding: '0px',
    color: 'black',
    backgroundColor: '#efefef'
  });

  var widgets = [title, panel];

  if (legendItems && Array.isArray(legendItems)) {
    if (legendItems.length > 0 && Array.isArray(legendItems[0])) {
      legendItems.forEach(function(oneLegend) {
        widgets.push(makeLegend(oneLegend));
      });
    } else {
      widgets.push(makeLegend(legendItems));
    }
  }

  ui.root.add(
    ui.Panel(
      widgets,
      ui.Panel.Layout.flow('vertical'),
      {
        backgroundColor: '#efefef',
        padding: '4px',
        margin: '0px',
        stretch: 'both'
      }
    )
  );
}


/****************************************************************************************
9. FIGURE FUNCTIONS
****************************************************************************************/

function showFigure1() {
  showSingleFigure(
    'Figure 1. Location and Elevation of the Volta River Basin',
    makeSinglePanel(srtm, elevVis, 'Study Area Map'),
    [
      {label: 'Low elevation', color: '#f7fcf5'},
      {label: 'Moderate elevation', color: '#74c476'},
      {label: 'High elevation', color: '#00441b'}
    ]
  );
}

function showFigure3() {
  showFigure(
    'Figure 3. Spatial Distribution of Annual Rainfall in the Volta River Basin',
    [
      makeThumbPanel(annualRainfall(2000), rainVis, 'Rainfall 2000'),
      makeThumbPanel(annualRainfall(2010), rainVis, 'Rainfall 2010'),
      makeThumbPanel(annualRainfall(2020), rainVis, 'Rainfall 2020'),
      makeThumbPanel(annualRainfall(2024), rainVis, 'Rainfall 2024')
    ],
    [
      {label: 'Low', color: '#8c510a'},
      {label: 'Moderate', color: '#f6e8c3'},
      {label: 'High', color: '#01665e'}
    ]
  );
}

function showFigure4() {
  showFigure(
    'Figure 4. Spatial Patterns of Extreme Rainfall Indices in the Volta River Basin',
    [
      makeThumbPanel(rx1day(indexYear), rxVis, 'Rx1day 2020'),
      makeThumbPanel(rx5day(indexYear), rxVis, 'Rx5day 2020'),
      makeThumbPanel(calcCDD(indexYear), cddVis, 'CDD 2020'),
      makeThumbPanel(calcCWD(indexYear), cwdVis, 'CWD 2020')
    ],
    [
      [
        {label: 'Low', color: '#ffffcc'},
        {label: 'Moderate', color: '#41b6c4'},
        {label: 'High', color: '#225ea8'}
      ],
      [
        {label: 'CDD Low', color: '#fff5f0'},
        {label: 'CDD Moderate', color: '#fc9272'},
        {label: 'CDD High', color: '#99000d'}
      ],
      [
        {label: 'CWD Low', color: '#f7fcf0'},
        {label: 'CWD Moderate', color: '#7bccc4'},
        {label: 'CWD High', color: '#084081'}
      ]
    ]
  );
}

function showFigure5() {
  showFigure(
    'Figure 5. Spatial Distribution of NDVI and Evapotranspiration in the Volta River Basin',
    [
      makeThumbPanel(annualNDVI(2020), ndviVis, 'NDVI 2020'),
      makeThumbPanel(annualNDVI(2024), ndviVis, 'NDVI 2024'),
      makeThumbPanel(annualET(2020), etVis, 'ET 2020'),
      makeThumbPanel(annualET(2024), etVis, 'ET 2024')
    ],
    [
      [
        {label: 'Very Low', color: '#d73027'},
        {label: 'Low', color: '#fdae61'},
        {label: 'Moderate', color: '#ffffbf'},
        {label: 'High', color: '#a6d96a'},
        {label: 'Very High', color: '#1a9850'}
      ],
      [
        {label: 'Low', color: '#f7fcfd'},
        {label: 'Moderate', color: '#66c2a4'},
        {label: 'High', color: '#00441b'}
      ]
    ]
  );
}

function showFigure6() {
  showFigure(
    'Figure 6. Spatial Distribution of Land Surface Temperature and Crop Water Stress Index in the Volta River Basin',
    [
      makeThumbPanel(annualLST(2020), lstVis, 'LST 2020'),
      makeThumbPanel(annualLST(2024), lstVis, 'LST 2024'),
      makeThumbPanel(annualCWSI(2020), cwsiVis, 'CWSI 2020'),
      makeThumbPanel(annualCWSI(2024), cwsiVis, 'CWSI 2024')
    ],
    [
      [
        {label: 'Cool', color: '#313695'},
        {label: 'Moderate', color: '#abd9e9'},
        {label: 'Hot', color: '#d73027'}
      ],
      [
        {label: 'Low stress', color: '#2c7bb6'},
        {label: 'Moderate stress', color: '#ffffbf'},
        {label: 'High stress', color: '#d7191c'}
      ]
    ]
  );
}

function showFigure7() {
  showFigure(
    'Figure 7. Corrected AHP-Based Flood Hazard Classification in the Volta River Basin',
    [
      makeThumbPanel(floodHazardClass_AHP(2000), hazardVis, 'Flood Hazard 2000'),
      makeThumbPanel(floodHazardClass_AHP(2010), hazardVis, 'Flood Hazard 2010'),
      makeThumbPanel(floodHazardClass_AHP(2020), hazardVis, 'Flood Hazard 2020'),
      makeThumbPanel(floodHazardClass_AHP(2024), hazardVis, 'Flood Hazard 2024')
    ],
    [
      {label: 'Low hazard', color: '#cfe3f5'},
      {label: 'Moderate hazard', color: '#67add8'},
      {label: 'High hazard', color: '#08519c'}
    ]
  );
}


/****************************************************************************************
10. CORRECTED TABLE 6 AREA STATISTICS
****************************************************************************************/

function className(code) {
  return ee.Algorithms.If(
    ee.Number(code).eq(1),
    'Low Hazard',
    ee.Algorithms.If(
      ee.Number(code).eq(2),
      'Moderate Hazard',
      'High Hazard'
    )
  );
}

function hazardAreaStats_AHP(classImage, year) {
  classImage = ee.Image(classImage);

  var areaImage = ee.Image.pixelArea()
    .divide(1e6)
    .rename('Area_km2');

  var totalArea = ee.Number(
    areaImage.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: basinGeom,
      scale: exportScale,
      maxPixels: 1e13,
      tileScale: 8
    }).get('Area_km2')
  );

  var classCodes = ee.List([1, 2, 3]);

  var features = classCodes.map(function(code) {
    code = ee.Number(code);

    var areaValue = areaImage
      .updateMask(classImage.eq(code))
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: basinGeom,
        scale: exportScale,
        maxPixels: 1e13,
        tileScale: 8
      })
      .get('Area_km2');

    var area = ee.Number(ee.Algorithms.If(areaValue, areaValue, 0));
    var percent = area.divide(totalArea).multiply(100);

    return ee.Feature(null, {
      Year: year,
      Hazard_Class_Code: code,
      Hazard_Class: className(code),
      Area_km2: area,
      Percentage: percent
    });
  });

  return ee.FeatureCollection(features);
}

var table6Stats = ee.FeatureCollection([]);

mainYears.forEach(function(year) {
  table6Stats = table6Stats.merge(
    hazardAreaStats_AHP(floodHazardClass_AHP(year), year)
  );
});

print('TABLE 6 CORRECTED AHP AREA STATISTICS', table6Stats);

Export.table.toDrive({
  collection: table6Stats,
  description: 'Table_6_Corrected_AHP_Flood_Hazard_Area_Statistics',
  folder: exportFolder,
  fileNamePrefix: 'Table_6_Corrected_AHP_Flood_Hazard_Area_Statistics',
  fileFormat: 'CSV'
});


/****************************************************************************************
11. HYDRO-CLIMATIC VARIABLE STATISTICS
****************************************************************************************/

function imageStats(image, year, variableName) {
  var band = ee.String(image.bandNames().get(0));

  var stats = image.reduceRegion({
    reducer: ee.Reducer.mean()
      .combine(ee.Reducer.min(), '', true)
      .combine(ee.Reducer.max(), '', true)
      .combine(ee.Reducer.stdDev(), '', true),
    geometry: basinGeom,
    scale: exportScale,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale: 8
  });

  return ee.Feature(null, {
    Year: year,
    Variable: variableName,
    Mean: stats.get(band.cat('_mean')),
    Min: stats.get(band.cat('_min')),
    Max: stats.get(band.cat('_max')),
    StdDev: stats.get(band.cat('_stdDev'))
  });
}

var allVariableStats = ee.FeatureCollection([]);

mainYears.forEach(function(year) {
  var statFC = ee.FeatureCollection([
    imageStats(annualRainfall(year), year, 'Rainfall'),
    imageStats(rx1day(year), year, 'Rx1day'),
    imageStats(rx5day(year), year, 'Rx5day'),
    imageStats(calcCDD(year), year, 'CDD'),
    imageStats(calcCWD(year), year, 'CWD'),
    imageStats(annualNDVI(year), year, 'NDVI'),
    imageStats(annualET(year), year, 'ET'),
    imageStats(annualLST(year), year, 'LST'),
    imageStats(annualCWSI(year), year, 'CWSI'),
    imageStats(floodHazardIndex_AHP(year), year, 'FHI_AHP')
  ]);

  allVariableStats = allVariableStats.merge(statFC);
});

Export.table.toDrive({
  collection: allVariableStats,
  description: 'Volta_Hydroclimatic_Variable_Statistics',
  folder: exportFolder,
  fileNamePrefix: 'Volta_Hydroclimatic_Variable_Statistics',
  fileFormat: 'CSV'
});


/****************************************************************************************
12. EXPORT CORRECTED RASTERS
****************************************************************************************/

if (RUN_RASTER_EXPORTS) {
  mainYears.forEach(function(year) {
    var stack = annualRainfall(year)
      .addBands(rx1day(year))
      .addBands(rx5day(year))
      .addBands(calcCDD(year))
      .addBands(calcCWD(year))
      .addBands(annualNDVI(year))
      .addBands(annualET(year))
      .addBands(annualLST(year))
      .addBands(annualCWSI(year))
      .addBands(floodHazardIndex_AHP(year))
      .addBands(floodHazardClass_AHP(year));

    Export.image.toDrive({
      image: stack,
      description: 'Corrected_AHP_Hydroclimatic_Stack_' + year,
      folder: exportFolder,
      fileNamePrefix: 'Corrected_AHP_Hydroclimatic_Stack_' + year,
      region: basinGeom,
      scale: exportScale,
      crs: exportCRS,
      maxPixels: 1e13
    });

    Export.image.toDrive({
      image: floodHazardIndex_AHP(year),
      description: 'Corrected_FHI_AHP_' + year,
      folder: exportFolder,
      fileNamePrefix: 'Corrected_FHI_AHP_' + year,
      region: basinGeom,
      scale: exportScale,
      crs: exportCRS,
      maxPixels: 1e13
    });

    Export.image.toDrive({
      image: floodHazardClass_AHP(year),
      description: 'Corrected_FloodHazardClass_AHP_' + year,
      folder: exportFolder,
      fileNamePrefix: 'Corrected_FloodHazardClass_AHP_' + year,
      region: basinGeom,
      scale: exportScale,
      crs: exportCRS,
      maxPixels: 1e13
    });
  });
}


/****************************************************************************************
13. HARMONISATION UNCERTAINTY EXPORT FOR 2020
****************************************************************************************/

var uYear = 2020;
var uStart = ee.Date.fromYMD(uYear, 1, 1);
var uEnd = uStart.advance(1, 'year');

var samplePoints = ee.FeatureCollection.randomPoints({
  region: basinGeom,
  points: 5000,
  seed: 123,
  maxError: 100
});

var chirpsOriginal = chirps
  .filterDate(uStart, uEnd)
  .select('precipitation')
  .sum()
  .clip(basinGeom)
  .rename('CHIRPS_original');

var chirps1km = chirpsOriginal
  .resample('bilinear')
  .reproject({
    crs: exportCRS,
    scale: exportScale
  })
  .rename('CHIRPS_1km');

var chirpsDiff = chirps1km
  .subtract(chirpsOriginal)
  .rename('CHIRPS_diff');

var ndviOriginal = annualNDVI(uYear)
  .rename('NDVI_original');

var ndvi1km = ndviOriginal
  .resample('bilinear')
  .reproject({
    crs: exportCRS,
    scale: exportScale
  })
  .rename('NDVI_1km');

var ndviDiff = ndvi1km
  .subtract(ndviOriginal)
  .rename('NDVI_diff');

var etOriginal = annualET(uYear)
  .rename('ET_original');

var et1km = etOriginal
  .resample('bilinear')
  .reproject({
    crs: exportCRS,
    scale: exportScale
  })
  .rename('ET_1km');

var etDiff = et1km
  .subtract(etOriginal)
  .rename('ET_diff');

var lstOriginal = annualLST(uYear)
  .rename('LST_original');

var lst1km = lstOriginal
  .resample('bilinear')
  .reproject({
    crs: exportCRS,
    scale: exportScale
  })
  .rename('LST_1km');

var lstDiff = lst1km
  .subtract(lstOriginal)
  .rename('LST_diff');

var uncertaintyStack = ee.Image.cat([
  chirpsOriginal, chirps1km, chirpsDiff,
  ndviOriginal, ndvi1km, ndviDiff,
  etOriginal, et1km, etDiff,
  lstOriginal, lst1km, lstDiff
]);

var uncertaintySamples = uncertaintyStack.sampleRegions({
  collection: samplePoints,
  scale: exportScale,
  geometries: true,
  tileScale: 8
});

Export.table.toDrive({
  collection: uncertaintySamples,
  description: 'Volta_Harmonisation_Uncertainty_2020',
  folder: exportFolder,
  fileNamePrefix: 'Volta_Harmonisation_Uncertainty_2020',
  fileFormat: 'CSV'
});

var differenceStack = chirpsDiff
  .addBands(ndviDiff)
  .addBands(etDiff)
  .addBands(lstDiff);

Export.image.toDrive({
  image: differenceStack,
  description: 'Volta_Harmonisation_Difference_Maps_2020',
  folder: exportFolder,
  fileNamePrefix: 'Volta_Harmonisation_Difference_Maps_2020',
  region: basinGeom,
  scale: exportScale,
  crs: exportCRS,
  maxPixels: 1e13
});


/****************************************************************************************
14. TERRAIN CONTEXT EXPORT
****************************************************************************************/

var slope = ee.Terrain.slope(srtm)
  .clip(basinGeom)
  .rename('Slope');

var terrainStack = srtm
  .rename('Elevation')
  .addBands(slope);

Export.image.toDrive({
  image: terrainStack,
  description: 'Volta_Terrain_Context',
  folder: exportFolder,
  fileNamePrefix: 'Volta_Terrain_Context',
  region: basinGeom,
  scale: exportScale,
  crs: exportCRS,
  maxPixels: 1e13
});

/****************************************************************************************
15. PUBLIC VALIDATION USING GLOBAL FLOOD DATABASE
****************************************************************************************/

var validationYear = 2024;
var validationHazardMap = floodHazardClass_AHP(validationYear);

var validationScale = 1000;
var nFloodPoints = 210;
var nNonFloodPoints = 210;

var gfd = ee.ImageCollection('GLOBAL_FLOOD_DB/MODIS_EVENTS/V1')
  .filterBounds(basinGeom);

print('Global Flood Database event count in basin:', gfd.size());

var observedFlood = gfd
  .select('flooded')
  .max()
  .unmask(0)
  .gt(0)
  .rename('Observed_Flood')
  .clip(basinGeom);

Map.addLayer(
  observedFlood.selfMask(),
  {palette: ['#ff0000']},
  'Observed flood reference from GFD',
  false
);

var permanentWater = waterOccurrence
  .unmask(0)
  .gte(90)
  .rename('PermanentWater')
  .clip(basinGeom);

var referenceClass = observedFlood
  .where(
    permanentWater.eq(1).and(observedFlood.eq(0)),
    99
  )
  .rename('Observed_Flood')
  .clip(basinGeom);

referenceClass = referenceClass.updateMask(referenceClass.neq(99));

var validationPoints = referenceClass.stratifiedSample({
  numPoints: 0,
  classBand: 'Observed_Flood',
  classValues: [0, 1],
  classPoints: [nNonFloodPoints, nFloodPoints],
  region: basinGeom,
  scale: validationScale,
  seed: 2026,
  geometries: true,
  tileScale: 4
});

print('Generated validation points', validationPoints);
print('Validation point count', validationPoints.size());

Map.addLayer(
  validationPoints.filter(ee.Filter.eq('Observed_Flood', 1)),
  {color: 'red'},
  'Flood validation points',
  false
);

Map.addLayer(
  validationPoints.filter(ee.Filter.eq('Observed_Flood', 0)),
  {color: 'green'},
  'Non-flood validation points',
  false
);

var predictedFlood = validationHazardMap
  .gte(2)
  .rename('Predicted_Flood')
  .clip(basinGeom);

Map.addLayer(
  predictedFlood,
  {
    min: 0,
    max: 1,
    palette: ['#f7f7f7', '#08519c']
  },
  'Predicted flood-prone zones from corrected AHP',
  false
);

var sampledValidation = predictedFlood.sampleRegions({
  collection: validationPoints,
  properties: ['Observed_Flood'],
  scale: validationScale,
  geometries: true,
  tileScale: 4
}).map(function(feature) {
  var observed = ee.Number(feature.get('Observed_Flood'));
  var predicted = ee.Number(feature.get('Predicted_Flood'));

  var outcome = ee.Algorithms.If(
    observed.eq(1).and(predicted.eq(1)),
    'TP',
    ee.Algorithms.If(
      observed.eq(0).and(predicted.eq(0)),
      'TN',
      ee.Algorithms.If(
        observed.eq(0).and(predicted.eq(1)),
        'FP',
        'FN'
      )
    )
  );

  return feature.set({
    Outcome: outcome,
    Validation_Year: validationYear,
    Validation_Source: 'Global Flood Database / DFO-based flood inventory',
    Prediction_Rule: 'Moderate and high hazard classes 2 and 3 = predicted flood; low hazard class 1 = predicted non-flood'
  });
});

function safeDivide(numerator, denominator) {
  numerator = ee.Number(numerator);
  denominator = ee.Number(denominator);

  return ee.Number(
    ee.Algorithms.If(
      denominator.eq(0),
      0,
      numerator.divide(denominator)
    )
  );
}

var TP = sampledValidation.filter(ee.Filter.eq('Outcome', 'TP')).size();
var TN = sampledValidation.filter(ee.Filter.eq('Outcome', 'TN')).size();
var FP = sampledValidation.filter(ee.Filter.eq('Outcome', 'FP')).size();
var FN = sampledValidation.filter(ee.Filter.eq('Outcome', 'FN')).size();

var total = TP.add(TN).add(FP).add(FN);

var accuracy = safeDivide(TP.add(TN), total);
var precision = safeDivide(TP, TP.add(FP));
var recall = safeDivide(TP, TP.add(FN));
var f1 = safeDivide(
  precision.multiply(recall).multiply(2),
  precision.add(recall)
);

var validationMetrics = ee.FeatureCollection([
  ee.Feature(null, {
    Validation_Year: validationYear,
    Reference_Data: 'Global Flood Database / DFO-based flood inventory',
    Prediction_Map: 'Corrected_AHP_Flood_Hazard_Class_' + validationYear,
    Prediction_Rule: 'Moderate and high hazard classes 2 and 3 = predicted flood; low hazard class 1 = predicted non-flood',
    TP: TP,
    TN: TN,
    FP: FP,
    FN: FN,
    Total: total,
    Accuracy: accuracy,
    Accuracy_percent: accuracy.multiply(100),
    Precision: precision,
    Precision_percent: precision.multiply(100),
    Recall: recall,
    Recall_percent: recall.multiply(100),
    F1_Score: f1
  })
]);

print('VALIDATION METRICS FROM PUBLIC GFD DATA', validationMetrics);

// Export metrics only as the required reproducibility file.
Export.table.toDrive({
  collection: validationMetrics,
  description: 'Corrected_AHP_Validation_Metrics_GFD',
  folder: exportFolder,
  fileNamePrefix: 'Corrected_AHP_Validation_Metrics_GFD',
  fileFormat: 'CSV'
});

// Optional light validation points export without geometry.
var sampledValidationLight = sampledValidation.map(function(feature) {
  var coords = feature.geometry().coordinates();

  return ee.Feature(null, {
    Longitude: coords.get(0),
    Latitude: coords.get(1),
    Observed_Flood: feature.get('Observed_Flood'),
    Predicted_Flood: feature.get('Predicted_Flood'),
    Outcome: feature.get('Outcome'),
    Validation_Year: feature.get('Validation_Year')
  });
});

Export.table.toDrive({
  collection: sampledValidationLight,
  description: 'Corrected_AHP_Validation_Points_GFD_Light',
  folder: exportFolder,
  fileNamePrefix: 'Corrected_AHP_Validation_Points_GFD_Light',
  fileFormat: 'CSV'
});


/****************************************************************************************
16. FINAL REPRODUCIBILITY CHECKS
****************************************************************************************/

print('SCRIPT READY');
print('Figure 7 uses floodHazardClass_AHP(year), which implements corrected Eq. 14.');
print('Table 6 uses hazardAreaStats_AHP(floodHazardClass_AHP(year), year).');
print('Corrected FHI and hazard-class rasters are exported.');
print('Validation uses the corrected hazard map and public Global Flood Database data.');
print('Validation rule: moderate and high hazard classes = predicted flood-prone.');
print('Low hazard class = predicted non-flood.');
print('Run the required CSV tasks:');
print('1. Table_6_Corrected_AHP_Flood_Hazard_Area_Statistics');
print('2. Corrected_AHP_Validation_Metrics_GFD');
print('Optional: Corrected_AHP_Validation_Points_GFD_Light');
print('Run raster exports only if GeoTIFF outputs are needed.');

// Choose figure to display.
// showFigure1();
// showFigure3();
// showFigure4();
// showFigure5();
// showFigure6();
showFigure7();
