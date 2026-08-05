/**
 * Workbook Data Model for the AFPP SCORM package.
 *
 * Defines all fields, tracks values, computes completion percentage,
 * and handles hydration/serialization for SCORM suspend_data.
 */
var Workbook = (function () {
  'use strict';

  /**
   * Field definitions grouped by step.
   * Each field has: key (short, for JSON), label (human-readable), required flag.
   * "optional" fields (like COA 3) do not count toward completion.
   */
  function buildStep5Fields() {
    // Matrix scores and plus/minus are either-or: at least one method must be complete.
    var fields = [];
    var r;
    for (r = 1; r <= 9; r++) {
      fields.push(
        { key: 's5_wt_' + r, label: 'Matrix — Weight (criterion ' + r + ')', required: false },
        { key: 's5_c1s_' + r, label: 'Matrix — COA 1 Score (criterion ' + r + ')', required: false },
        { key: 's5_c2s_' + r, label: 'Matrix — COA 2 Score (criterion ' + r + ')', required: false },
        { key: 's5_pm_r' + r + '_c1', label: 'Plus/Minus — COA 1 (criterion ' + r + ')', required: false },
        { key: 's5_pm_r' + r + '_c2', label: 'Plus/Minus — COA 2 (criterion ' + r + ')', required: false }
      );
    }
    return fields;
  }

  var STEPS = [
    {
      id: 0,
      title: 'Saving Your Work',
      fields: []
    },
    {
      id: 1,
      title: 'Introduction',
      fields: [
        { key: 'a1_verified', label: 'Assignment #1 Problem Statement submitted and verified', required: true }
      ]
    },
    {
      id: 2,
      title: 'AFPP Step 1: Planning Initiation',
      fields: [
        { key: 's1_assess', label: 'Initial assessment (priorities, success, boundaries, time, effort)', required: true },
        { key: 's1_tools', label: 'Tools gathered (SOPs, project files, reports/data, norms)', required: true }
      ]
    },
    {
      id: 3,
      title: 'AFPP Step 2: Mission Analysis',
      fields: [
        { key: 's2_facts', label: 'Facts', required: true },
        { key: 's2_assumptions', label: 'Assumptions (Five A’s as applicable)', required: true },
        { key: 's2_threats', label: 'Most likely and most dangerous threat', required: true },
        { key: 's2_constraints', label: 'Constraints and restraints', required: true },
        { key: 's2_cogs', label: 'Friendly/adversary COGs and critical factors (CC / CR / CV)', required: true },
        { key: 's2_tasks', label: 'Specified, implied, and essential tasks', required: true },
        { key: 's2_root', label: 'Root causes (3–5 whys)', required: true },
        { key: 's2_risk_p1', label: 'Risk (Pillar 1: Problem Framing)', required: true },
        { key: 's2_risk_he1', label: 'Pillar 2 — Harmful Event 1', required: true },
        { key: 's2_risk_src1', label: 'Pillar 2 — Source of Risk 1', required: true },
        { key: 's2_risk_lik1', label: 'Pillar 2 — Probability 1', required: true },
        { key: 's2_risk_imp1', label: 'Pillar 2 — Consequence 1', required: true },
        { key: 's2_risk_he2', label: 'Pillar 2 — Harmful Event 2 (optional)', required: false },
        { key: 's2_risk_src2', label: 'Pillar 2 — Source of Risk 2 (optional)', required: false },
        { key: 's2_risk_lik2', label: 'Pillar 2 — Probability 2 (optional)', required: false },
        { key: 's2_risk_imp2', label: 'Pillar 2 — Consequence 2 (optional)', required: false },
        { key: 's2_risk_he3', label: 'Pillar 2 — Harmful Event 3 (optional)', required: false },
        { key: 's2_risk_src3', label: 'Pillar 2 — Source of Risk 3 (optional)', required: false },
        { key: 's2_risk_lik3', label: 'Pillar 2 — Probability 3 (optional)', required: false },
        { key: 's2_risk_imp3', label: 'Pillar 2 — Consequence 3 (optional)', required: false },
        { key: 's2_risk_p3_ev1', label: 'Pillar 3 — Event 1', required: true },
        { key: 's2_risk_p3_prob1', label: 'Pillar 3 — Probability 1', required: true },
        { key: 's2_risk_p3_con1', label: 'Pillar 3 — Consequence 1', required: true },
        { key: 's2_risk_p3_risk1', label: 'Pillar 3 — Initial Risk Assessment 1', required: true },
        { key: 's2_risk_p3_ev2', label: 'Pillar 3 — Event 2 (optional)', required: false },
        { key: 's2_risk_p3_prob2', label: 'Pillar 3 — Probability 2 (optional)', required: false },
        { key: 's2_risk_p3_con2', label: 'Pillar 3 — Consequence 2 (optional)', required: false },
        { key: 's2_risk_p3_risk2', label: 'Pillar 3 — Initial Risk Assessment 2 (optional)', required: false },
        { key: 's2_risk_p3_ev3', label: 'Pillar 3 — Event 3 (optional)', required: false },
        { key: 's2_risk_p3_prob3', label: 'Pillar 3 — Probability 3 (optional)', required: false },
        { key: 's2_risk_p3_con3', label: 'Pillar 3 — Consequence 3 (optional)', required: false },
        { key: 's2_risk_p3_risk3', label: 'Pillar 3 — Initial Risk Assessment 3 (optional)', required: false },
        { key: 's2_risk_p4_risk1', label: 'Pillar 4 — Unacceptable Risk 1', required: true },
        { key: 's2_risk_p4_plan1', label: 'Pillar 4 — Management Plan 1', required: true },
        { key: 's2_risk_p4_act1', label: 'Pillar 4 — Specific Action 1', required: true },
        { key: 's2_risk_p4_risk2', label: 'Pillar 4 — Unacceptable Risk 2 (optional)', required: false },
        { key: 's2_risk_p4_plan2', label: 'Pillar 4 — Management Plan 2 (optional)', required: false },
        { key: 's2_risk_p4_act2', label: 'Pillar 4 — Specific Action 2 (optional)', required: false },
        { key: 's2_risk_p4_risk3', label: 'Pillar 4 — Unacceptable Risk 3 (optional)', required: false },
        { key: 's2_risk_p4_plan3', label: 'Pillar 4 — Management Plan 3 (optional)', required: false },
        { key: 's2_risk_p4_act3', label: 'Pillar 4 — Specific Action 3 (optional)', required: false },
        { key: 's2_crit_1', label: 'COA evaluation criterion 1', required: true },
        { key: 's2_crit_wt_1', label: 'COA criterion weight 1', required: true },
        { key: 's2_crit_2', label: 'COA evaluation criterion 2', required: true },
        { key: 's2_crit_wt_2', label: 'COA criterion weight 2', required: true },
        { key: 's2_crit_3', label: 'COA evaluation criterion 3', required: true },
        { key: 's2_crit_wt_3', label: 'COA criterion weight 3', required: true },
        { key: 's2_crit_4', label: 'COA evaluation criterion 4', required: true },
        { key: 's2_crit_wt_4', label: 'COA criterion weight 4', required: true },
        { key: 's2_crit_5', label: 'COA evaluation criterion 5 (optional)', required: false },
        { key: 's2_crit_wt_5', label: 'COA criterion weight 5 (optional)', required: false },
        { key: 's2_crit_6', label: 'COA evaluation criterion 6 (optional)', required: false },
        { key: 's2_crit_wt_6', label: 'COA criterion weight 6 (optional)', required: false },
        { key: 's2_crit_7', label: 'COA evaluation criterion 7 (optional)', required: false },
        { key: 's2_crit_wt_7', label: 'COA criterion weight 7 (optional)', required: false },
        { key: 's2_crit_8', label: 'COA evaluation criterion 8 (optional)', required: false },
        { key: 's2_crit_wt_8', label: 'COA criterion weight 8 (optional)', required: false },
        { key: 's2_crit_9', label: 'COA evaluation criterion 9 (optional)', required: false },
        { key: 's2_crit_wt_9', label: 'COA criterion weight 9 (optional)', required: false },
        { key: 's2_ccirs', label: 'Initial CCIRs / decision points', required: true },
        { key: 's2_intent', label: 'Commander’s intent statement', required: true }
      ]
    },
    {
      id: 4,
      title: 'AFPP Step 3: COA Development',
      fields: [
        { key: 's3_coa1', label: 'COA 1 (solution/approach)', required: true },
        { key: 's3_coa2', label: 'COA 2 (solution/approach)', required: true }
      ]
    },
    {
      id: 5,
      title: 'AFPP Step 4: COA Analysis and Wargaming',
      fields: [
        { key: 's4_wargame', label: 'Wargaming / analysis results', required: true },
        { key: 's4_refine', label: 'Refined / updated COAs', required: true }
      ]
    },
    {
      id: 6,
      title: 'AFPP Step 5: COA Comparison',
      fields: buildStep5Fields()
    },
    {
      id: 7,
      title: 'AFPP Step 6: COA Approval/Recommendation',
      fields: [
        { key: 'a2_verified', label: 'Assignment #2 Position Paper submitted', required: true }
      ]
    },
    {
      id: 8,
      title: 'AFPP Step 7: Plans and Order Generation',
      fields: [
        { key: 's7_p1_response', label: 'Step 7 Prompt Log — Step 1 Input Response', required: true },
        { key: 's7_p1_revision', label: 'Step 7 Prompt Log — Step 1 Final Revision', required: true },
        { key: 's7_p2_response', label: 'Step 7 Prompt Log — Step 2 Input Response', required: true },
        { key: 's7_p2_revision', label: 'Step 7 Prompt Log — Step 2 Final Revision', required: true },
        { key: 's7_p3_response', label: 'Step 7 Prompt Log — Step 3 Input Response', required: true },
        { key: 's7_p3_revision', label: 'Step 7 Prompt Log — Step 3 Final Revision', required: true },
        { key: 's7_p4_response', label: 'Step 7 Prompt Log — Step 4 Input Response', required: true },
        { key: 's7_p4_revision', label: 'Step 7 Prompt Log — Step 4 Final Revision', required: true },
        { key: 's7_reflection', label: 'Step 7 Reflection — Written Response', required: true },
        { key: 'a3_verified', label: 'Assignment #3 submitted', required: true }
      ]
    },
    {
      id: 9,
      title: 'Download & Submit',
      fields: []
    },
    {
      id: 10,
      title: 'Graded Example 1',
      optional: true,
      fields: []
    },
    {
      id: 11,
      title: 'Graded Example 2',
      optional: true,
      fields: []
    },
    {
      id: 12,
      title: 'Common Mistakes',
      optional: true,
      fields: []
    }
  ];

  var _data = {};

  function _buildAllKeys() {
    var keys = [];
    for (var s = 0; s < STEPS.length; s++) {
      var fields = STEPS[s].fields;
      for (var f = 0; f < fields.length; f++) {
        keys.push(fields[f].key);
      }
    }
    return keys;
  }

  var ALL_KEYS = _buildAllKeys();

  function init() {
    _data = {};
    for (var i = 0; i < ALL_KEYS.length; i++) {
      _data[ALL_KEYS[i]] = '';
    }
  }

  function setField(key, value) {
    if (!key) return;
    // Always accept updates for known keys; also allow newly added keys
    // so a stale/cached model cannot silently drop verification checkboxes.
    _data[key] = value == null ? '' : value;
  }

  function getField(key) {
    return _data.hasOwnProperty(key) ? _data[key] : '';
  }

  function getAllData() {
    var out = {};
    for (var k in _data) {
      if (_data.hasOwnProperty(k) && _data[k] !== '') {
        out[k] = _data[k];
      }
    }
    return out;
  }

  function loadData(obj) {
    init();
    if (!obj) return;
    for (var k in obj) {
      if (obj.hasOwnProperty(k) && _data.hasOwnProperty(k)) {
        var val = obj[k];
        // Soft safety: keep restored values within known generous caps if present.
        if (typeof val === 'string' && val.length > 10000) {
          val = val.slice(0, 10000);
        }
        _data[k] = val;
      }
    }

    // Back-compat: if older single-field risk exists, preserve it in Pillar 1 if empty.
    if (obj && obj.s2_risk && !_data.s2_risk_p1) {
      _data.s2_risk_p1 = obj.s2_risk;
    }
    // Back-compat: old free-text criteria → criterion 1 if empty.
    if (obj && obj.s2_criteria && !_data.s2_crit_1) {
      _data.s2_crit_1 = obj.s2_criteria;
    }
  }

  function fieldHasValue(key) {
    var val = _data[key];
    if (val === null || val === undefined) return false;
    return String(val).trim() !== '';
  }

  function fieldIsEffectivelyRequired(field) {
    if (!field) return false;
    // Optional criterion rows: weight required only when that criterion is filled.
    var wm = /^s2_crit_wt_(\d+)$/.exec(field.key);
    if (wm) {
      var wr = parseInt(wm[1], 10);
      if (wr <= 4) return true;
      return fieldHasValue('s2_crit_' + wr);
    }
    // Step 5 matrix / PM fields are either-or (handled in isStep5CompareComplete).
    if (/^s5_(wt_|c[12]s_|pm_)/.test(field.key)) return false;
    return !!field.required;
  }

  function isStep5MatrixComplete() {
    var r;
    for (r = 1; r <= 9; r++) {
      var active = r <= 4 || fieldHasValue('s2_crit_' + r);
      if (!active) continue;
      if (!fieldHasValue('s2_crit_wt_' + r) && !fieldHasValue('s5_wt_' + r)) return false;
      if (!fieldHasValue('s5_c1s_' + r) || !fieldHasValue('s5_c2s_' + r)) return false;
    }
    return true;
  }

  function isStep5PmComplete() {
    var r;
    for (r = 1; r <= 9; r++) {
      var active = r <= 4 || fieldHasValue('s2_crit_' + r);
      if (!active) continue;
      if (!fieldHasValue('s5_pm_r' + r + '_c1') || !fieldHasValue('s5_pm_r' + r + '_c2')) {
        return false;
      }
    }
    return true;
  }

  function isStep5CompareComplete() {
    return isStep5MatrixComplete() || isStep5PmComplete();
  }

  /** Percentage of *required* fields that have been filled in. */
  function completionPercent() {
    var total = 0;
    var filled = 0;
    for (var s = 0; s < STEPS.length; s++) {
      if (STEPS[s].id === 6) {
        total++;
        if (isStep5CompareComplete()) filled++;
        continue;
      }
      var fields = STEPS[s].fields;
      for (var f = 0; f < fields.length; f++) {
        if (!fieldIsEffectivelyRequired(fields[f])) continue;
        total++;
        if (fieldHasValue(fields[f].key)) filled++;
      }
    }
    return total === 0 ? 0 : Math.round((filled / total) * 100);
  }

  /** Check if all required fields in a specific step are filled. */
  function isStepComplete(stepIndex) {
    if (stepIndex < 0 || stepIndex >= STEPS.length) return false;
    if (STEPS[stepIndex].id === 6) return isStep5CompareComplete();

    var fields = STEPS[stepIndex].fields;
    if (!fields || fields.length === 0) return false;

    var hasRequired = false;
    for (var f = 0; f < fields.length; f++) {
      if (!fieldIsEffectivelyRequired(fields[f])) continue;
      hasRequired = true;
      if (!fieldHasValue(fields[f].key)) return false;
    }
    return hasRequired;
  }

  function isOptionalStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= STEPS.length) return false;
    return STEPS[stepIndex].optional === true;
  }

  function getSteps() {
    return STEPS;
  }

  function getStepCount() {
    return STEPS.length;
  }

  return {
    init: init,
    setField: setField,
    getField: getField,
    getAllData: getAllData,
    loadData: loadData,
    completionPercent: completionPercent,
    isStepComplete: isStepComplete,
    isOptionalStep: isOptionalStep,
    getSteps: getSteps,
    getStepCount: getStepCount
  };
})();
