/**
 * AutoCrumb Welcome / Onboarding Page
 */

let currentStep = 0;
const totalSteps = 4;

function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function updateUI() {
  // Steps visibility
  $$('.step').forEach(s => s.classList.remove('active'));
  document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('active');

  // Progress dots
  $$('.step-dot').forEach(d => {
    const step = parseInt(d.dataset.step);
    d.classList.toggle('active', step <= currentStep);
    d.classList.toggle('current', step === currentStep);
  });

  // Progress fill
  $('progress-fill').style.width = `${(currentStep / (totalSteps - 1)) * 100}%`;

  // Navigation buttons
  $('btn-back').classList.toggle('hidden', currentStep === 0);
  $('btn-skip').classList.toggle('hidden', currentStep === totalSteps - 1);

  if (currentStep === totalSteps - 1) {
    $('btn-next').textContent = 'Start Browsing';
  } else if (currentStep === 0) {
    $('btn-next').textContent = 'Get Started';
  } else {
    $('btn-next').textContent = 'Continue';
  }
}

async function saveWhitelistSelections() {
  const checks = $$('.quick-add-check:checked');
  for (const check of checks) {
    await sendMessage({
      action: 'addExpression',
      pattern: check.dataset.domain,
      type: 'whitelist',
    });
  }
}

function goNext() {
  if (currentStep === 1) {
    saveWhitelistSelections();
  }

  if (currentStep === totalSteps - 1) {
    window.close();
    return;
  }

  currentStep = Math.min(currentStep + 1, totalSteps - 1);
  updateUI();
}

function goBack() {
  currentStep = Math.max(currentStep - 1, 0);
  updateUI();
}

function skip() {
  window.close();
}

document.addEventListener('DOMContentLoaded', () => {
  updateUI();

  $('btn-next').addEventListener('click', goNext);
  $('btn-back').addEventListener('click', goBack);
  $('btn-skip').addEventListener('click', skip);

  // Step dot navigation
  $$('.step-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step);
      if (step <= currentStep + 1) {
        if (currentStep === 1) saveWhitelistSelections();
        currentStep = step;
        updateUI();
      }
    });
  });

  // Custom domain add
  $('btn-custom-add').addEventListener('click', () => {
    const input = $('custom-domain');
    const domain = input.value.trim();
    if (!domain) return;

    const pattern = domain.startsWith('*.') ? domain : domain;

    // Add to the list visually
    const list = document.querySelector('.quick-add-list');
    const item = document.createElement('label');
    item.className = 'quick-add-item';
    item.innerHTML = `
      <input type="checkbox" class="quick-add-check" data-domain="${pattern}" checked>
      <span class="quick-add-domain">${pattern}</span>
      <span class="quick-add-hint">Custom</span>
    `;
    list.appendChild(item);
    input.value = '';
  });

  $('custom-domain').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-custom-add').click();
  });

  // Ready cards → open settings
  $$('.ready-card').forEach(card => {
    card.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  });
});
