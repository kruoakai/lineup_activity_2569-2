// ระยะทางระหว่างพิกัด 2 จุด (เมตร) — Haversine
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * ประเมินตำแหน่งเทียบพื้นที่เข้าแถว
 * คืนค่า { result: 'in_zone' | 'out_of_zone' | 'low_accuracy' | 'no_location' | 'not_configured', distance }
 */
function evaluate(loc, s) {
  if (!s.geofence_configured) return { result: 'not_configured', distance: null };
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return { result: 'no_location', distance: null };
  const distance = Math.round(distanceMeters(loc.lat, loc.lng, Number(s.geofence_lat), Number(s.geofence_lng)));
  const accuracy = Number.isFinite(loc.accuracy) ? loc.accuracy : Infinity;
  if (accuracy > s.max_accuracy_m) return { result: 'low_accuracy', distance };
  // ยอมให้ขอบเขตกว้างขึ้นตามความคลาดเคลื่อนได้ไม่เกินครึ่งหนึ่งของรัศมี
  const tolerance = Math.min(accuracy, s.geofence_radius_m / 2);
  if (distance <= s.geofence_radius_m + tolerance) return { result: 'in_zone', distance };
  return { result: 'out_of_zone', distance };
}

module.exports = { distanceMeters, evaluate };
