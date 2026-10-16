/**
 * PDF Export for the AFPP Workbook.
 * Uses jsPDF to render a professional multi-page PDF of all responses.
 */
var PdfExport = (function () {
  'use strict';

  var PAGE_WIDTH  = 210;   // A4 mm
  var MARGIN_LEFT = 20;
  var MARGIN_RIGHT = 20;
  var MARGIN_TOP  = 25;
  var USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

  var LINE_HEIGHT = 6;
  var yPos = MARGIN_TOP;
  var doc;

  function newPage() {
    doc.addPage();
    yPos = MARGIN_TOP;
  }

  function checkPage(needed) {
    if (yPos + needed > 275) {
      newPage();
    }
  }

  function addTitle(text) {
    checkPage(20);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 37, 69);
    doc.text(text, PAGE_WIDTH / 2, yPos, { align: 'center' });
    yPos += 10;
  }

  function addSubtitle(text) {
    checkPage(12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 99, 119);
    doc.text(text, PAGE_WIDTH / 2, yPos, { align: 'center' });
    yPos += 8;
  }

  function addSectionHeader(text) {
    checkPage(14);
    yPos += 4;
    doc.setFillColor(11, 37, 69);
    doc.rect(MARGIN_LEFT, yPos - 5, USABLE_WIDTH, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(text, MARGIN_LEFT + 4, yPos);
    yPos += 9;
  }

  function addFieldLabel(label) {
    checkPage(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(19, 64, 116);
    doc.text(label, MARGIN_LEFT, yPos);
    yPos += 5;
  }

  function addFieldValue(value) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);

    if (!value || value.trim() === '') {
      doc.setTextColor(160, 160, 160);
      value = '(not completed)';
    }

    var lines = doc.splitTextToSize(value, USABLE_WIDTH - 4);
    for (var i = 0; i < lines.length; i++) {
      checkPage(LINE_HEIGHT);
      doc.text(lines[i], MARGIN_LEFT + 2, yPos);
      yPos += LINE_HEIGHT;
    }
    yPos += 2;
  }

  function addField(label, value) {
    var estimatedHeight = 10 + (value ? Math.ceil(value.length / 80) * LINE_HEIGHT : LINE_HEIGHT);
    checkPage(Math.min(estimatedHeight, 30));
    addFieldLabel(label);
    addFieldValue(value);
  }

  function addSeparator() {
    yPos += 2;
    doc.setDrawColor(210, 214, 220);
    doc.line(MARGIN_LEFT, yPos, PAGE_WIDTH - MARGIN_RIGHT, yPos);
    yPos += 4;
  }

  function parseCoaNumber(val) {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    var n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  function formatCoaNumber(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    if (Math.abs(n - Math.round(n)) < 0.0001) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }

  /**
   * Draw a bordered table with fixed column widths.
   * @param {object} options
   * @param {string[]} options.headers
   * @param {string[][]} options.rows
   * @param {number[]} options.colWidths  widths in mm (should sum to <= USABLE_WIDTH)
   * @param {string[]} [options.aligns]   'left' | 'center' | 'right' per column
   * @param {boolean[]} [options.boldRows] mark specific body rows as bold (e.g. totals)
   * @param {number[]} [options.fillRows] 0-based body row indexes to shade
   */
  function drawTable(options) {
    var headers = options.headers || [];
    var rows = options.rows || [];
    var colWidths = options.colWidths || [];
    var aligns = options.aligns || [];
    var boldRows = options.boldRows || [];
    var fillRows = options.fillRows || [];
    var rowH = 7;
    var headerH = 8;
    var padX = 1.5;
    var i;
    var c;
    var x;
    var cellText;
    var align;
    var textX;

    function drawHeader() {
      checkPage(headerH + rowH);
      x = MARGIN_LEFT;
      doc.setFillColor(11, 37, 69);
      doc.setDrawColor(11, 37, 69);
      doc.setLineWidth(0.2);
      for (c = 0; c < headers.length; c++) {
        doc.setFillColor(11, 37, 69);
        doc.rect(x, yPos, colWidths[c], headerH, 'FD');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        align = aligns[c] || (c === 0 ? 'left' : 'center');
        cellText = String(headers[c] == null ? '' : headers[c]);
        if (align === 'right') {
          textX = x + colWidths[c] - padX;
          doc.text(cellText, textX, yPos + 5.2, { align: 'right' });
        } else if (align === 'center') {
          textX = x + colWidths[c] / 2;
          doc.text(cellText, textX, yPos + 5.2, { align: 'center' });
        } else {
          doc.text(cellText, x + padX, yPos + 5.2);
        }
        x += colWidths[c];
      }
      yPos += headerH;
    }

    drawHeader();

    for (i = 0; i < rows.length; i++) {
      if (yPos + rowH > 275) {
        newPage();
        drawHeader();
      }

      var isBold = boldRows.indexOf(i) !== -1;
      var isFill = fillRows.indexOf(i) !== -1 || isBold;
      x = MARGIN_LEFT;
      doc.setDrawColor(180, 188, 198);
      doc.setLineWidth(0.2);

      for (c = 0; c < headers.length; c++) {
        if (isFill) {
          if (isBold) doc.setFillColor(232, 240, 248);
          else doc.setFillColor(245, 247, 250);
          doc.rect(x, yPos, colWidths[c], rowH, 'FD');
        } else {
          doc.setFillColor(255, 255, 255);
          doc.rect(x, yPos, colWidths[c], rowH, 'S');
        }

        cellText = String(rows[i][c] == null ? '' : rows[i][c]);
        doc.setFontSize(8);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(30, 30, 30);
        align = aligns[c] || (c === 0 ? 'left' : 'center');
        if (align === 'right') {
          textX = x + colWidths[c] - padX;
          doc.text(cellText, textX, yPos + 4.8, { align: 'right' });
        } else if (align === 'center') {
          textX = x + colWidths[c] / 2;
          doc.text(cellText, textX, yPos + 4.8, { align: 'center' });
        } else {
          // Clip long criterion labels to the cell width.
          var maxW = colWidths[c] - padX * 2;
          var clipped = doc.splitTextToSize(cellText, maxW)[0] || '';
          doc.text(clipped, x + padX, yPos + 4.8);
        }
        x += colWidths[c];
      }
      yPos += rowH;
    }
    yPos += 3;
  }

  function addNote(text) {
    checkPage(8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(90, 99, 119);
    var lines = doc.splitTextToSize(text, USABLE_WIDTH);
    for (var i = 0; i < lines.length; i++) {
      checkPage(LINE_HEIGHT);
      doc.text(lines[i], MARGIN_LEFT, yPos);
      yPos += 5;
    }
    yPos += 2;
  }

  function addCoaMatrixStep(workbook) {
    addFieldLabel('Weighted matrix / scored comparison');

    var rows = [];
    var totals = { 1: 0, 2: 0 };
    var hasTotals = { 1: false, 2: false };
    var r;
    var hasAnyRow = false;

    for (r = 1; r <= 9; r++) {
      var crit = String(workbook.getField('s2_crit_' + r) || '').trim();
      var c1Val = workbook.getField('s5_c1s_' + r) || '';
      var c2Val = workbook.getField('s5_c2s_' + r) || '';
      var wtVal = workbook.getField('s2_crit_wt_' + r) || workbook.getField('s5_wt_' + r) || '';

      if (!crit && !String(c1Val).trim() && !String(c2Val).trim()) continue;

      hasAnyRow = true;
      var weight = parseCoaNumber(wtVal);
      if (weight === null) weight = 1;
      var c1 = parseCoaNumber(c1Val);
      var c2 = parseCoaNumber(c2Val);
      var w1 = c1 !== null ? weight * c1 : null;
      var w2 = c2 !== null ? weight * c2 : null;

      if (w1 !== null) { totals[1] += w1; hasTotals[1] = true; }
      if (w2 !== null) { totals[2] += w2; hasTotals[2] = true; }

      rows.push([
        crit || ('Criterion ' + r),
        formatCoaNumber(weight),
        formatCoaNumber(c1),
        formatCoaNumber(w1),
        formatCoaNumber(c2),
        formatCoaNumber(w2)
      ]);
    }

    if (!hasAnyRow) {
      addFieldValue('');
    } else {
      rows.push([
        'Total',
        '',
        '',
        hasTotals[1] ? formatCoaNumber(totals[1]) : '',
        '',
        hasTotals[2] ? formatCoaNumber(totals[2]) : ''
      ]);
      drawTable({
        headers: ['Criterion', 'Wt', 'C1', 'W1', 'C2', 'W2'],
        rows: rows,
        colWidths: [58, 14, 18, 20, 18, 20],
        aligns: ['left', 'center', 'center', 'center', 'center', 'center'],
        boldRows: [rows.length - 1],
        fillRows: [rows.length - 1]
      });
      addNote('NOTE: The higher the number, the better. Wt = weight, C = score, W = weighted score (Wt × C). Criteria come from Step 2.');
    }

    addFieldLabel('Plus / Minus / Neutral comparison');
    var pmRows = [];
    for (r = 1; r <= 9; r++) {
      var pmCrit = String(workbook.getField('s2_crit_' + r) || '').trim();
      var pm1 = workbook.getField('s5_pm_r' + r + '_c1') || '';
      var pm2 = workbook.getField('s5_pm_r' + r + '_c2') || '';
      if (!pmCrit && !String(pm1).trim() && !String(pm2).trim()) continue;
      pmRows.push([pmCrit || ('Criterion ' + r), pm1 || '', pm2 || '']);
    }

    if (!pmRows.length) {
      addFieldValue('');
    } else {
      drawTable({
        headers: ['Criteria', 'COA 1', 'COA 2'],
        rows: pmRows,
        colWidths: [90, 29, 29],
        aligns: ['left', 'center', 'center']
      });
      addNote('Legend: + positive, 0 neutral, − negative. COA = course of action. Criteria come from Step 2.');
    }
  }

  function formatCertDate(d) {
    try {
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  /**
   * Landscape certificate of completion (first page of the full workbook PDF).
   */
  function drawCertificatePage(workbook) {
    var name = String(workbook.getField('cert_name') || '').trim() || 'Student';
    var classId = String(workbook.getField('cert_class_id') || '').trim() || '—';
    var flight = String(workbook.getField('cert_flight') || '').trim() || '—';
    var dateStr = formatCertDate(new Date());

    var W = 297; // A4 landscape mm
    var H = 210;
    var cx = W / 2;

    // Background
    doc.setFillColor(252, 250, 245);
    doc.rect(0, 0, W, H, 'F');

    // Outer navy border
    doc.setDrawColor(11, 37, 69);
    doc.setLineWidth(1.6);
    doc.rect(10, 10, W - 20, H - 20);

    // Inner gold border
    doc.setDrawColor(197, 150, 26);
    doc.setLineWidth(0.7);
    doc.rect(14, 14, W - 28, H - 28);

    // Accent corner marks
    doc.setDrawColor(197, 150, 26);
    doc.setLineWidth(1.2);
    var cLen = 12;
    // TL
    doc.line(18, 18, 18 + cLen, 18);
    doc.line(18, 18, 18, 18 + cLen);
    // TR
    doc.line(W - 18, 18, W - 18 - cLen, 18);
    doc.line(W - 18, 18, W - 18, 18 + cLen);
    // BL
    doc.line(18, H - 18, 18 + cLen, H - 18);
    doc.line(18, H - 18, 18, H - 18 - cLen);
    // BR
    doc.line(W - 18, H - 18, W - 18 - cLen, H - 18);
    doc.line(W - 18, H - 18, W - 18, H - 18 - cLen);

    var y = 36;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(11, 37, 69);
    doc.text('SQUADRON OFFICER SCHOOL', cx, y, { align: 'center' });
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 99, 119);
    doc.text('Air University  ·  United States Air Force', cx, y, { align: 'center' });
    y += 12;

    doc.setDrawColor(197, 150, 26);
    doc.setLineWidth(0.5);
    doc.line(cx - 40, y, cx + 40, y);
    y += 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(11, 37, 69);
    doc.text('Certificate of Completion', cx, y, { align: 'center' });
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(50, 55, 65);
    doc.text('This certifies that', cx, y, { align: 'center' });
    y += 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(19, 64, 116);
    var nameLines = doc.splitTextToSize(name, W - 60);
    doc.text(nameLines, cx, y, { align: 'center' });
    y += Math.max(12, nameLines.length * 9) + 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(50, 55, 65);
    doc.text('has successfully completed the', cx, y, { align: 'center' });
    y += 9;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(11, 37, 69);
    doc.text('Air Force Planning Process Student Workbook', cx, y, { align: 'center' });
    y += 16;

    // Meta row: Class / Flight / Date
    var metaY = y;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 125, 135);
    doc.text('CLASS ID', cx - 70, metaY, { align: 'center' });
    doc.text('FLIGHT', cx, metaY, { align: 'center' });
    doc.text('DATE', cx + 70, metaY, { align: 'center' });
    metaY += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(11, 37, 69);
    doc.text(classId, cx - 70, metaY, { align: 'center' });
    doc.text(flight, cx, metaY, { align: 'center' });
    doc.text(dateStr, cx + 70, metaY, { align: 'center' });

    y = H - 34;
    doc.setDrawColor(197, 150, 26);
    doc.setLineWidth(0.4);
    doc.line(cx - 35, y, cx + 35, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 99, 119);
    doc.text('AFPP Student Workbook  ·  Squadron Officer School', cx, y, { align: 'center' });
  }

  /**
   * @param {object} workbook Workbook model
   * @param {object} [options]
   * @param {number} [options.minStepId] Inclusive first step id (default: all)
   * @param {number} [options.maxStepId] Inclusive last step id (default: all)
   * @param {string} [options.filename] Download filename
   * @param {string} [options.subtitle] Optional subtitle under the cover title
   * @param {boolean} [options.includeCertificate] Prepend SOS certificate page
   */
  function generate(workbook, options) {
    options = options || {};

    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      alert('PDF library not loaded. Please try again.');
      return;
    }

    var jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || jspdf.jsPDF;
    var includeCertificate = !!options.includeCertificate;

    if (includeCertificate) {
      doc = new jsPDFClass({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      drawCertificatePage(workbook);
      doc.addPage('a4', 'portrait');
    } else {
      doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    }
    yPos = MARGIN_TOP;

    // ---- Cover / Header ----
    addTitle('Air Force Planning Process Student Workbook');
    addSubtitle('Squadron Officer School');
    if (options.subtitle) {
      addSubtitle(options.subtitle);
    }
    yPos += 4;

    doc.setDrawColor(197, 150, 26);
    doc.setLineWidth(0.8);
    doc.line(MARGIN_LEFT + 30, yPos, PAGE_WIDTH - MARGIN_RIGHT - 30, yPos);
    yPos += 8;

    // ---- Workbook responses (current model) ----
    if (!workbook || typeof workbook.getSteps !== 'function') {
      alert('Workbook model not available. Please refresh and try again.');
      return;
    }

    var minId = typeof options.minStepId === 'number' ? options.minStepId : null;
    var maxId = typeof options.maxStepId === 'number' ? options.maxStepId : null;
    var CERT_KEYS = { cert_name: 1, cert_class_id: 1, cert_flight: 1 };

    var steps = workbook.getSteps();
    for (var s = 0; s < steps.length; s++) {
      var step = steps[s];
      if (!step || !step.fields || step.fields.length === 0) continue;
      if (minId !== null && step.id < minId) continue;
      if (maxId !== null && step.id > maxId) continue;
      // Certificate details appear on page 1 — skip repeating them in the answers section.
      if (step.id === 9) continue;
      addSectionHeader(step.title);
      if (step.id === 6) {
        addCoaMatrixStep(workbook);
      } else {
        for (var f = 0; f < step.fields.length; f++) {
          var field = step.fields[f];
          if (CERT_KEYS[field.key]) continue;
          var value = workbook.getField(field.key);
          if (field.key === 'a1_verified') {
            value = (value === '1' || value === 'true')
              ? 'Yes — Problem Statement submitted and verified'
              : '';
          } else if (field.key === 'a2_verified') {
            value = (value === '1' || value === 'true')
              ? 'Yes — Position Paper submitted'
              : '';
          } else if (field.key === 'a3_verified') {
            value = (value === '1' || value === 'true')
              ? 'Yes — Assignment #3 submitted'
              : '';
          }
          // Skip unused optional fields so the PDF stays clean.
          if (!field.required && (!value || String(value).trim() === '')) continue;
          addField(field.label, value);
        }
      }
      addSeparator();
    }

    // ---- Footer on each page (skip decorative certificate page) ----
    var totalPages = doc.internal.getNumberOfPages();
    var startFooter = includeCertificate ? 2 : 1;
    for (var p = startFooter; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      var labelPage = includeCertificate ? (p - 1) : p;
      var labelTotal = includeCertificate ? (totalPages - 1) : totalPages;
      doc.text(
        'AFPP Student Workbook — Squadron Officer School — Page ' + labelPage + ' of ' + labelTotal,
        PAGE_WIDTH / 2, 290,
        { align: 'center' }
      );
    }

    // ---- Download ----
    doc.save(options.filename || 'AFPP_Student_Workbook_Answers.pdf');
  }

  return { generate: generate };
})();
