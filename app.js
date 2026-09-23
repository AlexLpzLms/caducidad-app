// ---------- Almacenamiento local ----------
const STORAGE_KEY = "mi-despensa.foods.v1";

function loadFoods() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFoods(foods) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(foods));
}

let foods = loadFoods();

// ---------- Utilidades de fecha / estado ----------
const CATEGORY_LABELS = {
  lacteos: "Lácteos",
  carnes: "Carnes / pescado",
  frutas: "Frutas / verduras",
  congelados: "Congelados",
  despensa: "Despensa",
  otro: "Otro",
};

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Devuelve estado visual según días restantes.
function getStatus(daysLeft) {
  if (daysLeft < 0) return { key: "expired", label: "Caducado", color: "var(--color-expired)" };
  if (daysLeft <= 2) return { key: "danger", label: "Urgente", color: "var(--color-danger)" };
  if (daysLeft <= 5) return { key: "warning", label: "Pronto", color: "var(--color-warning)" };
  return { key: "fresh", label: "Fresco", color: "var(--color-fresh)" };
}

// Barra de progreso: vida restante asumiendo una ventana de "vida útil visible" de 14 días antes de caducar.
function getProgressPercent(daysLeft) {
  const WINDOW = 14;
  const pct = Math.max(0, Math.min(100, (daysLeft / WINDOW) * 100));
  return pct;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// ---------- Render ----------
const foodListEl = document.getElementById("foodList");
const emptyStateEl = document.getElementById("emptyState");

function render() {
  const sorted = [...foods].sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry));

  foodListEl.innerHTML = "";
  emptyStateEl.classList.toggle("hidden", sorted.length > 0);

  for (const food of sorted) {
    const daysLeft = daysUntil(food.expiry);
    const status = getStatus(daysLeft);
    const pct = getProgressPercent(daysLeft);

    const card = document.createElement("article");
    card.className = "food-card";
    card.dataset.id = food.id;

    const daysLabel =
      daysLeft < 0
        ? `Caducó hace ${Math.abs(daysLeft)} día(s)`
        : daysLeft === 0
        ? "Caduca hoy"
        : `Quedan ${daysLeft} día(s)`;

    card.innerHTML = `
      <div class="food-card-top">
        <div>
          <div class="food-name">${escapeHtml(food.name)}</div>
          <div class="food-meta">${CATEGORY_LABELS[food.category] || "Otro"} · ${escapeHtml(food.quantity || "")}</div>
          <div class="food-meta">Caduca: ${formatDate(food.expiry)} · ${daysLabel}</div>
        </div>
        <span class="status-pill status-${status.key}">${status.label}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${pct}%; background:${status.color}"></div>
      </div>
    `;

    card.addEventListener("click", () => openDialog(food));
    foodListEl.appendChild(card);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Formulario / Dialog ----------
const dialog = document.getElementById("foodDialog");
const form = document.getElementById("foodForm");
const dialogTitle = document.getElementById("dialogTitle");
const nameInput = document.getElementById("foodName");
const categoryInput = document.getElementById("foodCategory");
const quantityInput = document.getElementById("foodQuantity");
const expiryInput = document.getElementById("foodExpiry");
const idInput = document.getElementById("foodId");
const deleteBtn = document.getElementById("deleteBtn");
const cancelBtn = document.getElementById("cancelBtn");
const addBtn = document.getElementById("addBtn");

function openDialog(food) {
  form.reset();
  if (food) {
    dialogTitle.textContent = "Editar alimento";
    idInput.value = food.id;
    nameInput.value = food.name;
    categoryInput.value = food.category;
    quantityInput.value = food.quantity || "";
    expiryInput.value = food.expiry;
    deleteBtn.classList.remove("hidden");
  } else {
    dialogTitle.textContent = "Nuevo alimento";
    idInput.value = "";
    deleteBtn.classList.add("hidden");
  }
  dialog.showModal();
}

addBtn.addEventListener("click", () => openDialog(null));
cancelBtn.addEventListener("click", () => dialog.close());

form.addEventListener("submit", (e) => {
  const id = idInput.value || crypto.randomUUID();
  const foodData = {
    id,
    name: nameInput.value.trim(),
    category: categoryInput.value,
    quantity: quantityInput.value.trim(),
    expiry: expiryInput.value,
  };

  if (!foodData.name || !foodData.expiry) return;

  const existingIndex = foods.findIndex((f) => f.id === id);
  if (existingIndex >= 0) {
    foods[existingIndex] = foodData;
  } else {
    foods.push(foodData);
  }

  saveFoods(foods);
  render();
});

deleteBtn.addEventListener("click", () => {
  const id = idInput.value;
  foods = foods.filter((f) => f.id !== id);
  saveFoods(foods);
  dialog.close();
  render();
});

// ---------- Notificaciones locales ----------
// iOS solo permite notificaciones reales estando la app abierta o justo tras abrirla
// (no hay push real sin servidor). Revisamos alimentos próximos a caducar al abrir la app.
async function checkExpiringAndNotify() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return;

  const urgent = foods.filter((f) => {
    const d = daysUntil(f.expiry);
    return d <= 2;
  });

  if (urgent.length === 0) return;

  const lastCheck = localStorage.getItem("mi-despensa.lastNotify");
  const todayKey = new Date().toDateString();
  if (lastCheck === todayKey) return; // solo una vez al día
  localStorage.setItem("mi-despensa.lastNotify", todayKey);

  const names = urgent.map((f) => f.name).join(", ");
  const reg = await navigator.serviceWorker.getRegistration();
  const title = "Alimentos por caducar";
  const body = `Revisa: ${names}`;
  if (reg) {
    reg.showNotification(title, { body, icon: "icons/icon-192.png" });
  } else {
    new Notification(title, { body });
  }
}

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

// ---------- Init ----------
render();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkExpiringAndNotify();
});
checkExpiringAndNotify();
