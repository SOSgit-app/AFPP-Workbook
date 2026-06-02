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
  var STEPS = [
    {
      id: 0,
      title: 'Introduction',
      fields: [
        { key: 'p_stmt', label: 'Problem Statement (1–2 sentences)', required: true },
        { key: 'org_desc', label: 'Organization and purpose', required: true },
        { key: 'org_stake', label: 'Key stakeholders (internal/external)', required: true },
        { key: 'org_constraints', label: 'Constraints (rules, resources, time, culture)', required: true }
      ]
    },
    {
      id: 1,
      title: 'AFPP Step 1: Planning Initiation',
      fields: [
        { key: 's1_assess', label: 'Initial assessment (priorities, success, boundaries, time, effort)', required: true },
        { key: 's1_tools', label: 'Tools gathered (SOPs, project files, reports/data, norms)', required: true }
      ]
    },
    {
      id: 2,
      title: 'AFPP Step 2: Mission Analysis',
      fields: [
        { key: 's2_facts', label: 'Facts', required: true },
        { key: 's2_assumptions', label: 'Assumptions (Five A’s as applicable)', required: true },
        { key: 's2_threats', label: 'Most likely and most dangerous threat', required: true },
        { key: 's2_constraints', label: 'Constraints and restraints', required: true },
        { key: 's2_tasks', label: 'Specified, implied, and essential tasks', required: true },
        { key: 's2_root', label: 'Root causes (3–5 whys)', required: true },
        { key: 's2_risk_p1', label: 'Risk (Pillar 1: Problem Framing)', required: true },
        { key: 's2_risk_he1', label: 'Harmful Event 1', required: true },
        { key: 's2_risk_he2', label: 'Harmful Event 2', required: true },
        { key: 's2_risk_he3', label: 'Harmful Event 3', required: true },
        { key: 's2_risk_p2', label: 'Risk (Pillar 2: Risk Assessment)', required: true },
        { key: 's2_risk_p3', label: 'Risk (Pillar 3: Judge the Risk)', required: true },
        { key: 's2_risk_p4', label: 'Risk (Pillar 4: Manage the Risk)', required: true },
        { key: 's2_criteria', label: 'COA evaluation criteria', required: true },
        { key: 's2_ccirs', label: 'Initial CCIRs / decision points', required: true },
        { key: 's2_intent', label: 'Commander’s intent statement', required: true }
      ]
    },
    {
      id: 3,
      title: 'AFPP Step 3: COA Development',
      fields: [
        { key: 's3_coa1', label: 'COA 1 (solution/approach)', required: true },
        { key: 's3_coa2', label: 'COA 2 (solution/approach)', required: true }
      ]
    },
    {
      id: 4,
      title: 'AFPP Step 4: COA Analysis and Wargaming',
      fields: [
        { key: 's4_wargame', label: 'Wargaming / analysis results', required: true },
        { key: 's4_refine', label: 'Refined / updated COAs', required: true }
      ]
    },
    {
      id: 5,
      title: 'AFPP Step 5: COA Comparison',
      fields: [
        { key: 's5_matrix', label: 'Weighted matrix / scored comparison', required: true },
        { key: 's5_summary', label: 'Strengths / weaknesses summary (+ / 0 / –)', required: true }
      ]
    },
    {
      id: 6,
      title: 'AFPP Step 6: COA Approval/Recommendation',
      fields: [
        { key: 's6_position', label: 'Position paper (recommended COA and justification)', required: true }
      ]
    },
    {
      id: 7,
      title: 'Graded Example 1',
      optional: true,
      fields: []
    },
    {
      id: 8,
      title: 'Graded Example 2',
      optional: true,
      fields: []
    },
    {
      id: 9,
      title: 'Common Mistakes',
      optional: true,
      fields: []
    },
    {
      id: 10,
      title: 'Submit & Download',
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
    if (_data.hasOwnProperty(key)) {
      _data[key] = value;
    }
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
        _data[k] = obj[k];
      }
    }

    // Back-compat: if older single-field risk exists, preserve it in Pillar 4 if new pillars are empty.
    if (obj && obj.s2_risk && !_data.s2_risk_p1 && !_data.s2_risk_p2 && !_data.s2_risk_p3 && !_data.s2_risk_p4) {
      _data.s2_risk_p4 = obj.s2_risk;
    }
  }

  /** Percentage of *required* fields that have been filled in. */
  function completionPercent() {
    var total = 0;
    var filled = 0;
    for (var s = 0; s < STEPS.length; s++) {
      var fields = STEPS[s].fields;
      for (var f = 0; f < fields.length; f++) {
        if (!fields[f].required) continue;
        total++;
        if (_data[fields[f].key] && _data[fields[f].key].trim() !== '') {
          filled++;
        }
      }
    }
    return total === 0 ? 0 : Math.round((filled / total) * 100);
  }

  /** Check if all required fields in a specific step are filled. */
  function isStepComplete(stepIndex) {
    if (stepIndex < 0 || stepIndex >= STEPS.length) return false;
    var fields = STEPS[stepIndex].fields;
    if (!fields || fields.length === 0) return false;

    var hasRequired = false;
    for (var f = 0; f < fields.length; f++) {
      if (!fields[f].required) continue;
      hasRequired = true;
      var val = _data[fields[f].key];
      if (!val || val.trim() === '') return false;
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
