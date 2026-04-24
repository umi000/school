// Date-to-words helper (English, used on certificates)
const ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
  "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const ORDINAL = {1:"1st",2:"2nd",3:"3rd"};
const ordinal = (n) => ORDINAL[n] || `${n}th`;

function numberToWords(n) {
  if (n === 0) return "Zero";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n/10)] + (n % 10 ? " " + ONES[n%10] : "");
  if (n < 1000) return ONES[Math.floor(n/100)] + " Hundred" + (n % 100 ? " " + numberToWords(n%100) : "");
  if (n < 2000) return ONES[Math.floor(n/1000)] + " Thousand" + (n % 1000 ? " " + numberToWords(n%1000) : "");
  return String(n);
}

function dateToWords(dateVal) {
  if (!dateVal) return "—";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day   = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year  = d.getFullYear();
  return `${ordinal(day)} ${month} ${numberToWords(year)}`;
}

function fmt(dateVal) {
  if (!dateVal) return "—";
  return new Date(dateVal).toLocaleDateString("en-PK", { day:"2-digit", month:"short", year:"numeric" });
}

function pronoun(gender) {
  const g = (gender || "").toLowerCase();
  return { he: g === "female" ? "She" : "He", his: g === "female" ? "Her" : "His", mr: g === "female" ? "Miss" : "Mr." };
}

const CERT_CSS = `
  body { font-family: "Times New Roman", Times, serif; margin: 0; color: #111; background: #fff; }
  .page { width: 190mm; margin: 10mm auto; padding: 0; }
  .cert-wrap { border: 3px double #1a6b3a; padding: 18mm 16mm; position: relative; }
  .cert-wrap.blue-border { border-color: #1a3a6b; }
  .header { text-align: center; margin-bottom: 6mm; }
  .header-logo { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 4mm; }
  .header-logo img { width: 52px; height: 52px; }
  .school-name { font-size: 16pt; font-weight: bold; color: #1a6b3a; }
  .school-addr { font-size: 10pt; color: #444; }
  .cert-title { text-align: center; font-size: 20pt; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; margin: 4mm 0; padding-bottom: 3mm; border-bottom: 2px solid currentColor; color: #1a6b3a; }
  .cert-title.blue { color: #1a3a6b; border-color: #1a3a6b; }
  .body-text { font-size: 12pt; line-height: 2.2; text-align: justify; margin-top: 4mm; }
  .underline { display: inline-block; border-bottom: 1px solid #333; min-width: 120px; font-weight: bold; }
  .table-data { width: 100%; border-collapse: collapse; margin: 4mm 0; font-size: 11pt; }
  .table-data th { background: #1a6b3a; color: #fff; padding: 6px 8px; text-align: left; font-size: 10pt; }
  .table-data th.blue-hd { background: #1a3a6b; }
  .table-data td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
  .table-data tr:last-child td { border-bottom: none; }
  .sig-block { display: flex; justify-content: space-between; margin-top: 14mm; font-size: 11pt; }
  .sig-col { text-align: center; }
  .sig-line { border-top: 1px solid #333; width: 130px; margin: 18mm auto 4px; }
  .sig-label { font-weight: bold; font-size: 11pt; }
  .sig-sub { font-size: 9pt; color: #555; }
  .row-pair { display: flex; gap: 24px; }
  .row-pair .field-block { flex: 1; }
  .field-block { margin-bottom: 4px; }
  .field-label { font-size: 9pt; color: #555; display: block; }
  .field-val { font-weight: bold; font-size: 11pt; border-bottom: 1px solid #aaa; display: block; }
  .stamp-area { text-align: right; font-size: 9pt; color: #888; margin-top: 6mm; }
  @media print { body { margin: 0; } .no-print { display: none; } }
`;

module.exports = { dateToWords, fmt, pronoun, CERT_CSS, numberToWords };
