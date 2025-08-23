import { supabase } from '../lib/supabase.js';
import { geocodeToCoord, drivingDistanceMiles } from '../lib/mapclient.js';

// Helpers for postcode normalization and validation
export function normalizeUkPostcode(raw = '') {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 5) return s;
  return s.slice(0, -3) + ' ' + s.slice(-3);
}

export function isValidUkPostcodeFormat(pc = '') {
  return /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/.test(pc.toUpperCase());
}

// Quote using postcode prefix zones
async function quoteByPostcodePrefix(postcodeRules, postcode, subtotalPence) {
  // Normalize and validate
  const normalized = normalizeUkPostcode(postcode);
  if (!isValidUkPostcodeFormat(normalized)) {
    return { 
      isDeliverable: false, 
      feePence: 0, 
      minOrderPence: 0, 
      zone: null, 
      reason: 'Invalid postcode', 
      debug: { engine: 'postcode', normalized } 
    };
  }
  
  // longest prefix match
  const zones = postcodeRules.areas.slice().sort((a, b) => b.pattern.length - a.pattern.length);
  const match = zones.find(z => normalized.startsWith(z.pattern.toUpperCase()));
  
  if (!match) {
    return { 
      isDeliverable: false, 
      feePence: 0, 
      minOrderPence: postcodeRules.default_min_order_threshold * 100, 
      zone: null, 
      reason: 'Out of delivery area', 
      debug: { engine: 'postcode', normalized } 
    };
  }
  
  const minOrderPence = (postcodeRules.default_min_order_threshold || 0) * 100;
  const feeGbp = match.fee;
  const subtotalGbp = subtotalPence / 100;
  let feePence = Math.round(feeGbp * 100);
  
  if (subtotalGbp < (postcodeRules.default_min_order_threshold || 0)) {
    feePence += Math.round((postcodeRules.default_extra_fee_if_below_threshold || 0) * 100);
  }
  
  return {
    isDeliverable: true,
    feePence,
    minOrderPence,
    zone: match.pattern,
    reason: null,
    debug: { engine: 'postcode', normalized, matchedPrefix: match.pattern }
  };
}

// Quote using distance bands (driving mile)
async function quoteByDistanceBands(distanceRules, storeLocation, postcode, address, subtotalPence) {
  try {
    // Geocode customer address
    const customerCoord = await geocodeToCoord(address || postcode);
    if (!customerCoord) {
      return {
        isDeliverable: false,
        feePence: 0,
        minOrderPence: 0,
        zone: null,
        reason: 'Unable to geocode address',
        debug: { engine: 'distance', address, postcode }
      };
    }

    // Calculate driving distance
    const distanceMiles = await drivingDistanceMiles(storeLocation, customerCoord);
    if (distanceMiles === null) {
      return {
        isDeliverable: false,
        feePence: 0,
        minOrderPence: 0,
        zone: null,
        reason: 'Unable to calculate route',
        debug: { engine: 'distance', distanceMiles }
      };
    }

    // Check if beyond service range
    if (distanceMiles > distanceRules.no_service_beyond) {
      return {
        isDeliverable: false,
        feePence: 0,
        minOrderPence: 0,
        zone: null,
        reason: 'Out of delivery range',
        debug: { engine: 'distance', distanceMiles, maxRange: distanceRules.no_service_beyond }
      };
    }

    // Find appropriate band
    const band = distanceRules.bands.find(b => distanceMiles <= b.max_distance);
    if (!band) {
      return {
        isDeliverable: false,
        feePence: 0,
        minOrderPence: 0,
        zone: null,
        reason: 'Out of delivery range',
        debug: { engine: 'distance', distanceMiles }
      };
    }

    const subtotalGbp = subtotalPence / 100;
    const feeGbp = subtotalGbp >= 0 ? band.fee_if_subtotal_gte : band.fee_if_subtotal_lt;

    return {
      isDeliverable: true,
      feePence: Math.round(feeGbp * 100),
      minOrderPence: 0, // Distance rules don't have min order threshold
      zone: `<= ${band.max_distance}mi`,
      reason: null,
      debug: { engine: 'distance', distanceMiles, band: band.max_distance }
    };
  } catch (error) {
    return {
      isDeliverable: false,
      feePence: 0,
      minOrderPence: 0,
      zone: null,
      reason: 'Error calculating delivery fee',
      debug: { engine: 'distance', error: error.message }
    };
  }
}

/**
 * Main quote function. Accepts mode (delivery/collection), postcode, address (optional), subtotalPence, store id.
 */
export async function quoteDelivery({ mode, postcode, address, subtotalPence, store = 'default' }) {
  if (mode === 'collection') {
    return { isDeliverable: true, feePence: 0, minOrderPence: 0, zone: null, reason: null, debug: { engine: 'collection' } };
  }

  try {
    // Get store configuration from database
    const { data: storeConfig, error } = await supabase
      .from('store_config')
      .select('*')
      .eq('id', store)
      .single();

    if (error || !storeConfig) {
      return {
        isDeliverable: false,
        feePence: 0,
        minOrderPence: 0,
        zone: null,
        reason: 'Store configuration not found',
        debug: { engine: 'error', store }
      };
    }

    const activeRuleType = storeConfig.delivery_active_rule_type;

    if (activeRuleType === 'postcode') {
      return await quoteByPostcodePrefix(
        storeConfig.delivery_postcode_rules,
        postcode,
        subtotalPence
      );
    } else if (activeRuleType === 'distance') {
      const storeLocation = {
        lat: storeConfig.location_lat,
        lng: storeConfig.location_lng
      };
      return await quoteByDistanceBands(
        storeConfig.delivery_distance_rules,
        storeLocation,
        postcode,
        address,
        subtotalPence
      );
    }

    return {
      isDeliverable: false,
      feePence: 0,
      minOrderPence: 0,
      zone: null,
      reason: 'Invalid delivery rule type',
      debug: { engine: 'error', activeRuleType }
    };
  } catch (error) {
    return {
      isDeliverable: false,
      feePence: 0,
      minOrderPence: 0,
      zone: null,
      reason: 'Error calculating delivery fee',
      debug: { engine: 'error', error: error.message }
    };
  }
}