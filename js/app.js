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

  // ---- DOM references ----
  var sidebar = document.getElementById('sidebar');
  var sidebarItems = document.querySelectorAll('#stepList li[data-step]');
  var navLinks = document.querySelectorAll('#stepList a.nav-link[data-step]');
  var stepPanels = document.querySelectorAll('.content-doc .step-panel[data-step]');
  var completionBar = document.getElementById('completionBar');
  var completionText = document.getElementById('completionText');
  var btnSave = document.getElementById('btnSave');
  var saveIndicator = document.getElementById('saveIndicator');
  var btnSubmitWorkbook = document.getElementById('btnSubmitWorkbook');
  var btnDownloadPdf = document.getElementById('btnDownloadPdf');
  var submitModal = document.getElementById('submitModal');
  var modalScore = document.getElementById('modalScore');
  var btnModalClose = document.getElementById('btnModalClose');

  var LAYOUT_VERSION = 3;

  /**
   * Remap saved step indices when the sidebar layout changes.
   */
  function migrateSuspendLayout(saved) {
    if (!saved || typeof saved !== 'object') return;
    if (saved._layoutVersion === LAYOUT_VERSION) return;

    var v = saved._layoutVersion;

    function mapV2ToV3(o) {
      if (o <= 3) return o;
      return Math.min(o + 3, 10);
    }

    function mapLegacyToV3(o) {
      if (o <= 2) return 0;
      if (o <= 5) return o - 2;
      if (o === 6) return 7;
      if (o <= 10) return o + 1;
      return 10;
    }

    function mapStep(o) {
      if (typeof o !== 'number' || isNaN(o)) return 0;
      if (v === 2) return mapV2ToV3(o);
      if (v === undefined || v === 1) return mapLegacyToV3(o);
      return o;
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

  // ---- Initialization ----

  function init() {
    initAccordions();
    Workbook.init();
    ScormAPI.initialize();

    var saved = ScormAPI.loadSuspendData();
    migrateSuspendLayout(saved);
    if (saved && typeof saved === 'object') {
      if (typeof saved._step === 'number') currentStep = clampStep(saved._step);
      if (saved._reviewed && typeof saved._reviewed === 'object') {
        reviewedSteps = saved._reviewed;
      }
      if (typeof saved._maxUnlocked === 'number') {
        maxUnlockedStep = clampStep(saved._maxUnlocked);
      }
      if (saved._data && typeof saved._data === 'object') {
        Workbook.loadData(saved._data);
      } else {
        // Back-compat: prior versions stored fields at the root of suspend_data
        Workbook.loadData(saved);
      }
    }

    recomputeMaxUnlocked();
    bindEvents();
    ensureContinueBars();
    showStep(currentStep);
    hydrateAllFields();
    updateSidebarChecks();
    updateCompletionUI();
    updateContinueButtons();
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
    var totalSteps = stepPanels ? stepPanels.length : 10;
    if (typeof n !== 'number' || isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n >= totalSteps) return totalSteps - 1;
    return n;
  }

  function showStep(stepIdx) {
    stepIdx = clampStep(stepIdx);
    collectCurrentStepData();
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
    var lastStepIdx = (stepPanels ? stepPanels.length - 1 : 0);
    // Only allow 100% once the learner reaches the last page.
    if (raw >= 100 && currentStep < lastStepIdx) return 99;
    return raw;
  }

  function updateCompletionUI() {
    var pct = getDisplayedCompletionPercent();
    if (completionBar) completionBar.style.width = pct + '%';
    if (completionText) completionText.textContent = pct + '% Complete';

    ScormAPI.setScore(pct);
    if (pct >= 100) ScormAPI.setComplete();
    else ScormAPI.setIncomplete();
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

  function collectCurrentStepData() {
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
      Workbook.setField(el.getAttribute('data-field'), el.value);
    }
  }

  function hydrateAllFields() {
    var allInputs = document.querySelectorAll('[data-field]');
    for (var i = 0; i < allInputs.length; i++) {
      var el = allInputs[i];
      var key = el.getAttribute('data-field');
      var val = Workbook.getField(key);
      if (val !== undefined && val !== null && val !== '') el.value = val;
    }
  }

  function flashSaveIndicator() {
    if (!saveIndicator) return;
    saveIndicator.classList.remove('hidden');
    saveIndicator.classList.add('visible');
    setTimeout(function () {
      saveIndicator.classList.remove('visible');
      saveIndicator.classList.add('hidden');
    }, 1500);
  }

  function saveProgress() {
    collectCurrentStepData();
    ScormAPI.saveSuspendData({
      _layoutVersion: LAYOUT_VERSION,
      _step: currentStep,
      _reviewed: reviewedSteps,
      _maxUnlocked: maxUnlockedStep,
      _data: Workbook.getAllData()
    });
    updateCompletionUI();
    updateSidebarChecks();
    updateContinueButtons();
    flashSaveIndicator();
  }

  function ensureContinueBars() {
    for (var i = 0; i < stepPanels.length; i++) {
      var panel = stepPanels[i];
      if (!panel || panel.querySelector('.continue-bar')) continue;
      var stepIdx = parseInt(panel.getAttribute('data-step'), 10);
      if (isNaN(stepIdx)) continue;
      if (stepIdx >= stepPanels.length - 1) continue; // no Continue on last step

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

  function isCurrentStepEligibleToContinue() {
    if (isOptionalStep(currentStep)) return true;
    if (stepHasRequiredFields(currentStep)) return Workbook.isStepComplete(currentStep);

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
      btns[i].disabled = !isCurrentStepEligibleToContinue();
    }
  }

  function handleContinue() {
    if (currentStep >= stepPanels.length - 1) return;

    var nextStep = getNextStep(currentStep);
    if (nextStep === currentStep) return;

    // Remove focus from the previous page's Continue button so the browser
    // doesn't try to keep a "Continue" button in view on the next page.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    // Required-field steps: must be complete.
    if (stepHasRequiredFields(currentStep) && !Workbook.isStepComplete(currentStep)) {
      alert('Please complete all required fields before continuing.');
      return;
    }

    // Read-only steps: must meet review criteria (optional sections are exempt).
    if (!isOptionalStep(currentStep) && !stepHasRequiredFields(currentStep) && !isCurrentStepEligibleToContinue()) {
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

  function openSubmitModal(scorePct) {
    if (modalScore) modalScore.textContent = String(Math.round(scorePct)) + '%';
    if (submitModal) submitModal.classList.add('visible');
  }

  function closeSubmitModal() {
    if (submitModal) submitModal.classList.remove('visible');
  }

  function submitToGradebook() {
    saveProgress();
    var pct = getDisplayedCompletionPercent();
    ScormAPI.setScore(pct);
    if (pct >= 100) ScormAPI.setComplete();
    else ScormAPI.setIncomplete();
    ScormAPI.commit();
    openSubmitModal(pct);
  }

  function downloadPdf() {
    saveProgress();
    if (typeof PdfExport === 'undefined' || !PdfExport || typeof PdfExport.generate !== 'function') {
      alert('PDF export is not available. Please refresh and try again.');
      return;
    }
    PdfExport.generate(Workbook);
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
        // - You can always go BACK to any unlocked section.
        // - You can only go FORWARD up to maxUnlockedStep (usually via Continue).
        if (!isOptionalStep(s) && s > maxUnlockedStep) {
          alert('Please use Continue to move forward after completing/reviewing the current section.');
          return;
        }
        showStep(s);
        autoSave();
      });
    }

    if (btnSave) {
      btnSave.addEventListener('click', function () {
        saveProgress();
      });
    }

    if (btnSubmitWorkbook) {
      btnSubmitWorkbook.addEventListener('click', function () {
        submitToGradebook();
      });
    }

    if (btnDownloadPdf) {
      btnDownloadPdf.addEventListener('click', function () {
        downloadPdf();
      });
    }

    if (btnModalClose) {
      btnModalClose.addEventListener('click', function () {
        closeSubmitModal();
      });
    }

    if (submitModal) {
      submitModal.addEventListener('click', function (e) {
        if (e.target === submitModal) closeSubmitModal();
      });
    }

    var allInputs = document.querySelectorAll('[data-field]');
    for (var j = 0; j < allInputs.length; j++) {
      allInputs[j].addEventListener('input', function () {
        collectCurrentStepData();
        updateCompletionUI();
        updateSidebarChecks();
        updateContinueButtons();
        autoSave();
      });
    }

    // Track accordion interaction (counts as "reviewed" evidence)
    var allAccordions = document.querySelectorAll('details.accordion');
    for (var a = 0; a < allAccordions.length; a++) {
      allAccordions[a].addEventListener('toggle', function () {
        if (this.open) this.dataset.openedOnce = 'true';
        markReviewedIfEligible();
        updateContinueButtons();
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
