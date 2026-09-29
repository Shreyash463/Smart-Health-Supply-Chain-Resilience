/**
 * SmartHealth Resilience — Public Health Operations Bulletin Controller
 * Track 3: Resilience (Build with AI: Code for Communities)
 * Vanilla JS, no build step, no npm bundling.
 */

// Application state container
const state = {
  phcs: [],
  alerts: [],
  activeDistrictFilter: "all",
  alertsFilter: "active",
  selectedPhcId: null,
  chartInstance: null,
  isSimulating: false
};

const API_BASE = "";

// Schematic SVG coordinates for the 8 primary health centres
const MAP_COORDS = {
  "phc_talegaon": { x: 120, y: 130 },
  "phc_dehu_road": { x: 190, y: 220 },
  "phc_kiwale":    { x: 230, y: 320 },
  "phc_chikhli":   { x: 340, y: 210 },
  "phc_junnar":    { x: 570, y: 110 },
  "phc_khed":      { x: 620, y: 210 },
  "phc_alandi":    { x: 550, y: 320 },
  "phc_shirur":    { x: 790, y: 240 }
};

// -----------------------------------------------------------------------------
// Pure Status Derivation Functions (Requirement A2 & A3)
// -----------------------------------------------------------------------------

/**
 * Pure function of live telemetry: computes status directly on every render.
 * Red / Critical = runway < 5 days or at_risk_count > 0
 * Amber / Low stock = runway < 10 days
 * Green / Optimal = runway >= 10 days
 */
function computePhcStatus(phc) {
  const worstDays = typeof phc.worst_days_left === "number" ? phc.worst_days_left : 30.0;
  if (worstDays < 5.0 || (phc.at_risk_medicines_count && phc.at_risk_medicines_count > 0)) {
    return "critical";
  }
  if (worstDays < 10.0) {
    return "warning";
  }
  return "optimal";
}

function getStatusBadgeHtml(status) {
  if (status === "critical") {
    return `
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F8EFEF] text-[#A6362A] border border-[#E0BCB7]">
        <span class="w-1.5 h-1.5 rounded-full bg-[#A6362A] mr-1.5 shrink-0"></span>
        Critical stockout
      </span>
    `;
  }
  if (status === "warning") {
    return `
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FAF4E6] text-[#8A6508] border border-[#E6D4AA]">
        <span class="w-1.5 h-1.5 rounded-full bg-[#B8860B] mr-1.5 shrink-0"></span>
        Low stock
      </span>
    `;
  }
  return `
    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EDF5F3] text-[#0F6E63] border border-[#BAD5D0]">
      <span class="w-1.5 h-1.5 rounded-full bg-[#0F6E63] mr-1.5 shrink-0"></span>
      Optimal stock
    </span>
  `;
}

// -----------------------------------------------------------------------------
// Initialization & Event Binding
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  updateLiveClock();
  setInterval(updateLiveClock, 1000);
  
  await refreshAllData();
  
  // Periodic background telemetry synchronization (every 25 seconds)
  setInterval(async () => {
    if (!state.isSimulating) {
      await refreshAllData(false);
    }
  }, 25000);
});

function setupEventListeners() {
  // District filter tabs
  document.getElementById("tabDistrictAll")?.addEventListener("click", () => setDistrictFilter("all"));
  document.getElementById("tabDistrictPimpri")?.addEventListener("click", () => setDistrictFilter("Pimpri-Chinchwad"));
  document.getElementById("tabDistrictNationB")?.addEventListener("click", () => setDistrictFilter("Nation B"));

  // Alerts wire filter
  document.getElementById("btnFilterAlertsActive")?.addEventListener("click", () => setAlertsFilter("active"));
  document.getElementById("btnFilterAlertsAll")?.addEventListener("click", () => setAlertsFilter("all"));

  // Header quick actions
  document.getElementById("btnRefresh")?.addEventListener("click", () => {
    showToast("Synchronizing health network telemetry...", "info");
    refreshAllData(true);
  });

  document.getElementById("btnResetDemo")?.addEventListener("click", async () => {
    if (confirm("Reset network telemetry to baseline state? This clears all simulated crisis alerts and restores standard stock.")) {
      await resetDemoState();
    }
  });

  // Modal close handlers
  document.getElementById("btnModalClose")?.addEventListener("click", closeModal);
  document.getElementById("btnModalCloseBottom")?.addEventListener("click", closeModal);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

function updateLiveClock() {
  const clock = document.getElementById("mastheadClock");
  if (clock) {
    const now = new Date();
    clock.textContent = `${now.toISOString().substring(11, 19)} UTC | Live network active`;
  }
}

// -----------------------------------------------------------------------------
// Data Fetching & Sync
// -----------------------------------------------------------------------------
async function refreshAllData(showSuccessToast = false) {
  try {
    await Promise.all([fetchPHCs(), fetchAlerts()]);
    renderAggregateKPIs();
    renderNetworkMap();
    renderPHCLedger();
    renderWireFeed();
    if (showSuccessToast) {
      showToast("Health network state synchronized.", "info");
    }
  } catch (error) {
    console.error("Telemetry refresh failed:", error);
    showToast("Could not synchronize telemetry: " + error.message, "error");
  }
}

async function fetchPHCs() {
  const res = await fetch(`${API_BASE}/phcs`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching health centres`);
  state.phcs = await res.json();
}

async function fetchAlerts() {
  const showAll = state.alertsFilter === "all";
  const res = await fetch(`${API_BASE}/alerts?show_all=${showAll}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching alerts`);
  state.alerts = await res.json();
}

async function resetDemoState() {
  try {
    showToast("Restoring baseline inventory and clearing crisis alerts...", "info");
    const res = await fetch(`${API_BASE}/seed`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to reset database");
    await refreshAllData();
    showToast("Baseline state restored successfully.", "info");
  } catch (err) {
    showToast("Reset failed: " + err.message, "error");
  }
}

// -----------------------------------------------------------------------------
// Filters & State Updaters
// -----------------------------------------------------------------------------
function setDistrictFilter(district) {
  state.activeDistrictFilter = district;

  document.querySelectorAll(".district-tab").forEach(tab => {
    tab.classList.remove("active", "bg-white", "text-[#1C2B29]", "font-semibold");
    tab.classList.add("text-[#526360]");
  });

  let activeTabId = "tabDistrictAll";
  if (district === "Pimpri-Chinchwad") activeTabId = "tabDistrictPimpri";
  else if (district === "Nation B") activeTabId = "tabDistrictNationB";

  const el = document.getElementById(activeTabId);
  if (el) {
    el.classList.add("active", "bg-white", "text-[#1C2B29]", "font-semibold");
    el.classList.remove("text-[#526360]");
  }

  renderNetworkMap();
  renderPHCLedger();
}

function setAlertsFilter(filter) {
  state.alertsFilter = filter;
  const btnActive = document.getElementById("btnFilterAlertsActive");
  const btnAll = document.getElementById("btnFilterAlertsAll");

  if (filter === "active") {
    btnActive.className = "px-2.5 py-1 rounded bg-[#1C2B29] text-white font-medium text-xs";
    btnAll.className = "px-2.5 py-1 rounded bg-[#EAEFE6] hover:bg-[#DEE5D9] text-[#1C2B29] font-medium text-xs";
  } else {
    btnActive.className = "px-2.5 py-1 rounded bg-[#EAEFE6] hover:bg-[#DEE5D9] text-[#1C2B29] font-medium text-xs";
    btnAll.className = "px-2.5 py-1 rounded bg-[#1C2B29] text-white font-medium text-xs";
  }

  fetchAlerts().then(() => {
    renderWireFeed();
    renderNetworkMap();
  });
}

// -----------------------------------------------------------------------------
// Aggregate Stats (Requirement A3: Pure derivation, no counters)
// -----------------------------------------------------------------------------
function renderAggregateKPIs() {
  const total = state.phcs.length;
  let criticalCount = 0;
  let warningCount = 0;
  let optimalCount = 0;

  for (const phc of state.phcs) {
    const s = computePhcStatus(phc);
    if (s === "critical") criticalCount++;
    else if (s === "warning") warningCount++;
    else optimalCount++;
  }

  document.getElementById("kpiTotalPhcs").textContent = total;
  document.getElementById("kpiCriticalPhcs").textContent = criticalCount;
  document.getElementById("kpiAmberPhcs").textContent = warningCount;
  document.getElementById("kpiGreenPhcs").textContent = optimalCount;
}

// -----------------------------------------------------------------------------
// Hero Section: Network Resilience Map Schematic (Part B)
// -----------------------------------------------------------------------------
function renderNetworkMap() {
  const nodesLayer = document.getElementById("mapNodesLayer");
  const transferLayer = document.getElementById("mapTransferLinesLayer");
  if (!nodesLayer || !transferLayer) return;

  // Clear previous SVG content
  nodesLayer.innerHTML = "";
  transferLayer.innerHTML = "";

  // 1. Render Active Redistribution Arcs (The One Animated Moment)
  const activeAlerts = state.alerts.filter(a => !a.resolved && a.donor_phc_id && a.phc_id);
  const drawnPairs = new Set();

  activeAlerts.forEach(alert => {
    const pairKey = `${alert.donor_phc_id}->${alert.phc_id}`;
    if (drawnPairs.has(pairKey)) return;
    drawnPairs.add(pairKey);

    const fromCoord = MAP_COORDS[alert.donor_phc_id];
    const toCoord = MAP_COORDS[alert.phc_id];

    if (fromCoord && toCoord) {
      // Calculate smooth quadratic bezier control point
      const midX = (fromCoord.x + toCoord.x) / 2;
      const midY = (fromCoord.y + toCoord.y) / 2 - 35;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${fromCoord.x} ${fromCoord.y} Q ${midX} ${midY} ${toCoord.x} ${toCoord.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("class", "active-transfer-arc");
      path.setAttribute("marker-end", "url(#arrowTeal)");
      transferLayer.appendChild(path);

      // Label at midpoint
      const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const labelBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      labelBg.setAttribute("x", midX - 52);
      labelBg.setAttribute("y", midY - 11);
      labelBg.setAttribute("width", "104");
      labelBg.setAttribute("height", "16");
      labelBg.setAttribute("rx", "3");
      labelBg.setAttribute("fill", "#FFFFFF");
      labelBg.setAttribute("stroke", "#0F6E63");
      labelBg.setAttribute("stroke-width", "1");

      const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      labelText.setAttribute("x", midX);
      labelText.setAttribute("y", midY + 1);
      labelText.setAttribute("font-family", "'Public Sans', sans-serif");
      labelText.setAttribute("font-size", "9");
      labelText.setAttribute("font-weight", "600");
      labelText.setAttribute("fill", "#0F6E63");
      labelText.setAttribute("text-anchor", "middle");
      labelText.textContent = `Lateral transfer`;

      labelGroup.appendChild(labelBg);
      labelGroup.appendChild(labelText);
      transferLayer.appendChild(labelGroup);
    }
  });

  // 2. Render PHC Facility Nodes
  state.phcs.forEach(phc => {
    const coords = MAP_COORDS[phc.id];
    if (!coords) return;

    // Filter check: dim nodes not in selected district
    const isFilteredOut = state.activeDistrictFilter !== "all" && phc.district !== state.activeDistrictFilter;
    const opacity = isFilteredOut ? "0.3" : "1.0";

    const status = computePhcStatus(phc);
    let radius = 13;
    let fill = "#0F6E63"; // Teal (optimal)
    let stroke = "#094740";
    let pulseClass = "";
    let statusText = `${phc.worst_days_left}d`;

    if (status === "critical") {
      radius = 18;
      fill = "#A6362A"; // Vermillion (critical)
      stroke = "#74221A";
      pulseClass = "critical-pulse-node";
      statusText = `Critical (${phc.worst_days_left}d)`;
    } else if (status === "warning") {
      radius = 15;
      fill = "#B8860B"; // Turmeric (low stock)
      stroke = "#8A6508";
      statusText = `Low (${phc.worst_days_left}d)`;
    }

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", `phc-map-node cursor-pointer ${pulseClass}`);
    g.setAttribute("style", `opacity: ${opacity}; transition: opacity 0.2s;`);
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-label", `${phc.name}, ${status} status, shortest runway ${phc.worst_days_left} days`);

    // Outer glow for critical
    if (status === "critical") {
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo.setAttribute("cx", coords.x);
      halo.setAttribute("cy", coords.y);
      halo.setAttribute("r", radius + 6);
      halo.setAttribute("fill", "rgba(166, 54, 42, 0.18)");
      halo.setAttribute("stroke", "#A6362A");
      halo.setAttribute("stroke-width", "1");
      halo.setAttribute("stroke-dasharray", "2 2");
      g.appendChild(halo);
    }

    // Main Circle
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", coords.x);
    circle.setAttribute("cy", coords.y);
    circle.setAttribute("r", radius);
    circle.setAttribute("fill", fill);
    circle.setAttribute("stroke", stroke);
    circle.setAttribute("stroke-width", "2");
    g.appendChild(circle);

    // Inner icon / pulse ring
    const innerDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    innerDot.setAttribute("cx", coords.x);
    innerDot.setAttribute("cy", coords.y);
    innerDot.setAttribute("r", 3.5);
    innerDot.setAttribute("fill", "#FFFFFF");
    g.appendChild(innerDot);

    // Facility Label Text (Sentence Case)
    const textName = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textName.setAttribute("x", coords.x);
    textName.setAttribute("y", coords.y + radius + 14);
    textName.setAttribute("font-family", "'Public Sans', sans-serif");
    textName.setAttribute("font-size", "11");
    textName.setAttribute("font-weight", "600");
    textName.setAttribute("fill", "#1C2B29");
    textName.setAttribute("text-anchor", "middle");
    textName.textContent = phc.name;
    g.appendChild(textName);

    // Runway Label (Tabular lining numerals)
    const textStatus = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textStatus.setAttribute("x", coords.x);
    textStatus.setAttribute("y", coords.y + radius + 26);
    textStatus.setAttribute("font-family", "'Public Sans', sans-serif");
    textStatus.setAttribute("font-size", "10");
    textStatus.setAttribute("font-weight", "500");
    textStatus.setAttribute("fill", status === "critical" ? "#A6362A" : status === "warning" ? "#8A6508" : "#0F6E63");
    textStatus.setAttribute("text-anchor", "middle");
    textStatus.textContent = statusText;
    g.appendChild(textStatus);

    // Click & Keyboard interactions
    g.addEventListener("click", () => openPhcModal(phc.id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPhcModal(phc.id);
      }
    });

    nodesLayer.appendChild(g);
  });
}

// -----------------------------------------------------------------------------
// Health Centre Ledger / Manifest (Dense Scannable List)
// -----------------------------------------------------------------------------
function renderPHCLedger() {
  const tbody = document.getElementById("phcLedgerBody");
  if (!tbody) return;

  let filtered = state.phcs;
  if (state.activeDistrictFilter !== "all") {
    filtered = state.phcs.filter(p => p.district === state.activeDistrictFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-[#697B78] text-xs">
          No health centres match the selected jurisdiction filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(phc => {
    const status = computePhcStatus(phc);
    const statusBadge = getStatusBadgeHtml(status);
    const runwayColor = status === "critical" ? "text-[#A6362A] font-bold" : status === "warning" ? "text-[#8A6508] font-semibold" : "text-[#0F6E63]";

    return `
      <tr class="hover:bg-[#F6F8F4] transition-colors">
        <!-- Facility name & jurisdiction -->
        <td class="py-3 px-4">
          <div class="font-semibold text-[#1C2B29] cursor-pointer hover:text-[#0F6E63]" onclick="openPhcModal('${phc.id}')">
            ${phc.name}
          </div>
          <div class="text-[11px] text-[#697B78]">
            ${phc.district}
          </div>
        </td>

        <!-- District column -->
        <td class="py-3 px-3 text-[#526360]">
          ${phc.district === "Pimpri-Chinchwad" ? "Municipal district" : "Partner node"}
        </td>

        <!-- Live status -->
        <td class="py-3 px-3 text-center">
          ${statusBadge}
        </td>

        <!-- Runway figure (tabular numerals) -->
        <td class="py-3 px-3 text-right tabular-nums">
          <span class="${runwayColor} text-sm">${phc.worst_days_left}</span>
          <span class="text-[#697B78] text-[11px]"> days</span>
        </td>

        <!-- Patient count -->
        <td class="py-3 px-3 text-right tabular-nums text-[#3D504D]">
          ${phc.today_patient_footfall}
        </td>

        <!-- Staff present -->
        <td class="py-3 px-3 text-right tabular-nums text-[#3D504D]">
          ${phc.today_staff_present} / ${phc.today_total_staff}
        </td>

        <!-- Actions -->
        <td class="py-3 px-4 text-center">
          <div class="inline-flex items-center space-x-2">
            <button 
              onclick="openPhcModal('${phc.id}')"
              class="px-2.5 py-1 rounded bg-white hover:bg-[#EEF1EC] text-[#1C2B29] border border-token text-xs font-medium transition-colors"
            >
              Inspect
            </button>
            <button 
              id="btnCrisis-${phc.id}"
              onclick="triggerSimulateCrisis('${phc.id}', '${phc.healthiest_medicine_id}')"
              title="Simulate sudden stockout crisis for live demonstration"
              class="px-2.5 py-1 rounded bg-[#F8EFEF] hover:bg-[#F2E4E4] text-[#A6362A] border border-[#D9B2AC] text-xs font-semibold transition-colors"
            >
              Simulate crisis
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Operations Dispatch Wire Feed (Alerts)
// -----------------------------------------------------------------------------
function renderWireFeed() {
  const container = document.getElementById("alertsContainer");
  if (!container) return;

  if (state.alerts.length === 0) {
    container.innerHTML = `
      <div class="py-6 text-center text-[#596B68] text-xs">
        Wire clear: No active stockout alerts across monitored health centres.
      </div>
    `;
    return;
  }

  container.innerHTML = state.alerts.map(alert => {
    const isCritical = alert.severity === "critical";
    const dateFormatted = new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isResolved = alert.resolved;

    return `
      <div class="py-3 text-xs space-y-1.5 ${isResolved ? 'opacity-50' : ''}">
        <!-- Wire Header -->
        <div class="flex flex-wrap items-center justify-between gap-1 text-[11px]">
          <div class="flex items-center space-x-2">
            <span class="font-bold ${isCritical ? 'text-[#A6362A]' : 'text-[#8A6508]'}">
              ${isCritical ? 'CRITICAL DISPATCH' : 'ADVISORY DISPATCH'}
            </span>
            <span class="text-[#697B78] tabular-nums">${dateFormatted} UTC</span>
            <span>/</span>
            <span class="font-semibold text-[#1C2B29]">${alert.phc_name}</span>
            <span class="text-[#697B78]">(${alert.district})</span>
            <span>/</span>
            <span class="text-[#3D504D] font-medium">${alert.medicine_name}</span>
            ${isResolved ? '<span class="px-1.5 py-0.2 rounded bg-[#EDF5F3] text-[#0F6E63] font-bold text-[10px]">RESOLVED</span>' : ''}
          </div>

          <div class="flex items-center space-x-2">
            <span class="text-[10px] text-[#697B78]">${alert.source || 'gemini-flash-latest'}</span>
            ${!isResolved ? `
              <button 
                onclick="triggerResolveAlert('${alert.id}')"
                class="px-2 py-0.5 rounded bg-white hover:bg-[#EEF1EC] text-[#1C2B29] border border-token text-[11px] font-medium transition-colors"
              >
                Acknowledge & resolve
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Wire Message Body (Plain sentence case, complete sentences) -->
        <p class="text-[#243533] leading-relaxed bg-[#F6F8F4] p-2.5 rounded border border-token">
          ${alert.message}
        </p>

        <!-- Surplus details line if transfer recommended -->
        ${alert.donor_phc_name ? `
          <div class="text-[11px] text-[#0F6E63] font-medium">
            Transfer corridor: ${alert.donor_phc_name} holds ${alert.surplus_qty} units available surplus in ${alert.district}.
          </div>
        ` : ''}
      </div>
    `;
  }).join("");

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Interactive Crisis Simulation (Requirement A1: Display names only)
// -----------------------------------------------------------------------------
async function triggerSimulateCrisis(phcId, medicineId) {
  if (state.isSimulating) return;
  state.isSimulating = true;

  // Requirement A1: Look up display name, NEVER leak internal id
  const targetPhc = state.phcs.find(p => p.id === phcId);
  const phcDisplayName = targetPhc ? targetPhc.name : "Health centre";

  const btn = document.getElementById(`btnCrisis-${phcId}`);
  let originalHtml = "";
  if (btn) {
    originalHtml = btn.innerHTML;
    btn.innerHTML = `Simulating...`;
    btn.disabled = true;
  }

  showToast(`Simulating sudden stockout crisis at ${phcDisplayName}...`, "warning");

  try {
    const res = await fetch(`${API_BASE}/simulate-crisis/${phcId}/${medicineId}`, {
      method: "POST"
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} executing crisis`);
    const data = await res.json();

    showToast(`Emergency alert created for ${phcDisplayName}. Gemini redistribution directive generated.`, "crisis");

    // Refresh state to update network map, ledger, and wire feed
    await refreshAllData();

    // Scroll to operations wire feed
    document.getElementById("alertsContainer")?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  } catch (err) {
    console.error("Crisis simulation error:", err);
    showToast("Crisis simulation failed: " + err.message, "error");
  } finally {
    state.isSimulating = false;
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

async function triggerResolveAlert(alertId) {
  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to resolve alert");
    showToast("Alert resolved and stock rebalanced successfully.", "info");
    await refreshAllData();
  } catch (err) {
    showToast("Could not resolve alert: " + err.message, "error");
  }
}

// -----------------------------------------------------------------------------
// PHC Detail Modal & Chart.js Visualization (Reskinned)
// -----------------------------------------------------------------------------
async function openPhcModal(phcId) {
  state.selectedPhcId = phcId;
  const modal = document.getElementById("phcModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  try {
    const [stockRes, historyRes] = await Promise.all([
      fetch(`${API_BASE}/stock/${phcId}`),
      fetch(`${API_BASE}/phc/${phcId}/history`)
    ]);

    const stockData = await stockRes.json();
    const historyData = await historyRes.json();
    const phc = stockData.phc;

    // Header updates: Clean stacked layout without middot
    document.getElementById("modalPhcName").textContent = phc.name;
    document.getElementById("modalPhcDistrict").textContent = phc.district;
    document.getElementById("modalPhcCoords").textContent = `${phc.lat}° N, ${phc.lng}° E`;
    document.getElementById("modalPhcContact").textContent = phc.contact_phone || "+91 20 2742 5555";

    const status = computePhcStatus(phc);
    const badgeEl = document.getElementById("modalStatusBadge");
    if (status === "critical") {
      badgeEl.className = "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F8EFEF] text-[#A6362A] border border-[#E0BCB7]";
      badgeEl.textContent = "Critical stockout";
    } else if (status === "warning") {
      badgeEl.className = "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FAF4E6] text-[#8A6508] border border-[#E6D4AA]";
      badgeEl.textContent = "Low stock";
    } else {
      badgeEl.className = "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EDF5F3] text-[#0F6E63] border border-[#BAD5D0]";
      badgeEl.textContent = "Optimal stock";
    }

    const minDays = stockData.items.length > 0 ? Math.min(...stockData.items.map(i => i.days_left)) : 0;
    const worstEl = document.getElementById("modalWorstDays");
    worstEl.textContent = `${minDays.toFixed(1)} days`;
    worstEl.className = `text-xl font-serif-masthead mt-1 tabular-nums font-bold ${minDays < 5 ? 'text-[#A6362A]' : minDays < 10 ? 'text-[#8A6508]' : 'text-[#0F6E63]'}`;

    document.getElementById("modalBeds").textContent = `${phc.beds_occupied || 18} / ${phc.bed_capacity || 30}`;

    const latestFootfall = historyData.footfall.slice(-1)[0]?.patient_count || 65;
    const latestStaff = historyData.staff_attendance.slice(-1)[0];
    document.getElementById("modalFootfall").textContent = `${latestFootfall} patients`;
    document.getElementById("modalStaff").textContent = latestStaff ? `${latestStaff.present_count} / ${latestStaff.total_staff}` : "11 / 14";

    renderHistoryChart(historyData);
    renderStockTable(phcId, phc.name, stockData.items);

  } catch (err) {
    console.error("Modal loading error:", err);
    showToast("Error loading facility details: " + err.message, "error");
  }
}

function closeModal() {
  const modal = document.getElementById("phcModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
  state.selectedPhcId = null;
}

function renderHistoryChart(historyData) {
  const canvas = document.getElementById("historyChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  const labels = historyData.footfall.map(item => {
    const parts = item.date.split("-");
    return `${parts[1]}/${parts[2]}`;
  });

  const footfallValues = historyData.footfall.map(item => item.patient_count);
  const staffValues = historyData.staff_attendance.map(item => item.present_count);

  state.chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Patient footfall",
          data: footfallValues,
          borderColor: "#0F6E63", // Teal
          backgroundColor: "rgba(15, 110, 99, 0.06)",
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 1.5,
          yAxisID: "y"
        },
        {
          label: "Staff on duty",
          data: staffValues,
          borderColor: "#B8860B", // Turmeric accent
          backgroundColor: "transparent",
          borderDash: [4, 4],
          tension: 0.2,
          borderWidth: 1.8,
          pointRadius: 1.5,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, font: { family: "'Public Sans', sans-serif", size: 11 } } },
        tooltip: { padding: 8, titleFont: { family: "'Public Sans', sans-serif" }, bodyFont: { family: "'Public Sans', sans-serif" } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: "'Public Sans', sans-serif", size: 10 } } },
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: { display: true, text: "Patients", font: { size: 10 } },
          grid: { color: "#E5E9E1" },
          ticks: { font: { family: "'Public Sans', sans-serif", size: 10 } }
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Staff", font: { size: 10 } },
          ticks: { font: { family: "'Public Sans', sans-serif", size: 10 }, stepSize: 2 }
        }
      }
    }
  });
}

function renderStockTable(phcId, phcName, items) {
  const tbody = document.getElementById("modalStockTableBody");
  if (!tbody) return;

  tbody.innerHTML = items.map(item => {
    const isCritical = item.days_left < 5.0;
    const isWarning = item.days_left >= 5.0 && item.days_left < 10.0;

    const barPercent = Math.min(100, Math.max(5, (item.days_left / 25) * 100));
    const barColor = isCritical ? "bg-[#A6362A]" : isWarning ? "bg-[#B8860B]" : "bg-[#0F6E63]";

    let statusPill = `
      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EDF5F3] text-[#0F6E63] border border-[#BAD5D0]">
        Optimal
      </span>
    `;
    if (isCritical) {
      statusPill = `
        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#F8EFEF] text-[#A6362A] border border-[#E0BCB7]">
          Critical
        </span>
      `;
    } else if (isWarning) {
      statusPill = `
        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FAF4E6] text-[#8A6508] border border-[#E6D4AA]">
          Low stock
        </span>
      `;
    }

    return `
      <tr class="hover:bg-[#F6F8F4] transition-colors">
        <td class="py-2.5 px-3">
          <div class="font-semibold text-[#1C2B29]">${item.name}</div>
          <div class="text-[10px] text-[#697B78]">${item.category || 'Essential medicine'}</div>
        </td>
        <td class="py-2.5 px-3 text-right tabular-nums font-semibold text-[#1C2B29]">
          ${item.current_qty} <span class="text-[10px] font-normal text-[#697B78]">${item.unit}</span>
        </td>
        <td class="py-2.5 px-3 text-right tabular-nums text-[#526360]">
          ${item.avg_daily_consumption}/day
        </td>
        <td class="py-2.5 px-4">
          <div class="flex items-center space-x-2">
            <div class="flex-1 bg-[#E5E9E1] rounded-full h-1.5 overflow-hidden">
              <div class="${barColor} h-1.5 rounded-full" style="width: ${barPercent}%"></div>
            </div>
            <span class="w-12 text-right tabular-nums font-bold ${isCritical ? 'text-[#A6362A]' : isWarning ? 'text-[#8A6508]' : 'text-[#3D504D]'}">
              ${item.days_left}d
            </span>
          </div>
        </td>
        <td class="py-2.5 px-3 text-center">
          ${statusPill}
        </td>
        <td class="py-2.5 px-3 text-center">
          <button 
            onclick="triggerSimulateCrisis('${phcId}', '${item.medicine_id}')"
            title="Simulate stockout for this specific medicine"
            class="px-2 py-0.5 rounded bg-white hover:bg-[#F8EFEF] text-[#A6362A] text-[10px] font-medium border border-token transition-colors"
          >
            Simulate drop
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// -----------------------------------------------------------------------------
// Toast Notifications
// -----------------------------------------------------------------------------
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  let bgClass = "bg-[#1C2B29] text-white border-token";
  let iconName = "info";

  if (type === "warning") {
    bgClass = "bg-[#FAF4E6] text-[#8A6508] border-[#E6D4AA]";
    iconName = "alert-triangle";
  } else if (type === "error" || type === "crisis") {
    bgClass = "bg-[#F8EFEF] text-[#A6362A] border-[#E0BCB7]";
    iconName = "alert-circle";
  }

  toast.className = `${bgClass} pointer-events-auto flex items-center space-x-2.5 px-3.5 py-2.5 rounded shadow-md border text-xs max-w-sm transition-all duration-200`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1 font-medium leading-snug">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4200);
}
