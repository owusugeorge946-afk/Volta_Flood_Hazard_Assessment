/************************************************************
 FINAL COMPLETE GEE FIGURE SCRIPT
 Volta River Basin
 Asset: projects/ee-owusugeorge946/assets/VOLTA_RIVER_BASIN

 FIGURES INCLUDED:
 Figure 1 - Study area map
 Figure 3 - Rainfall
 Figure 4 - Extreme rainfall indices
 Figure 5 - NDVI and ET
 Figure 6 - LST and CWSI
 Figure 7 - Flood hazard map

 NOTES:
 - Clean white background
 - No basemap contamination
 - Compact 2x2 panel layout
 - ET uses MODIS/061/MOD16A2GF (works for 2020 and 2024)

 ADDED FOR REPRODUCIBILITY:
 - Annual raster stack export
 - Flood hazard area statistics export
 - Hydro-climatic variable statistics export
 - Harmonisation uncertainty CSV export
 - Harmonisation difference-map export
 - Terrain context export
 - Corrected AHP model exported separately as FHI_AHP and FloodHazardClass_AHP

 IMPORTANT:
 - The original floodHazard(year) function is NOT changed.
 - Therefore, Figure 7 remains exactly as your original map.
************************************************************/


/***********************
 1. LOAD STUDY AREA
************************/
var basin = ee.FeatureCollection('projects/ee-owusugeorge946/assets/VOLTA_RIVER_BASIN');
var basinGeom = basin.geometry();
var basinBounds = basinGeom.bounds();

/***********************
 2. SETTINGS
************************/
var indexYear = 2020;

/***********************
 3. DATASETS
************************/
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterBounds(basin);

var srtm = ee.Image('USGS/SRTMGL1_003').clip(basin);

/***********************
 4. VISUALIZATION SETTINGS
************************/
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

// Brighter NDVI palette
var ndviVis = {
  min: 0.1,
  max: 0.7,
  palette: ['#d73027', '#fdae61', '#ffffbf', '#a6d96a', '#1a9850']
};

// Brighter ET palette
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

var floodVis = {
  min: 1,
  max: 3,
  palette: ['#fff7bc', '#fec44f', '#d95f0e']
};

/***********************
 5. HELPER FUNCTIONS
************************/
function annualRainfall(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  return chirps.filterDate(start, end)
    .sum()
    .clip(basin)
    .rename('Rainfall');
}

function rx1day(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  return chirps.filterDate(start, end)
    .max()
    .clip(basin)
    .rename('Rx1day');
}

function rx5day(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  var daily = chirps.filterDate(start, end).sort('system:time_start');
  var list = daily.toList(daily.size());
  var n = daily.size();

  var rolling = ee.ImageCollection(
    ee.List.sequence(0, n.subtract(5)).map(function(i) {
      i = ee.Number(i);
      var imgs = ee.ImageCollection.fromImages(
        ee.List.sequence(i, i.add(4)).map(function(j) {
          return ee.Image(list.get(j));
        })
      );
      return imgs.sum().rename('Rx5day');
    })
  );

  return rolling.max().clip(basin).rename('Rx5day');
}

function calcCDD(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  var daily = chirps.filterDate(start, end).sort('system:time_start');
  var list = daily.toList(daily.size());
  var size = daily.size();

  var init = ee.Dictionary({
    current: ee.Image.constant(0).clip(basin),
    max: ee.Image.constant(0).clip(basin)
  });

  var result = ee.List.sequence(0, size.subtract(1)).iterate(function(i, state) {
    state = ee.Dictionary(state);
    var img = ee.Image(list.get(i)).clip(basin);
    var isDry = img.lt(1);

    var current = ee.Image(state.get('current'));
    var maxRun = ee.Image(state.get('max'));

    var newCurrent = current.add(1).where(isDry.not(), 0);
    var newMax = maxRun.max(newCurrent);

    return ee.Dictionary({current: newCurrent, max: newMax});
  }, init);

  return ee.Image(ee.Dictionary(result).get('max')).rename('CDD');
}

function calcCWD(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  var daily = chirps.filterDate(start, end).sort('system:time_start');
  var list = daily.toList(daily.size());
  var size = daily.size();

  var init = ee.Dictionary({
    current: ee.Image.constant(0).clip(basin),
    max: ee.Image.constant(0).clip(basin)
  });

  var result = ee.List.sequence(0, size.subtract(1)).iterate(function(i, state) {
    state = ee.Dictionary(state);
    var img = ee.Image(list.get(i)).clip(basin);
    var isWet = img.gte(1);

    var current = ee.Image(state.get('current'));
    var maxRun = ee.Image(state.get('max'));

    var newCurrent = current.add(1).where(isWet.not(), 0);
    var newMax = maxRun.max(newCurrent);

    return ee.Dictionary({current: newCurrent, max: newMax});
  }, init);

  return ee.Image(ee.Dictionary(result).get('max')).rename('CWD');
}

function annualNDVI(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return ee.ImageCollection('MODIS/061/MOD13Q1')
    .filterBounds(basin)
    .filterDate(start, end)
    .select('NDVI')
    .mean()
    .multiply(0.0001)
    .clip(basin)
    .rename('NDVI');
}

function annualET(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return ee.ImageCollection('MODIS/061/MOD16A2GF')
    .filterBounds(basin)
    .filterDate(start, end)
    .select('ET')
    .sum()
    .multiply(0.1)
    .clip(basin)
    .rename('ET');
}

function annualLST(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  return ee.ImageCollection('MODIS/061/MOD11A2')
    .filterBounds(basin)
    .filterDate(start, end)
    .select('LST_Day_1km')
    .mean()
    .multiply(0.02)
    .subtract(273.15)
    .clip(basin)
    .rename('LST');
}

function annualCWSI(year) {
  var lst = annualLST(year);

  var stats = lst.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: basinGeom,
    scale: 1000,
    bestEffort: true,
    maxPixels: 1e13
  });

  var tmin = ee.Number(stats.get('LST_min'));
  var tmax = ee.Number(stats.get('LST_max'));

  return lst.subtract(tmin)
    .divide(tmax.subtract(tmin))
    .clamp(0, 1)
    .rename('CWSI');
}

function normalize(img, scale) {
  var stats = img.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: basinGeom,
    scale: scale,
    bestEffort: true,
    maxPixels: 1e13
  });

  var band = ee.String(img.bandNames().get(0));
  var min = ee.Number(stats.get(band.cat('_min')));
  var max = ee.Number(stats.get(band.cat('_max')));

  return img.subtract(min).divide(max.subtract(min)).clamp(0, 1);
}

function floodHazard(year) {
  var rain = normalize(annualRainfall(year), 5000);
  var rx5 = normalize(rx5day(year), 5000);
  var et = normalize(annualET(year), 500);
  var ndvi = normalize(annualNDVI(year), 1000);
  var lst = normalize(annualLST(year), 1000);
  var cwsi = normalize(annualCWSI(year), 1000);

  var wetness = rain.multiply(0.30)
    .add(rx5.multiply(0.30))
    .add(et.multiply(0.15))
    .add(ndvi.multiply(0.10))
    .add(ee.Image.constant(1).subtract(lst).multiply(0.10))
    .add(ee.Image.constant(1).subtract(cwsi).multiply(0.05))
    .rename('FloodHazard');

  return wetness.expression(
    "(b <= 0.33) ? 1" +
    ": (b <= 0.66) ? 2" +
    ": 3", {b: wetness}
  ).rename('FloodHazardClass').clip(basin);
}

/***********************
 6. RENDER IMAGE
************************/
function renderImage(image, vis) {
  var white = ee.Image.constant(1)
    .clip(basinBounds.buffer(300000))
    .visualize({
      palette: ['ffffff'],
      forceRgbOutput: true
    });

  var data = image.visualize(vis);

  var boundary = ee.Image().byte().paint({
    featureCollection: basin,
    color: 1,
    width: 2
  }).visualize({
    palette: ['000000']
  });

  return ee.ImageCollection([white, data, boundary]).mosaic();
}

/***********************
 7. THUMB PANELS
************************/
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

/***********************
 8. LEGEND
************************/
function makeLegend(items, titleText) {
  var panel = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      stretch: 'horizontal',
      backgroundColor: '#efefef',
      margin: '6px 0 0 0',
      padding: '2px 4px'
    }
  });

  if (titleText) {
    panel.add(ui.Label(titleText + ':', {
      fontWeight: 'bold',
      fontSize: '14px',
      margin: '0 8px 0 0',
      color: 'black'
    }));
  }

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

/***********************
 9. SHOW FIGURES
************************/
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

  var mainWidgets = [title, row1, row2];

  if (legendItems && Array.isArray(legendItems)) {
    if (legendItems.length > 0 && Array.isArray(legendItems[0])) {
      legendItems.forEach(function(oneLegend) {
        mainWidgets.push(makeLegend(oneLegend));
      });
    } else {
      mainWidgets.push(makeLegend(legendItems));
    }
  }

  var mainPanel = ui.Panel(
    mainWidgets,
    ui.Panel.Layout.flow('vertical'),
    {
      backgroundColor: '#efefef',
      padding: '4px',
      margin: '0px',
      stretch: 'both'
    }
  );

  ui.root.add(mainPanel);
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

  var mainWidgets = [title, panel];

  if (legendItems && Array.isArray(legendItems)) {
    if (legendItems.length > 0 && Array.isArray(legendItems[0])) {
      legendItems.forEach(function(oneLegend) {
        mainWidgets.push(makeLegend(oneLegend));
      });
    } else {
      mainWidgets.push(makeLegend(legendItems));
    }
  }

  var mainPanel = ui.Panel(
    mainWidgets,
    ui.Panel.Layout.flow('vertical'),
    {
      backgroundColor: '#efefef',
      padding: '4px',
      margin: '0px',
      stretch: 'both'
    }
  );

  ui.root.add(mainPanel);
}

/***********************
 10. FIGURE 1
************************/
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

/***********************
 11. FIGURE 3
************************/
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

/***********************
 12. FIGURE 4
************************/
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

/***********************
 13. FIGURE 5
************************/
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

/***********************
 14. FIGURE 6
************************/
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

/***********************
 15. FIGURE 7
************************/
function showFigure7() {
  var floodVisUpdated = {
    min: 1,
    max: 3,
    palette: ['#c6dbef', '#6baed6', '#08519c']
  };

  showFigure(
    'Figure 7. Flood Hazard Classification in the Volta River Basin',
    [
      makeThumbPanel(floodHazard(2000), floodVisUpdated, 'Flood Hazard 2000'),
      makeThumbPanel(floodHazard(2010), floodVisUpdated, 'Flood Hazard 2010'),
      makeThumbPanel(floodHazard(2020), floodVisUpdated, 'Flood Hazard 2020'),
      makeThumbPanel(floodHazard(2024), floodVisUpdated, 'Flood Hazard 2024')
    ],
    [
      {label: 'Low hazard', color: '#c6dbef'},
      {label: 'Moderate hazard', color: '#6baed6'},
      {label: 'High hazard', color: '#08519c'}
    ]
  );
}


/************************************************************
 16. ADDITIONAL REPRODUCIBILITY BLOCK
 IMPORTANT:
 - This block DOES NOT change your original floodHazard(year).
 - Therefore, Figure 7 remains exactly the same.
 - The corrected AHP model is exported separately as FHI_AHP and FloodHazardClass_AHP.
************************************************************/

/***********************
 A. REPRODUCIBILITY SETTINGS
************************/
var mainYears = [2000, 2010, 2020, 2024];
var exportScale = 1000;
var exportCRS = 'EPSG:4326';

/***********************
 B. CORRECTED AHP WEIGHTS
************************/
var wRx1day = 0.419;
var wRx5day = 0.292;
var wNDVI   = 0.113;
var wET     = 0.090;
var wLST    = 0.048;
var wCWSI   = 0.038;

/***********************
 C. POSITIVE AND INVERSE NORMALISATION
************************/
function normalizePositive_AHP(img, scale) {
  var stats = img.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: basinGeom,
    scale: scale,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale: 8
  });

  var band = ee.String(img.bandNames().get(0));
  var min = ee.Number(stats.get(band.cat('_min')));
  var max = ee.Number(stats.get(band.cat('_max')));

  return img.subtract(min)
    .divide(max.subtract(min))
    .clamp(0, 1);
}

function normalizeInverse_AHP(img, scale) {
  var stats = img.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: basinGeom,
    scale: scale,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale: 8
  });

  var band = ee.String(img.bandNames().get(0));
  var min = ee.Number(stats.get(band.cat('_min')));
  var max = ee.Number(stats.get(band.cat('_max')));

  return ee.Image(max)
    .subtract(img)
    .divide(max.subtract(min))
    .clamp(0, 1);
}

/***********************
 D. CORRECTED AHP FLOOD HAZARD INDEX
************************/
function floodHazardIndex_AHP(year) {
  var rx1 = normalizePositive_AHP(rx1day(year), 5000);
  var rx5 = normalizePositive_AHP(rx5day(year), 5000);
  var ndviInv = normalizeInverse_AHP(annualNDVI(year), 1000);
  var etInv = normalizeInverse_AHP(annualET(year), 500);
  var lstPos = normalizePositive_AHP(annualLST(year), 1000);
  var cwsiPos = normalizePositive_AHP(annualCWSI(year), 1000);

  return rx1.multiply(wRx1day)
    .add(rx5.multiply(wRx5day))
    .add(ndviInv.multiply(wNDVI))
    .add(etInv.multiply(wET))
    .add(lstPos.multiply(wLST))
    .add(cwsiPos.multiply(wCWSI))
    .rename('FHI_AHP')
    .clip(basin);
}

/***********************
 E. CORRECTED AHP FLOOD HAZARD CLASS
************************/
function floodHazard_AHP(year) {
  var fhi = floodHazardIndex_AHP(year);

  return ee.Image(1)
    .where(fhi.gte(0.33), 2)
    .where(fhi.gte(0.66), 3)
    .rename('FloodHazardClass_AHP')
    .clip(basin);
}

/***********************
 F. AREA STATISTICS FUNCTION
 This uses your ORIGINAL floodHazard(year), so it matches your displayed Figure 7.
************************/
function hazardAreaStats_original(classImage, year) {
  var areaImage = ee.Image.pixelArea().divide(1e6).rename('Area_km2');

  var totalArea = areaImage.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: basinGeom,
    scale: exportScale,
    maxPixels: 1e13,
    tileScale: 8
  }).get('Area_km2');

  var grouped = areaImage.addBands(classImage).reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'Hazard_Class_Code'
    }),
    geometry: basinGeom,
    scale: exportScale,
    maxPixels: 1e13,
    tileScale: 8
  });

  var groups = ee.List(grouped.get('groups'));

  return ee.FeatureCollection(groups.map(function(item) {
    item = ee.Dictionary(item);

    var code = ee.Number(item.get('Hazard_Class_Code'));
    var area = ee.Number(item.get('sum'));
    var percentage = area.divide(ee.Number(totalArea)).multiply(100);

    var name = ee.Algorithms.If(code.eq(1), 'Low Hazard',
      ee.Algorithms.If(code.eq(2), 'Moderate Hazard', 'High Hazard'));

    return ee.Feature(null, {
      Year: year,
      Hazard_Class_Code: code,
      Hazard_Class: name,
      Area_km2: area,
      Percentage: percentage
    });
  }));
}

/***********************
 G. VARIABLE STATISTICS FUNCTION
************************/
function imageStats_extra(image, year, variableName) {
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

/***********************
 H. EXPORT PRODUCTS WITHOUT CHANGING FIGURES
************************/
var allAreaStats_original = ee.FeatureCollection([]);
var allVariableStats_extra = ee.FeatureCollection([]);

mainYears.forEach(function(year) {
  var rain = annualRainfall(year);
  var r1 = rx1day(year);
  var r5 = rx5day(year);
  var cdd = calcCDD(year);
  var cwd = calcCWD(year);
  var ndvi = annualNDVI(year);
  var et = annualET(year);
  var lst = annualLST(year);
  var cwsi = annualCWSI(year);

  // Original flood hazard used in your current Figure 7.
  var hazard_original = floodHazard(year);

  // Corrected AHP outputs added separately.
  var fhi_ahp = floodHazardIndex_AHP(year);
  var hazard_ahp = floodHazard_AHP(year);

  var stack = rain
    .addBands(r1)
    .addBands(r5)
    .addBands(cdd)
    .addBands(cwd)
    .addBands(ndvi)
    .addBands(et)
    .addBands(lst)
    .addBands(cwsi)
    .addBands(hazard_original)
    .addBands(fhi_ahp)
    .addBands(hazard_ahp);

  Export.image.toDrive({
    image: stack,
    description: 'Volta_Flood_Hazard_Stack_' + year,
    folder: 'Volta_Flood_Hazard_GEE',
    fileNamePrefix: 'Volta_Flood_Hazard_Stack_' + year,
    region: basinGeom,
    scale: exportScale,
    crs: exportCRS,
    maxPixels: 1e13
  });

  allAreaStats_original = allAreaStats_original.merge(
    hazardAreaStats_original(hazard_original, year)
  );

  var statFC = ee.FeatureCollection([
    imageStats_extra(rain, year, 'Rainfall'),
    imageStats_extra(r1, year, 'Rx1day'),
    imageStats_extra(r5, year, 'Rx5day'),
    imageStats_extra(cdd, year, 'CDD'),
    imageStats_extra(cwd, year, 'CWD'),
    imageStats_extra(ndvi, year, 'NDVI'),
    imageStats_extra(et, year, 'ET'),
    imageStats_extra(lst, year, 'LST'),
    imageStats_extra(cwsi, year, 'CWSI'),
    imageStats_extra(fhi_ahp, year, 'FHI_AHP')
  ]);

  allVariableStats_extra = allVariableStats_extra.merge(statFC);
});

Export.table.toDrive({
  collection: allAreaStats_original,
  description: 'Volta_Flood_Hazard_Area_Statistics_Original_Map',
  folder: 'Volta_Flood_Hazard_GEE',
  fileNamePrefix: 'Volta_Flood_Hazard_Area_Statistics_Original_Map',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: allVariableStats_extra,
  description: 'Volta_Hydroclimatic_Variable_Statistics',
  folder: 'Volta_Flood_Hazard_GEE',
  fileNamePrefix: 'Volta_Hydroclimatic_Variable_Statistics',
  fileFormat: 'CSV'
});

/***********************
 I. HARMONISATION UNCERTAINTY EXPORT FOR 2020
************************/
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
  .clip(basin)
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
  folder: 'Volta_Flood_Hazard_GEE',
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
  folder: 'Volta_Flood_Hazard_GEE',
  fileNamePrefix: 'Volta_Harmonisation_Difference_Maps_2020',
  region: basinGeom,
  scale: exportScale,
  crs: exportCRS,
  maxPixels: 1e13
});

/***********************
 J. TERRAIN CONTEXT EXPORT
************************/
var slope = ee.Terrain.slope(srtm)
  .clip(basin)
  .rename('Slope');

var terrainStack = srtm
  .rename('Elevation')
  .addBands(slope);

Export.image.toDrive({
  image: terrainStack,
  description: 'Volta_Terrain_Context',
  folder: 'Volta_Flood_Hazard_GEE',
  fileNamePrefix: 'Volta_Terrain_Context',
  region: basinGeom,
  scale: exportScale,
  crs: exportCRS,
  maxPixels: 1e13
});

/***********************
 K. PRINT CHECKS
************************/
print('Your original floodHazard(year) function was NOT changed.');
print('Therefore, Figure 7 remains the same as your original map.');
print('Corrected AHP model exported separately as FHI_AHP and FloodHazardClass_AHP.');

print('Corrected AHP weights used only in FHI_AHP:');
print('Rx1day = 0.419');
print('Rx5day = 0.292');
print('NDVI inverse = 0.113');
print('ET inverse = 0.090');
print('LST positive = 0.048');
print('CWSI positive = 0.038');

print('Original map area statistics:', allAreaStats_original);
print('Hydro-climatic variable statistics:', allVariableStats_extra);
print('Harmonisation uncertainty sample preview:', uncertaintySamples.limit(5));

print('Additional reproducibility exports added successfully without changing Figure 7.');


/***********************
 17. CHOOSE ONE FIGURE
************************/
// showFigure1();
// showFigure3();
// showFigure4();
// showFigure5();
// showFigure6();
showFigure7();
