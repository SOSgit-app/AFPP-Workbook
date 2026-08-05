/**
 * Main Application Controller for the AFPP Student Workbook.
 *
 * Provides workbook-like step navigation, binds form fields to the
 * Workbook data model, and persists progress to SCORM suspend_data.
 */
(function () {
  'use strict';

  var currentStep = 0;
  var saveTimeout = null;
  var reviewedSteps = {};
  var maxUnlockedStep = 0;
  var navUnlocked = false;
  var fieldsHydrated = false;
  var scormCompletionReported = false;

  // ---- DOM references ----
  var sidebar = document.getElementById('sidebar');
  var sidebarItems = document.querySelectorAll('#stepList li[data-step]');
  var navLinks = document.querySelectorAll('#stepList a.nav-link[data-step]');
  var stepPanels = document.querySelectorAll('.content-doc .step-panel[data-step]');
  var completionBar = document.getElementById('completionBar');
  var completionText = document.getElementById('completionText');
  var btnSaveExit = document.getElementById('btnSaveExit');
  var btnRestoreBackup = document.getElementById('btnRestoreBackup');
  var backupFileInput = document.getElementById('backupFileInput');
  var btnFloatingSave = document.getElementById('btnFloatingSave');
  var saveIndicator = document.getElementById('saveIndicator');
  var floatingSaveIndicator = document.getElementById('floatingSaveIndicator');
  var btnDownloadPdf = document.getElementById('btnDownloadPdf');
  var btnDownloadSteps1to6 = document.getElementById('btnDownloadSteps1to6');
  var btnDownloadStep7List = document.querySelectorAll('[data-download-step7]');
  var btnDownloadFullList = document.querySelectorAll('[data-download-full]');
  var submitModal = document.getElementById('submitModal');
  var btnModalClose = document.getElementById('btnModalClose');
  var navPromptModal = document.getElementById('navPromptModal');
  var navPromptMessage = document.getElementById('navPromptMessage');
  var btnNavPromptOk = document.getElementById('btnNavPromptOk');

  var LAYOUT_VERSION = 6;

  /**
   * Generous character caps to keep compressed SCORM suspend_data under the
   * LMS limit. Focused on the long-answer steps (2, 3, 7).
   */
  function getFieldLimit(key) {
    if (!key) return null;

    // Step 5 matrix scores / weights are numbers — no text limit.
    if (/^s5_(c[123]s_|wt_)/.test(key)) return null;

    // Step 2 evaluation criteria (short labels).
    if (/^s2_crit_\d+$/.test(key)) return 500;
    // Step 2 criterion weights are numbers.
    if (/^s2_crit_wt_\d+$/.test(key)) return null;

    // Step 3 COAs — often the longest narrative answers.
    if (key === 's3_coa1' || key === 's3_coa2') return 5000;

    // Step 7 AI paste / revision / reflection.
    if (/^s7_p\d_(response|revision)$/.test(key)) return 6000;
    if (key === 's7_reflection') return 4000;

    // Step 2 risk-table cells (short entries).
    if (/^s2_risk_(he|src|p3_ev|p4_risk|p4_act)/.test(key)) return 1500;

    // Step 2 main analysis textareas.
    if (/^s2_/.test(key)) return 4000;

    // Step 4 wargaming / refine.
    if (/^s4_/.test(key)) return 4000;

    // Intro problem statement (short by design).
    if (key === 'a1_verified' || key === 'a2_verified' || key === 'a3_verified') return null;

    // Intro / Step 1 defaults.
    if (/^(p_|org_|s1_)/.test(key)) return 3000;

    // Fallback for any other free-text field.
    return 3000;
  }

  function truncateToLimit(key, value) {
    if (value === undefined || value === null) return '';
    value = String(value);
    var limit = getFieldLimit(key);
    if (!limit || value.length <= limit) return value;
    return value.slice(0, limit);
  }

  function updateCharCounter(el) {
    if (!el || !el.getAttribute) return;
    var key = el.getAttribute('data-field');
    var limit = getFieldLimit(key);
    if (!limit) return;

    var counter = el.parentNode && el.parentNode.querySelector
      ? el.parentNode.querySelector('.char-limit-meta[data-for="' + key + '"]')
      : null;
    if (!counter) return;

    var len = (el.value || '').length;
    var countEl = counter.querySelector('.char-count');
    if (countEl) countEl.textContent = String(len);

    counter.classList.toggle('char-limit-warn', len >= Math.floor(limit * 0.9) && len < limit);
    counter.classList.toggle('char-limit-max', len >= limit);
  }

  function initFieldLimits() {
    var fields = document.querySelectorAll('textarea[data-field], input[type="text"][data-field]');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      var key = el.getAttribute('data-field');
      var limit = getFieldLimit(key);
      if (!limit) continue;

      el.setAttribute('maxlength', String(limit));

      // Truncate any already-hydrated / restored oversize value.
      if (el.value && el.value.length > limit) {
        el.value = el.value.slice(0, limit);
      }

      var existing = el.parentNode.querySelector('.char-limit-meta[data-for="' + key + '"]');
      if (!existing) {
        var meta = document.createElement('div');
        meta.className = 'char-limit-meta';
        meta.setAttribute('data-for', key);
        meta.innerHTML =
          '<span class="char-count">0</span> / ' + limit +
          ' <span class="char-limit-hint">char limit</span>';
        el.parentNode.insertBefore(meta, el.nextSibling);
      }
      updateCharCounter(el);
    }
  }

  /**
   * Remap saved step indices when the sidebar layout changes.
   */
  function migrateSuspendLayout(saved) {
    if (!saved || typeof saved !== 'object') return;
    if (saved._layoutVersion === LAYOUT_VERSION) return;

    var v = saved._layoutVersion;

    function mapV5ToV6(o) {
      // Inserted "Saving Your Work" at step 0; shift everything forward by 1.
      return Math.min(o + 1, 12);
    }

    function mapV4ToV5(o) {
      if (o <= 7) return o;
      if (o === 11) return 8;
      return Math.min(o + 1, 11);
    }

    function mapV3ToV5(o) {
      if (o <= 6) return o;
      if (o === 10) return 8;
      return Math.min(o + 2, 11);
    }

    function mapV2ToV5(o) {
      if (o <= 3) return o;
      return Math.min(o + 5, 11);
    }

    function mapLegacyToV5(o) {
      if (o <= 2) return 0;
      if (o <= 5) return o - 2;
      if (o === 6) return 9;
      if (o <= 9) return o + 3;
      if (o === 10) return 8;
      return 8;
    }

    function mapStep(o) {
      if (typeof o !== 'number' || isNaN(o)) return 0;
      var mapped = o;
      if (v === 5) mapped = mapV5ToV6(o);
      else if (v === 4) mapped = mapV5ToV6(mapV4ToV5(o));
      else if (v === 3) mapped = mapV5ToV6(mapV3ToV5(o));
      else if (v === 2) mapped = mapV5ToV6(mapV2ToV5(o));
      else if (v === undefined || v === 1) mapped = mapV5ToV6(mapLegacyToV5(o));
      return mapped;
    }

    if (typeof saved._step === 'number') saved._step = mapStep(saved._step);

    if (typeof saved._maxUnlocked === 'number') {
      saved._maxUnlocked = mapStep(saved._maxUnlocked);
    }

    if (saved._reviewed && typeof saved._reviewed === 'object') {
      var nr = {};
      for (var rk in saved._reviewed) {
        if (!saved._reviewed.hasOwnProperty(rk)) continue;
        var nk = String(mapStep(parseInt(rk, 10)));
        if (saved._reviewed[rk]) nr[nk] = true;
      }
      saved._reviewed = nr;
    }

    saved._layoutVersion = LAYOUT_VERSION;
  }

  // ---- Auto-Accordion Conversion ----

  function initAccordions() {
    // Substeps first — they gather pillar/phase blocks inside their bodies
    convertSubstepsToAccordions();
    // Then convert any remaining standalone blocks
    convertBlocksToAccordions('.phase-block', '.phase-heading');
    convertBlocksToAccordions('.pillar-block', '.pillar-heading');
  }

  /**
   * Converts container elements (like .phase-block) into <details> accordions.
   * The first heading matching headingSel becomes the <summary>.
   */
  function convertBlocksToAccordions(blockSel, headingSel) {
    var blocks = document.querySelectorAll(blockSel);
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (block.closest('details.accordion')) continue;
      var heading = block.querySelector(headingSel);
      if (!heading) continue;

      var details = document.createElement('details');
      details.className = 'accordion ' + block.className;
      details.open = false;

      var summary = document.createElement('summary');
      summary.className = 'accordion-summary';
      summary.innerHTML = heading.innerHTML;
      appendAccordionProgressCheck(summary);

      heading.parentNode.removeChild(heading);

      block.parentNode.insertBefore(details, block);
      details.appendChild(summary);

      block.className = 'accordion-body';
      details.appendChild(block);
    }
  }

  /**
   * Converts .substep-heading h3 elements (numbered subsections in Mission
   * Analysis) into collapsible accordions by grouping each heading with its
   * subsequent sibling elements until the next substep-heading.
   */
  function convertSubstepsToAccordions() {
    var headings = document.querySelectorAll('h3.substep-heading');
    for (var i = 0; i < headings.length; i++) {
      var h = headings[i];
      if (h.closest('details.accordion')) continue;

      var details = document.createElement('details');
      details.className = 'accordion accordion-substep';
      details.open = false;

      var summary = document.createElement('summary');
      summary.className = 'accordion-summary accordion-summary-substep';
      summary.innerHTML = h.innerHTML;
      appendAccordionProgressCheck(summary);

      h.parentNode.insertBefore(details, h);
      details.appendChild(summary);

      var body = document.createElement('div');
      body.className = 'accordion-body';

      // Remove the original heading so the sibling walk doesn't stop on it
      h.parentNode.removeChild(h);

      var next = details.nextSibling;
      while (next) {
        if (next.nodeType === 1) {
          var isStop = false;
          if (next.matches) {
            isStop = next.matches('h3.substep-heading') ||
                     next.matches('details.accordion-substep') ||
                     next.matches('.continue-bar') ||
                     next.matches('.final-actions') ||
                     next.matches('.phase-block') ||
                     next.matches('.pillar-block') ||
                     next.matches('details.accordion');
          }
          if (isStop || next.tagName === 'H2') break;
        }
        var toMove = next;
        next = next.nextSibling;
        body.appendChild(toMove);
      }

      details.appendChild(body);
    }
  }

  function appendAccordionProgressCheck(summary) {
    if (!summary || summary.querySelector('.accordion-progress-check')) return;
    var check = document.createElement('span');
    check.className = 'accordion-progress-check';
    check.setAttribute('aria-hidden', 'true');
    check.title = 'Has entered content';
    check.textContent = '\u2713';
    summary.appendChild(check);
  }

  function getAccordionBody(details) {
    if (!details) return null;
    for (var i = 0; i < details.children.length; i++) {
      if (details.children[i].classList && details.children[i].classList.contains('accordion-body')) {
        return details.children[i];
      }
    }
    return null;
  }

  function accordionHasEnteredContent(details) {
    var body = getAccordionBody(details);
    if (!body) return false;
    var fields = body.querySelectorAll('[data-field]');
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i];
      // Only count fields owned by this accordion (not nested child accordions).
      var owner = el.closest ? el.closest('details.accordion') : null;
      if (owner !== details) continue;
      if (el.type === 'checkbox') {
        if (el.checked) return true;
      } else if (String(el.value || '').trim() !== '') {
        return true;
      }
    }
    return false;
  }

  /** Show a checkmark on accordion headers that already have student input. */
  function updateAccordionProgressChecks() {
    var all = document.querySelectorAll('details.accordion');
    for (var i = 0; i < all.length; i++) {
      var details = all[i];
      var summary = details.querySelector(':scope > .accordion-summary') || details.querySelector('.accordion-summary');
      if (summary) appendAccordionProgressCheck(summary);
      var has = accordionHasEnteredContent(details);
      details.classList.toggle('has-entered-content', has);
      if (summary) {
        if (has) summary.setAttribute('data-progress', 'started');
        else summary.removeAttribute('data-progress');
      }
    }
  }

  // ---- Initialization ----

  function init() {
    initAccordions();
    Workbook.init();
    ScormAPI.initialize();

    var saved = ScormAPI.loadSuspendData();
    applySavedState(saved);

    bindEvents();
    ensureContinueBars();
    refreshSavedUI();
    initFieldLimits();
    initRiskRowActions();
    updateLmsSaveStatus({ version: ScormAPI.getVersion() });
  }

  function isOptionalStep(stepIdx) {
    return Workbook && typeof Workbook.isOptionalStep === 'function' && Workbook.isOptionalStep(stepIdx);
  }

  function getNextStep(stepIdx) {
    var totalSteps = stepPanels ? stepPanels.length : 0;
    if (stepIdx < 0 || stepIdx >= totalSteps - 1) return stepIdx;

    if (isOptionalStep(stepIdx)) return stepIdx + 1;

    var next = stepIdx + 1;
    while (next < totalSteps && isOptionalStep(next)) {
      next++;
    }
    return next;
  }

  function applyOptionalSkip(unlocked) {
    var totalSteps = stepPanels ? stepPanels.length : 0;
    while (unlocked < totalSteps && isOptionalStep(unlocked)) {
      unlocked++;
    }
    return unlocked;
  }

  function stepHasRequiredFields(stepIdx) {
    if (!Workbook || typeof Workbook.getSteps !== 'function') return false;
    var steps = Workbook.getSteps();
    if (!steps || stepIdx < 0 || stepIdx >= steps.length) return false;
    // AFPP Step 5: either-or matrix/PM gate (fields themselves are not individually required).
    if (steps[stepIdx].id === 6) return true;
    var fields = steps[stepIdx].fields || [];
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].required) return true;
    }
    return false;
  }

  function isStepDone(stepIdx) {
    if (isOptionalStep(stepIdx)) return false;
    if (stepHasRequiredFields(stepIdx)) return Workbook.isStepComplete(stepIdx);
    return reviewedSteps && reviewedSteps[String(stepIdx)] === true;
  }

  function recomputeMaxUnlocked() {
    // maxUnlockedStep represents the highest step index the learner may navigate to.
    // It advances by one when the previous step is "done".
    var totalSteps = stepPanels ? stepPanels.length : 0;
    var unlocked = 0;
    for (var i = 0; i < totalSteps; i++) {
      if (isOptionalStep(i)) continue;
      if (isStepDone(i)) unlocked = Math.max(unlocked, i + 1);
    }
    maxUnlockedStep = Math.max(maxUnlockedStep || 0, applyOptionalSkip(unlocked));
    maxUnlockedStep = clampStep(maxUnlockedStep);
  }

  function canAdvanceFrom(stepIdx) {
    return isStepDone(stepIdx);
  }

  function getCurrentPanel() {
    for (var i = 0; i < stepPanels.length; i++) {
      var idx = parseInt(stepPanels[i].getAttribute('data-step'), 10);
      if (idx === currentStep) return stepPanels[i];
    }
    return null;
  }

  function panelAllAccordionsOpenedOnce(panel) {
    if (!panel) return true;
    var acc = panel.querySelectorAll('details.accordion');
    if (!acc || acc.length === 0) return true;
    for (var i = 0; i < acc.length; i++) {
      if (acc[i].dataset.openedOnce !== 'true') return false;
    }
    return true;
  }

  function markReviewedIfEligible() {
    if (isOptionalStep(currentStep)) return;
    // Steps with required fields are gated by completion, not "reviewed".
    if (stepHasRequiredFields(currentStep)) return;

    var main = document.getElementById('mainContent');
    if (!main) return;

    // near-bottom check (with a little buffer)
    var atBottom = (main.scrollTop + main.clientHeight) >= (main.scrollHeight - 40);
    if (!atBottom) return;

    var panel = getCurrentPanel();
    if (!panelAllAccordionsOpenedOnce(panel)) return;

    reviewedSteps[String(currentStep)] = true;
    if (currentStep + 1 > maxUnlockedStep) maxUnlockedStep = currentStep + 1;
    updateSidebarChecks();
    updateContinueButtons();
    autoSave();
  }

  function clampStep(n) {
    var totalSteps = stepPanels ? stepPanels.length : 12;
    if (typeof n !== 'number' || isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n >= totalSteps) return totalSteps - 1;
    return n;
  }

  function showStep(stepIdx) {
    stepIdx = clampStep(stepIdx);
    // Never collect empty DOM over restored answers before the first hydrate.
    // Also skip collect when re-showing the same step (initial load).
    if (fieldsHydrated && stepIdx !== currentStep) {
    collectCurrentStepData();
    }
    currentStep = stepIdx;

    for (var i = 0; i < stepPanels.length; i++) {
      var panelStep = parseInt(stepPanels[i].getAttribute('data-step'), 10);
      stepPanels[i].classList.toggle('hidden', panelStep !== stepIdx);
    }

    for (var j = 0; j < sidebarItems.length; j++) {
      var liStep = parseInt(sidebarItems[j].getAttribute('data-step'), 10);
      sidebarItems[j].classList.toggle('active', liStep === stepIdx);
    }

    forceScrollTop();
    updateContinueButtons();
    if (stepIdx === 6) syncCriteriaToMatrix();
  }

  function forceScrollTop() {
    var main = document.getElementById('mainContent');
    if (!main) return;

    // Hard reset immediately.
    main.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    // Also reset outer document (some LMS shells wrap/scroll).
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    // After layout, re-assert top and move focus to the new section heading.
    requestAnimationFrame(function () {
      main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      var panel = getCurrentPanel();
      if (panel) {
        var h2 = panel.querySelector('h2');
        if (h2) {
          h2.setAttribute('tabindex', '-1');
          h2.focus({ preventScroll: true });
        }
      }
      main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    // One more time shortly after (covers delayed layout/fonts/LMS scripts).
    setTimeout(function () {
      main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, 50);
  }

  // ---- Completion Tracking ----

  function getDisplayedCompletionPercent() {
    var raw = Workbook.completionPercent();
    var submitStepIdx = 9;
    for (var i = 0; i < stepPanels.length; i++) {
      if (stepPanels[i].querySelector('.final-actions')) {
        submitStepIdx = parseInt(stepPanels[i].getAttribute('data-step'), 10);
        break;
      }
    }
    // Only allow 100% once the learner reaches Download & Submit.
    if (raw >= 100 && currentStep < submitStepIdx) return 99;
    return raw;
  }

  function updateCompletionUI() {
    var pct = getDisplayedCompletionPercent();
    if (completionBar) completionBar.style.width = pct + '%';
    if (completionText) completionText.textContent = pct + '% Complete';

    // Report completion/score to Canvas when the workbook reaches 100%.
    if (pct >= 100 && !scormCompletionReported) {
      scormCompletionReported = true;
      ScormAPI.setComplete(100);
      ScormAPI.commit();
      flashSaveIndicator('Marked complete in Canvas', false);
      updateLmsSaveStatus({
        version: ScormAPI.getVersion(),
        scormOk: true,
        verified: true
      });
    }
  }

  function updateSidebarChecks() {
    for (var i = 0; i < sidebarItems.length; i++) {
      var li = sidebarItems[i];
      var stepIdx = parseInt(li.getAttribute('data-step'), 10);
      var complete = isStepDone(stepIdx);
      li.classList.toggle('completed', complete);
      var check = li.querySelector('.step-check');
      if (check) check.classList.toggle('hidden', !complete);
    }
  }

  function syncVerificationCheckbox(el) {
    if (!el || el.type !== 'checkbox') return;
    var key = el.getAttribute('data-field');
    if (!key) return;
    var val = el.checked ? '1' : '';
    Workbook.setField(key, val);
    var wrap = el.closest ? el.closest('.submission-verify') : null;
    if (wrap) wrap.classList.toggle('is-checked', el.checked);
  }

  function readFieldValue(el) {
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? '1' : '';
    return el.value;
  }

  function writeFieldValue(el, val) {
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = val === '1' || val === 'true' || val === true;
      var wrap = el.closest ? el.closest('.submission-verify') : null;
      if (wrap) wrap.classList.toggle('is-checked', el.checked);
      return;
    }
    el.value = val == null ? '' : val;
  }

  function collectCurrentStepData() {
    if (!fieldsHydrated) return;
    var panel = null;
    for (var i = 0; i < stepPanels.length; i++) {
      var idx = parseInt(stepPanels[i].getAttribute('data-step'), 10);
      if (idx === currentStep) {
        panel = stepPanels[i];
        break;
      }
    }
    if (!panel) return;
    var inputs = panel.querySelectorAll('[data-field]');
    for (var j = 0; j < inputs.length; j++) {
      var el = inputs[j];
      var key = el.getAttribute('data-field');
      var val = truncateToLimit(key, readFieldValue(el));
      if (el.type !== 'checkbox' && val !== el.value) el.value = val;
      Workbook.setField(key, val);
    }
  }

  function collectAllStepData() {
    if (!fieldsHydrated) return;
    var inputs = document.querySelectorAll('[data-field]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var key = el.getAttribute('data-field');
      var val = truncateToLimit(key, readFieldValue(el));
      if (el.type !== 'checkbox' && val !== el.value) el.value = val;
      Workbook.setField(key, val);
    }
  }

  function applySavedState(saved) {
    migrateSuspendLayout(saved);
    if (!saved || typeof saved !== 'object') return;

    if (typeof saved._step === 'number') currentStep = clampStep(saved._step);
    if (saved._reviewed && typeof saved._reviewed === 'object') {
      reviewedSteps = saved._reviewed;
    }
    if (typeof saved._maxUnlocked === 'number') {
      maxUnlockedStep = clampStep(saved._maxUnlocked);
    }
    if (saved._navUnlocked === true) {
      navUnlocked = true;
      maxUnlockedStep = Math.max(maxUnlockedStep, (stepPanels ? stepPanels.length : 1) - 1);
    }
    if (saved._data && typeof saved._data === 'object') {
      Workbook.loadData(saved._data);
    } else {
      Workbook.loadData(saved);
    }
  }

  function refreshSavedUI() {
    recomputeMaxUnlocked();
    // Hydrate fields BEFORE showStep so we never collect blank inputs over saved data.
    hydrateAllFields();
    showStep(currentStep);
    updateCompletionUI();
    updateSidebarChecks();
    updateContinueButtons();
  }

  function hydrateAllFields() {
    var allInputs = document.querySelectorAll('[data-field]');
    for (var i = 0; i < allInputs.length; i++) {
      var el = allInputs[i];
      var key = el.getAttribute('data-field');
      var val = truncateToLimit(key, Workbook.getField(key));
      if (el.type === 'checkbox') {
        writeFieldValue(el, val);
      } else if (val !== undefined && val !== null && val !== '') {
        el.value = val;
      } else {
        // Keep selects/inputs blank when saved value is empty
        if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (!val) el.value = '';
        }
      }
      updateCharCounter(el);
    }
    fieldsHydrated = true;
    autosizeRiskTextareas();
    updateAllPmSelectStyles();
    restoreOptionalRiskRows();
    syncCriteriaToMatrix();
    updateAccordionProgressChecks();
  }

  function autosizeRiskTextarea(el) {
    if (!el || !el.closest) return;
    var table = el.closest('.risk-entry-table, .coa-matrix-table');
    if (!table) return;
    var row = el.closest('tr');
    if (!row) return;
    syncRiskRowHeights(row);
  }

  function parseCoaNumber(val) {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    var n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  function formatCoaNumber(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (Math.abs(n - Math.round(n)) < 0.0001) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }

  function syncCriteriaToMatrix() {
    var r;
    for (r = 1; r <= 9; r++) {
      var src = document.querySelector('[data-field="s2_crit_' + r + '"]');
      var wtSrc = document.querySelector('[data-field="s2_crit_wt_' + r + '"]');
      var label = document.querySelector('.coa-criterion-label[data-crit-sync="' + r + '"]');
      var pmLabel = document.querySelector('.coa-pm-criterion-label[data-pm-crit-sync="' + r + '"]');
      var matrixRow = document.querySelector('#coaComparisonMatrix tr[data-coa-row="' + r + '"]');
      var pmRow = document.querySelector('#coaPlusMinusTable tr[data-pm-row="' + r + '"]');
      var critRow = document.querySelector('#criteriaEntryTable tr[data-risk-row="' + r + '"]');
      var weightEl = document.querySelector('[data-field="s5_wt_' + r + '"]');

      var text = src ? String(src.value || '').trim() : '';
      if (!text) text = Workbook.getField('s2_crit_' + r) || '';
      text = String(text || '').trim();

      if (label) {
        label.textContent = text || ('Criterion ' + r);
        label.classList.toggle('coa-criterion-empty', !text);
      }

      if (pmLabel) {
        pmLabel.textContent = text || ('Criterion ' + r);
        pmLabel.classList.toggle('coa-criterion-empty', !text);
      }

      // Keep screen-reader labels in sync with criterion text.
      var pmLabelC1 = document.querySelector('label[for="f_s5_pm_r' + r + '_c1"]');
      var pmLabelC2 = document.querySelector('label[for="f_s5_pm_r' + r + '_c2"]');
      var srBase = text || ('Criterion ' + r);
      if (pmLabelC1) pmLabelC1.textContent = srBase + ' — COA 1';
      if (pmLabelC2) pmLabelC2.textContent = srBase + ' — COA 2';

      var wtVal = wtSrc ? String(wtSrc.value || '').trim() : '';
      if (!wtVal) wtVal = String(Workbook.getField('s2_crit_wt_' + r) || '').trim();
      if (!wtVal) wtVal = String(Workbook.getField('s5_wt_' + r) || '').trim();

      // Back-compat: older packages stored weight only on Step 5.
      if (wtVal && wtSrc && !String(wtSrc.value || '').trim()) {
        wtSrc.value = wtVal;
        Workbook.setField('s2_crit_wt_' + r, wtVal);
      }

      if (weightEl) {
        weightEl.readOnly = true;
        weightEl.classList.add('coa-weight-autofill');
        if (wtVal !== String(weightEl.value || '')) {
          weightEl.value = wtVal;
        }
        Workbook.setField('s5_wt_' + r, wtVal);
      }

      if (r >= 5) {
        var critHidden = !critRow || critRow.classList.contains('hidden');
        if (matrixRow) matrixRow.classList.toggle('hidden', critHidden);
        if (pmRow) pmRow.classList.toggle('hidden', critHidden);
      }
    }
    updateCoaMatrix();
  }

  function updateCoaMatrix() {
    var table = document.getElementById('coaComparisonMatrix');
    if (!table) return;

    var totals = { 1: 0, 2: 0 };
    var hasTotals = { 1: false, 2: false };
    var row;
    var r;
    var coa;

    for (r = 1; r <= 9; r++) {
      row = table.querySelector('tr[data-coa-row="' + r + '"]');
      if (!row || row.classList.contains('hidden')) continue;

      var weightEl = row.querySelector('[data-field="s5_wt_' + r + '"]');
      var weight = weightEl ? parseCoaNumber(weightEl.value) : null;
      if (weight === null && weightEl && String(weightEl.value || '').trim() === '') {
        weight = 1; // default weight when blank
      }

      for (coa = 1; coa <= 2; coa++) {
        var scoreEl = row.querySelector('[data-field="s5_c' + coa + 's_' + r + '"]');
        var score = scoreEl ? parseCoaNumber(scoreEl.value) : null;
        var weightedEl = row.querySelector('.coa-weighted-val[data-coa="' + coa + '"][data-row="' + r + '"]');
        var weighted = null;

        if (weight !== null && score !== null) {
          weighted = weight * score;
          totals[coa] += weighted;
          hasTotals[coa] = true;
        }

        if (weightedEl) weightedEl.textContent = formatCoaNumber(weighted);
      }
    }

    var totalCell1 = table.querySelector('[data-coa-total="1"]');
    var totalCell2 = table.querySelector('[data-coa-total="2"]');
    if (totalCell1) totalCell1.classList.remove('coa-total-winner');
    if (totalCell2) totalCell2.classList.remove('coa-total-winner');

    for (coa = 1; coa <= 2; coa++) {
      var totalEl = table.querySelector('[data-coa-total="' + coa + '"] span');
      if (totalEl) {
        totalEl.textContent = hasTotals[coa] ? formatCoaNumber(totals[coa]) : '—';
      }
    }

    if (hasTotals[1] && hasTotals[2]) {
      if (totals[1] > totals[2] && totalCell1) totalCell1.classList.add('coa-total-winner');
      else if (totals[2] > totals[1] && totalCell2) totalCell2.classList.add('coa-total-winner');
      else {
        // Tie — highlight both
        if (totalCell1) totalCell1.classList.add('coa-total-winner');
        if (totalCell2) totalCell2.classList.add('coa-total-winner');
      }
    } else if (hasTotals[1] && totalCell1) {
      totalCell1.classList.add('coa-total-winner');
    } else if (hasTotals[2] && totalCell2) {
      totalCell2.classList.add('coa-total-winner');
    }
  }

  function updatePmSelectStyle(el) {
    if (!el || !el.classList || !el.classList.contains('coa-pm-select')) return;
    el.classList.remove('coa-pm-plus', 'coa-pm-zero', 'coa-pm-minus');
    if (el.value === '+') el.classList.add('coa-pm-plus');
    else if (el.value === '0') el.classList.add('coa-pm-zero');
    else if (el.value === '-') el.classList.add('coa-pm-minus');
  }

  function updateAllPmSelectStyles() {
    var selects = document.querySelectorAll('.coa-pm-select');
    for (var i = 0; i < selects.length; i++) updatePmSelectStyle(selects[i]);
  }

  function getRiskTable(tableId) {
    return document.querySelector('.risk-entry-table[data-risk-table="' + tableId + '"]');
  }

  function clearRiskRowFields(row) {
    if (!row) return;
    var fields = row.querySelectorAll('[data-field]');
    for (var i = 0; i < fields.length; i++) {
      fields[i].value = '';
      Workbook.setField(fields[i].getAttribute('data-field'), '');
      updateCharCounter(fields[i]);
    }
  }

  function riskRowHasData(row) {
    if (!row) return false;
    var fields = row.querySelectorAll('[data-field]');
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].value && String(fields[i].value).trim() !== '') return true;
    }
    return false;
  }

  function updateRiskRowActionButtons(tableId) {
    var table = getRiskTable(tableId);
    if (!table) return;
    var addBtn = document.querySelector('[data-add-risk-row="' + tableId + '"]');
    var removeBtn = document.querySelector('[data-remove-risk-row="' + tableId + '"]');
    var optionalRows = table.querySelectorAll('tr.risk-row-optional');
    var visibleOptional = 0;
    var hiddenOptional = 0;
    for (var i = 0; i < optionalRows.length; i++) {
      if (optionalRows[i].classList.contains('hidden')) hiddenOptional++;
      else visibleOptional++;
    }
    if (addBtn) addBtn.classList.toggle('hidden', hiddenOptional === 0);
    if (removeBtn) removeBtn.classList.toggle('hidden', visibleOptional === 0);
  }

  function addOptionalRiskRow(tableId) {
    var table = getRiskTable(tableId);
    if (!table) return;
    var next = table.querySelector('tr.risk-row-optional.hidden');
    if (!next) return;
    next.classList.remove('hidden');
    syncRiskRowHeights(next);
    updateRiskRowActionButtons(tableId);
    if (tableId === 'criteria') syncCriteriaToMatrix();
    var firstField = next.querySelector('[data-field]');
    if (firstField && typeof firstField.focus === 'function') firstField.focus();
    autoSave();
  }

  function removeOptionalRiskRow(tableId) {
    var table = getRiskTable(tableId);
    if (!table) return;
    var optionalRows = table.querySelectorAll('tr.risk-row-optional:not(.hidden)');
    if (!optionalRows.length) return;
    var last = optionalRows[optionalRows.length - 1];
    if (riskRowHasData(last)) {
      var ok = window.confirm('Remove this optional row and clear its entries?');
      if (!ok) return;
    }
    clearRiskRowFields(last);
    last.classList.add('hidden');
    updateRiskRowActionButtons(tableId);
    if (tableId === 'criteria') syncCriteriaToMatrix();
    updateCompletionUI();
    updateSidebarChecks();
    updateAccordionProgressChecks();
    updateContinueButtons();
    autoSave();
  }

  function restoreOptionalRiskRows() {
    var tables = document.querySelectorAll('.risk-entry-table[data-risk-table]');
    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var tableId = table.getAttribute('data-risk-table');
      var optionalRows = table.querySelectorAll('tr.risk-row-optional');
      for (var r = 0; r < optionalRows.length; r++) {
        var row = optionalRows[r];
        if (riskRowHasData(row)) row.classList.remove('hidden');
      }
      updateRiskRowActionButtons(tableId);
    }
  }

  function initRiskRowActions() {
    var addBtns = document.querySelectorAll('[data-add-risk-row]');
    for (var i = 0; i < addBtns.length; i++) {
      addBtns[i].addEventListener('click', function () {
        addOptionalRiskRow(this.getAttribute('data-add-risk-row'));
      });
    }
    var removeBtns = document.querySelectorAll('[data-remove-risk-row]');
    for (var j = 0; j < removeBtns.length; j++) {
      removeBtns[j].addEventListener('click', function () {
        removeOptionalRiskRow(this.getAttribute('data-remove-risk-row'));
      });
    }
    restoreOptionalRiskRows();
  }

  function syncRiskRowHeights(row) {
    if (!row) return;
    var areas = row.querySelectorAll('textarea[data-field]');
    if (!areas || areas.length === 0) return;

    var i;
    var maxH = 0;
    for (i = 0; i < areas.length; i++) {
      areas[i].style.height = 'auto';
      if (areas[i].scrollHeight > maxH) maxH = areas[i].scrollHeight;
    }
    // Keep a usable minimum; match the tallest cell in this row.
    maxH = Math.max(maxH, 42);
    for (i = 0; i < areas.length; i++) {
      areas[i].style.height = maxH + 'px';
    }

    var selects = row.querySelectorAll('select[data-field]');
    for (i = 0; i < selects.length; i++) {
      selects[i].style.height = maxH + 'px';
    }

    var numInputs = row.querySelectorAll('input[type="number"][data-field]');
    for (i = 0; i < numInputs.length; i++) {
      numInputs[i].style.height = maxH + 'px';
    }

    var weightedCells = row.querySelectorAll('.coa-weighted-cell');
    for (i = 0; i < weightedCells.length; i++) {
      weightedCells[i].style.minHeight = maxH + 'px';
    }
  }

  function autosizeRiskTextareas() {
    var tables = document.querySelectorAll('.risk-entry-table, .coa-matrix-table');
    for (var t = 0; t < tables.length; t++) {
      var rows = tables[t].querySelectorAll('tbody tr');
      for (var r = 0; r < rows.length; r++) syncRiskRowHeights(rows[r]);
    }
    updateCoaMatrix();
  }

  function flashSaveIndicator(message, isWarning) {
    var text = message || 'Saved';
    var targets = [saveIndicator, floatingSaveIndicator];
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      if (!el) continue;
      el.textContent = text;
      el.classList.toggle('save-indicator-warning', !!isWarning);
      el.classList.remove('hidden');
      el.classList.add('visible');
    }
    setTimeout(function () {
      for (var j = 0; j < targets.length; j++) {
        var ind = targets[j];
        if (!ind) continue;
        ind.textContent = 'Saved';
        ind.classList.remove('visible', 'save-indicator-warning');
        ind.classList.add('hidden');
      }
    }, isWarning ? 3500 : 1500);
  }

  function buildProgressPayload() {
    collectAllStepData();
    return {
      _layoutVersion: LAYOUT_VERSION,
      _savedAt: Date.now(),
      _step: currentStep,
      _reviewed: reviewedSteps,
      _maxUnlocked: maxUnlockedStep,
      _navUnlocked: navUnlocked,
      _data: Workbook.getAllData()
    };
  }

  // Backup files are learner-bound so one student cannot restore another's answers.
  // This deters casual sharing; it is not cryptographic security against DevTools edits.
  var BACKUP_SEAL = 'AFPP-SOS-WB-SEAL-v2';

  function fnv1aHash(str) {
    var h = 0x811c9dc5;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function backupSignature(learnerId, sealedBody) {
    return fnv1aHash(BACKUP_SEAL + '|' + String(learnerId || '') + '|' + String(sealedBody || ''));
  }

  function encodeBackupBody(innerObj) {
    var json = JSON.stringify(innerObj);
    if (typeof LZString !== 'undefined') {
      return LZString.compressToEncodedURIComponent(json);
    }
    // Fallback: base64-ish via encodeURIComponent (still not plain answers in the file).
    try {
      return btoa(unescape(encodeURIComponent(json)));
    } catch (e) {
      return json;
    }
  }

  function decodeBackupBody(sealedBody) {
    if (!sealedBody) return null;
    try {
      if (typeof LZString !== 'undefined') {
        var json = LZString.decompressFromEncodedURIComponent(String(sealedBody));
        if (json) return JSON.parse(json);
      }
      try {
        var raw = decodeURIComponent(escape(atob(String(sealedBody))));
        return JSON.parse(raw);
      } catch (e2) {
        return JSON.parse(String(sealedBody));
      }
    } catch (e) {
      return null;
    }
  }

  function currentLearnerId() {
    if (typeof ScormAPI.getLearnerId === 'function') {
      return String(ScormAPI.getLearnerId() || '').trim();
    }
    return '';
  }

  function currentLearnerName() {
    if (typeof ScormAPI.getLearnerName === 'function') {
      return String(ScormAPI.getLearnerName() || '').trim();
    }
    return '';
  }

  function sealBackupForDownload(innerPayload) {
    var learnerId = currentLearnerId();
    if (ScormAPI.isAvailable() && !learnerId) {
      return { error: 'Canvas did not provide a student ID, so a secure backup cannot be created yet. Try Save again in a moment.' };
    }
    // Offline preview only: still seal, but mark as standalone (not transferable into Canvas).
    if (!learnerId) learnerId = 'standalone';

    var sealedBody = encodeBackupBody(innerPayload || buildProgressPayload());
    return {
      file: {
        _afppBackup: true,
        _backupVersion: 2,
        _learnerId: learnerId,
        _learnerName: currentLearnerName(),
        _savedAt: Date.now(),
        _sealed: sealedBody,
        _sig: backupSignature(learnerId, sealedBody)
      }
    };
  }

  function unsealBackupFile(obj) {
    if (!obj || typeof obj !== 'object' || obj._afppBackup !== true) {
      return { error: 'That file does not look like an AFPP workbook backup.' };
    }

    // Reject old plaintext backups (v1) — they were shareable answer keys.
    if (!obj._sealed || Number(obj._backupVersion) < 2) {
      return {
        error:
          'This backup format is no longer accepted.\n\n' +
          'Create a new backup with Save in your own Canvas session, then use that file.'
      };
    }

    var myId = currentLearnerId();
    if (ScormAPI.isAvailable() && !myId) {
      return { error: 'Canvas did not provide your student ID, so restore is blocked. Re-open the assignment and try again.' };
    }
    if (!myId) myId = 'standalone';

    var fileId = String(obj._learnerId || '').trim();
    if (!fileId || fileId !== myId) {
      return {
        error:
          'This backup belongs to another student and cannot be restored.\n\n' +
          'Each backup only works for the Canvas account that downloaded it.'
      };
    }

    if (obj._sig !== backupSignature(fileId, obj._sealed)) {
      return {
        error:
          'This backup file failed the integrity check (it may have been edited).\n\n' +
          'Download a fresh backup with Save from your own account.'
      };
    }

    var inner = decodeBackupBody(obj._sealed);
    if (!inner || typeof inner !== 'object') {
      return { error: 'Could not read the contents of that backup file.' };
    }
    return { payload: inner };
  }

  function downloadBackupFile() {
    try {
      var sealed = sealBackupForDownload(buildProgressPayload());
      if (sealed.error) {
        alert(sealed.error);
        return false;
      }
      var json = JSON.stringify(sealed.file, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var d = new Date();
      var stamp =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0') +
        '_' +
        String(d.getHours()).padStart(2, '0') +
        String(d.getMinutes()).padStart(2, '0');
      var safeId = (currentLearnerId() || 'student').replace(/[^\w\-.@]/g, '_').slice(0, 24);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'AFPP-backup-' + safeId + '-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      return true;
    } catch (e) {
      console.warn('Backup download failed', e);
      return false;
    }
  }

  function restoreFromBackupObject(obj) {
    var opened = unsealBackupFile(obj);
    if (opened.error) {
      alert(opened.error);
      return false;
    }
    applySavedState(opened.payload);
    refreshSavedUI();
    initFieldLimits();
    restoreOptionalRiskRows();
    var result = saveProgress();
    flashSaveIndicator('Backup restored', false);
    if (result && result.scormOk && result.verified) {
      alert('Backup restored and saved to Canvas.');
    } else if (result && result.scormOk) {
      alert('Backup restored. Use Save & Exit so Canvas can finish storing it.');
    } else {
      alert(
        'Backup restored on this screen.\n\n' +
        'Canvas did not confirm the save yet — keep your backup file, and click Save until the top bar says “Canvas save OK”.'
      );
    }
    return true;
  }

  function handleBackupFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(String(reader.result || ''));
        restoreFromBackupObject(obj);
      } catch (e) {
        alert('Could not read that backup file. Make sure it is the .json file downloaded from Save.');
      }
    };
    reader.onerror = function () {
      alert('Could not read that backup file.');
    };
    reader.readAsText(file);
  }

  function saveProgress() {
    if (!fieldsHydrated) return null;
    var result = ScormAPI.saveSuspendData(buildProgressPayload());
    updateCompletionUI();
    updateSidebarChecks();
    updateContinueButtons();

    if (result && result.tooLarge) {
      flashSaveIndicator('NOT saved to Canvas — answers too long', true);
    } else if (result && result.scormOk && result.verified) {
      flashSaveIndicator('Saved to Canvas', false);
    } else if (result && result.scormOk && !result.verified) {
      flashSaveIndicator('Sent to Canvas — use Save & Exit to finish', true);
    } else if (!ScormAPI.isAvailable()) {
      flashSaveIndicator('Offline — use Save & Exit for backup file', true);
    } else {
      flashSaveIndicator('Canvas save failed — click Save again', true);
    }
    updateLmsSaveStatus(result);
    return result;
  }

  function updateLmsSaveStatus(result) {
    var el = document.getElementById('lmsSaveStatus');
    if (!el) return;
    var version = (result && result.version) || ScormAPI.getVersion() || 'none';
    if (!ScormAPI.isAvailable()) {
      el.textContent = 'Offline mode — use Save & Exit for backup';
      el.className = 'lms-save-status lms-save-warn';
      return;
    }
    if (result && result.scormOk && result.verified) {
      el.textContent = 'Canvas save OK · SCORM ' + version;
      el.className = 'lms-save-status lms-save-ok';
    } else if (result && result.scormOk && !result.verified) {
      el.textContent = 'Canvas pending · use Save & Exit · SCORM ' + version;
      el.className = 'lms-save-status lms-save-warn';
    } else if (result && result.tooLarge) {
      el.textContent = 'Canvas save blocked (too large) · SCORM ' + version;
      el.className = 'lms-save-status lms-save-bad';
    } else if (result && result.scormOk === false && typeof result.compressedLength === 'number') {
      // Only after an actual save attempt — not on first load.
      el.textContent = 'Canvas save failed · SCORM ' + version;
      el.className = 'lms-save-status lms-save-bad';
    } else {
      el.textContent = 'SCORM ' + version + ' connected';
      el.className = 'lms-save-status';
    }
  }

  function saveAndExit() {
    var result = saveProgress();
    var downloaded = downloadBackupFile();
    if (!downloaded) {
      alert(
        'Could not download the backup file in this window.\n\n' +
        'If your browser blocked it, allow downloads for this site, then click Save & Exit again.'
      );
    }

    if (!ScormAPI.isAvailable()) {
      alert(
        'Offline mode: ' +
        (downloaded ? 'a backup file was downloaded. ' : '') +
        'You can close this window.'
      );
      try { window.close(); } catch (e) {}
      return;
    }

    if (!result || !result.scormOk) {
      alert(
        'Canvas did not confirm your save.\n\n' +
        (downloaded
          ? 'A backup file was still downloaded — keep it.\n\n'
          : 'A backup file may not have downloaded. Try Save & Exit again after allowing downloads.\n\n') +
        'Do not leave yet. Shorten long Step 2 / 3 / 7 answers if needed, click Save until the top bar says “Canvas save OK”, then Save & Exit.\n\n' +
        'If progress is lost later, use Restore Backup (top right, next to Save & Exit) with your .json file.'
      );
      return;
    }

    // Only terminate after Canvas accepted the write (verified optional — some LMS flush on Terminate).
    ScormAPI.commit();
    ScormAPI.finish();

    flashSaveIndicator(downloaded ? 'Saved + backup downloaded — you can exit' : 'Saved — you can exit', false);

    // Try to close the SCO window/tab. Canvas often blocks this.
    try {
      window.close();
    } catch (e) {}

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'afpp-scorm-exit' }, '*');
      }
    } catch (e2) {}

    // If the LMS kept the window open, tell the learner it's safe to leave.
    setTimeout(function () {
      if (document.visibilityState === 'hidden') return;
      alert('Progress saved. You can close this window or return to Canvas.');
    }, 400);
  }

  function ensureContinueBars() {
    for (var i = 0; i < stepPanels.length; i++) {
      var panel = stepPanels[i];
      if (!panel || panel.querySelector('.continue-bar')) continue;
      var stepIdx = parseInt(panel.getAttribute('data-step'), 10);
      if (isNaN(stepIdx)) continue;
      if (stepIdx >= stepPanels.length - 1) continue; // no Continue on last step
      if (panel.querySelector('.final-actions')) continue; // no Continue on Submit

      var bar = document.createElement('div');
      bar.className = 'continue-bar';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = 'Continue';
      btn.setAttribute('data-continue-from', String(stepIdx));
      btn.setAttribute('data-continue-to', String(getNextStep(stepIdx)));

      bar.appendChild(btn);
      panel.appendChild(bar);
    }
  }

  function unlockAllNavigation() {
    var totalSteps = stepPanels ? stepPanels.length : 0;
    if (totalSteps < 1) return;

    navUnlocked = true;
    maxUnlockedStep = totalSteps - 1;

    for (var i = 0; i < totalSteps; i++) {
      if (!isOptionalStep(i)) reviewedSteps[String(i)] = true;
    }

    updateSidebarChecks();
    updateContinueButtons();
    autoSave();

    if (saveIndicator) {
      var prev = saveIndicator.textContent;
      saveIndicator.textContent = 'Unlocked';
      saveIndicator.classList.remove('hidden');
      saveIndicator.classList.add('visible');
      setTimeout(function () {
        saveIndicator.textContent = prev || 'Saved';
        saveIndicator.classList.remove('visible');
        saveIndicator.classList.add('hidden');
      }, 1500);
    }
  }

  function isCurrentStepEligibleToContinue() {
    if (navUnlocked) return true;
    if (isOptionalStep(currentStep)) return true;
    if (stepHasRequiredFields(currentStep)) {
      // Always re-read the live DOM (esp. verification checkboxes) before gating.
      collectCurrentStepData();
      return Workbook.isStepComplete(currentStep);
    }

    var main = document.getElementById('mainContent');
    var atBottom = true;
    if (main) atBottom = (main.scrollTop + main.clientHeight) >= (main.scrollHeight - 40);

    var panel = getCurrentPanel();
    var accOk = panelAllAccordionsOpenedOnce(panel);
    return atBottom && accOk;
  }

  function updateContinueButtons() {
    var btns = document.querySelectorAll('button[data-continue-from]');
    for (var i = 0; i < btns.length; i++) {
      var from = parseInt(btns[i].getAttribute('data-continue-from'), 10);
      if (isNaN(from)) continue;
      if (from !== currentStep) continue;
      // Keep Continue clickable; handleContinue shows a clear message if incomplete.
      // (Disabled buttons were trapping learners when checkbox state lagged.)
      btns[i].disabled = false;
      btns[i].setAttribute('aria-disabled', isCurrentStepEligibleToContinue() ? 'false' : 'true');
    }
  }

  function handleContinue() {
    if (currentStep >= stepPanels.length - 1) return;

    var nextStep = getNextStep(currentStep);
    if (nextStep === currentStep) return;

    // Sync latest form/checkbox values before validation.
    collectCurrentStepData();

    // Remove focus from the previous page's Continue button so the browser
    // doesn't try to keep a "Continue" button in view on the next page.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    // Required-field steps: must be complete.
    if (!navUnlocked && stepHasRequiredFields(currentStep) && !Workbook.isStepComplete(currentStep)) {
      var msg = 'Please complete all required fields before continuing.';
      var steps = Workbook.getSteps && Workbook.getSteps();
      var stepMeta = steps && steps[currentStep];
      if (stepMeta && stepMeta.id === 1) {
        msg = 'Please check the box confirming you have submitted the Problem Statement and it has been verified before continuing.';
      } else if (stepMeta && stepMeta.id === 7) {
        msg = 'Please check the box confirming you have submitted the Position Paper before continuing.';
      } else if (stepMeta && stepMeta.id === 8) {
        msg = 'Please complete all Step 7 fields and check the box confirming Assignment #3 has been submitted before continuing.';
      } else if (stepMeta && stepMeta.id === 6) {
        msg += '\n\nFinish either the weighted matrix or the plus/minus/neutral table (at least one).';
      }
      alert(msg);
      return;
    }

    // Read-only steps: must meet review criteria (optional sections are exempt).
    if (!navUnlocked && !isOptionalStep(currentStep) && !stepHasRequiredFields(currentStep) && !isCurrentStepEligibleToContinue()) {
      alert('Please review the entire section (open the collapsible items and scroll to the bottom) before continuing.');
      return;
    }

    if (!isOptionalStep(currentStep) && !stepHasRequiredFields(currentStep)) {
      reviewedSteps[String(currentStep)] = true;
    }

    if (nextStep > maxUnlockedStep) maxUnlockedStep = applyOptionalSkip(nextStep);
    saveProgress();
    showStep(nextStep);
  }

  function openDownloadModal() {
    if (submitModal) submitModal.classList.add('visible');
  }

  function closeDownloadModal() {
    if (submitModal) submitModal.classList.remove('visible');
  }

  function showNavPrompt(message) {
    if (!navPromptModal) {
      alert(message || 'Please click Continue at the bottom of the page to move to the next section.');
      return;
    }
    if (navPromptMessage) {
      if (message) {
        navPromptMessage.textContent = message;
      } else {
        navPromptMessage.innerHTML =
          'Please click <strong>Continue</strong> at the bottom of the page to unlock the next section. ' +
          'The sidebar lets you jump to any section you have already opened.';
      }
    }
    navPromptModal.classList.add('visible');
    if (btnNavPromptOk) btnNavPromptOk.focus();
  }

  function closeNavPrompt() {
    if (navPromptModal) navPromptModal.classList.remove('visible');
  }

  function downloadPdf() {
    collectAllStepData();
    saveProgress();
    if (typeof PdfExport === 'undefined' || !PdfExport || typeof PdfExport.generate !== 'function') {
      alert('PDF export is not available. Please refresh and try again.');
      return;
    }
    PdfExport.generate(Workbook, {
      minStepId: 1,
      maxStepId: 8,
      subtitle: 'Complete Workbook Responses (Introduction–Step 7)',
      filename: 'AFPP_Student_Workbook_Answers.pdf'
    });
    // Mark the SCORM activity complete for Canvas gradebook.
    ScormAPI.setComplete(100);
    ScormAPI.commit();
    scormCompletionReported = true;
    openDownloadModal();
  }

  function downloadSteps1to6Pdf() {
    collectAllStepData();
    saveProgress();
    if (typeof PdfExport === 'undefined' || !PdfExport || typeof PdfExport.generate !== 'function') {
      alert('PDF export is not available. Please refresh and try again.');
      return;
    }
    PdfExport.generate(Workbook, {
      minStepId: 2,
      maxStepId: 7,
      subtitle: 'Steps 1–6 Responses',
      filename: 'AFPP_Steps_1-6_Answers.pdf'
    });
  }

  function downloadStep7Pdf() {
    collectAllStepData();
    saveProgress();
    if (typeof PdfExport === 'undefined' || !PdfExport || typeof PdfExport.generate !== 'function') {
      alert('PDF export is not available. Please refresh and try again.');
      return;
    }
    PdfExport.generate(Workbook, {
      minStepId: 8,
      maxStepId: 8,
      subtitle: 'Step 7 — Plans and Order Generation (Assignment #3)',
      filename: 'AFPP_Step_7_Answers.pdf'
    });
  }

  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(function () {
      saveProgress();
    }, 400);
  }

  function bindEvents() {
    for (var i = 0; i < navLinks.length; i++) {
      navLinks[i].addEventListener('click', function (e) {
        e.preventDefault();
        var s = parseInt(this.getAttribute('data-step'), 10);
        if (isNaN(s)) return;
        // Navigation rules:
        // - Optional sections (graded examples, common mistakes) are always available.
        // - Already-unlocked sections can be opened from the sidebar in either direction.
        // - Sections beyond maxUnlockedStep require Continue (or Ctrl+Shift+U unlock).
        if (!navUnlocked && !isOptionalStep(s) && s > maxUnlockedStep) {
          showNavPrompt();
          return;
        }
        showStep(s);
        autoSave();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        unlockAllNavigation();
      }
    });

    if (btnSaveExit) {
      btnSaveExit.addEventListener('click', function () {
        saveAndExit();
      });
    }

    if (btnRestoreBackup && backupFileInput) {
      btnRestoreBackup.addEventListener('click', function () {
        backupFileInput.value = '';
        backupFileInput.click();
      });
      backupFileInput.addEventListener('change', function () {
        var file = backupFileInput.files && backupFileInput.files[0];
        if (!file) return;
        var ok = confirm(
          'Restore answers from this backup file?\n\n' +
          'This only works for a backup downloaded from YOUR Canvas account.\n' +
          'It will replace what is currently on screen.'
        );
        if (!ok) {
          backupFileInput.value = '';
          return;
        }
        handleBackupFile(file);
        backupFileInput.value = '';
      });
    }

    if (btnFloatingSave) {
      btnFloatingSave.addEventListener('click', function () {
        saveProgress();
      });
    }

    if (btnDownloadPdf) {
      btnDownloadPdf.addEventListener('click', function () {
        downloadPdf();
      });
    }

    if (btnDownloadSteps1to6) {
      btnDownloadSteps1to6.addEventListener('click', function () {
        downloadSteps1to6Pdf();
      });
    }

    for (var d7 = 0; d7 < btnDownloadStep7List.length; d7++) {
      btnDownloadStep7List[d7].addEventListener('click', function () {
        downloadStep7Pdf();
      });
    }

    for (var df = 0; df < btnDownloadFullList.length; df++) {
      btnDownloadFullList[df].addEventListener('click', function () {
        downloadPdf();
      });
    }

    if (btnModalClose) {
      btnModalClose.addEventListener('click', function () {
        closeDownloadModal();
      });
    }

    if (btnNavPromptOk) {
      btnNavPromptOk.addEventListener('click', function () {
        closeNavPrompt();
      });
    }
    if (navPromptModal) {
      navPromptModal.addEventListener('click', function (e) {
        if (e.target === navPromptModal) closeNavPrompt();
      });
    }

    if (submitModal) {
      submitModal.addEventListener('click', function (e) {
        if (e.target === submitModal) closeDownloadModal();
      });
    }

    var allInputs = document.querySelectorAll('[data-field]');
    for (var j = 0; j < allInputs.length; j++) {
      allInputs[j].addEventListener('input', function () {
        var key = this.getAttribute('data-field');
        var limit = getFieldLimit(key);
        if (limit && this.value && this.value.length > limit) {
          this.value = this.value.slice(0, limit);
        }
        updateCharCounter(this);
        updatePmSelectStyle(this);
        autosizeRiskTextarea(this);
        if (key && /^s2_crit(_wt)?_\d+$/.test(key)) syncCriteriaToMatrix();
        if (this.closest && this.closest('.coa-matrix-table')) updateCoaMatrix();
        collectCurrentStepData();
        updateCompletionUI();
        updateSidebarChecks();
        updateAccordionProgressChecks();
        updateContinueButtons();
        autoSave();
      });
      allInputs[j].addEventListener('change', function () {
        var key = this.getAttribute('data-field');
        var limit = getFieldLimit(key);
        if (limit && this.value && this.value.length > limit) {
          this.value = this.value.slice(0, limit);
        }
        if (this.type === 'checkbox') {
          syncVerificationCheckbox(this);
        }
        updateCharCounter(this);
        updatePmSelectStyle(this);
        if (key && /^s2_crit(_wt)?_\d+$/.test(key)) syncCriteriaToMatrix();
        if (this.closest && this.closest('.coa-matrix-table')) updateCoaMatrix();
        collectCurrentStepData();
        updateCompletionUI();
        updateSidebarChecks();
        updateAccordionProgressChecks();
        updateContinueButtons();
        autoSave();
      });
    }
    autosizeRiskTextareas();

    // Track accordion interaction (counts as "reviewed" evidence)
    var allAccordions = document.querySelectorAll('details.accordion');
    for (var a = 0; a < allAccordions.length; a++) {
      allAccordions[a].addEventListener('toggle', function () {
        if (this.open) this.dataset.openedOnce = 'true';
        markReviewedIfEligible();
        updateContinueButtons();
        if (this.open) {
          var self = this;
          requestAnimationFrame(function () {
            var rows = self.querySelectorAll('.risk-entry-table tbody tr');
            for (var r = 0; r < rows.length; r++) syncRiskRowHeights(rows[r]);
          });
        }
      });
    }

    // Review gate for read-only/accordion steps: scroll to bottom + open accordions.
    var main = document.getElementById('mainContent');
    if (main) {
      main.addEventListener('scroll', function () {
        markReviewedIfEligible();
        updateContinueButtons();
      });
    }

    document.addEventListener('click', function (e) {
      var el = e.target;
      if (!el) return;
      if (el.matches && el.matches('button[data-continue-from]')) {
        handleContinue();
      }
    });

    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-copy-prompt]') : null;
      if (!btn) return;
      e.preventDefault();

      var cell = btn.closest('td');
      var quote = cell ? cell.querySelector('.prompt-quote') : null;
      var text = '';
      if (quote) {
        text = quote.getAttribute('data-prompt-text') || quote.textContent || '';
      }
      text = String(text).replace(/^[\s“”"']+|[\s“”"']+$/g, '').trim();
      if (!text) return;

      function showCopied() {
        var prev = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('is-copied');
        setTimeout(function () {
          btn.textContent = prev || 'Copy';
          btn.classList.remove('is-copied');
        }, 1400);
      }

      function fallbackCopy(str) {
        var ta = document.createElement('textarea');
        ta.value = str;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          showCopied();
        } catch (err) {
          alert('Unable to copy. Please select and copy the prompt manually.');
        }
        document.body.removeChild(ta);
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(showCopied).catch(function () {
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }
    });

    // Ensure the sidebar is keyboard-scrollable as a nav region.
    if (sidebar) sidebar.setAttribute('aria-label', 'Guide sections');

    window.addEventListener('beforeunload', function () {
      saveProgress();
      ScormAPI.commit();
      ScormAPI.finish();
    });
  }

  // ---- Boot ----

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
