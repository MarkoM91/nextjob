/** The NextJOB CV designs on offer; kept apart from the renderer so the studio can list them without loading the PDF engine. */

export type CvDesignId = "sidebar" | "modern" | "minimal";

export const CV_DESIGNS: Array<{ id: CvDesignId; label: string; blurb: string }> = [
  { id: "sidebar", label: "Sidebar", blurb: "Coloured side column for contact and skills, experience on the right." },
  { id: "modern", label: "Modern", blurb: "Bold header band, two-column body." },
  { id: "minimal", label: "Minimal", blurb: "Clean single column with accent rules." },
];

export const CV_ACCENTS: Array<{ id: string; hex: string; label: string }> = [
  { id: "pine", hex: "2a8b68", label: "Pine" }, { id: "navy", hex: "1f3a93", label: "Navy" }, { id: "coral", hex: "d9534f", label: "Coral" },
  { id: "plum", hex: "6b3fa0", label: "Plum" }, { id: "slate", hex: "334155", label: "Slate" }, { id: "teal", hex: "0f766e", label: "Teal" },
];

export function designKey(design: CvDesignId, accentHex: string): string { return `nextjob:${design}:${accentHex}`; }

export function parseDesignKey(value: string | undefined | null): { design: CvDesignId; accent: string } | null {
  const match = value?.match(/^nextjob:(sidebar|modern|minimal):([0-9a-f]{6})$/);
  return match ? { design: match[1] as CvDesignId, accent: match[2] } : null;
}
