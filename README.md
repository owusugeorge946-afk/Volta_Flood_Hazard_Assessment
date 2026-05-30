# Volta_Flood_Hazard_Assessment
Google Earth Engine and Colab scripts for flood hazard assessment in the Volta River Basin using CHIRPS, MODIS, AHP, validation, and uncertainty analysis.


# Remote Sensing-Based Flood Hazard Assessment in the Volta River Basin

This repository contains the Google Earth Engine and Google Colab reproducibility scripts for the study:

**Remote Sensing-Based Uncertainty-Aware Flood Hazard Assessment in the Volta River Basin Using Extreme Rainfall and Multi-Source Satellite Data**

## Study Area

The study focuses on the Volta River Basin in West Africa.

## Study Period

The analysis covers the period **2000–2024**, with selected mapping years:

- 2000
- 2010
- 2020
- 2024

## Datasets

The analysis used publicly available satellite datasets accessed through Google Earth Engine:

| Dataset | Product | Main Variable | Resolution |
|---|---|---|---|
| CHIRPS Daily Rainfall | UCSB-CHG/CHIRPS/DAILY | Rainfall, Rx1day, Rx5day, CDD, CWD | 0.05° |
| MODIS NDVI | MODIS/061/MOD13Q1 | NDVI | 250 m |
| MODIS Evapotranspiration | MODIS/061/MOD16A2GF | ET | 500 m |
| MODIS Land Surface Temperature | MODIS/061/MOD11A2 | LST | 1 km |
| SRTM Elevation | USGS/SRTMGL1_003 | Elevation and slope | 30 m |

Ground rainfall observations from the Ghana Meteorological Agency were used for CHIRPS rainfall validation. These station observations are not fully redistributed in this repository because they are subject to data ownership restrictions.

## Repository Structure

```text
Volta_Flood_Hazard_Assessment/
│
├── gee_scripts/
│   └── Volta_Flood_Hazard_GEE_Main.js
│
├── colab_scripts/
│   └── Volta_Flood_Hazard_Colab_Analysis.ipynb
│
├── outputs/
│   ├── tables/
│   └── figures/
│
└── README.md
