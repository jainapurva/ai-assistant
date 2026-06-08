const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const data = JSON.parse(process.argv[2]);
const outFile = path.resolve(data.outFile || 'invoice.pdf');

const doc = new PDFDocument({ margin: 50, size: 'A4' });
doc.pipe(fs.createWriteStream(outFile));

const PRIMARY = '#1a1a2e';
const ACCENT = '#4f46e5';
const LIGHT = '#f8f8ff';
const GRAY = '#666666';

// Header background
doc.rect(0, 0, doc.page.width, 130).fill(PRIMARY);

// Company name
doc.fillColor('#ffffff').fontSize(26).font('Helvetica-Bold')
   .text(data.from.name, 50, 40);
doc.fillColor('#a5b4fc').fontSize(10).font('Helvetica')
   .text(data.from.email, 50, 72);

// INVOICE label
doc.fillColor('#ffffff').fontSize(32).font('Helvetica-Bold')
   .text('INVOICE', 0, 35, { align: 'right', width: doc.page.width - 50 });
doc.fillColor('#a5b4fc').fontSize(11).font('Helvetica')
   .text(`#${data.invoiceNumber}`, 0, 75, { align: 'right', width: doc.page.width - 50 });

// Bill To / Date block
const infoY = 155;
doc.fillColor(PRIMARY).fontSize(9).font('Helvetica-Bold')
   .text('BILL TO', 50, infoY);
doc.fillColor(PRIMARY).fontSize(13).font('Helvetica-Bold')
   .text(data.to.name, 50, infoY + 14);
doc.fillColor(GRAY).fontSize(10).font('Helvetica')
   .text(data.to.email, 50, infoY + 30);

// Dates on right
const dateBlockX = doc.page.width - 200;
doc.fillColor(GRAY).fontSize(9).font('Helvetica')
   .text('Issue Date', dateBlockX, infoY)
   .text('Due Date', dateBlockX, infoY + 22);
doc.fillColor(PRIMARY).fontSize(10).font('Helvetica-Bold')
   .text(data.date, dateBlockX + 75, infoY, { align: 'right', width: 125 })
   .text(data.dueDate, dateBlockX + 75, infoY + 22, { align: 'right', width: 125 });

// Divider
doc.moveTo(50, 215).lineTo(doc.page.width - 50, 215).strokeColor('#e0e0f0').lineWidth(1).stroke();

// Table header
const tableTop = 230;
const colDesc = 50, colQty = 330, colRate = 400, colAmt = 470;

doc.rect(50, tableTop, doc.page.width - 100, 24).fill(ACCENT);
doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
   .text('DESCRIPTION', colDesc + 5, tableTop + 7)
   .text('QTY', colQty, tableTop + 7)
   .text('RATE', colRate, tableTop + 7)
   .text('AMOUNT', colAmt, tableTop + 7);

// Table rows
let rowY = tableTop + 24;
data.items.forEach((item, i) => {
  const bg = i % 2 === 0 ? '#ffffff' : LIGHT;
  doc.rect(50, rowY, doc.page.width - 100, 28).fill(bg);
  doc.fillColor(PRIMARY).fontSize(10).font('Helvetica')
     .text(item.description, colDesc + 5, rowY + 8, { width: 270 })
     .text(String(item.quantity), colQty, rowY + 8)
     .text(`$${Number(item.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, colRate, rowY + 8)
     .text(`$${Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, colAmt, rowY + 8);
  rowY += 28;
});

// Totals
const totalsX = doc.page.width - 230;
rowY += 20;

const addTotalRow = (label, value, bold, highlight) => {
  if (highlight) {
    doc.rect(totalsX - 10, rowY - 5, 195, 28).fill(ACCENT);
    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
       .text(label, totalsX, rowY)
       .text(value, totalsX + 80, rowY, { align: 'right', width: 95 });
    rowY += 32;
  } else {
    doc.fillColor(GRAY).fontSize(10).font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, totalsX, rowY)
       .text(value, totalsX + 80, rowY, { align: 'right', width: 95 });
    rowY += 20;
  }
};

addTotalRow('Subtotal', `$${Number(data.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
if (data.tax) addTotalRow('Tax', `$${Number(data.tax).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
rowY += 5;
addTotalRow('TOTAL DUE', `$${Number(data.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, true, true);

// Footer
const footerY = doc.page.height - 60;
doc.moveTo(50, footerY - 15).lineTo(doc.page.width - 50, footerY - 15).strokeColor('#e0e0f0').lineWidth(1).stroke();
doc.fillColor(GRAY).fontSize(9).font('Helvetica')
   .text('Thank you for your business!', 50, footerY, { align: 'center', width: doc.page.width - 100 });

doc.end();
console.log(outFile);
