import { useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";
import { useFirestoreState } from "./hooks/useFirestoreState";

type TimeEntry = {
  id: number;
  date: string;
  hours: number;
};

type InvoiceHistory = {
  id: number;
  description: string;
  amount: number;
  filename: string;
  generatedAt: string;
};

type Props = { onNotice: (text: string) => void };

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const today = () => new Date().toISOString().slice(0, 10);
const localDate = (value: string) => new Date(`${value}T12:00:00`);
const formatDate = (value: string, full = true) =>
  localDate(value).toLocaleDateString(
    "en-US",
    full
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric" },
  );
const invoiceName = () => {
  const date = new Date();
  return `JC_${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}${String(date.getFullYear()).slice(-2)}.pdf`;
};

function periodLabel(entries: TimeEntry[]) {
  if (!entries.length) return "No time entries";
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return `${formatDate(sorted[0].date, false)} – ${formatDate(
    sorted[sorted.length - 1].date,
    true,
  )}`;
}

function parseHubstaffText(text: string): TimeEntry[] {
  const clean = text.replace(/\s+/g, " ");
  const results: Array<{ date: string; hours: number }> = [];
  const month =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const pattern = new RegExp(
    `(${month}\\s+\\d{1,2},?\\s+20\\d{2}|\\d{1,2}[\\/-]\\d{1,2}[\\/-]20\\d{2}).{0,100}?(\\d{1,2}):([0-5]\\d)(?::[0-5]\\d)?`,
    "gi",
  );

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clean))) {
    const date = new Date(match[1]);
    if (!Number.isNaN(date.valueOf())) {
      results.push({
        date: date.toISOString().slice(0, 10),
        hours: Number(match[2]) + Number(match[3]) / 60,
      });
    }
  }

  const grouped = new Map<string, number>();
  results.forEach((entry) => {
    grouped.set(entry.date, (grouped.get(entry.date) || 0) + entry.hours);
  });

  return [...grouped]
    .map(([date, hours], index) => ({
      id: Date.now() + index,
      date,
      hours: Math.round(hours * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function TimesheetInvoices({ onNotice }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [billTo, setBillTo] = useState("Alive Church");
  const [hourlyRate, setHourlyRate] = useState(25);
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseStatus, setParseStatus] = useState("Upload a Hubstaff PDF to begin.");
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useFirestoreState<InvoiceHistory[]>(
    "timesheetInvoiceHistory",
    [],
  );

  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    [entries],
  );
  const totalPay = totalHours * Number(hourlyRate || 0);
  const currentPeriod = periodLabel(entries);
  const invoiceDescription = description || (entries.length ? currentPeriod : "");

  const readPdf = async (file?: File) => {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      onNotice("Please choose a PDF file.");
      return;
    }

    setFileName(file.name);
    setParseStatus("Reading time entries…");
    try {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        text += ` ${content.items.map((item) => ("str" in item ? item.str : "")).join(" ")}`;
      }
      const parsed = parseHubstaffText(text);
      if (!parsed.length) {
        setParseStatus("No dated durations found. Add rows manually.");
        onNotice("PDF was read, but no time entries were recognized.");
        return;
      }
      setEntries(parsed);
      setDescription(periodLabel(parsed));
      setParseStatus(`${parsed.length} dated entries found. Review before invoicing.`);
      onNotice("Timesheet generated from the Hubstaff PDF.");
    } catch {
      setParseStatus("This PDF could not be parsed automatically.");
      onNotice("The PDF could not be parsed automatically.");
    }
  };

  const updateEntry = (id: number, values: Partial<TimeEntry>) =>
    setEntries((current) =>
      current
        .map((entry) => (entry.id === id ? { ...entry, ...values } : entry))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );

  const addRow = () =>
    setEntries((current) => [
      ...current,
      { id: Date.now(), date: today(), hours: 8 },
    ]);

  const removeRow = (id: number) =>
    setEntries((current) => current.filter((entry) => entry.id !== id));

  const generateInvoice = () => {
    if (!entries.length) {
      onNotice("Add at least one time entry first.");
      return;
    }

    const doc = new jsPDF();
    const filename = invoiceName();
    const finalDescription = invoiceDescription || currentPeriod;

    doc.setTextColor(7, 62, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(25);
    doc.text("INVOICE", 20, 25);

    doc.setFontSize(12);
    doc.text("JC", 190, 23, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.setFontSize(9);
    doc.text(
      `Issued ${new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`,
      190,
      30,
      { align: "right" },
    );

    doc.setTextColor(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("BILL TO", 20, 49);
    doc.setFontSize(15);
    doc.text(billTo.trim() || "Alive Church", 20, 58);

    doc.setFillColor(7, 62, 39);
    doc.rect(20, 75, 170, 10, "F");
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.text("DESCRIPTION", 24, 81.5);
    doc.text("HOURS", 128, 81.5, { align: "right" });
    doc.text("RATE", 157, 81.5, { align: "right" });
    doc.text("AMOUNT", 186, 81.5, { align: "right" });

    doc.setTextColor(25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(finalDescription, 24, 97);
    doc.text(totalHours.toFixed(2), 128, 97, { align: "right" });
    doc.text(usd.format(hourlyRate), 157, 97, { align: "right" });
    doc.text(usd.format(totalPay), 186, 97, { align: "right" });

    doc.setDrawColor(220);
    doc.line(20, 105, 190, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("TOTAL", 145, 121);
    doc.setTextColor(7, 62, 39);
    doc.setFontSize(16);
    doc.text(usd.format(totalPay), 190, 121, { align: "right" });

    doc.setTextColor(110);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Total hours: ${totalHours.toFixed(2)}  •  Hourly rate: ${usd.format(hourlyRate)}`,
      190,
      134,
      { align: "right" },
    );
    doc.text("Thank you.", 20, 270);
    doc.save(filename);

    setHistory((current) => [
      {
        id: Date.now(),
        description: finalDescription,
        amount: totalPay,
        filename,
        generatedAt: new Date().toISOString(),
      },
      ...current,
    ]);
    onNotice(`${filename} generated.`);
  };

  return (
    <section className="feature-page timesheet-invoices">
      <div className="fp-head">
        <div>
          <h2>Timesheets & Invoices</h2>
          <p>Turn Hubstaff reports into ready-to-send invoices.</p>
        </div>
        <button className="primary" onClick={() => fileInputRef.current?.click()}>
          <Upload />
          Upload Hubstaff PDF
        </button>
      </div>

      <article className="surface timesheet-process">
        <ol className="timesheet-steps" aria-label="Invoice steps">
          <li className={entries.length ? "done" : "active"}><span>1</span>Upload</li>
          <li className={entries.length ? "active" : ""}><span>2</span>Review</li>
          <li><span>3</span>Invoice</li>
        </ol>
        <label
          className={`timesheet-dropzone${dragging ? " dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void readPdf(event.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => void readPdf(event.target.files?.[0])}
          />
          <span>PDF</span>
          <strong>Drag & drop your Hubstaff PDF here</strong>
          <small>or click to browse files</small>
          <em>Your file stays in this browser and is never uploaded.</em>
        </label>
        <div className="timesheet-file-status">
          <span>{fileName ? "✓" : <FileText />}</span>
          <div>
            <b>{fileName || "No file selected"}</b>
            <small>{parseStatus}</small>
          </div>
          <button className="outline" onClick={() => fileInputRef.current?.click()}>
            <RefreshCw />
            Replace
          </button>
        </div>
      </article>

      <div className="timesheet-workspace">
        <section className="surface timesheet-table-card">
          <div className="surface-title">
            <div>
              <b>Time Entries</b>
              <small>
                {entries.length} time {entries.length === 1 ? "entry" : "entries"}
              </small>
            </div>
            <button className="outline" onClick={addRow}>
              <Plus />
              Add row
            </button>
          </div>
          <div className="timesheet-table-wrap">
            <div className="timesheet-table-head">
              <span>Date</span>
              <span>Day</span>
              <span>Time</span>
              <span />
            </div>
            {entries.length ? (
              entries.map((entry) => (
                <div className="timesheet-row" key={entry.id}>
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(event) => updateEntry(entry.id, { date: event.target.value })}
                    aria-label="Work date"
                  />
                  <span>
                    {localDate(entry.date).toLocaleDateString("en-US", {
                      weekday: "long",
                    })}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={entry.hours}
                    onChange={(event) =>
                      updateEntry(entry.id, {
                        hours: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                    aria-label="Hours"
                  />
                  <button
                    className="icon-button"
                    aria-label="Delete row"
                    onClick={() => removeRow(entry.id)}
                  >
                    <Trash2 />
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-card">Upload a Hubstaff PDF or add rows manually.</p>
            )}
            <div className="timesheet-total-row">
              <b>Total</b>
              <strong>{totalHours.toFixed(2)} hrs</strong>
            </div>
          </div>
        </section>

        <aside className="timesheet-right-rail">
          <section className="surface timesheet-summary-card">
            <div className="surface-title">
              <b>Invoice summary</b>
            </div>
            <div className="timesheet-fields">
              <label>
                Bill to
                <input value={billTo} onChange={(event) => setBillTo(event.target.value)} />
              </label>
              <label>
                Description
                <input
                  value={invoiceDescription}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={currentPeriod}
                />
              </label>
            </div>
            <dl>
              <div>
                <dt>Total hours</dt>
                <dd>{totalHours.toFixed(2)} hrs</dd>
              </div>
              <div>
                <dt>Hourly rate</dt>
                <dd>
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={hourlyRate}
                    onChange={(event) => setHourlyRate(Number(event.target.value) || 0)}
                  />
                </dd>
              </div>
              <div className="total">
                <dt>Total pay</dt>
                <dd>{usd.format(totalPay)}</dd>
              </div>
            </dl>
            <button className="primary" onClick={generateInvoice}>
              <Download />
              Generate invoice PDF
            </button>
            <p>
              Filename: <b>{invoiceName()}</b>
            </p>
          </section>

          <section className="surface timesheet-recent-card">
            <div className="surface-title">
              <b>Recent invoices</b>
            </div>
            {history.length ? (
              history.slice(0, 8).map((item) => (
                <div className="timesheet-history-item" key={item.id}>
                  <span>
                    <b>{item.description}</b>
                    <small>{item.filename}</small>
                  </span>
                  <strong>{usd.format(item.amount)}</strong>
                </div>
              ))
            ) : (
              <p className="empty-card">Generated invoices will appear here.</p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
