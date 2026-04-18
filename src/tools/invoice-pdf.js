#!/usr/bin/env node
/**
 * Standalone invoice PDF generator.
 * Bundled into dist/ and mounted read-only inside the bwrap sandbox.
 *
 * Usage:
 *   node /opt/tools/invoice-pdf.js '<JSON>'
 *
 * JSON fields:
 *   invoiceNumber  - e.g. "INV-2026-001"
 *   date           - e.g. "April 12, 2026"
 *   dueDate        - e.g. "May 12, 2026"
 *   from           - { name, address?, email?, phone? }
 *   to             - { name, address?, email?, phone? }
 *   items          - [{ description, quantity, rate, amount }]
 *   subtotal       - number
 *   tax            - number (0 if none)
 *   taxRate        - string, e.g. "8.25%" (optional)
 *   total          - number
 *   notes          - string (optional)
 *   currency       - string, default "$"
 *
 * Outputs: invoice_<number>.pdf in the current working directory.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const PRIMARY = [22, 163, 74];   // Swayat green
const DARK = [26, 26, 46];
const MUTED = [120, 120, 140];
const LIGHT_BG = [248, 250, 252];

function formatCurrency(amount, currency = '$') {
  return `${currency}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateInvoice(data) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  const safeNumber = (data.invoiceNumber || 'INV-0001').replace(/[^a-zA-Z0-9\-_]/g, '');
  const fileName = `invoice_${safeNumber.toLowerCase()}.pdf`;
  const filePath = path.join(process.cwd(), fileName);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const cur = data.currency || '$';
  const pageWidth = doc.page.width - 100; // 50 margin each side

  // ── Header ──
  doc.rect(50, 50, pageWidth, 80).fill(`rgb(${PRIMARY.join(',')})`);
  doc.fontSize(28).fill('#ffffff').text('INVOICE', 70, 68, { width: pageWidth - 40 });
  doc.fontSize(11).fill('#ffffff').text(data.invoiceNumber || 'INV-0001', 70, 100, { width: pageWidth - 40 });

  // ── Dates (right-aligned in header) ──
  doc.fontSize(9).fill('#ffffff');
  doc.text(`Date: ${data.date || 'N/A'}`, 350, 72, { width: 190, align: 'right' });
  doc.text(`Due: ${data.dueDate || 'N/A'}`, 350, 86, { width: 190, align: 'right' });

  // ── From / To ──
  let y = 155;

  doc.fontSize(8).fill(`rgb(${MUTED.join(',')})`).text('FROM', 50, y);
  doc.fontSize(8).fill(`rgb(${MUTED.join(',')})`).text('BILL TO', 300, y);
  y += 16;

  const from = data.from || {};
  const to = data.to || {};

  doc.fontSize(11).fill(`rgb(${DARK.join(',')})`).text(from.name || 'Your Business', 50, y);
  doc.fontSize(11).fill(`rgb(${DARK.join(',')})`).text(to.name || 'Client', 300, y);
  y += 16;

  doc.fontSize(9).fill(`rgb(${MUTED.join(',')})`);
  if (from.address) { doc.text(from.address, 50, y); y += 13; }
  if (from.email) { doc.text(from.email, 50, y); y += 13; }
  if (from.phone) { doc.text(from.phone, 50, y); y += 13; }

  let yTo = 187;
  if (to.address) { doc.text(to.address, 300, yTo); yTo += 13; }
  if (to.email) { doc.text(to.email, 300, yTo); yTo += 13; }
  if (to.phone) { doc.text(to.phone, 300, yTo); yTo += 13; }

  y = Math.max(y, yTo) + 25;

  // ── Items Table ──
  // Header row
  doc.rect(50, y, pageWidth, 28).fill(`rgb(${LIGHT_BG.join(',')})`);
  doc.fontSize(8).fill(`rgb(${MUTED.join(',')})`);
  doc.text('DESCRIPTION', 60, y + 9, { width: 230 });
  doc.text('QTY', 300, y + 9, { width: 50, align: 'center' });
  doc.text('RATE', 355, y + 9, { width: 80, align: 'right' });
  doc.text('AMOUNT', 440, y + 9, { width: 95, align: 'right' });
  y += 28;

  // Item rows
  const items = data.items || [];
  doc.fontSize(10).fill(`rgb(${DARK.join(',')})`);
  for (const item of items) {
    // Light border
    doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    doc.fill(`rgb(${DARK.join(',')})`);
    doc.text(item.description || '', 60, y + 10, { width: 230 });
    doc.text(String(item.quantity ?? 1), 300, y + 10, { width: 50, align: 'center' });
    doc.text(formatCurrency(item.rate || 0, cur), 355, y + 10, { width: 80, align: 'right' });
    doc.text(formatCurrency(item.amount || 0, cur), 440, y + 10, { width: 95, align: 'right' });
    y += 35;
  }

  // Bottom border
  doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  y += 20;

  // ── Totals ──
  const totalsX = 355;
  const totalsValX = 440;
  const totalsW = 95;

  doc.fontSize(10).fill(`rgb(${MUTED.join(',')})`);
  doc.text('Subtotal', totalsX, y, { width: 80 });
  doc.fill(`rgb(${DARK.join(',')})`);
  doc.text(formatCurrency(data.subtotal || 0, cur), totalsValX, y, { width: totalsW, align: 'right' });
  y += 22;

  if (data.tax && data.tax > 0) {
    doc.fill(`rgb(${MUTED.join(',')})`);
    doc.text(`Tax${data.taxRate ? ` (${data.taxRate})` : ''}`, totalsX, y, { width: 80 });
    doc.fill(`rgb(${DARK.join(',')})`);
    doc.text(formatCurrency(data.tax, cur), totalsValX, y, { width: totalsW, align: 'right' });
    y += 22;
  }

  // Total highlight
  doc.rect(totalsX - 10, y - 4, pageWidth - totalsX + 60, 32).fill(`rgb(${PRIMARY.join(',')})`);
  doc.fontSize(12).fill('#ffffff');
  doc.text('TOTAL', totalsX, y + 4, { width: 80 });
  doc.text(formatCurrency(data.total || 0, cur), totalsValX, y + 4, { width: totalsW, align: 'right' });
  y += 50;

  // ── Notes ──
  if (data.notes) {
    doc.fontSize(8).fill(`rgb(${MUTED.join(',')})`).text('NOTES', 50, y);
    y += 14;
    doc.fontSize(9).fill(`rgb(${DARK.join(',')})`).text(data.notes, 50, y, { width: pageWidth });
    y += 30;
  }

  // ── Footer ──
  const footerY = doc.page.height - 60;
  doc.moveTo(50, footerY).lineTo(50 + pageWidth, footerY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.fontSize(8).fill(`rgb(${MUTED.join(',')})`);
  doc.text('Generated by Swayat AI — swayat.com', 50, footerY + 10, { width: pageWidth, align: 'center' });

  doc.end();

  stream.on('finish', () => {
    console.log(JSON.stringify({ success: true, file: fileName, path: filePath }));
  });

  stream.on('error', (err) => {
    console.error(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  });
}

// ── CLI entrypoint ──
try {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node invoice-pdf.js \'<JSON>\'');
    process.exit(1);
  }
  const data = JSON.parse(input);
  generateInvoice(data);
} catch (err) {
  console.error(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
}
