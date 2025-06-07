// auth.js --------------------------------------------------------------
const API_ROOT = window.location.pathname.includes("/public/") ? ".." : ".";

window.api = (url, opts = {}) =>
  fetch(`${API_ROOT}/api/${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then((r) =>
    r.ok
      ? r.json()
      : r
          .json()
          .catch(() => ({}))
          .then((e) => Promise.reject(e))
  );

const authModal = document.getElementById("auth-modal");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authHelp = document.getElementById("auth-help");
const authSwitchLink = document.getElementById("auth-switch-link");
const authErr = document.getElementById("auth-error");

let mode = "login"; // "login" | "register"

function setLoggedUser(email = "") {
  const lbl = document.getElementById("current-user");
  lbl.textContent = email ? `Вписан като: ${email}` : "";
}

function showAuth() {
  authModal.classList.remove("hidden");
}
function hideAuth() {
  authModal.classList.add("hidden");
}
function setMode(m) {
  mode = m;
  authTitle.textContent = m === "login" ? "Вход" : "Регистрация";
  authHelp.textContent = m === "login" ? "Нямате акаунт?" : "Имате акаунт?";
  authSwitchLink.textContent = m === "login" ? "Регистрация" : "Вход";
}
authSwitchLink.onclick = (e) => {
  e.preventDefault();
  setMode(mode === "login" ? "register" : "login");
};

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authErr.classList.add("hidden");

  const form = new FormData(authForm);
  const body = JSON.stringify({
    email: form.get("email"),
    password: form.get("password"),
  });

  try {
    if (mode === "login") await api("login.php", { method: "POST", body });
    if (mode === "register")
      await api("register.php", { method: "POST", body });

    const me = await api("me.php"); // { id, email }
    setLoggedUser(me.email);

    hideAuth();
    initApp();
    if (window.renderHistory) window.renderHistory();
  } catch (err) {
    authErr.textContent = err.error || "Неизвестна грешка.";
    authErr.classList.remove("hidden");
  }
});

/* ------------- Kick-off on page load ------------- */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const me = await api("me.php");
    console.log("me:", me);
    setLoggedUser(me.email);
    initApp(); // already logged in
  } catch {
    showAuth(); // forces login / registration
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await api("logout.php");
  } catch {}

  document.getElementById("input-field").value = SAMPLE_JSON;
  document.getElementById("output-field").value = "";
  document.getElementById("manual-format-field").value = DEFAULT_SETTINGS_TEXT;

  document.getElementById("output-field").value = "";
  const hist = document.getElementById("history-container");
  if (hist) hist.innerHTML = "";

  const fileUpload = document.getElementById("file-upload");
  const fileInfo = document.querySelector(".file-info");
  const fileName = document.getElementById("file-name");

  if (fileUpload) fileUpload.value = "";
  if (fileInfo) fileInfo.style.display = "none";
  if (fileName) fileName.textContent = "";

  setLoggedUser("");
  showAuth();
});
