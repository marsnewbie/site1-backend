import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helpers for postcode normalization and validation
export function normalizeUkPostcode(raw = '') {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 5) return s;
  return s.slice(0, -3) + ' ' + s.slice(-3);
}

export function isValidUkPostcodeFormat(pc = '') {
  return /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/.test(pc.toUpperCase());
}

// Load delivery configs (for demonstration we load two sample files)
const postcodeConfigPath = path.join(__dirname, '..', '..', 'seed', 'delivery.postcode_zone.sample.json');
const mileConfigPath = path.join(__dirname, '..', '..', 'seed', 'delivery.driving_mile.sample.json');

function loadConfig(activeType) {
  let cfg;
  if (activeType === 'postcode_prefix') {
    cfg = JSON.parse(fs.readFileSync(postcodeConfigPath, 'utf-8'));
  } else if (activeType === 'distance_bands') {
    cfg = JSON.parse(fs.readFileSync(mileConfigPath, 'utf-8'));
  } else {
    throw new Error('Invalid delivery mode');
  }
  return cfg;
}

// Quote using postcode prefix zones
function quoteByPostcodePrefix(cfg, postcode, subtotalPence) {
  const pp = cfg.postcode_prefix;
  // Normalize and validate
  const normalized = normalizeUkPostcode(postcode);
  if (!isValidUkPostcodeFormat(normalized)) {
    return { isDeliverable: false, feePence: 0, minOrderPence: 0, zone: null, reason: 'Invalid postcode', debug: { engine: 'postcode_prefix', normalized } };
  }
  // longest prefix match
  const zones = pp.areas.slice().sort((a, b) => b.pattern.length - a.pattern.length);
  const match = zones.find(z => normalized.startsWith(z.pattern.toUpperCase()));
  if (!match) {
    return { isDeliverable: false, feePence: 0, minOrderPence: pp.default_min_order_gbp * 100, zone: null, reason: 'Out of delivery area', debug: { engine: 'postcode_prefix', normalized } };
  }
  const minOrderPence = (pp.default_min_order_gbp || 0) * 100;
  const feeGbp = match.fee_gbp;
  const subtotalGbp = subtotalPence / 100;
  let feePence = Math.round(feeGbp * 100);
  if (subtotalGbp < (pp.default_min_order_gbp || 0)) {
    feePence += Math.round((pp.extra_fee_if_below_min_gbp || 0) * 100);
  }
  return {
    isDeliverable: true,
    feePence,
    minOrderPence,
    zone: match.pattern,
    reason: null,
    debug: { engine: 'postcode_prefix', normalized, matchedPrefix: match.pattern }
  };
}

// Quote using distance bands (driving mile)
function quoteByDistanceBands(cfg, postcode, address, subtotalPence) {
  const db = cfg.distance_bands;
  // For demonstration we simulate a route distance rather than calling Mapbox
  // In production, call Mapbox Directions Matrix using SHOP_ORIGIN_LAT/LNG and customer geocode
  const simulatedMiles = 1.5; // stub value
  const minOrderGbp = (db.min_order_threshold_gbp != null ? db.min_order_threshold_gbp : cfg.postcode_prefix?.default_min_order_gbp) || 0;
  if (simulatedMiles > db.no_service_beyond_miles) {
    return {
      isDeliverable: false,
      feePence: 0,
      minOrderPence: minOrderGbp * 100,
      zone: null,
      reason: 'Out of delivery range',
      debug: { engine: 'distance_bands', routeMiles: simulatedMiles }
    };
  }
  // find band
  const band = db.bands.find(b => simulatedMiles <= b.max_miles);
  if (!band) {
    return {
      isDeliverable: false,
      feePence: 0,
      minOrderPence: minOrderGbp * 100,
      zone: null,
      reason: 'Out of delivery range',
      debug: { engine: 'distance_bands', routeMiles: simulatedMiles }
    };
  }
  const subtotalGbp = subtotalPence / 100;
  const feeGbp = subtotalGbp >= minOrderGbp ? band.fee_if_subtotal_gbp_gte : band.fee_if_subtotal_gbp_lt;
  return {
    isDeliverable: true,
    feePence: Math.round(feeGbp * 100),
    minOrderPence: minOrderGbp * 100,
    zone: `<= ${band.max_miles}mi`,
    reason: null,
    debug: { engine: 'distance_bands', routeMiles: simulatedMiles, bandIdx: db.bands.indexOf(band) }
  };
}

/**
 * Main quote function. Accepts mode (delivery/collection), postcode, address (optional), subtotalPence, store id.
 */
export async function quoteDelivery({ mode, postcode, address, subtotalPence, store }) {
  if (mode === 'collection') {
    return { isDeliverable: true, feePence: 0, minOrderPence: 0, zone: null, reason: null, debug: { engine: 'collection' } };
  }
  // Load active config (use postcode sample as default)
  const cfg = JSON.parse(fs.readFileSync(postcodeConfigPath, 'utf-8'));
  const activeType = cfg.active_rule_type;
  if (activeType === 'postcode_prefix') {
    return quoteByPostcodePrefix(cfg, postcode, subtotalPence);
  } else if (activeType === 'distance_bands') {
    return quoteByDistanceBands(cfg, postcode, address, subtotalPence);
  }
  throw new Error('Invalid delivery configuration');
}