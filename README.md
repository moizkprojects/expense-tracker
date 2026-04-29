# Per Diem Native (Expo)

Mobile app to track daily expenses against GSA FY2026 M&IE with a 7-day local-only memory window.

## Implemented

- React Native + Expo app scaffold
- SQLite schema and seed process
- FY2026 rates imported from provided Excel into `assets/rates/fy2026_master.json`
- City exact match, county fallback lookup pipeline:
  - Nominatim geocode
  - US Census county lookup
  - County/state match against local GSA rates
- Daily M&IE budget calculator and color-coded remaining/overage
- Expense flow with exactly one empty line at a time and `+ another expense`
- Rolling 7-day retention prune on app startup and writes
- Unit tests for budget math, season logic, resolver selector, and retention cutoff

## Run

```bash
npm install
npm test
npm start
```

## Refresh Rate Data From New GSA Workbook

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\extract-rates.ps1 -InputXlsx "C:\path\to\FY2026_PerDiemMasterRatesFile.xlsx"
```

## Free APIs Used

- Nominatim (OpenStreetMap): `https://nominatim.openstreetmap.org/`
- US Census Geocoder: `https://geocoding.geo.census.gov/`

Both are free to use; production usage should respect rate limits and terms.
