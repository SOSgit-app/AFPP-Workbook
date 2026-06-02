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

  function generate(workbook) {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      alert('PDF library not loaded. Please try again.');
      return;
    }

    var jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || jspdf.jsPDF;
    doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    yPos = MARGIN_TOP;

    // ---- Cover / Header ----
    addTitle('Air Force Planning Process Student Workbook');
    addSubtitle('Squadron Officer School');
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

    var steps = workbook.getSteps();
    for (var s = 0; s < steps.length; s++) {
      var step = steps[s];
      if (!step || !step.fields || step.fields.length === 0) continue;
      addSectionHeader(step.title);
      for (var f = 0; f < step.fields.length; f++) {
        var field = step.fields[f];
        addField(field.label, workbook.getField(field.key));
      }
      addSeparator();
    }

    // ---- Footer on each page ----
    var totalPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(
        'AFPP Student Workbook — Squadron Officer School — Page ' + p + ' of ' + totalPages,
        PAGE_WIDTH / 2, 290,
        { align: 'center' }
      );
    }

    // ---- Download ----
    doc.save('AFPP_Student_Workbook_Answers.pdf');
  }

  return { generate: generate };
})();
