import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export function generateOfferLetterPdf({ outputPath, candidateName, jobTitle, salary, bonus, equity, startDate, companyName = 'Acme Technologies Inc.' }) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const doc = new PDFDocument({ margin: 60 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.fontSize(20).text(companyName, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text('Offer of Employment', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.text(`Dear ${candidateName},`);
    doc.moveDown();
    doc.text(
      `We are delighted to offer you the position of ${jobTitle} at ${companyName}. ` +
      `We were impressed by your background and are confident you'll make a great addition to our team.`
    );
    doc.moveDown();
    doc.text('Compensation details:');
    doc.moveDown(0.5);
    doc.text(`•  Annual Base Salary: ₹${Number(salary).toLocaleString('en-IN')}`);
    if (bonus) doc.text(`•  Annual Bonus Target: ₹${Number(bonus).toLocaleString('en-IN')}`);
    if (equity) doc.text(`•  Equity: ${equity}`);
    doc.text(`•  Proposed Start Date: ${startDate}`);
    doc.moveDown();
    doc.text(
      'This offer is contingent upon successful completion of any remaining background checks. ' +
      'Please log into the candidate portal to accept or decline this offer.'
    );
    doc.moveDown(2);
    doc.text('We look forward to welcoming you to the team!');
    doc.moveDown(2);
    doc.text('Sincerely,');
    doc.text('The Hiring Team');
    doc.text(companyName);

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}
