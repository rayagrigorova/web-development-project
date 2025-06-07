const SAMPLE_JSON = `{
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}`;

const DEFAULT_SETTINGS_TEXT = `inputformat=json
outputformat=yaml
savetohistory=false
align=true
case=none`;

const inputField = document.getElementById("input-field");
const outputField = document.getElementById("output-field");

window.initApp = function initApp() {
  if (window._appInitialized) return;
  window._appInitialized = true;
  // Tab functionality
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      tabContents[index].classList.add("active");
    });
  });

  // Format mode toggle
  const formatModeRadios = document.querySelectorAll(
    'input[name="format-mode"]'
  );
  const manualFormatContainer = document.getElementById(
    "manual-format-container"
  );
  const manualFormatField = document.getElementById("manual-format-field");
  const inputFormatSelect = document.getElementById("input-format-select");
  const outputFormatSelect = document.getElementById("output-format-select");
  const dropdownFormatsContainer = document.getElementById(
    "dropdown-formats-container"
  );

  formatModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.value === "manual") {
        if (!manualFormatField.value.trim()) {
          manualFormatField.value = DEFAULT_SETTINGS_TEXT;
        }

        manualFormatContainer.style.display = "block";
        dropdownFormatsContainer.style.display = "none";
        document.getElementById("save-history-btn").style.display = "none";
      } else {
        manualFormatContainer.style.display = "none";
        dropdownFormatsContainer.style.display = "block";
        document.getElementById("save-history-btn").style.display =
          "inline-flex";
      }
    });
  });

  // Transform functionality
  const transformBtn = document.getElementById("transform-btn");
  const historyContainer = document.getElementById("history-container");

  transformBtn.addEventListener("click", async () => {
    const input = inputField.value;
    const formatMode = document.querySelector(
      'input[name="format-mode"]:checked'
    ).value;

    // ---------- build settings ----------
    let settingsString = "";
    if (formatMode === "manual") {
      settingsString = manualFormatField.value.trim();
    } else {
      const inputFmt = inputFormatSelect.value.toLowerCase();
      const outputFmt = outputFormatSelect.value.toLowerCase();
      settingsString = `inputformat=${inputFmt}\noutputformat=${outputFmt}`;
    }

    // ---------- UI feedback ----------
    transformBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Обработва се...';
    transformBtn.disabled = true;

    let result, meta;
    try {
      ({ result, meta } = await DataTransformer.convert(input, settingsString));
      outputField.value = result;
    } catch (err) {
      outputField.value = "⚠️ Грешка при трансформация:\n" + err.message;
    } finally {
      transformBtn.innerHTML = '<i class="fas fa-bolt"></i> Трансформирай';
      transformBtn.disabled = false;
    }

    // ---------- server-side history ----------
    if (settingsString.includes("savetohistory=true")) {
      await api("save_conversion.php", {
        method: "POST",
        body: JSON.stringify({
          input_format: meta.inFmt,
          output_format: meta.outFmt,
          settings: settingsString,
          input,
          output: result,
        }),
      })
        .then(() => {
          showToast("Успешно запазено в историята!");
          renderHistory();
        })
        .catch(() => {
          showToast("Неуспешен запис в историята.", "error");
        });
    }
  });

  function renderHistory() {
    historyContainer.innerHTML = '<div class="empty-state">Зареждане…</div>';

    api("history.php")
      .then((history) => {
        if (history.length === 0) {
          historyContainer.innerHTML =
            '<div class="empty-state">Няма записана история</div>';
          return;
        }

        historyContainer.innerHTML = "";

        history.forEach((entry, index) => {
          const wrapper = document.createElement("div");
          wrapper.className = "history-item";

          const ts = new Date(entry.created_at).toLocaleString();

          wrapper.innerHTML = `
          <div class="history-item-header">
            <div class="history-item-title">${getFormatLabel(
              entry.settings
            )}</div>
            <div class="history-item-time">${ts}</div>
          </div>
          <div class="history-item-preview">${truncate(entry.input_text)}</div>
          <button class="btn btn-outline" data-index="${index}">Зареди</button>
        `;

          wrapper.querySelector("button").addEventListener("click", () => {
            inputField.value = entry.input_text;
            manualFormatField.value = entry.settings;
            formatModeRadios.forEach((r) => {
              if (r.value === "manual") r.checked = true;
            });
            manualFormatContainer.style.display = "block";
            dropdownFormatsContainer.style.display = "none";

            outputField.value = entry.output_text;
            tabs[0].click();
          });

          historyContainer.appendChild(wrapper);
        });
      })
      .catch(() => {
        historyContainer.innerHTML =
          '<div class="empty-state">Грешка при зареждане на историята</div>';
      });
  }

  function truncate(str) {
    return str.length > 80 ? str.substring(0, 77) + "..." : str;
  }

  function getFormatLabel(settings) {
    const inputMatch = settings.match(/inputformat=(\w+)/);
    const outputMatch = settings.match(/outputformat=(\w+)/);
    const from = inputMatch ? inputMatch[1] : "неизвестен";
    const to = outputMatch ? outputMatch[1] : "неизвестен";
    return `${from} → ${to}`;
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await api("logout.php");
        historyContainer.innerHTML = "";
        showAuth(); // Show login modal again
      } catch (err) {
        showToast("Грешка при изход.", "error");
      }
    });
  }

  window.renderHistory = renderHistory;
  renderHistory();
};

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${
    type === "success" ? "fa-check-circle" : "fa-exclamation-triangle"
  }"></i> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

document
  .getElementById("save-history-btn")
  .addEventListener("click", async () => {
    const inputFormat = document
      .getElementById("input-format-select")
      .value.toLowerCase();
    const outputFormat = document
      .getElementById("output-format-select")
      .value.toLowerCase();
    const inputText = inputField.value.trim();

    if (!inputText) {
      showToast("Полето „Вход“ е празно.", "error");
      return;
    }

    // Step 1: Run conversion
    const settings = `
      inputformat=${inputFormat}
      outputformat=${outputFormat}
      savetohistory=true
    `.trim();

    let resultData, meta;
    try {
      const resultObj = await DataTransformer.convert(inputText, settings);
      resultData = resultObj.result;
      meta = resultObj.meta;
      outputField.value = resultData;
    } catch (err) {
      showToast("Грешка при трансформацията: " + err.message, "error");
      return;
    }

    // Step 2: Use api() helper for saving to backend safely
    try {
      const response = await api("save_conversion.php", {
        method: "POST",
        body: JSON.stringify({
          input_format: meta.inFmt,
          output_format: meta.outFmt,
          settings,
          input: inputText,
          output: resultData,
        }),
      });

      showToast("Успешно запазено в историята!");
      renderHistory();
    } catch (err) {
      showToast("Грешка при записа: " + err.message, "error");
    }
  });

const fileUpload = document.getElementById("file-upload");

const fileInfo = document.querySelector(".file-info");
const removeFileBtn = document.getElementById("remove-file-btn");

fileUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    inputField.value = text;
    fileInfo.style.display = "flex";
    document.getElementById(
      "file-name"
    ).textContent = `Качен файл: ${file.name}`;
    showToast(`Файлът „${file.name}“ беше зареден успешно.`);
  } catch (err) {
    showToast("Грешка при зареждане на файла.", "error");
  }
});

removeFileBtn.addEventListener("click", () => {
  fileUpload.value = "";
  inputField.value = "";
  fileInfo.style.display = "none";
  document.getElementById("file-name").textContent = "";
});
