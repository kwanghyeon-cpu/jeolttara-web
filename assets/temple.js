// 사찰 페이지: 걷기 코스 지도와 "다녀왔어요" 표시. 글은 tools/build-web.mjs가 HTML로 미리 써 둔다.
/* global maplibregl, JT, Visited, styleUrl, useKoreanLabels, addPinImages, PIN_OFFSET, TRAIL_COLORS */
(function () {
  const t = JSON.parse(document.getElementById("temple-data").textContent);

  // ── 다녀왔어요 ─────────────────────────────────────────
  const btn = document.getElementById("visit");
  const paint = (on) => {
    btn.setAttribute("aria-pressed", on);
    btn.querySelector("span").textContent = on ? "다녀왔어요" : "다녀왔어요로 표시";
  };
  paint(Visited.has(t.id));
  btn.addEventListener("click", () => {
    paint(Visited.toggle(t.id));
    if (map.getSource("temple")) map.getSource("temple").setData(templeFeature());
  });

  // ── 공유: 휴대폰은 공유 창, PC는 주소 복사 ────────────────
  const share = document.getElementById("share");
  if (share) share.addEventListener("click", async () => {
    const url = location.href.split("#")[0];
    const title = share.dataset.title;
    try {
      if (navigator.share) { await navigator.share({ title: `${title} | 절따라`, url }); return; }
      await navigator.clipboard.writeText(url);
      share.querySelector("span").textContent = "주소를 복사했어요";
      setTimeout(() => { share.querySelector("span").textContent = "공유"; }, 2000);
    } catch { /* 공유 창을 닫은 경우 */ }
  });

  // ── 지도 ───────────────────────────────────────────────
  const map = new maplibregl.Map({
    container: "map",
    style: styleUrl(),
    center: [t.lng, t.lat],
    zoom: 14,
    // 페이지를 내리다 지도에 걸리지 않게: 휴대폰은 두 손가락, PC는 Ctrl+휠로 움직인다
    cooperativeGestures: true,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.FullscreenControl(), "top-right");

  const templeFeature = () => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [t.lng, t.lat] },
    properties: { icon: Visited.has(t.id) ? "jt-pin-visited" : t.curated ? "jt-pin-curated" : "jt-pin" },
  });
  const trailData = (selected) => ({
    type: "FeatureCollection",
    features: t.trails.map((tr, i) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: tr.path },
      properties: {
        color: TRAIL_COLORS[i % TRAIL_COLORS.length],
        width: selected === i ? 6 : 4,
        opacity: selected != null && selected !== i ? 0.35 : 0.95,
        z: selected === i ? 1 : 0,
      },
    })),
  });
  const fit = (coords) => {
    const b = new maplibregl.LngLatBounds();
    coords.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 600 });
  };

  map.on("load", async () => {
    useKoreanLabels(map);
    await addPinImages(map);
    map.addSource("trails", { type: "geojson", data: trailData(null) });
    map.addLayer({
      id: "trails", type: "line", source: "trails",
      layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "z"] },
      paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": ["get", "opacity"] },
    });
    map.addSource("temple", { type: "geojson", data: templeFeature() });
    map.addLayer({
      id: "temple", type: "symbol", source: "temple",
      layout: { "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-anchor": "bottom", "icon-offset": PIN_OFFSET },
    });
    // 사찰 둘레 코스(OSM)만 한눈에 담는다. 두루누비 코스는 수십 km라 고를 때만 맞춘다.
    const near = t.trails.filter((tr) => tr.source !== "DURUNUBI").flatMap((tr) => tr.path);
    if (near.length) fit([[t.lng, t.lat], ...near]);
  });

  // 코스 카드를 누르면 그 코스를 강조하고 지도를 맞춘다
  let selected = null;
  document.querySelectorAll(".trail").forEach((el) => {
    el.addEventListener("click", () => {
      const i = +el.dataset.i;
      selected = selected === i ? null : i;
      document.querySelectorAll(".trail").forEach((x) => x.setAttribute("aria-pressed", +x.dataset.i === selected));
      if (!map.getSource("trails")) return;
      map.getSource("trails").setData(trailData(selected));
      fit(selected == null ? [[t.lng, t.lat], ...t.trails.flatMap((tr) => tr.path)] : t.trails[selected].path);
      document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
})();
