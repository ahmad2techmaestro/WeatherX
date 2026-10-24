/** Base maps. All are keyless; each requires its attribution to stay visible. */
export const BASEMAPS = [
  {
    value: "standard",
    label: "Standard",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    value: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 18,
  },
  {
    value: "terrain",
    label: "Terrain",
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
];
