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
    hideAuth();
    initApp(); // ← render the main UI
  } catch (err) {
    authErr.textContent = err.error || "Неизвестна грешка.";
    authErr.classList.remove("hidden");
  }
});

/* ------------- Kick-off on page load ------------- */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    await api("me.php");
    initApp(); // already logged in
  } catch {
    showAuth(); // forces login / registration
  }
});
