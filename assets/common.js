// 지도 페이지와 사찰 페이지가 함께 쓰는 것: 다녀온 사찰 기록, 지도 스타일, 지도 표지, 글자 도우미.
/* global maplibregl */
const JT = window.JT || {};

/** 다녀온 사찰 기록. 이 브라우저에만 저장하고 어디에도 보내지 않는다. */
const Visited = {
  KEY: "jeolttara.visited",
  all() {
    try { return new Set(JSON.parse(localStorage.getItem(this.KEY) || "[]")); } catch { return new Set(); }
  },
  has(id) { return this.all().has(id); },
  toggle(id) {
    const s = this.all();
    if (s.has(id)) s.delete(id); else s.add(id);
    try { localStorage.setItem(this.KEY, JSON.stringify([...s])); } catch { /* 저장 못 하면 이번 화면에서만 */ }
    return s.has(id);
  },
};

/** 앱(ui/TempleMap.kt)과 같은 MapTiler 아웃도어 지도. 사찰 표지가 잘 보이도록 늘 밝은 지도를 쓴다. */
const styleUrl = () => `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${JT.key}`;

/** 코스 선 색(앱의 TrailColors와 같다). */
const TRAIL_COLORS = ["#A67C3D", "#3F5A73", "#9A5640", "#55745F"];

/** 핀 끝이 아이콘 높이의 몇 % 지점인지(앱의 PIN_TIP과 같다). */
const PIN_TIP = 0.942;
const PIN_H = 36;

/** 지명을 한국어로: name:ko가 있으면 그걸, 없으면 원래 이름을 쓴다. */
function useKoreanLabels(map) {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const tf = map.getLayoutProperty(layer.id, "text-field");
    if (!tf) continue;
    const s = JSON.stringify(tf);
    if (/name/.test(s) && !/name:ko/.test(s)) {
      map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:ko"], ["get", "name"]]);
    }
  }
}

/** 지도 표지(연꽃 핀) 세 가지를 지도에 올린다. 이름에 jt- 를 붙여 MapTiler 아이콘과 겹치지 않게 한다. */
async function addPinImages(map) {
  const load = (name) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `${JT.root}assets/${name}.svg`;
  });
  const [pin, curated, visited] = await Promise.all([load("pin"), load("pin-curated"), load("pin-visited")]);
  map.addImage("jt-pin", pin, { pixelRatio: 2 });
  map.addImage("jt-pin-curated", curated, { pixelRatio: 2 });
  map.addImage("jt-pin-visited", visited, { pixelRatio: 2 });
}

/** 핀 끝이 사찰 위치를 가리키도록 아래로 내리는 양(아이콘 픽셀). */
const PIN_OFFSET = [0, +(PIN_H * (1 - PIN_TIP)).toFixed(2)];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
