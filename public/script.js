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
        const inputFmt = inputFormatSelect.value.toLowerCase();
        const outputFmt = outputFormatSelect.value.toLowerCase();
        manualFormatField.value = `inputformat=${inputFmt}\noutputformat=${outputFmt}`;

        manualFormatContainer.style.display = "block";
        dropdownFormatsContainer.style.display = "none";
      } else {
        manualFormatContainer.style.display = "none";
        dropdownFormatsContainer.style.display = "block";
      }
    });
  });

  // Transform functionality
  const transformBtn = document.getElementById("transform-btn");
  const inputField = document.getElementById("input-field");
  const outputField = document.getElementById("output-field");
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
      }).catch(() => {});
      renderHistory();
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
        alert("Грешка при изход.");
      }
    });
  }

  window.renderHistory = renderHistory;
  renderHistory();
};
