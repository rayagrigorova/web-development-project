document.addEventListener("DOMContentLoaded", () => {
  // Tab functionality
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      tab.classList.add("active");
      tabContents[index].classList.add("active");
    });
  });

  // Format mode toggle
  const formatModeRadios = document.querySelectorAll('input[name="format-mode"]');
  const manualFormatContainer = document.getElementById('manual-format-container');
  const manualFormatField = document.getElementById('manual-format-field');
  const inputFormatSelect = document.getElementById('input-format-select');
  const outputFormatSelect = document.getElementById('output-format-select');
  const dropdownFormatsContainer = document.getElementById('dropdown-formats-container');

  formatModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'manual') {
        manualFormatContainer.style.display = 'block';
        dropdownFormatsContainer.style.display = 'none';
      } else {
        manualFormatContainer.style.display = 'none';
        dropdownFormatsContainer.style.display = 'block';
      }
    });
  });

  // Transform functionality
  const transformBtn = document.getElementById("transform-btn");
  const inputField = document.getElementById("input-field");
  const outputField = document.getElementById("output-field");
  const settingsField = document.getElementById("settings-field");
  const historyContainer = document.getElementById("history-container");

  transformBtn.addEventListener("click", () => {
    const input = inputField.value;
    let inputFormat, outputFormat;
    
    // Check which mode is selected
    const formatMode = document.querySelector('input[name="format-mode"]:checked').value;
    
    if (formatMode === 'manual') {
      // Parse manual format input
      const manualSettings = manualFormatField.value;
      const inputMatch = manualSettings.match(/inputformat=(\w+)/i);
      const outputMatch = manualSettings.match(/outputformat=(\w+)/i);
      
      inputFormat = inputMatch ? inputMatch[1] : 'Автоматично откриване';
      outputFormat = outputMatch ? outputMatch[1] : 'YAML';
    } else {
      // Use dropdown values
      inputFormat = inputFormatSelect.value;
      outputFormat = outputFormatSelect.value;
    }
    
    const extraSettings = settingsField.value;

    const fullSettings = `inputformat=${inputFormat}
outputformat=${outputFormat}
${extraSettings}`.trim();

    const output = `Демонстрационен изход:\n\n${input}`;

    transformBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обработва се...';
    transformBtn.disabled = true;

    setTimeout(() => {
      outputField.value = output;
      transformBtn.innerHTML = '<i class="fas fa-bolt"></i> Трансформирай';
      transformBtn.disabled = false;

      if (fullSettings.includes("savetohistory=true")) {
        const record = {
          input,
          settings: fullSettings,
          output,
          timestamp: new Date().toISOString()
        };

        const history = JSON.parse(localStorage.getItem("transformHistory") || "[]");
        history.unshift(record);
        localStorage.setItem("transformHistory", JSON.stringify(history));

        renderHistory();
      }
    }, 800);
  });

  function renderHistory() {
    historyContainer.innerHTML = "";
    const history = JSON.parse(localStorage.getItem("transformHistory") || "[]");

    if (history.length === 0) {
      historyContainer.innerHTML = `<div class="empty-state">Няма записана история</div>`;
      return;
    }

    history.forEach((entry, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "history-item";

      wrapper.innerHTML = `
        <div class="history-item-header">
          <div class="history-item-title">${getFormatLabel(entry.settings)}</div>
          <div class="history-item-time">${new Date(entry.timestamp).toLocaleString()}</div>
        </div>
        <div class="history-item-preview">${truncate(entry.input)}</div>
        <button class="btn btn-outline" data-index="${index}">Зареди</button>
      `;

      wrapper.querySelector("button").addEventListener("click", () => {
        inputField.value = entry.input;
        settingsField.value = entry.settings;
        outputField.value = entry.output;
        tabs[0].click();
      });

      historyContainer.appendChild(wrapper);
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

  renderHistory();
});