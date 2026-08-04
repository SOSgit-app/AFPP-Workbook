/**
 * SCORM API Wrapper for the AFPP Workbook.
 *
 * Prefers SCORM 2004 3rd/4th Edition (API_1484_11, 64,000-char suspend_data)
 * and falls back to SCORM 1.2 (window.API, 4,096-char limit) if needed.
 *
 * Persists the FULL workbook to the LMS suspend_data only (no browser localStorage /
 * IndexedDB mirror). Students can also download/restore a JSON backup file from the UI.
 */
var ScormAPI = (function () {
  'use strict';

  var _api = null;
  var _version = null; // '2004' | '1.2' | null
  var _initialized = false;
  var _finished = false;

  // SCORM 2004 3rd/4th: 64000; SCORM 1.2: 4096. Stay slightly under.
  var SCORM_SAFE_LIMIT_2004 = 63000;
  var SCORM_SAFE_LIMIT_12 = 4000;

  var _lastSaveResult = {
    scormOk: false,
    tooLarge: false,
    verified: false,
    compressedLength: 0,
    version: null,
    error: ''
  };

  function _findAPI2004(win) {
    var attempts = 0;
    var maxAttempts = 500;
    while (attempts < maxAttempts) {
      if (win.API_1484_11) return win.API_1484_11;
      if (!win.parent || win.parent === win) break;
      win = win.parent;
      attempts++;
    }
    if (window.opener && window.opener !== window) {
      try {
        if (window.opener.API_1484_11) return window.opener.API_1484_11;
        return _findAPI2004(window.opener);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function _findAPI12(win) {
    var attempts = 0;
    var maxAttempts = 500;
    while (attempts < maxAttempts) {
      if (win.API) return win.API;
      if (!win.parent || win.parent === win) break;
      win = win.parent;
      attempts++;
    }
    if (window.opener && window.opener !== window) {
      try {
        if (window.opener.API) return window.opener.API;
        return _findAPI12(window.opener);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function _discoverAPI() {
    if (_api && _version) return _api;

    var api2004 = _findAPI2004(window);
    if (api2004) {
      _api = api2004;
      _version = '2004';
      return _api;
    }

    var api12 = _findAPI12(window);
    if (api12) {
      _api = api12;
      _version = '1.2';
      return _api;
    }

    _api = null;
    _version = null;
    return null;
  }

  function _getAPI() {
    return _discoverAPI();
  }

  function _safeLimit() {
    return _version === '2004' ? SCORM_SAFE_LIMIT_2004 : SCORM_SAFE_LIMIT_12;
  }

  function _getLastError() {
    var api = _getAPI();
    if (!api || !_initialized) return '';
    try {
      if (_version === '2004' && typeof api.GetLastError === 'function') {
        return String(api.GetLastError() || '');
      }
      if (_version === '1.2' && typeof api.LMSGetLastError === 'function') {
        return String(api.LMSGetLastError() || '');
      }
    } catch (e) {
      return '';
    }
    return '';
  }

  function _getDiagnostic() {
    var api = _getAPI();
    if (!api || !_initialized) return '';
    try {
      if (_version === '2004' && typeof api.GetDiagnostic === 'function') {
        return String(api.GetDiagnostic(_getLastError()) || '');
      }
      if (_version === '1.2' && typeof api.LMSGetDiagnostic === 'function') {
        return String(api.LMSGetDiagnostic('') || '');
      }
    } catch (e) {
      return '';
    }
    return '';
  }

  function initialize() {
    if (_initialized) return true;
    var api = _getAPI();
    if (!api) {
      console.warn('SCORM API not found — running in standalone mode (use Save to download a backup file).');
      return false;
    }

    var result;
    if (_version === '2004') {
      result = api.Initialize('');
    } else {
      result = api.LMSInitialize('');
    }
    _initialized = (result === 'true' || result === true);

    if (_initialized) {
      if (_version === '2004') {
        var completion = getValue('cmi.completion_status');
        if (completion === 'unknown' || completion === 'not attempted' || completion === '') {
          setValue('cmi.completion_status', 'incomplete');
          commit();
        }
      } else {
        var status = getValue('cmi.core.lesson_status');
        if (status === 'not attempted' || status === '') {
          setValue('cmi.core.lesson_status', 'incomplete');
          commit();
        }
      }
      console.info('SCORM initialized as ' + _version);
    }
    return _initialized;
  }

  function getValue(key) {
    var api = _getAPI();
    if (!api || !_initialized) return '';
    try {
      if (_version === '2004') return api.GetValue(key) || '';
      return api.LMSGetValue(key) || '';
    } catch (e) {
      return '';
    }
  }

  function setValue(key, value) {
    var api = _getAPI();
    if (!api || !_initialized) return false;
    try {
      var result;
      if (_version === '2004') {
        result = api.SetValue(key, String(value));
      } else {
        result = api.LMSSetValue(key, String(value));
      }
      return (result === 'true' || result === true);
    } catch (e) {
      return false;
    }
  }

  function commit() {
    var api = _getAPI();
    if (!api || !_initialized) return false;
    try {
      var result;
      if (_version === '2004') {
        result = api.Commit('');
      } else {
        result = api.LMSCommit('');
      }
      return (result === 'true' || result === true);
    } catch (e) {
      return false;
    }
  }

  function finish() {
    if (_finished) return true;
    if (!_initialized) return false;
    var api = _getAPI();
    if (!api) return false;
    try {
      var result;
      if (_version === '2004') {
        result = api.Terminate('');
      } else {
        result = api.LMSFinish('');
      }
      _finished = (result === 'true' || result === true);
      return _finished;
    } catch (e) {
      return false;
    }
  }

  function getVersion() {
    return _version;
  }

  // ---- Encode / decode ----

  function _encodePayload(dataObj) {
    var json = JSON.stringify(dataObj);
    if (typeof LZString !== 'undefined') {
      return LZString.compressToEncodedURIComponent(json);
    }
    return json;
  }

  function _decodePayload(raw) {
    if (!raw) return null;
    try {
      if (typeof LZString !== 'undefined') {
        var json = LZString.decompressFromEncodedURIComponent(raw);
        if (json) return JSON.parse(json);
      }
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse saved progress:', e);
      return null;
    }
  }

  function _dataKeyCount(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    if (obj._data && typeof obj._data === 'object') return Object.keys(obj._data).length;
    var n = 0;
    for (var k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      if (k.charAt(0) === '_') continue;
      n++;
    }
    return n;
  }

  function _verifyScormWrite(expectedCompressed) {
    var raw = getValue('cmi.suspend_data');
    if (!raw) return false;
    if (raw.length < Math.min(expectedCompressed.length, 20)) return false;
    if (raw === expectedCompressed) return true;
    var decoded = _decodePayload(raw);
    return !!(decoded && typeof decoded === 'object');
  }

  // ---- Suspend Data (compressed) ----

  function saveSuspendData(dataObj) {
    if (!dataObj || typeof dataObj !== 'object') return _lastSaveResult;
    dataObj._savedAt = Date.now();
    delete dataObj._externalData;

    var compressedFull = _encodePayload(dataObj);
    var tooLarge = compressedFull.length > _safeLimit();
    var scormOk = false;
    var verified = false;
    var errMsg = '';

    if (_initialized) {
      if (tooLarge) {
        errMsg =
          'Progress is too large for this LMS (' +
          compressedFull.length +
          ' chars, limit ~' +
          _safeLimit() +
          ', SCORM ' +
          (_version || '?') +
          '). Shorten long Step 2/3/7 answers, or keep your downloaded backup file.';
        console.warn(errMsg);
      } else {
        if (_version === '2004') {
          setValue('cmi.exit', 'suspend');
        }
        scormOk = setValue('cmi.suspend_data', compressedFull);
        if (scormOk) scormOk = commit();
        if (scormOk) {
          verified = _verifyScormWrite(compressedFull);
          if (!verified) {
            errMsg = 'LMS Commit succeeded but suspend_data read-back was empty/short. Use Save & Exit so Canvas can flush progress.';
            console.warn(errMsg, 'error=', _getLastError(), _getDiagnostic());
          }
        } else {
          errMsg = 'LMS save failed (SCORM ' + (_version || '?') + '). error=' + _getLastError() + ' ' + _getDiagnostic();
          console.warn(errMsg);
        }
      }
    } else {
      errMsg = 'Not connected to Canvas — progress was not saved to the LMS.';
    }

    _lastSaveResult = {
      scormOk: scormOk,
      tooLarge: tooLarge,
      verified: verified,
      compressedLength: compressedFull.length,
      version: _version,
      error: errMsg
    };

    return _lastSaveResult;
  }

  var _lastLoadInfo = {
    scormFieldCount: 0,
    version: null,
    scormRawLength: 0
  };

  function loadSuspendData() {
    var fromScorm = null;
    var raw = getValue('cmi.suspend_data');
    if (raw) fromScorm = _decodePayload(raw);

    if (fromScorm && fromScorm._externalData && _dataKeyCount(fromScorm) === 0) {
      console.warn('Ignoring metadata-only SCORM stub from older package version.');
      fromScorm = null;
    }

    var scormCount = _dataKeyCount(fromScorm);
    _lastLoadInfo = {
      scormFieldCount: scormCount,
      version: _version,
      scormRawLength: raw ? String(raw).length : 0
    };

    console.info('Progress load: SCORM fields=', scormCount, 'version=', _version);
    return fromScorm;
  }

  function getLastSaveResult() {
    return _lastSaveResult;
  }

  function getLastLoadInfo() {
    return _lastLoadInfo;
  }

  // ---- Score & Status ----

  function setScore(raw) {
    var score = String(Math.round(raw));
    var scaled = String(Math.max(0, Math.min(1, Number(raw) / 100)));
    if (_version === '2004') {
      setValue('cmi.score.raw', score);
      setValue('cmi.score.min', '0');
      setValue('cmi.score.max', '100');
      setValue('cmi.score.scaled', scaled);
    } else {
      setValue('cmi.core.score.raw', score);
      setValue('cmi.core.score.min', '0');
      setValue('cmi.core.score.max', '100');
    }
  }

  /**
   * Mark the SCO complete/passed for Canvas gradebook.
   * SCORM 2004 often needs completion_status + success_status + score.
   */
  function setComplete(scoreRaw) {
    var score = typeof scoreRaw === 'number' ? scoreRaw : 100;
    setScore(score);

    if (_version === '2004') {
      setValue('cmi.completion_status', 'completed');
      setValue('cmi.success_status', 'passed');
      // Primary objective (needed when objectiveSetByContent is true)
      setValue('cmi.objectives.0.id', 'afpp_completion');
      setValue('cmi.objectives.0.completion_status', 'completed');
      setValue('cmi.objectives.0.success_status', 'passed');
      setValue('cmi.objectives.0.score.scaled', '1');
      setValue('cmi.objectives.0.score.raw', String(Math.round(score)));
      setValue('cmi.objectives.0.score.min', '0');
      setValue('cmi.objectives.0.score.max', '100');
    } else {
      // 1.2: "passed" implies completed + success for many LMS gradebooks
      setValue('cmi.core.lesson_status', 'passed');
    }
    commit();
  }

  function setIncomplete() {
    if (_version === '2004') {
      setValue('cmi.completion_status', 'incomplete');
      // Do not force success_status unknown if LMS rejects empty; only set if writable
      setValue('cmi.success_status', 'unknown');
    } else {
      setValue('cmi.core.lesson_status', 'incomplete');
    }
    commit();
  }

  function isAvailable() {
    return !!_getAPI();
  }

  function getLearnerId() {
    if (!_initialized) return '';
    if (_version === '2004') {
      return String(getValue('cmi.learner_id') || '').trim();
    }
    return String(getValue('cmi.core.student_id') || getValue('cmi.learner_id') || '').trim();
  }

  function getLearnerName() {
    if (!_initialized) return '';
    if (_version === '2004') {
      return String(getValue('cmi.learner_name') || '').trim();
    }
    return String(getValue('cmi.core.student_name') || getValue('cmi.learner_name') || '').trim();
  }

  return {
    initialize: initialize,
    getValue: getValue,
    setValue: setValue,
    commit: commit,
    finish: finish,
    getVersion: getVersion,
    saveSuspendData: saveSuspendData,
    loadSuspendData: loadSuspendData,
    getLastSaveResult: getLastSaveResult,
    getLastLoadInfo: getLastLoadInfo,
    setScore: setScore,
    setComplete: setComplete,
    setIncomplete: setIncomplete,
    isAvailable: isAvailable,
    getLearnerId: getLearnerId,
    getLearnerName: getLearnerName
  };
})();
