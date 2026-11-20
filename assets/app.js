// 첫 화면: 전국 사찰 지도와 목록. 데이터는 data/index.json(tools/build-web.mjs가 만든다).
/* global maplibregl, JT, Visited, styleUrl, useKoreanLabels, addPinImages, PIN_OFFSET, esc */
(async function () {
  const $ = (s) => document.querySelector(s);
  const data = await (await fetch(`${JT.root}data/index.json`)).json();
  const themeLabel = Object.fromEntries(data.themes.map((t) => [t.id, t.label]));
  const byId = new Map(data.temples.map((t) => [t.id, t]));

  const state = { filter: "all", region: "", query: "", selected: null };

  // ── 거르개 ─────────────────────────────────────────────
  const chips = [
    ["all", "전체"], ["curated", "코스 추천"], ["templestay", "템플스테이"], ["visited", "다녀온 곳"],
    ...data.themes.map((t) => [t.id, t.label]),
  ];
  $("#chips").innerHTML = chips.map(([id, label]) =>
    `<button type="button" class="chip" data-f="${id}" aria-pressed="${id === "all"}">${esc(label)}</button>`).join("");
  $("#region").innerHTML = `<option value="">전국</option>` + data.regions.map((r) => `<option>${esc(r)}</option>`).join("");

  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.filter = b.dataset.f;
    for (const c of $("#chips").children) c.setAttribute("aria-pressed", c === b);
    update();
  });
  $("#region").addEventListener("change", (e) => { state.region = e.target.value; update(true); });
  $("#q").addEventListener("input", (e) => { state.query = e.target.value.trim(); update(); });

  function matches(t, visited) {
    if (state.region && t.region !== state.region) return false;
    switch (state.filter) {
      case "all": break;
      case "curated": if (!t.curated) return false; break;
      case "templestay": if (!t.templestay) return false; break;
      case "visited": if (!visited.has(t.id)) return false; break;
      default: if (!(t.themes || []).includes(state.filter)) return false;
    }
    if (state.query) {
      const q = state.query.replace(/\s+/g, "");
      const hay = (t.name + t.address + t.region).replace(/\s+/g, "");
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // ── 목록 ───────────────────────────────────────────────
  function tags(t) {
    const out = [];
    if (t.curated) out.push(`<span class="tag tag-ink">코스 추천</span>`);
    if (t.templestay) out.push(`<span class="tag tag-gold">템플스테이</span>`);
    for (const th of t.themes || []) out.push(`<span class="tag">${esc(themeLabel[th])}</span>`);
    return out.join("");
  }
  function card(t, visited) {
    const img = t.thumb || t.image;
    return `<a class="card" href="${JT.root}t/${t.id}/" data-id="${t.id}">
      <div class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<img class="ph" src="${JT.root}assets/pin.svg" alt="">`}</div>
      <div class="body">
        <div class="name">${esc(t.name)}${visited.has(t.id) ? `<span class="done" title="다녀옴">${JT.icons.check}</span>` : ""}</div>
        <div class="addr">${esc(t.address)}</div>
        ${t.summary ? `<div class="sum">${esc(t.summary)}</div>` : ""}
        <div class="meta"><div class="tags">${tags(t)}</div>${t.n ? `<span class="trails">걷기 코스 ${t.n}</span>` : ""}</div>
      </div></a>`;
  }

  let list = [];
  function update(fit = false) {
    const visited = Visited.all();
    list = data.temples.filter((t) => matches(t, visited))
      .sort((a, b) => (b.curated ? 1 : 0) - (a.curated ? 1 : 0) || a.name.localeCompare(b.name, "ko"));
    $("#count").textContent = `${list.length.toLocaleString("ko-KR")}곳`;
    $("#list").innerHTML = list.length ? list.map((t) => card(t, visited)).join("")
      : `<p class="empty">조건에 맞는 사찰이 없어요.</p>`;
    const done = data.temples.filter((t) => visited.has(t.id)).length;
    $("#progress").textContent = `전국 사찰 ${data.temples.length.toLocaleString("ko-KR")}곳 중 ${done}곳을 다녀왔어요`;
    $("#bar").style.width = `${(done / data.temples.length) * 100}%`;
    if (map?.getSource("temples")) {
      map.getSource("temples").setData(features(list, visited));
      if (fit && list.length) {
        const b = new maplibregl.LngLatBounds();
        list.forEach((t) => b.extend([t.lng, t.lat]));
        map.fitBounds(b, { padding: 60, maxZoom: 12, duration: 600 });
      }
    }
  }

  // ── 지도 ───────────────────────────────────────────────
  function features(temples, visited) {
    return {
      type: "FeatureCollection",
      features: temples.map((t) => {
        const v = visited.has(t.id);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [t.lng, t.lat] },
          properties: {
            id: t.id,
            icon: v ? "jt-pin-visited" : t.curated ? "jt-pin-curated" : "jt-pin",
            size: t.curated || v ? 1 : 0.9,
            order: v ? 2 : t.curated ? 1 : 0,
          },
        };
      }),
    };
  }

  const map = new maplibregl.Map({
    container: "map",
    style: styleUrl(),
    center: [127.8, 36.3],
    zoom: 5.9,
    minZoom: 5,
    maxBounds: [[122, 32], [133, 39.6]],
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.GeolocateControl({ fitBoundsOptions: { maxZoom: 11 } }), "top-right");

  map.on("load", async () => {
    useKoreanLabels(map);
    await addPinImages(map);
    map.addSource("temples", { type: "geojson", data: features([], new Set()), cluster: true, clusterRadius: 46, clusterMaxZoom: 10 });
    map.addLayer({
      id: "clusters", type: "circle", source: "temples", filter: ["has", "point_count"],
      paint: {
        "circle-color": "#2B312E",
        "circle-radius": ["step", ["get", "point_count"], 15, 20, 19, 80, 24, 200, 29],
        "circle-stroke-color": "#F3EFE7",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "temples", filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count_abbreviated"]],
        "text-font": ["Roboto Bold", "Noto Sans Bold"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#F3EFE7" },
    });
    map.addLayer({
      id: "pins", type: "symbol", source: "temples", filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["get", "size"],
        "icon-allow-overlap": true,
        "icon-anchor": "bottom",
        "icon-offset": PIN_OFFSET,
        "symbol-sort-key": ["get", "order"],
      },
    });
    map.on("click", "clusters", async (e) => {
      const f = e.features[0];
      const zoom = await map.getSource("temples").getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom });
    });
    map.on("click", "pins", (e) => select(e.features[0].properties.id));
    map.on("click", (e) => {
      if (!map.queryRenderedFeatures(e.point, { layers: ["pins", "clusters"] }).length) select(null);
    });
    for (const l of ["pins", "clusters"]) {
      map.on("mouseenter", l, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; });
    }
    update();
    // 사찰 페이지의 "지도에서 보기"(…/#사찰id)로 들어왔을 때
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (byId.has(fromHash)) select(fromHash, true);
  });

  // ── 고른 사찰 미리보기 ─────────────────────────────────
  function select(id, fly = false) {
    state.selected = id;
    const box = $("#preview");
    if (!id) { box.hidden = true; box.innerHTML = ""; return; }
    const t = byId.get(id);
    box.innerHTML = `<button type="button" class="close" aria-label="닫기">${JT.icons.close}</button>${card(t, Visited.all())}`;
    box.hidden = false;
    box.querySelector(".close").onclick = () => select(null);
    if (fly) map.flyTo({ center: [t.lng, t.lat], zoom: Math.max(map.getZoom(), 12.5) });
  }

  // ── 휴대폰: 지도/목록 전환 ─────────────────────────────
  $("#toggle").addEventListener("click", () => {
    const toList = !document.body.classList.contains("show-list");
    document.body.classList.toggle("show-list", toList);
    $("#toggle").innerHTML = toList ? `${JT.icons.map}<span>지도</span>` : `${JT.icons.list}<span>목록</span>`;
    if (!toList) map.resize();
  });

  // 다른 탭(사찰 페이지)에서 다녀옴 표시를 바꾸면 반영
  window.addEventListener("storage", (e) => { if (e.key === Visited.KEY) update(); });
  window.addEventListener("pageshow", (e) => { if (e.persisted) update(); });
  update();
})();
