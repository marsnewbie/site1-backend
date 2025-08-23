import axios from 'axios';

const PROVIDER = process.env.MAPS_PROVIDER || "mapbox";
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// 地址/邮编 → 经纬度（仅 distance 规则用；postcode 规则不需要）
async function geocodeToCoord(query) {
  if (PROVIDER !== "mapbox") {
    throw new Error("Only 'mapbox' provider implemented for now.");
  }
  
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
  const res = await axios.get(url, {
    params: { access_token: MAPBOX_TOKEN, limit: 1, country: "gb" },
    timeout: 5000
  });
  
  const f = res.data && res.data.features && res.data.features[0];
  if (!f) return null;
  
  const [lng, lat] = f.center;
  return { lat, lng };
}

// 驾车距离（英里）
async function drivingDistanceMiles(origin, destination) {
  if (PROVIDER !== "mapbox") {
    throw new Error("Only 'mapbox' provider implemented for now.");
  }
  
  const url =
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/` +
    `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  
  const res = await axios.get(url, {
    params: { access_token: MAPBOX_TOKEN, annotations: "distance" },
    timeout: 5000
  });
  
  const meters = res.data?.distances?.[0]?.[1];
  if (typeof meters !== "number") return null;
  
  return meters / 1609.344;
}

export { geocodeToCoord, drivingDistanceMiles };
