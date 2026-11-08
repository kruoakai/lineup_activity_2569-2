<template>
  <div class="mapwrap">
    <form class="search row" @submit.prevent="search">
      <input v-model="q" class="grow" placeholder="ค้นหาสถานที่ เช่น วิทยาลัยเทคนิคชัยภูมิ" />
      <button class="btn sm" :disabled="searching">{{ searching ? '…' : 'ค้นหา' }}</button>
    </form>
    <ul v-if="results.length" class="results">
      <li v-for="r in results" :key="r.place_id" @click="choose(r)">{{ r.display_name }}</li>
    </ul>
    <div class="mapbox">
      <div ref="el" class="map" />
      <!-- หมุดตรึงกลางจอ: เลื่อนแผนที่ให้หมุดชี้จุดที่ต้องการ (แบบแอปสั่งอาหาร) -->
      <div class="pin" :class="{ lifting: moving }"><span>📍</span></div>
      <div class="tools">
        <button type="button" class="btn sm" @click="toggleLayer">{{ satellite ? '🗺 แผนที่' : '🛰 ดาวเทียม' }}</button>
        <button type="button" class="btn sm" :disabled="locating" @click="locate">{{ locating ? '…' : '◎ ตำแหน่งฉัน' }}</button>
      </div>
    </div>
    <p class="small muted">เลื่อนแผนที่ให้หมุด 📍 อยู่กลางลานเข้าแถว (หรือแตะบนแผนที่) · วงกลม = พื้นที่ที่เช็กชื่อได้ {{ radius }} ม.</p>
    <p v-if="msg" class="small" style="color:var(--bad)">{{ msg }}</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getBestPosition } from '../util';

const props = defineProps({ lat: [Number, String], lng: [Number, String], radius: { type: Number, default: 150 } });
const emit = defineEmits(['update']);
const el = ref(null);
const q = ref('');
const results = ref([]);
const searching = ref(false);
const locating = ref(false);
const satellite = ref(true);
const moving = ref(false);
const msg = ref('');
let map; let circle; let street; let imagery;

// ค่าเริ่มต้น: อำเภอเมืองชัยภูมิ (ผู้ดูแลเลื่อนไปจุดจริง)
const DEFAULT = [15.8068, 102.0315];

onMounted(() => {
  const has = props.lat !== '' && props.lng !== '' && props.lat != null && Number.isFinite(+props.lat);
  const start = has ? [+props.lat, +props.lng] : DEFAULT;
  map = L.map(el.value, { zoomControl: true, attributionControl: true }).setView(start, has ? 18 : 15);
  street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri' });
  (satellite.value ? imagery : street).addTo(map);
  circle = L.circle(start, { radius: props.radius, color: '#1d4e89', weight: 2, fillColor: '#2f6fb8', fillOpacity: 0.15 }).addTo(map);
  map.on('movestart', () => { moving.value = true; });
  map.on('move', () => circle.setLatLng(map.getCenter()));
  map.on('moveend', () => { moving.value = false; report(); });
  map.on('click', (e) => map.panTo(e.latlng));
  if (!has) report();
});

onBeforeUnmount(() => map?.remove());

watch(() => props.radius, (r) => circle?.setRadius(Number(r) || 0));

function report() {
  const c = map.getCenter();
  emit('update', { lat: +c.lat.toFixed(7), lng: +c.lng.toFixed(7) });
}

function toggleLayer() {
  satellite.value = !satellite.value;
  map.removeLayer(satellite.value ? street : imagery);
  (satellite.value ? imagery : street).addTo(map);
}

async function locate() {
  locating.value = true;
  msg.value = '';
  try {
    const p = await getBestPosition({ timeoutMs: 15000, goodEnough: 10 });
    map.setView([p.lat, p.lng], 19);
    msg.value = p.accuracy > 30 ? `ความแม่นยำ ±${Math.round(p.accuracy)} ม. — ตรวจตำแหน่งบนภาพดาวเทียมอีกครั้ง` : '';
  } catch (e) {
    msg.value = e.message;
  } finally {
    locating.value = false;
  }
}

async function search() {
  if (!q.value.trim()) return;
  searching.value = true;
  msg.value = '';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=th&accept-language=th&q=${encodeURIComponent(q.value)}`);
    results.value = await r.json();
    if (!results.value.length) msg.value = 'ไม่พบสถานที่ ลองพิมพ์ชื่ออื่น หรือเลื่อนแผนที่เอง';
  } catch {
    msg.value = 'ค้นหาไม่ได้ในขณะนี้';
  } finally {
    searching.value = false;
  }
}

function choose(r) {
  results.value = [];
  map.setView([+r.lat, +r.lon], 18);
}
</script>

<style scoped>
.mapbox { position: relative; height: 360px; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); }
.map { position: absolute; inset: 0; }
.pin { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -100%); z-index: 500; pointer-events: none; font-size: 34px; transition: transform .15s; filter: drop-shadow(0 3px 3px rgba(0,0,0,.35)); }
.pin.lifting { transform: translate(-50%, -125%); }
.tools { position: absolute; right: 8px; bottom: 8px; z-index: 600; display: flex; gap: 6px; }
.tools .btn { background: #fff; color: #1c2430; }
.search { margin-bottom: 6px; }
.results { list-style: none; margin: 0 0 6px; padding: 0; border: 1px solid var(--line); border-radius: 10px; max-height: 180px; overflow: auto; background: var(--card); }
.results li { padding: 8px 10px; font-size: .85rem; border-bottom: 1px solid var(--line); cursor: pointer; }
.results li:last-child { border-bottom: 0; }
</style>
