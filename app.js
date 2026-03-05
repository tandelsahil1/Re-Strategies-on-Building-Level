import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* ---------------- DOM ---------------- */
const appRoot = document.getElementById("appRoot");
const scenarioStage = document.getElementById("scenarioStage");

const viewerShell = document.getElementById("viewerShell");
const viewerEl = document.getElementById("viewer3d");

const roomNameInput = document.getElementById("roomNameInput");
const lengthInput = document.getElementById("lengthInput");
const widthInput = document.getElementById("widthInput");
const heightInput = document.getElementById("heightInput");
const buildBtn = document.getElementById("buildBtn");
const dimensionReadout = document.getElementById("dimensionReadout");

const componentRowsEl = document.getElementById("componentRows");
const selectionReadout = document.getElementById("selectionReadout");
const viewerRoomTitle = document.getElementById("viewerRoomTitle");
const roomNameReadout = document.getElementById("roomNameReadout");

const insideBtn = document.getElementById("insideBtn");
const outsideBtn = document.getElementById("outsideBtn");
const resetBtn = document.getElementById("resetBtn");

const goScenariosBtn = document.getElementById("goScenariosBtn");
const backToRoomBtn = document.getElementById("backToRoomBtn");

const scenarioListEl = document.getElementById("scenarioList");
const scenarioDescriptionEl = document.getElementById("scenarioDescription");
const scenarioDescCard = document.getElementById("scenarioDescCard");
const showTotalBtn = document.getElementById("showTotalBtn");

const totalCard = document.getElementById("totalCard");
const totalDonut = document.getElementById("totalDonut");
const totalPercentEl = document.getElementById("totalPercent");
const totalKgEl = document.getElementById("totalKg");
const totalKgWithoutEl = document.getElementById("totalKgWithout");
const totalKgSavedEl = document.getElementById("totalKgSaved");
const resetScenariosBtn = document.getElementById("resetScenariosBtn");

/* ---------------- Scenario names ---------------- */
const SCENARIOS = [
  "Reuse same location",
  "Reuse diff location",
  "Repair same location",
  "Repair diff location",
  "Refurbish",
  "Repurpose",
  "Recycle",
  "Redistribute",
];

/* ---------------- Category definitions ---------------- */
const CATEGORY_DEFS = {
  wall: {
    label: "Wall",
    areaLabel: "Area (m²)",
    csvComponent: "Wall",
    defaultAreaType: "max",
  },
  floor: {
    label: "Floor Panels",
    areaLabel: "Area (m²)",
    csvComponent: "Floor Panels",
    defaultAreaType: "maxIntegerPanels",
  },
  ceiling: {
    label: "Ceiling",
    areaLabel: "Area (m²)",
    csvComponent: "Ceiling",
    defaultAreaType: "maxIntegerPanels",
  },
  door: {
    label: "Door",
    areaLabel: "Area (m²)",
    csvComponent: "Door",
    defaultAreaType: "door",
  },
  lights: {
    label: "Lights",
    areaLabel: "Coverage (m²)",
    csvComponent: "Lights",
    defaultAreaType: "floorArea",
  },
  pedestal: {
    label: "Pedestals",
    areaLabel: "Area (m²)",
    csvComponent: "Pedestals",
    defaultAreaType: "maxIntegerPanels",
  },
};

/* ---------------- State ---------------- */
const state = {
  roomName: "Lindner Room",
  dims: { length: 5, width: 10, height: 3 },
  raisedFloorHeight: 0.45,
  selected: new Set(),
  ui: {},
  componentsCatalog: {},
  settings: {
    wall: { area: 0, material: "glass", product: "", productType: "" },
    floor: { area: 0, material: "calcium", product: "", productType: "" },
    ceiling: { area: 0, material: "metal", product: "", productType: "" },
    door: { area: 2.0, material: "glass", product: "", productType: "", count: 1 },
    lights: { area: 20, material: "warm", product: "", productType: "" },
    pedestal: { area: 0, material: "hollow", product: "", productType: "" },
  },
  metrics: {},
  scenario: {
    mode: "room",
    chartByComponent: {},
    descByScenario: {},
    chosenByComponent: {},
  },
  objects: {
    root: null,
    ghost: [],
    pickables: [],
    categories: { wall: [], floor: [], ceiling: [], door: [], lights: [], pedestal: [] },
    wallInst: null,
    floorInst: null,
    ceilingInst: null,
    doorGroup: null,
    lightGroup: null,
    lightSpots: [],
    wallCells: [],
    floorCells: [],
    ceilingCells: [],
    pedBase: null,
    pedRod: null,
    pedHead: null,
    pedRing: null,
    pedestalAnchors: [],
    ceilingLightCandidates: [],
  },
};

let scene, camera, renderer, controls;
let ambientLight, hemiLight, dirLight;
let texCache = new Map();
let anisotropy = 4;
let tmpObj = new THREE.Object3D();

/* ---------------- File loading ---------------- */
async function loadTextFile(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

async function loadCSVData() {
  const [chartText, descText, componentsText] = await Promise.all([
    loadTextFile("./chart.csv"),
    loadTextFile("./description.csv"),
    loadTextFile("./components.csv"),
  ]);

  parseScenarioCSVs(chartText, descText);
  parseComponentsCSV(componentsText);
}

/* ---------------- Init ---------------- */
init().catch((err) => {
  console.error(err);
  alert(
    "Failed to load CSV files. If you opened index.html directly, run the project with Live Server or another local server."
  );
});

async function init() {
  await loadCSVData();
  setupUI();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1320);
  scene.fog = new THREE.Fog(0x0d1320, 20, 60);

  camera = new THREE.PerspectiveCamera(52, viewerEl.clientWidth / viewerEl.clientHeight, 0.05, 240);
  camera.position.set(12, 5.5, 12);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewerEl.appendChild(renderer.domElement);

  anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 4;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.4;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 2, 0);

  setupLighting();
  setupEnvironment();
  setupEvents();

  buildRoom();
  setOutsideView();

  renderer.setAnimationLoop(renderLoop);
}

/* ---------------- Scenario CSV parsing ---------------- */
function parseScenarioCSVs(chartCSVText, descCSVText) {
  const chartRows = parseCSV(chartCSVText);
  const descRows = parseCSV(descCSVText);

  const chartByComponent = {};
  for (const r of chartRows) {
    const comp = r["Components"]?.trim();
    if (!comp) continue;

    const chartvalue = toNum(r["chartvalue"]);
    const scenarioValues = {};

    for (const s of SCENARIOS) {
      scenarioValues[s] = toNum(r[s]);
    }

    chartByComponent[comp] = { chartvalue, scenarioValues };
  }

  const descByScenario = {};
  for (const r of descRows) {
    const s = r["Scenario"]?.trim();
    if (!s) continue;

    descByScenario[s] = {
      en: stripQuotes(r["Description"] || ""),
      de: stripQuotes(r["Description_DE"] || ""),
    };
  }

  state.scenario.chartByComponent = chartByComponent;
  state.scenario.descByScenario = descByScenario;
}

/* ---------------- components.csv parsing ---------------- */
function parseComponentsCSV(componentsCSVText) {
  const rows = parseCSV(componentsCSVText);
  const catalog = {};

  for (const r of rows) {
    const comp = (r["Components"] || "").trim();
    const prod = (r["Product"] || "").trim();
    const type = (r["Product type"] || "").trim();
    if (!comp || !prod || !type) continue;

    if (!catalog[comp]) catalog[comp] = { products: {} };
    if (!catalog[comp].products[prod]) catalog[comp].products[prod] = [];
    if (!catalog[comp].products[prod].includes(type)) catalog[comp].products[prod].push(type);
  }

  state.componentsCatalog = catalog;

  for (const [key, def] of Object.entries(CATEGORY_DEFS)) {
    const compName = def.csvComponent;
    const entry = catalog[compName];
    if (!entry) continue;

    const products = Object.keys(entry.products);
    if (!products.length) continue;

    const p0 = products[0];
    const t0 = entry.products[p0]?.[0] || "";
    state.settings[key].product = state.settings[key].product || p0;
    state.settings[key].productType = state.settings[key].productType || t0;

    state.settings[key].material = deriveMaterialForCategory(
      key,
      state.settings[key].product,
      state.settings[key].productType
    );
  }
}

function getProductsForComponent(compName) {
  return Object.keys(state.componentsCatalog?.[compName]?.products || {});
}

function getTypesForComponentProduct(compName, productName) {
  return (state.componentsCatalog?.[compName]?.products?.[productName] || []).slice();
}

/* ---------------- Product selection -> material mapping ---------------- */
function deriveMaterialForCategory(catKey, productName, productType) {
  const p = (productName || "").toLowerCase();
  const t = (productType || "").toLowerCase();

  if (catKey === "wall") {
    if (p.includes("wood")) return "wood";
    if (p.includes("glass")) return "glass";
    return "glass";
  }

  if (catKey === "floor") {
    if (p.includes("ligna") || p.includes("wood") || t.includes("wood")) return "wood";
    return "calcium";
  }

  if (catKey === "ceiling") {
    if (p.includes("glass")) return "glass";
    return "metal";
  }

  if (catKey === "door") {
    if (p.includes("aluminium")) return "aluminium";
    if (p.includes("glass")) return "glass";
    if (p.includes("wood")) return "wood";
    return "glass";
  }

  if (catKey === "lights") {
    return state.settings.lights.material || "warm";
  }

  if (catKey === "pedestal") {
    return state.settings.pedestal.material || "hollow";
  }

  return state.settings[catKey]?.material || "glass";
}

function isDoorDoubleLeaf(productName) {
  const p = (productName || "").toLowerCase();
  return p.includes("2 lfg");
}

/* ---------------- UI ---------------- */
function setupUI() {
  componentRowsEl.innerHTML = "";

  for (const [key, def] of Object.entries(CATEGORY_DEFS)) {
    const row = document.createElement("div");
    row.className = "comp-row";
    row.dataset.cat = key;

    const top = document.createElement("div");
    top.className = "comp-top";

    const toggle = document.createElement("button");
    toggle.className = "comp-toggle";
    toggle.textContent = def.label;

    const summary = document.createElement("div");
    summary.className = "comp-summary";
    summary.textContent = "Not selected";

    top.append(toggle, summary);

    const controlsWrap = document.createElement("div");
    controlsWrap.className = "comp-controls hidden";

    const areaWrap = document.createElement("div");
    areaWrap.className = "comp-field";
    const areaLabel = document.createElement("label");
    areaLabel.textContent = def.areaLabel;
    const areaInput = document.createElement("input");
    areaInput.type = "number";
    areaInput.min = "0";
    areaInput.step = key === "door" ? "0.1" : "1";
    areaInput.value = String(state.settings[key].area ?? 0);
    areaWrap.append(areaLabel, areaInput);

    const compWrap = document.createElement("div");
    compWrap.className = "comp-field";
    const compLabel = document.createElement("label");
    compLabel.textContent = "Component";
    const compSelect = document.createElement("select");
    compSelect.disabled = true;
    const compOpt = document.createElement("option");
    compOpt.value = def.csvComponent;
    compOpt.textContent = def.csvComponent;
    compOpt.selected = true;
    compSelect.appendChild(compOpt);
    compWrap.append(compLabel, compSelect);

    const prodWrap = document.createElement("div");
    prodWrap.className = "comp-field";
    const prodLabel = document.createElement("label");
    prodLabel.textContent = "Product";
    const prodSelect = document.createElement("select");
    prodWrap.append(prodLabel, prodSelect);

    const typeWrap = document.createElement("div");
    typeWrap.className = "comp-field";
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Product type";
    const typeSelect = document.createElement("select");
    typeWrap.append(typeLabel, typeSelect);

    const doorCountWrap = document.createElement("div");
    doorCountWrap.className = "comp-field hidden";
    const doorCountLabel = document.createElement("label");
    doorCountLabel.textContent = "Number of doors";
    const doorCountInput = document.createElement("input");
    doorCountInput.type = "number";
    doorCountInput.min = "1";
    doorCountInput.max = "24";
    doorCountInput.step = "1";
    doorCountInput.value = String(state.settings.door.count ?? 1);
    doorCountWrap.append(doorCountLabel, doorCountInput);

    if (key === "door") doorCountWrap.classList.remove("hidden");

    controlsWrap.append(areaWrap, compWrap, prodWrap, typeWrap);
    if (key === "door") controlsWrap.append(doorCountWrap);

    row.append(top, controlsWrap);
    componentRowsEl.appendChild(row);

    state.ui[key] = {
      row,
      toggle,
      summary,
      controlsWrap,
      areaInput,
      compSelect,
      prodSelect,
      typeSelect,
      doorCountInput,
    };

    hydrateProductTypeSelectsForCategory(key);

    toggle.addEventListener("click", () => {
      if (state.selected.has(key)) state.selected.delete(key);
      else state.selected.add(key);

      if (state.selected.has(key) && Number(areaInput.value) <= 0) {
        const suggested = suggestDefaultArea(key);
        areaInput.value = String(suggested);
        state.settings[key].area = Number(areaInput.value);
      }

      syncUISelectionState();

      if (key === "door") buildRoom();
      else applyAllCategories();

      updateScenarioButtonState();
    });

    areaInput.addEventListener("input", () => {
      state.settings[key].area = Number(areaInput.value) || 0;
      if (key === "door") buildRoom();
      else applyAllCategories();
      updateScenarioButtonState();
    });

    prodSelect.addEventListener("change", () => {
      state.settings[key].product = prodSelect.value;
      hydrateProductTypeSelectsForCategory(key);

      state.settings[key].material = deriveMaterialForCategory(
        key,
        state.settings[key].product,
        state.settings[key].productType
      );

      if (key === "door") buildRoom();
      else applyAllCategories();
    });

    typeSelect.addEventListener("change", () => {
      state.settings[key].productType = typeSelect.value;

      state.settings[key].material = deriveMaterialForCategory(
        key,
        state.settings[key].product,
        state.settings[key].productType
      );

      if (key === "door") buildRoom();
      else applyAllCategories();
    });

    if (key === "door") {
      doorCountInput.addEventListener("input", () => {
        state.settings.door.count = clamp(Math.floor(Number(doorCountInput.value) || 1), 1, 24, 1);
        doorCountInput.value = String(state.settings.door.count);
        buildRoom();
      });
    }
  }

  syncUISelectionState();
  updateScenarioButtonState();
}

function hydrateProductTypeSelectsForCategory(catKey) {
  const def = CATEGORY_DEFS[catKey];
  const ui = state.ui[catKey];
  if (!def || !ui) return;

  const compName = def.csvComponent;
  const products = getProductsForComponent(compName);

  ui.prodSelect.innerHTML = "";
  for (const p of products) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    ui.prodSelect.appendChild(opt);
  }

  const desiredProduct =
    state.settings[catKey].product && products.includes(state.settings[catKey].product)
      ? state.settings[catKey].product
      : (products[0] || "");

  state.settings[catKey].product = desiredProduct;
  ui.prodSelect.value = desiredProduct;

  const types = getTypesForComponentProduct(compName, desiredProduct);
  ui.typeSelect.innerHTML = "";
  for (const t of types) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    ui.typeSelect.appendChild(opt);
  }

  const desiredType =
    state.settings[catKey].productType && types.includes(state.settings[catKey].productType)
      ? state.settings[catKey].productType
      : (types[0] || "");

  state.settings[catKey].productType = desiredType;
  ui.typeSelect.value = desiredType;

  state.settings[catKey].material = deriveMaterialForCategory(catKey, desiredProduct, desiredType);
}

function syncUISelectionState() {
  const selectedLabels = [];

  for (const [key, ui] of Object.entries(state.ui)) {
    const active = state.selected.has(key);
    ui.row.classList.toggle("active", active);
    ui.toggle.classList.toggle("active", active);
    ui.controlsWrap.classList.toggle("hidden", !active);

    if (active) {
      selectedLabels.push(CATEGORY_DEFS[key].label);
      ui.summary.textContent = `${CATEGORY_DEFS[key].areaLabel}`;
    } else {
      ui.summary.textContent = "Not selected";
    }
  }

  selectionReadout.textContent = selectedLabels.length ? selectedLabels.join(", ") : "None";
}

function updateScenarioButtonState() {
  const comps = getSelectedCSVComponents();
  goScenariosBtn.disabled = comps.length === 0;
}

/* ---------------- Events ---------------- */
function setupEvents() {
  window.addEventListener("resize", onResize);
  buildBtn.addEventListener("click", buildRoom);

  roomNameInput.addEventListener("input", () => {
    state.roomName = roomNameInput.value.trim() || "Untitled Room";
    roomNameReadout.textContent = state.roomName;
    viewerRoomTitle.textContent = state.roomName;
  });

  insideBtn.addEventListener("click", setInsideView);
  outsideBtn.addEventListener("click", setOutsideView);

  resetBtn.addEventListener("click", () => {
    state.selected.clear();
    state.scenario.chosenByComponent = {};
    totalCard.classList.add("hidden");
    scenarioDescriptionEl.textContent = "Select a scenario ring to see the description here.";
    syncUISelectionState();
    applyAllCategories();
    updateScenarioButtonState();
  });

  goScenariosBtn.addEventListener("click", () => enterScenarioMode());
  backToRoomBtn.addEventListener("click", () => exitScenarioMode());

  resetScenariosBtn.addEventListener("click", () => {
    state.scenario.mode = "scenarios";
    totalCard.classList.add("hidden");
    totalCard.style.display = "";
    if (scenarioDescCard) scenarioDescCard.style.display = "";
    appRoot.classList.add("mode-scenario-select");
    appRoot.classList.remove("mode-total");
    clearTotalViewerLayout();
    buildScenarioListUI();
  });

  showTotalBtn.addEventListener("click", () => {
    if (!allSelectedComponentsHaveChoice()) {
      alert("Please select a scenario for each component.");
      return;
    }
    showTotal();
  });
}

/* ---------------- TOTAL MODE LAYOUT ---------------- */
function layoutTotalViewer() {
  if (!viewerShell) return;

  const leftCard = document.querySelector(".scenario-left .scenario-card");
  const btnRect = showTotalBtn.getBoundingClientRect();
  if (!leftCard) return;

  const cardRect = leftCard.getBoundingClientRect();
  const gap = 14;
  const pad = 12;

  const left = cardRect.left + pad;
  const top = btnRect.bottom + gap;
  const width = cardRect.width - pad * 2;
  const height = Math.max(360, window.innerHeight - top - 24);

  viewerShell.style.display = "block";
  viewerShell.style.position = "fixed";
  viewerShell.style.left = `${left}px`;
  viewerShell.style.top = `${top}px`;
  viewerShell.style.width = `${width}px`;
  viewerShell.style.height = `${height}px`;
  viewerShell.style.zIndex = "7";
}

function clearTotalViewerLayout() {
  if (!viewerShell) return;
  viewerShell.removeAttribute("style");
}

/* ---------------- Resize ---------------- */
function onResize() {
  if (appRoot.classList.contains("mode-total")) {
    layoutTotalViewer();
  }

  const w = viewerEl.clientWidth;
  const h = viewerEl.clientHeight;

  if (!w || !h) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

/* =========================================================
   3D Scene setup
========================================================= */
function setupLighting() {
  ambientLight = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(ambientLight);

  hemiLight = new THREE.HemisphereLight(0xbfd7ff, 0x222731, 0.44);
  hemiLight.position.set(0, 12, 0);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xeef4ff, 0.68);
  dirLight.position.set(-10, 12, -8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 90;
  dirLight.shadow.camera.left = -20;
  dirLight.shadow.camera.right = 20;
  dirLight.shadow.camera.top = 20;
  dirLight.shadow.camera.bottom = -20;
  dirLight.shadow.bias = -0.00015;
  scene.add(dirLight);

  const fill = new THREE.PointLight(0x9fd6ff, 0.25, 60);
  fill.position.set(10, 2.2, 10);
  scene.add(fill);
}

function setupEnvironment() {
  const outer = new THREE.Mesh(
    new THREE.CircleGeometry(60, 80),
    new THREE.MeshStandardMaterial({ color: 0x1b2638, roughness: 0.98, metalness: 0 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  outer.receiveShadow = true;
  scene.add(outer);
}

/* =========================================================
   Room build
========================================================= */
function buildRoom() {
  state.roomName = roomNameInput.value.trim() || "Untitled Room";
  roomNameReadout.textContent = state.roomName;
  viewerRoomTitle.textContent = state.roomName;

  const length = clamp(parseFloat(lengthInput.value), 2, 100, 5);
  const width = clamp(parseFloat(widthInput.value), 2, 100, 10);
  const height = clamp(parseFloat(heightInput.value), 2.2, 8, 3);

  lengthInput.value = String(length);
  widthInput.value = String(width);
  heightInput.value = String(height);

  state.dims = { length, width, height };

  if (state.objects.root) {
    disposeObject(state.objects.root);
    scene.remove(state.objects.root);
  }

  state.objects = {
    root: new THREE.Group(),
    ghost: [],
    pickables: [],
    categories: { wall: [], floor: [], ceiling: [], door: [], lights: [], pedestal: [] },
    wallInst: null,
    floorInst: null,
    ceilingInst: null,
    doorGroup: null,
    lightGroup: null,
    lightSpots: [],
    wallCells: [],
    floorCells: [],
    ceilingCells: [],
    pedBase: null,
    pedRod: null,
    pedHead: null,
    pedRing: null,
    pedestalAnchors: [],
    ceilingLightCandidates: [],
  };

  scene.add(state.objects.root);

  computeMetrics();
  buildGhostShell();
  buildWallSystem();
  buildFloorPanels();
  buildCeilingPanels();
  buildDoor();
  buildLights();
  buildPedestalSystem();

  updateDimensionReadout();
  updateCategoryInputBounds();
  applyAllCategories();

  controls.target.set(0, state.metrics.floorTopY + state.dims.height * 0.45, 0);
  controls.update();

  updateScenarioButtonState();
}

function computeDoorPlacements() {
  const m = state.metrics;
  const doorCount = clamp(Math.floor(Number(state.settings.door.count) || 1), 1, 24, 1);

  const bySide = { front: 0, back: 0, left: 0, right: 0 };
  const order = ["front", "back", "left", "right"];

  for (let i = 0; i < doorCount; i++) bySide[order[i % 4]]++;

  const placements = [];

  function addSide(side, k) {
    if (k <= 0) return;

    const span = side === "front" || side === "back" ? m.length : m.width;
    const minClear = 0.8 + m.doorWidth / 2;
    const usable = Math.max(0, span - minClear * 2);

    for (let i = 0; i < k; i++) {
      const t = k === 1 ? 0.5 : i / (k - 1);
      const along = -span / 2 + minClear + usable * t;
      placements.push({ side, along });
    }
  }

  addSide("front", bySide.front);
  addSide("back", bySide.back);
  addSide("left", bySide.left);
  addSide("right", bySide.right);

  return placements;
}

function computeMetrics() {
  const { length, width, height } = state.dims;
  const floorTopY = state.raisedFloorHeight;
  const ceilingY = floorTopY + height;

  const doorHeight = Math.min(2.2, Math.max(1.9, height * 0.74));
  const requestedDoorArea = Math.max(0.8, state.settings.door.area || 2.0);
  const doorWidth = clamp(requestedDoorArea / doorHeight, 0.75, Math.min(1.6, length * 0.4), 1.0);

  const nx = Math.max(1, Math.floor(length));
  const nz = Math.max(1, Math.floor(width));
  const panelCount = nx * nz;
  const xMargin = (length - nx) / 2;
  const zMargin = (width - nz) / 2;

  state.metrics = {
    ...state.dims,
    floorTopY,
    ceilingY,
    doorHeight,
    doorWidth,
    doorPlacements: computeDoorPlacements(),
    nx,
    nz,
    panelCount,
    usableFloorArea: panelCount,
    xMargin,
    zMargin,
    wallMaxArea: 0,
    ceilingMaxArea: panelCount,
    floorMaxArea: panelCount,
    pedestalMaxArea: panelCount,
  };
}

function updateDimensionReadout() {
  const m = state.metrics;
  dimensionReadout.textContent = `Size: ${m.length.toFixed(2)}m × ${m.width.toFixed(2)}m × ${m.height.toFixed(2)}m`;
}

function updateCategoryInputBounds() {
  const m = state.metrics;
  const maxDoorArea = m.doorWidth * m.doorHeight;

  const maxMap = {
    wall: m.wallMaxArea,
    floor: m.floorMaxArea,
    ceiling: m.ceilingMaxArea,
    door: maxDoorArea,
    lights: m.length * m.width,
    pedestal: m.pedestalMaxArea,
  };

  for (const [cat, ui] of Object.entries(state.ui)) {
    const maxVal = maxMap[cat] || 0;
    ui.areaInput.max = String(Math.max(0, Math.floor(maxVal * 10) / 10));
    ui.areaInput.placeholder = `max ${maxVal.toFixed(1)}`;

    const current = Number(ui.areaInput.value) || 0;
    if (current > maxVal) {
      ui.areaInput.value = String(Math.max(0, Math.floor(maxVal)));
      state.settings[cat].area = Number(ui.areaInput.value);
    }
  }
}

/* ---------------- Geometry builders ---------------- */
function buildGhostShell() {
  const { length, width, height } = state.metrics;
  const floorTopY = state.metrics.floorTopY;

  const shellGroup = new THREE.Group();
  state.objects.root.add(shellGroup);

  const shellGeo = new THREE.BoxGeometry(length, height, width);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x8cb7ff,
    transparent: true,
    opacity: 0.06,
    roughness: 0.22,
    metalness: 0,
    transmission: 0.82,
    thickness: 0.08,
    ior: 1.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.position.set(0, floorTopY + height / 2, 0);
  shellGroup.add(shell);

  const edgeGeo = new THREE.EdgesGeometry(shellGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x66a5ff, transparent: true, opacity: 0.55 });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.position.copy(shell.position);
  shellGroup.add(edges);

  const baseSlab = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.06, width),
    new THREE.MeshStandardMaterial({
      color: 0x4a5c76,
      roughness: 0.92,
      metalness: 0.02,
      transparent: true,
      opacity: 0.92,
    })
  );
  baseSlab.position.set(0, 0.03, 0);
  baseSlab.receiveShadow = true;
  shellGroup.add(baseSlab);

  const ghostRaisedFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    new THREE.MeshBasicMaterial({
      color: 0x95b8ee,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ghostRaisedFloor.rotation.x = -Math.PI / 2;
  ghostRaisedFloor.position.set(0, floorTopY + 0.001, 0);
  shellGroup.add(ghostRaisedFloor);

  state.objects.ghost.push(shell, edges, baseSlab, ghostRaisedFloor);
}

function buildWallSystem() { return buildWallSystem_impl(); }
function buildFloorPanels() { return buildFloorPanels_impl(); }
function buildCeilingPanels() { return buildCeilingPanels_impl(); }
function buildDoor() { return buildDoor_impl(); }
function buildLights() { return buildLights_impl(); }
function buildPedestalSystem() { return buildPedestalSystem_impl(); }

function buildWallSystem_impl() {
  const m = state.metrics;
  const group = new THREE.Group();
  state.objects.root.add(group);

  const cells = [];
  const thickness = 0.03;
  const inset = 0.015;
  const y0 = m.floorTopY;
  const doorW = m.doorWidth;
  const doorH = m.doorHeight;

  const doorPlacements = (m.doorPlacements || []).map((p) => ({
    side: p.side,
    along: p.along,
    xMin: p.side === "front" || p.side === "back" ? p.along - doorW / 2 : null,
    xMax: p.side === "front" || p.side === "back" ? p.along + doorW / 2 : null,
    zMin: p.side === "left" || p.side === "right" ? p.along - doorW / 2 : null,
    zMax: p.side === "left" || p.side === "right" ? p.along + doorW / 2 : null,
    yMin: y0,
    yMax: y0 + doorH,
  }));

  function isInsideAnyDoorCutout(side, center, seg, yCenter, hSeg) {
    const cellMin = center - seg / 2;
    const cellMax = center + seg / 2;
    const cellYMin = yCenter - hSeg / 2;
    const cellYMax = yCenter + hSeg / 2;

    for (const d of doorPlacements) {
      if (d.side !== side) continue;

      const overlapsY = rangesOverlap(cellYMin, cellYMax, d.yMin, d.yMax);
      if (!overlapsY) continue;

      if (side === "front" || side === "back") {
        if (rangesOverlap(cellMin, cellMax, d.xMin, d.xMax)) return true;
      } else {
        if (rangesOverlap(cellMin, cellMax, d.zMin, d.zMax)) return true;
      }
    }
    return false;
  }

  function addWallCells(side, span) {
    const cols = Math.ceil(span);
    const rows = Math.ceil(m.height);

    const centers = [];
    const sizes = [];
    for (let c = 0; c < cols; c++) {
      const seg = c === cols - 1 ? span - (cols - 1) : 1;
      if (seg <= 0.001) continue;
      centers.push(-span / 2 + c + seg / 2);
      sizes.push(seg);
    }

    let yCursor = 0;
    for (let r = 0; r < rows; r++) {
      const hSeg = Math.min(1, m.height - yCursor);
      if (hSeg <= 0.001) break;
      const yCenter = y0 + yCursor + hSeg / 2;

      for (let i = 0; i < centers.length; i++) {
        const seg = sizes[i];
        const center = centers[i];

        if (state.selected.has("door") && (Number(state.settings.door.area) || 0) > 0) {
          if (isInsideAnyDoorCutout(side, center, seg, yCenter, hSeg)) continue;
        }

        const d = {
          side,
          pos: new THREE.Vector3(),
          rotY: 0,
          scale: new THREE.Vector3(seg, hSeg, 1),
          area: seg * hSeg,
        };

        if (side === "back") {
          d.pos.set(center, yCenter, -m.width / 2 + inset);
          d.rotY = 0;
        } else if (side === "front") {
          d.pos.set(center, yCenter, m.width / 2 - inset);
          d.rotY = Math.PI;
        } else if (side === "left") {
          d.pos.set(-m.length / 2 + inset, yCenter, center);
          d.rotY = Math.PI / 2;
        } else if (side === "right") {
          d.pos.set(m.length / 2 - inset, yCenter, center);
          d.rotY = -Math.PI / 2;
        }

        cells.push(d);
      }

      yCursor += hSeg;
    }
  }

  addWallCells("back", m.length);
  addWallCells("front", m.length);
  addWallCells("left", m.width);
  addWallCells("right", m.width);

  state.metrics.wallMaxArea = cells.reduce((s, c) => s + c.area, 0);
  state.objects.wallCells = cells;

  const geo = new THREE.BoxGeometry(1, 1, thickness);
  const mat = createWallMaterial(state.settings.wall.material);
  const inst = new THREE.InstancedMesh(geo, mat, cells.length);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  inst.userData.category = "wall";

  cells.forEach((c, i) => {
    tmpObj.position.copy(c.pos);
    tmpObj.rotation.set(0, c.rotY, 0);
    tmpObj.scale.copy(c.scale);
    tmpObj.updateMatrix();
    inst.setMatrixAt(i, tmpObj.matrix);
  });

  inst.instanceMatrix.needsUpdate = true;
  inst.count = 0;
  group.add(inst);

  state.objects.wallInst = inst;
  state.objects.categories.wall.push(inst);
}

function buildFloorPanels_impl() {
  const m = state.metrics;
  const group = new THREE.Group();
  state.objects.root.add(group);

  const cells = [];
  const panelTopY = m.floorTopY;
  const panelThickness = 0.04;
  const startX = -m.length / 2 + m.xMargin + 0.5;
  const startZ = -m.width / 2 + m.zMargin + 0.5;

  for (let iz = 0; iz < m.nz; iz++) {
    for (let ix = 0; ix < m.nx; ix++) {
      const x = startX + ix;
      const z = startZ + iz;
      cells.push({ x, z, y: panelTopY + panelThickness / 2, area: 1 });
    }
  }

  state.objects.floorCells = cells;

  const geo = new THREE.BoxGeometry(0.98, panelThickness, 0.98);
  const mat = createFloorMaterial(state.settings.floor.material);
  const inst = new THREE.InstancedMesh(geo, mat, cells.length);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  inst.userData.category = "floor";

  cells.forEach((c, i) => {
    tmpObj.position.set(c.x, c.y, c.z);
    tmpObj.rotation.set(0, 0, 0);
    tmpObj.scale.set(1, 1, 1);
    tmpObj.updateMatrix();
    inst.setMatrixAt(i, tmpObj.matrix);
  });

  inst.instanceMatrix.needsUpdate = true;
  inst.count = 0;
  group.add(inst);

  state.objects.floorInst = inst;
  state.objects.categories.floor.push(inst);
}

function buildCeilingPanels_impl() {
  const m = state.metrics;
  const group = new THREE.Group();
  state.objects.root.add(group);

  const cells = [];
  const y = m.ceilingY - 0.02;
  const startX = -m.length / 2 + m.xMargin + 0.5;
  const startZ = -m.width / 2 + m.zMargin + 0.5;

  for (let iz = 0; iz < m.nz; iz++) {
    for (let ix = 0; ix < m.nx; ix++) {
      cells.push({ x: startX + ix, z: startZ + iz, y, area: 1 });
    }
  }

  state.objects.ceilingCells = cells;

  const geo = new THREE.BoxGeometry(0.98, 0.035, 0.98);
  const mat = createCeilingMaterial(state.settings.ceiling.material);
  const inst = new THREE.InstancedMesh(geo, mat, cells.length);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  inst.userData.category = "ceiling";

  cells.forEach((c, i) => {
    tmpObj.position.set(c.x, c.y, c.z);
    tmpObj.rotation.set(0, 0, 0);
    tmpObj.scale.set(1, 1, 1);
    tmpObj.updateMatrix();
    inst.setMatrixAt(i, tmpObj.matrix);
  });

  inst.instanceMatrix.needsUpdate = true;
  inst.count = 0;
  group.add(inst);

  state.objects.ceilingInst = inst;
  state.objects.categories.ceiling.push(inst);

  state.objects.ceilingLightCandidates = cells
    .filter((_, i) => i % 2 === 0)
    .map((c) => ({ x: c.x, y: m.ceilingY - 0.04, z: c.z }));
}

function buildDoor_impl() {
  const m = state.metrics;
  const group = new THREE.Group();
  state.objects.root.add(group);

  group.visible = false;
  group.userData.category = "door";

  const doorH = m.doorHeight;
  const y0 = m.floorTopY;

  const isDouble = isDoorDoubleLeaf(state.settings.door.product);
  const doorCount = clamp(Math.floor(Number(state.settings.door.count) || 1), 1, 24, 1);
  state.settings.door.count = doorCount;

  const placements = m.doorPlacements || [];
  const zFront = m.width / 2 - 0.03;
  const zBack = -m.width / 2 + 0.03;
  const xLeft = -m.length / 2 + 0.03;
  const xRight = m.length / 2 - 0.03;

  function addDoorAt(side, along) {
    const frameMat = createDoorFrameMaterial();
    const doorMat = createDoorMaterial(state.settings.door.material);

    // base single-leaf width
    const singleDoorW = m.doorWidth;

    // if double leaf, make total width = 2x single leaf width
    const totalDoorW = isDouble ? singleDoorW * 2 : singleDoorW;

    // geometries
    const frameSideGeo = new THREE.BoxGeometry(0.06, doorH + 0.06, 0.08);
    const frameTopGeo = new THREE.BoxGeometry(totalDoorW, 0.06, 0.08);

    const slabDepth = 0.035;
    const slabGeoSingle = new THREE.BoxGeometry(singleDoorW - 0.08, doorH - 0.04, slabDepth);

    const leafGap = 0.035;
    const leafW = singleDoorW - 0.08; // each leaf same as single-leaf slab width
    const slabGeoLeaf = new THREE.BoxGeometry(leafW, doorH - 0.04, slabDepth);

    const g = new THREE.Group();
    g.userData.category = "door";

    let basePos = new THREE.Vector3();
    let rotY = 0;

    if (side === "front") { basePos.set(along, 0, zFront); rotY = Math.PI; }
    if (side === "back")  { basePos.set(along, 0, zBack); rotY = 0; }
    if (side === "left")  { basePos.set(xLeft, 0, along); rotY = Math.PI / 2; }
    if (side === "right") { basePos.set(xRight, 0, along); rotY = -Math.PI / 2; }

    g.position.copy(basePos);
    g.rotation.y = rotY;

    // frame
    const frameL = new THREE.Mesh(frameSideGeo, frameMat);
    frameL.position.set(-totalDoorW / 2 + 0.03, y0 + (doorH + 0.06) / 2, 0);

    const frameR = frameL.clone();
    frameR.position.x = totalDoorW / 2 - 0.03;

    const frameT = new THREE.Mesh(frameTopGeo, frameMat);
    frameT.position.set(0, y0 + doorH + 0.03, 0);

    g.add(frameL, frameR, frameT);

    if (!isDouble) {
      const slab = new THREE.Mesh(slabGeoSingle, doorMat);
      slab.position.set(0, y0 + (doorH - 0.04) / 2, -0.012);
      slab.castShadow = true;
      slab.receiveShadow = true;
      g.add(slab);

      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.08, 18),
        new THREE.MeshStandardMaterial({ color: 0xc6ccd6, metalness: 0.95, roughness: 0.18 })
      );
      handle.rotation.z = Math.PI / 2;
      handle.position.set(singleDoorW / 2 - 0.12, y0 + doorH * 0.52, 0.01);
      handle.castShadow = true;
      g.add(handle);

    } else {
      // place 2 full-width leaves side by side
      const leafOffset = leafW / 2 + leafGap / 2;

      const leafL = new THREE.Mesh(slabGeoLeaf, doorMat);
      leafL.position.set(-leafOffset, y0 + (doorH - 0.04) / 2, -0.012);
      leafL.castShadow = true;
      leafL.receiveShadow = true;

      const leafR = new THREE.Mesh(slabGeoLeaf, doorMat);
      leafR.position.set(leafOffset, y0 + (doorH - 0.04) / 2, -0.012);
      leafR.castShadow = true;
      leafR.receiveShadow = true;

      g.add(leafL, leafR);

      const handleL = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.08, 18),
        new THREE.MeshStandardMaterial({ color: 0xc6ccd6, metalness: 0.95, roughness: 0.18 })
      );
      handleL.rotation.z = Math.PI / 2;
      handleL.position.set(-leafGap / 2, y0 + doorH * 0.52, 0.01);

      const handleR = handleL.clone();
      handleR.position.x = leafGap / 2;

      g.add(handleL, handleR);
    }

    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
      o.userData.category = "door";
    });

    group.add(g);
  }

  for (let i = 0; i < Math.min(placements.length, doorCount); i++) {
    const p = placements[i];
    addDoorAt(p.side, p.along);
  }

  state.objects.doorGroup = group;
  state.objects.categories.door.push(group);
}

function buildLights_impl() {
  const group = new THREE.Group();
  state.objects.root.add(group);
  state.objects.lightSpots = [];

  const candidates = state.objects.ceilingLightCandidates;
  const maxFixtures = Math.max(1, Math.min(24, candidates.length));

  for (let i = 0; i < maxFixtures; i++) {
    const c = candidates[i];

    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.03, 24),
      new THREE.MeshStandardMaterial({
        color: 0x2b313b,
        metalness: 0.7,
        roughness: 0.38,
        emissive: 0x000000,
        emissiveIntensity: 0.1,
      })
    );
    fixture.position.set(c.x, c.y, c.z);
    fixture.castShadow = true;

    const diffuser = new THREE.Mesh(
      new THREE.CircleGeometry(0.083, 24),
      new THREE.MeshStandardMaterial({
        color: 0xfff2dc,
        emissive: 0xffd9a8,
        emissiveIntensity: 1.2,
        roughness: 0.2,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    diffuser.rotation.x = -Math.PI / 2;
    diffuser.position.set(c.x, c.y - 0.017, c.z);

    const spot = new THREE.SpotLight(0xffe0b8, 14, 14, 0.75, 0.45, 1.2);
    spot.position.set(c.x, c.y - 0.03, c.z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.bias = -0.00008;
    spot.shadow.radius = 2;

    const target = new THREE.Object3D();
    target.position.set(c.x, state.metrics.floorTopY + 0.02, c.z);
    group.add(target);
    spot.target = target;

    fixture.visible = false;
    diffuser.visible = false;
    spot.visible = false;

    group.add(fixture, diffuser, spot);
    state.objects.lightSpots.push({ fixture, diffuser, spot, target });
  }

  group.userData.category = "lights";
  state.objects.lightGroup = group;
  state.objects.categories.lights.push(group);
}

function buildPedestalSystem_impl() {
  const m = state.metrics;
  const root = new THREE.Group();
  state.objects.root.add(root);

  const anchors = [];
  const panelTop = m.floorTopY;
  const rodBottomY = 0.06;
  const rodTopY = panelTop - 0.045;
  const rodHeight = Math.max(0.05, rodTopY - rodBottomY);
  const cornerOffset = 0.42;

  for (const p of state.objects.floorCells) {
    anchors.push([p.x - cornerOffset, p.z - cornerOffset]);
    anchors.push([p.x + cornerOffset, p.z - cornerOffset]);
    anchors.push([p.x - cornerOffset, p.z + cornerOffset]);
    anchors.push([p.x + cornerOffset, p.z + cornerOffset]);
  }

  state.objects.pedestalAnchors = anchors;

  const mats = createPedestalMaterial(state.settings.pedestal.material);

  const baseGeo = new THREE.BoxGeometry(0.22, 0.03, 0.22);
  const baseInst = new THREE.InstancedMesh(baseGeo, mats.base, anchors.length);
  baseInst.castShadow = true;
  baseInst.receiveShadow = true;
  baseInst.frustumCulled = false;

  const rodGeo = new THREE.CylinderGeometry(0.025, 0.025, rodHeight, 18);
  const rodInst = new THREE.InstancedMesh(rodGeo, mats.rod, anchors.length);
  rodInst.castShadow = true;
  rodInst.receiveShadow = true;
  rodInst.frustumCulled = false;

  const headGeo = new THREE.BoxGeometry(0.16, 0.02, 0.16);
  const headInst = new THREE.InstancedMesh(headGeo, mats.head, anchors.length);
  headInst.castShadow = true;
  headInst.receiveShadow = true;
  headInst.frustumCulled = false;

  const ringGeo = new THREE.TorusGeometry(0.04, 0.005, 8, 22);
  const ringInst = new THREE.InstancedMesh(ringGeo, mats.ring, anchors.length);
  ringInst.castShadow = true;
  ringInst.receiveShadow = true;
  ringInst.frustumCulled = false;

  anchors.forEach((a, i) => {
    const [x, z] = a;

    tmpObj.position.set(x, 0.015, z);
    tmpObj.rotation.set(0, 0, 0);
    tmpObj.scale.set(1, 1, 1);
    tmpObj.updateMatrix();
    baseInst.setMatrixAt(i, tmpObj.matrix);

    tmpObj.position.set(x, rodBottomY + rodHeight / 2, z);
    tmpObj.rotation.set(0, 0, 0);
    tmpObj.updateMatrix();
    rodInst.setMatrixAt(i, tmpObj.matrix);

    tmpObj.position.set(x, rodTopY, z);
    tmpObj.rotation.set(0, 0, 0);
    tmpObj.updateMatrix();
    headInst.setMatrixAt(i, tmpObj.matrix);

    tmpObj.position.set(x, rodTopY - 0.015, z);
    tmpObj.rotation.set(Math.PI / 2, 0, 0);
    tmpObj.updateMatrix();
    ringInst.setMatrixAt(i, tmpObj.matrix);
  });

  baseInst.instanceMatrix.needsUpdate = true;
  rodInst.instanceMatrix.needsUpdate = true;
  headInst.instanceMatrix.needsUpdate = true;
  ringInst.instanceMatrix.needsUpdate = true;

  baseInst.count = 0;
  rodInst.count = 0;
  headInst.count = 0;
  ringInst.count = 0;

  root.add(baseInst, rodInst, headInst, ringInst);

  state.objects.pedBase = baseInst;
  state.objects.pedRod = rodInst;
  state.objects.pedHead = headInst;
  state.objects.pedRing = ringInst;

  state.objects.categories.pedestal.push(baseInst, rodInst, headInst, ringInst);
}

/* =========================================================
   Apply categories
========================================================= */
function applyAllCategories() {
  applyWallCategory();
  applyFloorCategory();
  applyCeilingCategory();
  applyDoorCategory();
  applyLightsCategory();
  applyPedestalCategory();
}

function applyWallCategory() {
  const inst = state.objects.wallInst;
  if (!inst) return;

  const active = state.selected.has("wall");
  const areaReq = clamp(Number(state.settings.wall.area) || 0, 0, state.metrics.wallMaxArea, 0);
  state.settings.wall.area = areaReq;

  replaceInstancedMaterial(inst, createWallMaterial(state.settings.wall.material));

  if (!active || areaReq <= 0) {
    inst.count = 0;
    return;
  }

  let total = 0;
  let count = 0;
  for (let i = 0; i < state.objects.wallCells.length; i++) {
    total += state.objects.wallCells[i].area;
    count = i + 1;
    if (total >= areaReq) break;
  }

  inst.count = Math.min(count, state.objects.wallCells.length);
}

function applyFloorCategory() {
  const inst = state.objects.floorInst;
  if (!inst) return;

  const active = state.selected.has("floor");
  const max = state.metrics.floorMaxArea;
  const req = clamp(Math.floor(Number(state.settings.floor.area) || 0), 0, max, 0);
  state.settings.floor.area = req;

  replaceInstancedMaterial(inst, createFloorMaterial(state.settings.floor.material));
  inst.count = active && req > 0 ? req : 0;
}

function applyCeilingCategory() {
  const inst = state.objects.ceilingInst;
  if (!inst) return;

  const active = state.selected.has("ceiling");
  const max = state.metrics.ceilingMaxArea;
  const req = clamp(Math.floor(Number(state.settings.ceiling.area) || 0), 0, max, 0);
  state.settings.ceiling.area = req;

  replaceInstancedMaterial(inst, createCeilingMaterial(state.settings.ceiling.material));
  inst.count = active && req > 0 ? req : 0;
}

function applyDoorCategory() {
  const group = state.objects.doorGroup;
  if (!group) return;

  const active = state.selected.has("door");
  const maxDoorArea = state.metrics.doorWidth * state.metrics.doorHeight;
  const area = clamp(Number(state.settings.door.area) || 0, 0, maxDoorArea, 0);

  group.visible = active && area > 0;
}

function applyLightsCategory() {
  const active = state.selected.has("lights");
  const maxCoverage = state.metrics.length * state.metrics.width;
  const cov = clamp(Number(state.settings.lights.area) || 0, 0, maxCoverage, 0);
  const mode = state.settings.lights.material;

  const count = active
    ? Math.min(state.objects.lightSpots.length, Math.max(1, Math.ceil(cov / 8)))
    : 0;

  const mood = getLightMood(mode);
  ambientLight.intensity = mood.ambient;
  hemiLight.intensity = mood.hemi;
  dirLight.intensity = mood.sun;

  state.objects.lightSpots.forEach((o, i) => {
    const vis = i < count;
    o.fixture.visible = vis;
    o.diffuser.visible = vis;
    o.spot.visible = vis;

    if (vis) {
      o.spot.color.set(mood.color);
      o.spot.intensity = mood.spot;
      o.diffuser.material.color.set(mood.diffuser);
      o.diffuser.material.emissive.set(mood.diffuser);
      o.diffuser.material.emissiveIntensity = 1.2;
      o.fixture.material.emissive.set(mood.color);
      o.fixture.material.emissiveIntensity = 0.08;
    }
  });
}

function applyPedestalCategory() {
  const active = state.selected.has("pedestal");
  const max = state.metrics.pedestalMaxArea;
  const reqPanels = clamp(Math.floor(Number(state.settings.pedestal.area) || 0), 0, max, 0);

  const mats = createPedestalMaterial(state.settings.pedestal.material);
  replaceInstancedMaterial(state.objects.pedBase, mats.base);
  replaceInstancedMaterial(state.objects.pedRod, mats.rod);
  replaceInstancedMaterial(state.objects.pedHead, mats.head);
  replaceInstancedMaterial(state.objects.pedRing, mats.ring);

  if (!active || reqPanels <= 0) {
    state.objects.pedBase.count = 0;
    state.objects.pedRod.count = 0;
    state.objects.pedHead.count = 0;
    state.objects.pedRing.count = 0;
    return;
  }

  const pedCount = reqPanels * 4;
  state.objects.pedBase.count = pedCount;
  state.objects.pedRod.count = pedCount;
  state.objects.pedHead.count = pedCount;
  state.objects.pedRing.count = pedCount;
}

/* =========================================================
   Materials & textures
========================================================= */
function createWallMaterial(type) {
  if (type === "glass") {
    return new THREE.MeshPhysicalMaterial({
      color: 0xbfe2ff,
      transmission: 0.95,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0,
      thickness: 0.05,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  const tex = getTexture("woodWallReal");
  tex.repeat.set(1.2, 1.0);

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.02,
    bumpMap: tex,
    bumpScale: 0.045,
    side: THREE.DoubleSide,
  });
}

function createFloorMaterial(type) {
  if (type === "wood") {
    const tex = getTexture("woodFloorReal");
    tex.repeat.set(2.0, 2.0);
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.52,
      metalness: 0.03,
      bumpMap: tex,
      bumpScale: 0.05,
    });
  }

  const tex = getTexture("calciumPanel");
  tex.repeat.set(1, 1);

  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.78,
    metalness: 0.02,
    bumpMap: tex,
    bumpScale: 0.012,
    color: 0xf5f5f2,
  });
}

function createCeilingMaterial(type) {
  if (type === "glass") {
    return new THREE.MeshPhysicalMaterial({
      color: 0xd9eeff,
      transmission: 0.92,
      transparent: true,
      opacity: 0.35,
      roughness: 0.04,
      metalness: 0.02,
      thickness: 0.03,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
  }

  const tex = getTexture("brushedMetal");
  tex.repeat.set(2.2, 2.2);

  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xd7dae1,
    roughness: 0.34,
    metalness: 0.9,
    bumpMap: tex,
    bumpScale: 0.02,
  });
}

function createDoorMaterial(type) {
  if (type === "glass") {
    return new THREE.MeshPhysicalMaterial({
      color: 0xbbe0ff,
      transmission: 0.95,
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0,
      thickness: 0.03,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });
  }

  if (type === "aluminium") {
    const tex = getTexture("brushedMetal");
    tex.repeat.set(3.0, 1.6);
    return new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xe0e3ea,
      roughness: 0.28,
      metalness: 0.95,
      bumpMap: tex,
      bumpScale: 0.02,
    });
  }

  const tex = getTexture("woodDoorReal");
  tex.repeat.set(1.4, 1.0);
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.5,
    metalness: 0.03,
    bumpMap: tex,
    bumpScale: 0.04,
  });
}

function createDoorFrameMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x9097a5,
    roughness: 0.35,
    metalness: 0.75,
  });
}

function createPedestalMaterial(type) {
  const isRaised = type === "raised";
  const baseColor = isRaised ? 0x8c96a5 : 0x667892;
  const rodColor = isRaised ? 0xa6b0bf : 0x7a8da8;
  const headColor = isRaised ? 0xc0c9d6 : 0x8ea2be;

  return {
    base: new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.32, metalness: 0.82 }),
    rod: new THREE.MeshStandardMaterial({ color: rodColor, roughness: 0.22, metalness: 0.9 }),
    head: new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.26, metalness: 0.86 }),
    ring: new THREE.MeshStandardMaterial({ color: 0xb5bcc7, roughness: 0.2, metalness: 0.92 }),
  };
}

function getLightMood(mode) {
  if (mode === "daylight") {
    return { color: 0xe8f3ff, diffuser: 0xf2f8ff, spot: 18, ambient: 0.2, hemi: 0.44, sun: 0.7 };
  }
  if (mode === "neutral") {
    return { color: 0xffedd6, diffuser: 0xfff1de, spot: 16, ambient: 0.18, hemi: 0.4, sun: 0.64 };
  }
  return { color: 0xffd9ac, diffuser: 0xffe3bc, spot: 15, ambient: 0.16, hemi: 0.36, sun: 0.6 };
}

/* --------- Procedural textures --------- */
function getTexture(kind) {
  if (texCache.has(kind)) return texCache.get(kind);

  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (kind === "woodWallReal") drawRealWood(ctx, size, { tone: "walnut", planks: true, rotate: false });
  else if (kind === "woodFloorReal") drawRealWood(ctx, size, { tone: "oak", planks: true, rotate: true });
  else if (kind === "woodDoorReal") drawRealWood(ctx, size, { tone: "teak", planks: false, rotate: false });
  else if (kind === "calciumPanel") drawCalciumPanel(ctx, size);
  else if (kind === "brushedMetal") drawBrushedMetal(ctx, size);
  else {
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.repeat.set(1, 1);

  texCache.set(kind, tex);
  return tex;
}

function drawRealWood(ctx, size, opts) {
  const tone = opts.tone || "oak";
  const rotate = !!opts.rotate;
  const planks = opts.planks !== false;

  const palettes = {
    oak: ["#c7925f", "#b57e50", "#a06f46", "#d2a06d", "#8f603b"],
    walnut: ["#7f5a3f", "#6c4a35", "#5b3d2c", "#8b6446", "#4a3124"],
    teak: ["#a46e3f", "#8f5d35", "#b87a48", "#764b2d", "#c48a56"],
  };
  const pal = palettes[tone] || palettes.oak;

  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 22000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * 0.05;
    const v = 160 + Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgba(${v},${v - 10},${v - 30},${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const lines = 240;
  for (let i = 0; i < lines; i++) {
    const base = pal[i % pal.length];
    ctx.strokeStyle = hexToRgba(base, 0.18 + Math.random() * 0.08);
    ctx.lineWidth = 1 + Math.random() * 1.2;
    ctx.beginPath();

    const freq = 0.004 + Math.random() * 0.01;
    const amp = 12 + Math.random() * 28;
    const drift = (Math.random() - 0.5) * 80;

    for (let tt = 0; tt <= size; tt += 14) {
      const v = (i / lines) * size;
      const wave = Math.sin((tt + drift) * freq) * amp;
      const jitter = (Math.random() - 0.5) * 4;

      let x = tt;
      let y = v + wave + jitter;

      if (rotate) [x, y] = [y, x];

      if (tt === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }

  const knotCount = planks ? 10 : 6;
  for (let k = 0; k < knotCount; k++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 18 + Math.random() * 40;
    const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    rg.addColorStop(0, "rgba(40,20,10,0.35)");
    rg.addColorStop(0.35, "rgba(90,60,40,0.18)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const rr = (a / (Math.PI * 4)) * r;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.6;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  if (planks) {
    const plankW = 140 + Math.random() * 60;
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    for (let p = 0; p < size; p += plankW) {
      if (!rotate) ctx.fillRect(p + plankW - 2, 0, 2, size);
      else ctx.fillRect(0, p + plankW - 2, size, 2);
    }
  }
}

function drawCalciumPanel(ctx, size) {
  ctx.fillStyle = "#f1f1ee";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const g = 210 + Math.floor(Math.random() * 30);
    const a = Math.random() * 0.06;
    ctx.fillStyle = `rgba(${g},${g},${g},${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  ctx.strokeStyle = "rgba(120,120,120,0.15)";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  ctx.fillStyle = "rgba(80,80,80,0.22)";
  [[42, 42], [size - 42, 42], [42, size - 42], [size - 42, size - 42]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBrushedMetal(ctx, size) {
  ctx.fillStyle = "#d9dde4";
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const shade = 210 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.35 + Math.random() * 0.25})`;
    ctx.fillRect(0, y, size, 1);
  }

  for (let i = 0; i < 7000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(x, y, Math.random() * 14 + 3, 1);
  }
}

/* =========================================================
   Camera
========================================================= */
function setOutsideView() {
  const m = state.metrics;
  if (!m.length) return;
  camera.position.set(m.length * 0.95, m.floorTopY + m.height * 0.8, m.width * 1.05);
  controls.target.set(0, m.floorTopY + m.height * 0.45, 0);
  controls.minDistance = 1.4;
  controls.maxDistance = 80;
  controls.update();
}

function setInsideView() {
  const m = state.metrics;
  if (!m.length) return;
  camera.position.set(0, m.floorTopY + m.height * 0.55, m.width * 0.2);
  controls.target.set(0, m.floorTopY + m.height * 0.52, -m.width * 0.25);
  controls.minDistance = 0.6;
  controls.maxDistance = 60;
  controls.update();
}

function renderLoop() {
  controls.update();
  renderer.render(scene, camera);
}

function fitCameraToObject(object3D, padding = 1.18) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let distance = (maxDim / 2) / Math.tan(fov / 2);
  distance *= padding;

  const dir = new THREE.Vector3(1.4, 0.1, 1).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(distance));

  controls.target.copy(center);
  controls.update();

  camera.near = Math.max(0.05, distance / 200);
  camera.far = Math.max(200, distance * 20);
  camera.updateProjectionMatrix();
}

function setSummaryView() {
  if (!state.objects?.root) return;
  fitCameraToObject(state.objects.root, 1.5);
}

/* =========================================================
   Scenario mode UI
========================================================= */
function enterScenarioMode() {
  state.scenario.mode = "scenarios";
  appRoot.classList.add("mode-scenarios");
  appRoot.classList.add("mode-scenario-select");
  appRoot.classList.remove("mode-total");

  scenarioStage.setAttribute("aria-hidden", "false");

  pruneScenarioSelections();
  totalCard.classList.add("hidden");
  buildScenarioListUI();
}

function exitScenarioMode() {
  state.scenario.mode = "room";
  scenarioStage.setAttribute("aria-hidden", "true");
  appRoot.classList.remove("mode-scenarios", "mode-scenario-select", "mode-total");
  totalCard.classList.add("hidden");
  totalCard.style.display = "";
  scenarioDescCard.style.display = "";
  clearTotalViewerLayout();
  onResize();
}

function pruneScenarioSelections() {
  const selectedComps = new Set(getSelectedCSVComponents());
  for (const comp of Object.keys(state.scenario.chosenByComponent)) {
    if (!selectedComps.has(comp)) delete state.scenario.chosenByComponent[comp];
  }
}

function getSelectedCSVComponents() {
  const comps = [];
  for (const [key, def] of Object.entries(CATEGORY_DEFS)) {
    if (!state.selected.has(key)) continue;
    const area = Number(state.settings[key].area) || 0;
    if (area <= 0) continue;
    comps.push(def.csvComponent);
  }
  return comps;
}

function getSelectedCategorySummaryHTML() {
  const builtUpArea = (state.dims.length * state.dims.width).toFixed(2);

  const rows = [];
  for (const [key, def] of Object.entries(CATEGORY_DEFS)) {
    if (!state.selected.has(key)) continue;
    const area = Number(state.settings[key]?.area) || 0;
    if (area <= 0) continue;

    rows.push(`
      <div class="result-comp-row">
        <span class="result-comp-name">${escapeHtml(def.label)}</span>
        <span class="result-comp-value">${area.toFixed(2)} m²</span>
      </div>
    `);
  }

  return `
    <div class="result-summary-card">
      <div class="result-summary-top">
        <div class="result-room-block">
          <div class="result-label">Room name</div>
          <div class="result-room-name">${escapeHtml(state.roomName)}</div>
        </div>

        <div class="result-area-block">
          <div class="result-label">Built up area</div>
          <div class="result-area-value">${builtUpArea} m²</div>
        </div>
      </div>

      <div class="result-components-block">
        <div class="result-label">Selected components</div>
        <div class="result-components-list">
          ${rows.length ? rows.join("") : `<div class="result-empty">No components selected</div>`}
        </div>
      </div>
    </div>
  `;
}

function buildScenarioListUI() {
  scenarioListEl.innerHTML = "";
  showTotalBtn.disabled = true;
  totalCard.classList.add("hidden");

  const selectedComponents = getSelectedCSVComponents();
  if (!selectedComponents.length) {
    scenarioListEl.innerHTML =
      `<div style="color: var(--muted);">No components selected. Go back and select components + area.</div>`;
    scenarioDescriptionEl.textContent = "Select a component to view scenario descriptions.";
    return;
  }

  const availByComp = new Map();

  for (const comp of selectedComponents) {
    const block = document.createElement("div");
    block.className = "comp-scenarios";

    const header = document.createElement("div");
    header.className = "comp-scenarios-header";

    const name = document.createElement("div");
    name.className = "comp-scenarios-name";
    name.textContent = comp;

    const area = document.createElement("div");
    area.className = "comp-scenarios-area";
    area.textContent = `Area: ${getAreaForCSVComponent(comp).toFixed(2)} m²`;

    header.append(name, area);
    block.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "ring-grid";

    const cfg = state.scenario.chartByComponent[comp] || null;
    const chartvalue = cfg?.chartvalue ?? 0;

    const available = [];
    for (const s of SCENARIOS) {
      const v = cfg?.scenarioValues?.[s];
      if (!Number.isFinite(v)) continue;
      available.push({ scenario: s, value: v });
    }

    availByComp.set(comp, available.map((x) => x.scenario));

    if (!available.length || !Number.isFinite(chartvalue) || chartvalue <= 0) {
      const msg = document.createElement("div");
      msg.style.color = "var(--muted)";
      msg.style.fontSize = "0.85rem";
      msg.textContent = "No scenario data available for this component.";
      block.appendChild(msg);
      scenarioListEl.appendChild(block);
      continue;
    }

    const chosen = state.scenario.chosenByComponent[comp];

    header.addEventListener("click", () => {
      showDescriptionsForComponent(comp, available.map((x) => x.scenario));
    });

    for (const item of available) {
      let pct = 0;
      if (Number.isFinite(chartvalue) && chartvalue > 0) {
        pct = 100 - (item.value / chartvalue) * 100;
      }
      if (item.value === 0) pct = 100;
      pct = clamp(pct, 0, 100, 0);

      const ring = document.createElement("div");
      ring.className = "ring-item";
      ring.dataset.comp = comp;
      ring.dataset.scenario = item.scenario;
      ring.dataset.value = String(item.value);
      ring.dataset.pct = String(pct);

      ring.innerHTML = `
        <div class="donut">${donutSVG(pct, 84)}</div>
        <div class="ring-title">${escapeHtml(item.scenario)}</div>
        <div class="ring-sub">${pct.toFixed(1)}%</div>
      `;

      ring.addEventListener("click", () => {
        selectScenarioForComponent(comp, item.scenario);

        const d = state.scenario.descByScenario[item.scenario];
        scenarioDescCard.style.display = "";

scenarioDescriptionEl.innerHTML = `
  <div class="desc-title">Room details</div>
  <div class="desc-item">
    <div class="desc-s">Room name</div>
    <div class="desc-b">${escapeHtml(state.roomName)}</div>
  </div>

  <div class="desc-item">
    <div class="desc-s">Cross-sectional area</div>
    <div class="desc-b">${(state.dims.length * state.dims.width).toFixed(2)} m²</div>
  </div>

  <div class="desc-item">
    <div class="desc-s">Selected components</div>
    <div class="desc-b">
      ${getSelectedComponentsDetailsHTML()}
    </div>
  </div>
`;
      });

      grid.appendChild(ring);
    }

    block.appendChild(grid);
    scenarioListEl.appendChild(block);

    requestAnimationFrame(() => animateDonuts(block));
    applyChosenStylingForComponent(comp, chosen);
  }

  const firstComp = selectedComponents[0];
  const firstScs = availByComp.get(firstComp) || [];
  showDescriptionsForComponent(firstComp, firstScs);

  showTotalBtn.disabled = !allSelectedComponentsHaveChoice();
}

function showDescriptionsForComponent(comp, scenarios) {
  const parts = [];
  parts.push(`<div class="desc-title">Scenario description</div>`);
  parts.push(getSelectedCategorySummaryHTML());
  parts.push(`<div class="desc-item"><div class="desc-s">${escapeHtml(comp)}</div><div class="desc-b">Available scenarios:</div></div>`);

  for (const s of scenarios) {
    const d = state.scenario.descByScenario[s];
    if (!d?.en) continue;
    parts.push(`
      <div class="desc-item">
        <div class="desc-s">${escapeHtml(s)}</div>
        <div class="desc-b">${escapeHtml(d.en)}</div>
      </div>
    `);
  }

  scenarioDescriptionEl.innerHTML = parts.join("");
}

function selectScenarioForComponent(comp, scenarioName) {
  state.scenario.chosenByComponent[comp] = scenarioName;
  applyChosenStylingForComponent(comp, scenarioName);
  showTotalBtn.disabled = !allSelectedComponentsHaveChoice();
}

function applyChosenStylingForComponent(comp, chosenScenario) {
  const rings = [...scenarioListEl.querySelectorAll(`.ring-item[data-comp="${cssEscape(comp)}"]`)];
  if (!rings.length) return;

  for (const r of rings) {
    const isChosen = r.dataset.scenario === chosenScenario;
    r.classList.toggle("selected", isChosen);
    r.classList.toggle("faded", chosenScenario ? !isChosen : false);
  }
}

function allSelectedComponentsHaveChoice() {
  const comps = getSelectedCSVComponents();
  if (!comps.length) return false;

  for (const comp of comps) {
    if (!state.scenario.chosenByComponent[comp]) return false;
  }

  return true;
}

function getAreaForCSVComponent(comp) {
  const entry = Object.entries(CATEGORY_DEFS).find(([, def]) => def.csvComponent === comp);
  if (!entry) return 0;
  const [key] = entry;
  return Number(state.settings[key]?.area) || 0;
}

function showTotal() {
  state.scenario.mode = "total";

  appRoot.classList.remove("mode-scenario-select");
  appRoot.classList.add("mode-total");

  layoutTotalViewer();

  requestAnimationFrame(() => {
    onResize();
    setSummaryView();
    requestAnimationFrame(() => {
      onResize();
      setSummaryView();
      requestAnimationFrame(() => {
        onResize();
        setSummaryView();
      });
    });
  });

  const selectedComps = getSelectedCSVComponents();

  let areaSum = 0;
  let weightedPctSum = 0;
  let kgAfter = 0;
  let kgWithout = 0;

  for (const comp of selectedComps) {
    const area = getAreaForCSVComponent(comp);
    if (area <= 0) continue;

    const chosenScenario = state.scenario.chosenByComponent[comp];
    const cfg = state.scenario.chartByComponent[comp];

    if (!cfg || !Number.isFinite(cfg.chartvalue) || cfg.chartvalue <= 0) continue;
    if (!chosenScenario) continue;

    const v = cfg.scenarioValues?.[chosenScenario];

    let pct = 0;
    if (Number.isFinite(v) && cfg.chartvalue > 0) {
      pct = 100 - (v / cfg.chartvalue) * 100;
    }
    if (Number.isFinite(v) && v === 0) pct = 100;
    pct = clamp(pct, 0, 100, 0);

    areaSum += area;
    weightedPctSum += pct * area;
    kgAfter += (Number.isFinite(v) ? v : 0) * area;
    kgWithout += cfg.chartvalue * area;
  }

  const totalPct = areaSum > 0 ? weightedPctSum / areaSum : 0;
  const kgSaved = kgWithout - kgAfter;

  totalDonut.innerHTML = donutSVG(totalPct, 200);
  requestAnimationFrame(() => animateDonuts(totalDonut));

  if (totalPercentEl) totalPercentEl.textContent = `${totalPct.toFixed(1)}%`;
  totalKgWithoutEl.textContent = `${kgWithout.toFixed(2)} kg`;
  totalKgEl.textContent = `${kgAfter.toFixed(2)} kg`;
  if (totalKgSavedEl) totalKgSavedEl.textContent = `${kgSaved.toFixed(2)} kg`;

  totalCard.classList.remove("hidden");

  scenarioListEl.innerHTML =
    `<div style="color: var(--muted);">Total calculated. Click “Change scenario selection” to edit.</div>`;

  scenarioDescriptionEl.innerHTML = `
  <div class="desc-title result-main-title">Project summary</div>
  ${getSelectedCategorySummaryHTML()}
`;
}

/* =========================================================
   Smooth donut animation helper
========================================================= */
function animateDonuts(container) {
  const circles = container.querySelectorAll("circle.donut-progress");
  circles.forEach((c) => {
    const C = Number(c.getAttribute("data-c"));
    const P = Number(c.getAttribute("data-p"));
    if (!Number.isFinite(C) || !Number.isFinite(P)) return;

    c.style.strokeDasharray = `${C} ${C}`;
    c.style.strokeDashoffset = `${C}`;

    requestAnimationFrame(() => {
      const target = C * (1 - Math.max(0, Math.min(100, P)) / 100);
      c.style.strokeDashoffset = `${target}`;
    });
  });
}

function getSelectedComponentsDetailsHTML() {
  const rows = [];

  for (const [key, def] of Object.entries(CATEGORY_DEFS)) {
    if (!state.selected.has(key)) continue;

    const area = Number(state.settings[key]?.area) || 0;
    if (area <= 0) continue;

    rows.push(`
      <li>
        <b>${escapeHtml(def.label)}</b> — ${area.toFixed(2)} m²
      </li>
    `);
  }

  if (!rows.length) {
    return `No components selected.`;
  }

  return `
    <ul style="margin: 0; padding-left: 18px;">
      ${rows.join("")}
    </ul>
  `;
}
/* =========================================================
   Defaults + misc
========================================================= */
function suggestDefaultArea(cat) {
  const m = state.metrics;
  if (!m) return 0;

  switch (CATEGORY_DEFS[cat].defaultAreaType) {
    case "max":
      return Math.max(1, Math.floor(m.wallMaxArea || 0));
    case "maxIntegerPanels":
      return Math.max(1, Math.min(1000, m.panelCount || 0));
    case "floorArea":
      return Math.max(4, Math.floor((m.length * m.width) / 2));
    case "door":
      return Number((m.doorWidth * m.doorHeight).toFixed(1));
    default:
      return 1;
  }
}

function replaceInstancedMaterial(inst, newMat) {
  if (!inst) return;
  if (inst.material && inst.material !== newMat) inst.material.dispose?.();
  inst.material = newMat;
}

function rangesOverlap(a1, a2, b1, b2) {
  return Math.max(a1, b1) < Math.min(a2, b2);
}

function clamp(v, min, max, fallback = min) {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material.dispose?.();
    }
  });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];

  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => (row[h] = (cells[idx] ?? "").trim()));
    out.push(row);
  }

  return out;
}

function splitCSVLine(line) {
  const res = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      res.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }

  res.push(cur);
  return res;
}

function stripQuotes(s) {
  const t = (s || "").trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function toNum(v) {
  const s = String(v ?? "").trim();
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function donutSVG(percent, sizePx) {
  const size = sizePx;
  const stroke = Math.max(10, Math.round(size * 0.12));
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const P = Math.max(0, Math.min(100, percent));
  const gid = `g_${size}_${Math.round(P * 10)}_${Math.random().toString(16).slice(2)}`;

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#79f5dc" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#5ea7ff" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}"
      fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="${stroke}" />
    <circle class="donut-progress"
      data-c="${C}" data-p="${P}"
      cx="${size / 2}" cy="${size / 2}" r="${r}"
      fill="none" stroke="url(#${gid})" stroke-width="${stroke}"
      stroke-linecap="round"
      stroke-dasharray="${C} ${C}"
      stroke-dashoffset="${C}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
      fill="#f2f6ff" font-size="${Math.round(size * 0.18)}" font-weight="900">
      ${P.toFixed(0)}%
    </text>
  </svg>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(s) {
  return String(s).replaceAll('"', '\\"');
}

function hexToRgba(hex, a) {
  const c = new THREE.Color(hex);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r},${g},${b},${a})`;
}