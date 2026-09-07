import type { CandidateProfile, GeneratedApplication, Job } from "./domain";

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function companyName(job: Job): string { return job.company.replace(/\s+\(fictional\)$/i, ""); }

/** Selected bullets belong to one experience each; an experience nothing was picked from keeps its own verified bullets. */
function experienceBullets(experience: CandidateProfile["experiences"][number], application: GeneratedApplication): string[] {
  const selectedIds = new Set(application.cvBullets.flatMap((bullet) => bullet.sourceFactIds));
  const selected = experience.bullets.filter((bullet) => selectedIds.has(bullet.id));
  return (selected.length ? selected : experience.bullets).map((bullet) => bullet.text);
}

export function applicationPlainText(profile: CandidateProfile, job: Job, application: GeneratedApplication): string {
  return [
    profile.fullName,
    `${profile.location} | ${profile.email} | ${profile.phone}`,
    "",
    "PROFESSIONAL SUMMARY",
    application.summary,
    "",
    "WORK EXPERIENCE",
    ...profile.experiences.flatMap((experience) => [
      `${experience.role} — ${experience.company}`,
      `${experience.startDate} — ${experience.endDate ?? "Present"}`,
      ...experienceBullets(experience, application).map((text) => `• ${text}`),
      "",
    ]),
    "SKILLS",
    profile.skills.join(", "),
    "",
    "EDUCATION",
    profile.education.join("\n"),
    "",
    "LANGUAGES",
    profile.languages.join(", "),
    "",
    `Tailored for: ${job.title} — ${companyName(job)}`,
    `${application.ats.label}: ${application.ats.overallScore}/100`,
  ].join("\n");
}

export function coverLetterText(profile: CandidateProfile, job: Job, application: GeneratedApplication): string {
  return [profile.fullName, `${profile.location} | ${profile.email} | ${profile.phone}`, "", `${job.title} — ${companyName(job)}`, "", application.coverLetter].join("\n");
}

export function emailText(profile: CandidateProfile, job: Job, application: GeneratedApplication): string {
  return [`Subject: ${application.email.subject}`, "", application.email.body, "", `Prepared for: ${job.title} — ${companyName(job)} · ${profile.fullName}`].join("\n");
}

export function interviewPrepText(profile: CandidateProfile, job: Job, application: GeneratedApplication): string {
  const section = (title: string, items: string[]) => items.length ? [title, ...items.map((item) => `• ${item}`), ""] : [];
  return [
    `INTERVIEW PREPARATION — ${job.title} at ${companyName(job)}`,
    `Prepared for ${profile.fullName} from verified experience only.`,
    "",
    ...section("LIKELY QUESTIONS", application.interview.likelyQuestions),
    ...section("POSSIBLE GAPS TO ADDRESS HONESTLY", application.interview.gapQuestions),
    ...section("STAR STORY PROMPTS", application.interview.starPrompts),
    ...section("QUESTIONS TO ASK", application.interview.questionsToAsk),
    ...section("RESEARCH CHECKLIST", application.interview.researchChecklist),
  ].join("\n");
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255); }
function u32(value: number): Uint8Array { return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }
function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function zipStore(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data]);
    locals.push(local);
    centrals.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  }
  const central = concat(centrals);
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]);
  return concat([...locals, central, end]);
}

export function textToDocx(text: string, meta: { title: string; author: string; description?: string }): Uint8Array {
  const paragraphs = text.split("\n").map((line) => `<w:p><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`).join("");
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: "word/document.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>` },
    { name: "word/_rels/document.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>` },
    { name: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${xml(meta.title)}</dc:title><dc:creator>${xml(meta.author)}</dc:creator><dc:description>${xml(meta.description ?? "Factual document generated by NextJOB")}</dc:description><dcterms:created>${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
  ];
  return zipStore(files);
}

export function generateDocx(profile: CandidateProfile, job: Job, application: GeneratedApplication): Uint8Array {
  return textToDocx(applicationPlainText(profile, job, application), { title: `NextJOB tailored CV — ${job.title}`, author: profile.fullName, description: "ATS-compatible, factual CV generated by NextJOB" });
}

/** Typographic characters Helvetica can show through WinAnsi; anything else outside Latin-1 becomes "?". */
const WIN_ANSI_EXTRAS: Record<string, number> = { "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99 };

function pdfEscape(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 63;
    if (char === "\\" || char === "(" || char === ")") output += `\\${char}`;
    else if (code >= 0x20 && code <= 0x7e) output += char;
    else if (code >= 0xa0 && code <= 0xff) output += `\\${code.toString(8).padStart(3, "0")}`;
    else if (char in WIN_ANSI_EXTRAS) output += `\\${WIN_ANSI_EXTRAS[char].toString(8).padStart(3, "0")}`;
    else output += "?";
  }
  return output;
}

function wrapLine(line: string, width = 92): string[] {
  if (line.length <= width) return [line];
  const lines: string[] = [];
  let current = "";
  for (const word of line.split(" ")) {
    if (current && `${current} ${word}`.length > width) { lines.push(current); current = word; }
    else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}

const LINES_PER_PAGE = 58;

/** Selectable-text PDF with as many A4 pages as the text needs. */
export function textToPdf(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const lines = text.split("\n").flatMap((line) => wrapLine(line));
  const pages: string[][] = [];
  for (let start = 0; start < Math.max(1, lines.length); start += LINES_PER_PAGE) pages.push(lines.slice(start, start + LINES_PER_PAGE));
  // Object numbers are 1-based positions in this array; the page tree is filled in once its kids exist.
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"];
  const pageIds: number[] = [];
  for (const page of pages) {
    const commands = ["BT", "/F1 10 Tf", "50 790 Td", "13 TL", ...page.map((line, index) => `${index === 0 ? "" : "T* "}(${pdfEscape(line)}) Tj`), "ET"].join("\n");
    const contentId = objects.push(`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}\nendstream`);
    pageIds.push(objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) { offsets.push(encoder.encode(body).length); body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`; }
  const xref = encoder.encode(body).length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(body);
}

export function generatePdf(profile: CandidateProfile, job: Job, application: GeneratedApplication): Uint8Array {
  return textToPdf(applicationPlainText(profile, job, application));
}
