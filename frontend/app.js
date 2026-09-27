/**
 * Smart Health & Supply Chain Resilience — Frontend Controller
 * Track 3: Resilience (Build with AI: Code for Communities)
 * Vanilla JS, no build step, no npm bundling.
 */

// State container
const state = {
  phcs: [],
  alerts: [],
  activeDistrictFilter: "all",
  alertsFilter: "active",
  selectedPhcId: null,
  chartInstance: null,
  isSimulating: false
};

// Base API URL: uses relative origin (works on both localhost and deployed Cloud Run/Firebase)
const API_BASE = "";

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await refreshAllData();
  // Auto-refresh alerts and statuses every 30 seconds
  setInterval(async () => {
    if (!state.isSimulating) {
      await refreshAllData(false);
    }
  }, 30000);
});

function setupEventListeners() {
  // District filter tabs
  document.getElementById("tabDistrictAll")?.addEventListener("click", () => setDistrictFilter("all"));
  document.getElementById("tabDistrictPimpri")?.addEventListener("click", () => setDistrictFilter("Pimpri-Chinchwad"));
  document.getElementById("tabDistrictNationB")?.addEventListener("click", () => setDistrictFilter("Nation B"));

  // Alerts filter buttons
  document.getElementById("btnFilterAlertsActive")?.addEventListener("click", () => setAlertsFilter("active"));
  document.getElementById("btnFilterAlertsAll")?.addEventListener("click", () => setAlertsFilter("all"));

  // Header quick action buttons
  document.getElementById("btnRefresh")?.addEventListener("click", () => {
    showToast("Refreshing live network forecast...", "info");
    refreshAllData(true);
  });

  document.getElementById("btnResetDemo")?.addEventListener("click", async () => {
    if (confirm("Reset network data back to initial baseline demo state?")) {
      await resetDemoState();
    }
  });

  // Modal close buttons
  document.getElementById("btnModalClose")?.addEventListener("click", closeModal);
  document.getElementById("btnModalCloseBottom")?.addEventListener("click", closeModal);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// -----------------------------------------------------------------------------
// Data Fetching
// -----------------------------------------------------------------------------
async function refreshAllData(showSuccessToast = false) {
  try {
    await Promise.all([fetchPHCs(), fetchAlerts()]);
    renderKPIs();
    renderPHCGrid();
    renderAlertsFeed();
    if (showSuccessToast) {
      showToast("Healthcare network status synchronized.", "success");
    }
  } catch (error) {
    console.error("Failed to refresh data:", error);
    showToast("Error updating telemetry: " + error.message, "error");
  }
}

async function fetchPHCs() {
  const res = await fetch(`${API_BASE}/phcs`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching PHCs`);
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
    showToast("Resetting database to initial baseline...", "info");
    const res = await fetch(`${API_BASE}/seed`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to reset database");
    await refreshAllData();
    showToast("Demo baseline restored successfully!", "success");
  } catch (err) {
    showToast("Reset failed: " + err.message, "error");
  }
}

// -----------------------------------------------------------------------------
// Filters & State Setters
// -----------------------------------------------------------------------------
function setDistrictFilter(district) {
  state.activeDistrictFilter = district;
  
  // Update tab visual styling
  document.querySelectorAll(".district-tab").forEach(tab => {
    tab.classList.remove("active", "bg-white", "text-slate-900", "font-semibold", "shadow-xs");
    tab.classList.add("text-slate-600");
  });

  let activeTabId = "tabDistrictAll";
  if (district === "Pimpri-Chinchwad") activeTabId = "tabDistrictPimpri";
  else if (district === "Nation B") activeTabId = "tabDistrictNationB";

  const el = document.getElementById(activeTabId);
  if (el) {
    el.classList.add("active", "bg-white", "text-slate-900", "font-semibold", "shadow-xs");
    el.classList.remove("text-slate-600");
  }

  renderPHCGrid();
}

function setAlertsFilter(filter) {
  state.alertsFilter = filter;
  const btnActive = document.getElementById("btnFilterAlertsActive");
  const btnAll = document.getElementById("btnFilterAlertsAll");

  if (filter === "active") {
    btnActive.className = "px-2.5 py-1 rounded-md bg-rose-600 text-white font-medium shadow-xs";
    btnAll.className = "px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium";
  } else {
    btnActive.className = "px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium";
    btnAll.className = "px-2.5 py-1 rounded-md bg-rose-600 text-white font-medium shadow-xs";
  }

  fetchAlerts().then(() => renderAlertsFeed());
}

// -----------------------------------------------------------------------------
// Top KPIs Bar Rendering
// -----------------------------------------------------------------------------
function renderKPIs() {
  const total = state.phcs.length;
  const critical = state.phcs.filter(p => p.status === "red").length;
  const amber = state.phcs.filter(p => p.status === "amber").length;
  const green = state.phcs.filter(p => p.status === "green").length;

  document.getElementById("kpiTotalPhcs").textContent = total;
  document.getElementById("kpiCriticalPhcs").textContent = critical;
  document.getElementById("kpiAmberPhcs").textContent = amber;
  document.getElementById("kpiGreenPhcs").textContent = green;

  const activeAlertsCount = state.alerts.filter(a => !a.resolved).length;
  const badge = document.getElementById("activeAlertsBadge");
  if (badge) {
    badge.textContent = `${activeAlertsCount} Active`;
    if (activeAlertsCount > 0) {
      badge.className = "bg-rose-600 text-white text-[11px] px-2 py-0.5 rounded-full font-semibold animate-pulse";
    } else {
      badge.className = "bg-emerald-600 text-white text-[11px] px-2 py-0.5 rounded-full font-semibold";
    }
  }
}

// -----------------------------------------------------------------------------
// PHC Grid & Status Cards Rendering
// -----------------------------------------------------------------------------
function renderPHCGrid() {
  const container = document.getElementById("phcGridContainer");
  if (!container) return;

  let filtered = state.phcs;
  if (state.activeDistrictFilter !== "all") {
    filtered = state.phcs.filter(p => p.district === state.activeDistrictFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400">
        No PHCs found matching selected filter.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(phc => {
    const isRed = phc.status === "red";
    const isAmber = phc.status === "amber";

    let borderClass = "border-emerald-200 hover:border-emerald-300";
    let bgGlow = "bg-white";
    let statusBadge = `
      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span> Optimal Stock
      </span>
    `;

    if (isRed) {
      borderClass = "border-rose-400 shadow-md ring-1 ring-rose-400/40 crisis-card-pulse";
      bgGlow = "bg-gradient-to-b from-rose-50/60 to-white";
      statusBadge = `
        <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-600 mr-1.5"></span> Critical Risk (<5d)
        </span>
      `;
    } else if (isAmber) {
      borderClass = "border-amber-300 shadow-xs";
      bgGlow = "bg-gradient-to-b from-amber-50/40 to-white";
      statusBadge = `
        <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span> Low Stock (<10d)
        </span>
      `;
    }

    const runwayColor = isRed ? "text-rose-600" : isAmber ? "text-amber-600" : "text-emerald-700";

    return `
      <div class="rounded-2xl border ${borderClass} ${bgGlow} transition-all duration-200 flex flex-col justify-between overflow-hidden group">
        <!-- Card Header -->
        <div class="p-4 sm:p-5 pb-3">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 class="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors cursor-pointer" onclick="openPhcModal('${phc.id}')">
                ${phc.name}
              </h3>
              <div class="flex items-center space-x-1.5 text-xs text-slate-500 mt-0.5">
                <i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i>
                <span>${phc.district}</span>
              </div>
            </div>
            <div>${statusBadge}</div>
          </div>

          <!-- Runway Metric Card -->
          <div class="mt-3 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
            <div>
              <span class="text-[11px] font-medium text-slate-500">Worst Medicine Runway</span>
              <div class="text-xl font-extrabold ${runwayColor} tracking-tight">
                ${phc.worst_days_left} <span class="text-xs font-semibold text-slate-400">days</span>
              </div>
            </div>
            <div class="text-right text-[11px] text-slate-500">
              <div>Medicines: <strong class="text-slate-800">${phc.total_medicines_count}</strong></div>
              <div>At Risk: <strong class="${phc.at_risk_medicines_count > 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}">${phc.at_risk_medicines_count}</strong></div>
            </div>
          </div>

          <!-- Operational Indicators -->
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
            <div class="flex items-center space-x-1.5">
              <i data-lucide="users" class="w-3.5 h-3.5 text-slate-400"></i>
              <span>Footfall: <strong class="text-slate-800">${phc.today_patient_footfall}</strong></span>
            </div>
            <div class="flex items-center space-x-1.5">
              <i data-lucide="user-check" class="w-3.5 h-3.5 text-slate-400"></i>
              <span>Staff: <strong class="text-slate-800">${phc.today_staff_present}/${phc.today_total_staff}</strong></span>
            </div>
          </div>
        </div>

        <!-- Card Action Footer -->
        <div class="p-4 pt-2 bg-slate-50/60 border-t border-slate-100 flex items-center gap-2">
          <!-- View Details Button -->
          <button 
            onclick="openPhcModal('${phc.id}')"
            class="flex-1 py-2 px-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors flex items-center justify-center space-x-1"
          >
            <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-500"></i>
            <span>Inspect</span>
          </button>

          <!-- Simulate Crisis Button (Live Demo Centerpiece) -->
          <button 
            id="btnCrisis-${phc.id}"
            onclick="triggerSimulateCrisis('${phc.id}', '${phc.healthiest_medicine_id}')"
            title="Simulate sudden stockout crisis for live demonstration"
            class="flex-1 py-2 px-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white text-xs font-bold shadow-xs hover:shadow transition-all flex items-center justify-center space-x-1 active:scale-95"
          >
            <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-300"></i>
            <span>Simulate Crisis</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Alerts Feed Rendering
// -----------------------------------------------------------------------------
function renderAlertsFeed() {
  const container = document.getElementById("alertsContainer");
  if (!container) return;

  if (state.alerts.length === 0) {
    container.innerHTML = `
      <div class="py-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-1">
        <i data-lucide="check-circle" class="w-6 h-6 text-emerald-500 mb-1"></i>
        <span class="font-medium text-slate-700">No active stockout alerts in the network.</span>
        <span class="text-slate-400">All PHCs currently have &ge; 5 days of essential medicine supply.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = state.alerts.map(alert => {
    const isCritical = alert.severity === "critical";
    const dateFormatted = new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isResolved = alert.resolved;

    return `
      <div class="py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs ${isResolved ? 'opacity-60 bg-slate-50/50 p-2 rounded-lg' : ''}">
        <!-- Alert Info -->
        <div class="space-y-1.5 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${isCritical ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}">
              ${isCritical ? '🔴 CRITICAL STOCKOUT' : '🟡 SUPPLY WARNING'}
            </span>
            <span class="font-bold text-slate-900">${alert.phc_name}</span>
            <span class="text-slate-400">•</span>
            <span class="text-slate-500 font-medium">${alert.district}</span>
            <span class="text-slate-400">•</span>
            <span class="text-slate-700 font-semibold">${alert.medicine_name}</span>
            <span class="text-slate-400">•</span>
            <span class="text-[10px] text-slate-400 font-mono">${dateFormatted}</span>
            ${isResolved ? '<span class="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-bold">RESOLVED</span>' : ''}
          </div>

          <!-- Alert Message (Gemini Generated) -->
          <p class="text-slate-800 leading-relaxed font-normal bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            ${alert.message}
          </p>

          <!-- Redistribution Donor Info -->
          ${alert.donor_phc_name ? `
            <div class="flex items-center space-x-2 text-[11px] text-emerald-800 font-medium pt-0.5">
              <i data-lucide="arrow-right-left" class="w-3.5 h-3.5 text-emerald-600"></i>
              <span>Surplus Source: <strong>${alert.donor_phc_name}</strong> (available surplus: <strong>${alert.surplus_qty}</strong> units)</span>
            </div>
          ` : `
            <div class="flex items-center space-x-2 text-[11px] text-amber-800 font-medium pt-0.5">
              <i data-lucide="truck" class="w-3.5 h-3.5 text-amber-600"></i>
              <span>Action: Emergency district warehouse procurement dispatch</span>
            </div>
          `}
        </div>

        <!-- Action Buttons -->
        <div class="flex sm:flex-col items-center sm:items-end gap-1.5 shrink-0">
          <span class="text-[10px] font-mono text-slate-400 flex items-center space-x-1">
            <i data-lucide="sparkles" class="w-3 h-3 text-indigo-500"></i>
            <span>${alert.source || 'gemini-flash-latest'}</span>
          </span>
          ${!isResolved ? `
            <button 
              onclick="triggerResolveAlert('${alert.id}')"
              class="px-2.5 py-1 rounded bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 text-[11px] font-medium transition-colors border border-slate-200 hover:border-emerald-600"
            >
              Resolve Alert
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join("");

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// Interactive Crisis Simulation (Centerpiece for Demo)
// -----------------------------------------------------------------------------
async function triggerSimulateCrisis(phcId, medicineId) {
  if (state.isSimulating) return;
  state.isSimulating = true;

  const btn = document.getElementById(`btnCrisis-${phcId}`);
  let originalHtml = "";
  if (btn) {
    originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Dropping Stock...</span>`;
    btn.disabled = true;
    lucide.createIcons();
  }

  showToast(`Simulating sudden stockout crisis at ${phcId}...`, "warning");

  try {
    const res = await fetch(`${API_BASE}/simulate-crisis/${phcId}/${medicineId}`, {
      method: "POST"
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} executing crisis`);
    const data = await res.json();

    showToast(`🚨 Crisis triggered! Stock dropped to 2 units. Gemini redistribution alert generated!`, "crisis");

    // Refresh state to update cards to red and show new alert
    await refreshAllData();

    // Smooth scroll to alerts panel so the user sees the newly generated alert immediately
    document.getElementById("alertsContainer")?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  } catch (err) {
    console.error("Crisis simulation error:", err);
    showToast("Crisis simulation failed: " + err.message, "error");
  } finally {
    state.isSimulating = false;
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
      lucide.createIcons();
    }
  }
}

async function triggerResolveAlert(alertId) {
  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to resolve alert");
    showToast("Alert marked as resolved.", "success");
    await refreshAllData();
  } catch (err) {
    showToast("Could not resolve alert: " + err.message, "error");
  }
}

// -----------------------------------------------------------------------------
// PHC Detail Modal & Chart.js Visualization
// -----------------------------------------------------------------------------
async function openPhcModal(phcId) {
  state.selectedPhcId = phcId;
  const modal = document.getElementById("phcModal");
  if (!modal) return;

  // Open modal container
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  // Fetch full stock & historical footfall in parallel
  try {
    const [stockRes, historyRes] = await Promise.all([
      fetch(`${API_BASE}/stock/${phcId}`),
      fetch(`${API_BASE}/phc/${phcId}/history`)
    ]);

    const stockData = await stockRes.json();
    const historyData = await historyRes.json();
    const phc = stockData.phc;

    // Header updates
    document.getElementById("modalPhcName").textContent = phc.name;
    document.getElementById("modalPhcDistrict").textContent = `${phc.district} • Lat: ${phc.lat}, Lng: ${phc.lng} • Contact: ${phc.contact_phone || '+91 20 2742 5555'}`;
    
    // Quick metric updates
    const minDays = stockData.items.length > 0 ? Math.min(...stockData.items.map(i => i.days_left)) : 0;
    const worstEl = document.getElementById("modalWorstDays");
    worstEl.textContent = `${minDays.toFixed(1)} days`;
    worstEl.className = `text-lg font-extrabold ${minDays < 5 ? 'text-rose-600' : minDays < 10 ? 'text-amber-600' : 'text-emerald-600'}`;

    const dotEl = document.getElementById("modalStatusDot");
    dotEl.className = `w-3.5 h-3.5 rounded-full ${minDays < 5 ? 'bg-rose-500 animate-ping' : minDays < 10 ? 'bg-amber-400' : 'bg-emerald-400'}`;

    document.getElementById("modalBeds").textContent = `${phc.beds_occupied || 18} / ${phc.bed_capacity || 30}`;

    // Get today's footfall and attendance from history
    const latestFootfall = historyData.footfall.slice(-1)[0]?.patient_count || 65;
    const latestStaff = historyData.staff_attendance.slice(-1)[0];
    document.getElementById("modalFootfall").textContent = `${latestFootfall} patients`;
    document.getElementById("modalStaff").textContent = latestStaff ? `${latestStaff.present_count} / ${latestStaff.total_staff}` : "11 / 14";

    // Render 21-day historical line chart
    renderHistoryChart(historyData);

    // Render full stock table
    renderStockTable(phcId, stockData.items);

  } catch (err) {
    console.error("Modal loading error:", err);
    showToast("Error loading PHC details: " + err.message, "error");
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
    return `${parts[1]}/${parts[2]}`; // MM/DD
  });

  const footfallValues = historyData.footfall.map(item => item.patient_count);
  const staffValues = historyData.staff_attendance.map(item => item.present_count);

  state.chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Patient Footfall",
          data: footfallValues,
          borderColor: "#059669", // Emerald
          backgroundColor: "rgba(5, 150, 105, 0.08)",
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 2,
          yAxisID: "y"
        },
        {
          label: "Staff Present",
          data: staffValues,
          borderColor: "#6366f1", // Indigo
          backgroundColor: "transparent",
          borderDash: [4, 4],
          tension: 0.2,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { padding: 8 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: { display: true, text: "Patients", font: { size: 10 } },
          ticks: { font: { size: 10 } }
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Staff Present", font: { size: 10 } },
          ticks: { font: { size: 10 }, stepSize: 2 }
        }
      }
    }
  });
}

function renderStockTable(phcId, items) {
  const tbody = document.getElementById("modalStockTableBody");
  if (!tbody) return;

  tbody.innerHTML = items.map(item => {
    const isRed = item.status === "red";
    const isAmber = item.status === "amber";

    // Progress bar width (max 30 days scale)
    const barPercent = Math.min(100, Math.max(4, (item.days_left / 25) * 100));
    const barColor = isRed ? "bg-rose-500" : isAmber ? "bg-amber-500" : "bg-emerald-500";

    const statusBadge = isRed ? `
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
        Critical (&lt;5d)
      </span>
    ` : isAmber ? `
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
        Low (&lt;10d)
      </span>
    ` : `
      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
        Optimal
      </span>
    `;

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-2.5 px-3">
          <div class="font-semibold text-slate-800">${item.name}</div>
          <div class="text-[10px] text-slate-400">${item.category || 'Essential Medicine'}</div>
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
          ${item.current_qty} <span class="text-[10px] font-normal text-slate-500">${item.unit}</span>
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-600">
          ${item.avg_daily_consumption}/day
        </td>
        <td class="py-2.5 px-4">
          <div class="flex items-center space-x-2">
            <div class="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
              <div class="${barColor} h-2 rounded-full transition-all" style="width: ${barPercent}%"></div>
            </div>
            <span class="w-12 text-right font-mono font-bold ${isRed ? 'text-rose-600' : isAmber ? 'text-amber-600' : 'text-slate-700'}">
              ${item.days_left}d
            </span>
          </div>
        </td>
        <td class="py-2.5 px-3 text-center">
          ${statusBadge}
        </td>
        <td class="py-2.5 px-3 text-center">
          <button 
            onclick="triggerSimulateCrisis('${phcId}', '${item.medicine_id}')"
            title="Simulate stockout for this specific medicine"
            class="px-2 py-1 rounded bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 text-[10px] font-semibold border border-slate-200 hover:border-rose-300 transition-colors"
          >
            ⚠️ Drop
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
  let bgClass = "bg-slate-900 text-white border-slate-700";
  let iconName = "info";

  if (type === "success") {
    bgClass = "bg-emerald-900 text-emerald-100 border-emerald-700";
    iconName = "check-circle";
  } else if (type === "warning") {
    bgClass = "bg-amber-900 text-amber-100 border-amber-700";
    iconName = "alert-triangle";
  } else if (type === "error" || type === "crisis") {
    bgClass = "bg-rose-900 text-rose-100 border-rose-700 shadow-xl ring-2 ring-rose-500/50";
    iconName = "alert-octagon";
  }

  toast.className = `${bgClass} pointer-events-auto flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs max-w-md transition-all duration-300 transform translate-x-full`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1 font-medium leading-snug">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Slide in
  requestAnimationFrame(() => {
    toast.classList.remove("translate-x-full");
  });

  // Slide out and remove
  setTimeout(() => {
    toast.classList.add("translate-x-full", "opacity-0");
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}
