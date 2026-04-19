import { jsPDF } from "jspdf";

type Line =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; text: string; index: number }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "hr" }
  | { type: "blank" };

function parseMarkdown(md: string): Line[] {
  const out: Line[] = [];
  const rows = md.split("\n");
  let inCode = false;

  for (const raw of rows) {
    if (raw.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push({ type: "code", text: raw });
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      out.push({ type: "blank" });
      continue;
    }
    if (trimmed === "---" || trimmed === "***") {
      out.push({ type: "hr" });
      continue;
    }
    if (trimmed.startsWith("### ")) {
      out.push({ type: "h3", text: trimmed.slice(4) });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      out.push({ type: "h2", text: trimmed.slice(3) });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      out.push({ type: "h1", text: trimmed.slice(2) });
      continue;
    }
    if (trimmed.startsWith("> ")) {
      out.push({ type: "quote", text: trimmed.slice(2) });
      continue;
    }
    if (/^[-*]\s/.test(trimmed)) {
      out.push({ type: "bullet", text: trimmed.slice(2) });
      continue;
    }
    const num = /^(\d+)\.\s(.*)$/.exec(trimmed);
    if (num) {
      out.push({ type: "numbered", index: parseInt(num[1], 10), text: num[2] });
      continue;
    }
    out.push({ type: "p", text: trimmed });
  }

  return out;
}

function stripInlineMarkers(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(\S.*?\S|\S)\*(?=\s|$)/g, "$1$2")
    .replace(/(^|\s)_(\S.*?\S|\S)_(?=\s|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
}

export function downloadMarkdownAsPdf(markdown: string, slug: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 56;
  const marginY = 56;
  const contentW = pageW - marginX * 2;
  let y = marginY;

  const lines = parseMarkdown(markdown);

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - marginY) {
      doc.addPage();
      y = marginY;
    }
  };

  const writeWrapped = (
    text: string,
    opts: {
      font: "helvetica" | "courier";
      style: "normal" | "bold" | "italic";
      size: number;
      color: number;
      lineH: number;
      indent?: number;
      prefix?: string;
      prefixIndent?: number;
      leftRule?: boolean;
    }
  ) => {
    doc.setFont(opts.font, opts.style);
    doc.setFontSize(opts.size);
    doc.setTextColor(opts.color);
    const indent = opts.indent ?? 0;
    const wrapped = doc.splitTextToSize(
      text,
      contentW - indent
    ) as string[];
    ensureSpace(wrapped.length * opts.lineH);
    if (opts.prefix) {
      doc.text(opts.prefix, marginX + (opts.prefixIndent ?? 0), y);
    }
    if (opts.leftRule) {
      doc.setDrawColor(170);
      doc.setLineWidth(1.5);
      doc.line(
        marginX,
        y - opts.lineH + 4,
        marginX,
        y + (wrapped.length - 1) * opts.lineH + 4
      );
    }
    doc.text(wrapped, marginX + indent, y);
    y += wrapped.length * opts.lineH;
  };

  for (const line of lines) {
    switch (line.type) {
      case "blank":
        y += 8;
        break;
      case "hr":
        ensureSpace(16);
        doc.setDrawColor(210);
        doc.setLineWidth(0.5);
        doc.line(marginX, y + 4, pageW - marginX, y + 4);
        y += 16;
        break;
      case "h1":
        y += 6;
        writeWrapped(stripInlineMarkers(line.text), {
          font: "helvetica",
          style: "bold",
          size: 20,
          color: 20,
          lineH: 24,
        });
        y += 6;
        break;
      case "h2":
        y += 10;
        writeWrapped(stripInlineMarkers(line.text), {
          font: "helvetica",
          style: "bold",
          size: 15,
          color: 25,
          lineH: 18,
        });
        y += 4;
        break;
      case "h3":
        y += 6;
        writeWrapped(stripInlineMarkers(line.text), {
          font: "helvetica",
          style: "bold",
          size: 13,
          color: 30,
          lineH: 16,
        });
        y += 2;
        break;
      case "p":
        writeWrapped(stripInlineMarkers(line.text), {
          font: "helvetica",
          style: "normal",
          size: 11,
          color: 40,
          lineH: 15,
        });
        y += 4;
        break;
      case "bullet":
        writeWrapped(stripInlineMarkers(line.text), {
          font: "helvetica",
          style: "normal",
          size: 11,
          color: 40,
          lineH: 15,
          indent: 14,
          prefix: "•",
          prefixIndent: 2,
        });
        y += 2;
        break;
      case "numbered":
        writeWrapped(stripInlineMarkers(line.text), {
          font: "helvetica",
          style: "normal",
          size: 11,
          color: 40,
          lineH: 15,
          indent: 22,
          prefix: `${line.index}.`,
          prefixIndent: 0,
        });
        y += 2;
        break;
      case "quote":
        writeWrapped(stripInlineMarkers(line.text), {
          font: "helvetica",
          style: "italic",
          size: 11,
          color: 100,
          lineH: 15,
          indent: 12,
          leftRule: true,
        });
        y += 4;
        break;
      case "code":
        writeWrapped(line.text, {
          font: "courier",
          style: "normal",
          size: 10,
          color: 60,
          lineH: 13,
          indent: 8,
        });
        break;
    }
  }

  doc.save(`${slug}.pdf`);
}
