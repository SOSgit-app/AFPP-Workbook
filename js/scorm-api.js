/**
 * SCORM 1.2 API Wrapper for the AFPP Workbook.
 *
 * Handles LMS communication: finding the API, initializing the session,
 * reading/writing cmi values, and managing suspend_data with lz-string
 * compression to stay within the 4096-char limit.
 */
var ScormAPI = (function () {
  'use strict';

  var _api = null;
  var _initialized = false;
  var _finished = false;

  /**
   * Search up through window/opener hierarchy for the SCORM API object.
   * SCORM 1.2 exposes it as window.API.
   */
  function _findAPI(win) {
    var attempts = 0;
    var maxAttempts = 500;
    while (!win.API && win.parent && win.parent !== win && attempts < maxAttempts) {
      win = win.parent;
      attempts++;
    }
    if (win.API) return win.API;

    if (window.opener && window.opener !== window) {
      return _findAPI(window.opener);
    }
    return null;
  }

  function _getAPI() {
    if (_api) return _api;
    _api = _findAPI(window);
    return _api;
  }

  function initialize() {
    if (_initialized) return true;
    var api = _getAPI();
    if (!api) {
      console.warn('SCORM API not found — running in standalone mode.');
      return false;
    }
    var result = api.LMSInitialize('');
    _initialized = (result === 'true' || result === true);
    if (_initialized) {
      var status = getValue('cmi.core.lesson_status');
      if (status === 'not attempted' || status === '') {
        setValue('cmi.core.lesson_status', 'incomplete');
        commit();
      }
    }
    return _initialized;
  }

  function getValue(key) {
    var api = _getAPI();
    if (!api || !_initialized) return '';
    return api.LMSGetValue(key) || '';
  }

  function setValue(key, value) {
    var api = _getAPI();
    if (!api || !_initialized) return false;
    var result = api.LMSSetValue(key, String(value));
    return (result === 'true' || result === true);
  }

  function commit() {
    var api = _getAPI();
    if (!api || !_initialized) return false;
    return api.LMSCommit('');
  }

  function finish() {
    if (_finished) return true;
    if (!_initialized) return false;
    var api = _getAPI();
    if (!api) return false;
    var result = api.LMSFinish('');
    _finished = (result === 'true' || result === true);
    return _finished;
  }

  // ---- Suspend Data (compressed) ----

  function saveSuspendData(dataObj) {
    var json = JSON.stringify(dataObj);
    var compressed = '';
    if (typeof LZString !== 'undefined') {
      compressed = LZString.compressToEncodedURIComponent(json);
    } else {
      compressed = json;
    }
    setValue('cmi.suspend_data', compressed);
    commit();
  }

  function loadSuspendData() {
    var raw = getValue('cmi.suspend_data');
    if (!raw) return null;
    try {
      if (typeof LZString !== 'undefined') {
        var json = LZString.decompressFromEncodedURIComponent(raw);
        if (json) return JSON.parse(json);
      }
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse suspend_data:', e);
      return null;
    }
  }

  // ---- Score & Status ----

  function setScore(raw) {
    setValue('cmi.core.score.raw', String(Math.round(raw)));
    setValue('cmi.core.score.min', '0');
    setValue('cmi.core.score.max', '100');
  }

  function setComplete() {
    setValue('cmi.core.lesson_status', 'completed');
    commit();
  }

  function setIncomplete() {
    setValue('cmi.core.lesson_status', 'incomplete');
    commit();
  }

  function isAvailable() {
    return !!_getAPI();
  }

  return {
    initialize: initialize,
    getValue: getValue,
    setValue: setValue,
    commit: commit,
    finish: finish,
    saveSuspendData: saveSuspendData,
    loadSuspendData: loadSuspendData,
    setScore: setScore,
    setComplete: setComplete,
    setIncomplete: setIncomplete,
    isAvailable: isAvailable
  };
})();
