"use client";

import { Document, Link, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * NextJOB's own CV designs, rendered in the browser as vector PDFs (selectable text, no
 * rasterising). They read the same tailored résumé data the studio shows, so the PDF
 * always matches what the candidate reviewed.
 */


import { buildCvModel as buildModel, type CvDesignInput, type CvSection as Section } from "./cv-design-model";
export type { CvDesignInput } from "./cv-design-model";

const base = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, lineHeight: 1.45, color: "#1f2937" },
  bold: { fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8.5, color: "#4b5563" },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  bulletDot: { width: 8 },
  bulletText: { flex: 1 },
  entry: { marginBottom: 7 },
  entryHeading: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  entryMeta: { fontSize: 8.5, color: "#4b5563", marginBottom: 2 },
});

function Bullets({ items }: { items: string[] }) {
  return <View>{items.map((line, index) => <View key={index} style={base.bullet}><Text style={base.bulletDot}>•</Text><Text style={base.bulletText}>{line}</Text></View>)}</View>;
}

function Entries({ section }: { section: Section }) {
  return <View>{section.entries.map((entry, index) => <View key={index} style={base.entry} wrap={false}><Text style={base.entryHeading}>{entry.heading}</Text>{entry.meta ? <Text style={base.entryMeta}>{entry.meta}</Text> : null}<Bullets items={entry.lines} /></View>)}</View>;
}

function SectionTitle({ children, color, light = false, spaced = false }: { children: string; color: string; light?: boolean; spaced?: boolean }) {
  return <Text style={{ fontFamily: "Helvetica-Bold", fontSize: spaced ? 9 : 11, color: light ? "#ffffff" : color, letterSpacing: spaced ? 1.4 : 0.2, textTransform: "uppercase", marginBottom: 5, marginTop: 4, paddingBottom: 3, borderBottomWidth: light ? 0 : 1, borderBottomColor: color, borderBottomStyle: "solid" }}>{children}</Text>;
}

function SkillGroups({ groups, light = false }: { groups: ReturnType<typeof buildModel>["skills"]; light?: boolean }) {
  return <View>{groups.map((group, index) => <View key={index} style={{ marginBottom: 4 }}><Text style={[base.bold, { color: light ? "#ffffff" : "#1f2937" }]}>{group.name}</Text>{group.keywords.length ? <Text style={{ color: light ? "rgba(255,255,255,0.88)" : "#374151", fontSize: 8.8 }}>{group.keywords.join(" · ")}</Text> : null}</View>)}</View>;
}

function SidebarDesign({ model, accent }: { model: ReturnType<typeof buildModel>; accent: string }) {
  return <Page size="A4" style={[base.page, { paddingLeft: 0, paddingTop: 0, paddingBottom: 0, paddingRight: 0 }]}>
    <View fixed style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "33%", backgroundColor: accent }} />
    <View style={{ flexDirection: "row" }}>
      <View style={{ width: "33%", padding: 26, paddingRight: 18, color: "#ffffff" }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 21, lineHeight: 1.1, color: "#ffffff", marginBottom: 4 }}>{model.name}</Text>
        <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", marginBottom: 14 }}>{model.headline}</Text>
        <SectionTitle color={accent} light>Contact</SectionTitle>
        {[...model.contact, ...model.links].map((line, index) => <Text key={index} style={{ color: "#ffffff", fontSize: 8.8, marginBottom: 2 }}>{line}</Text>)}
        <View style={{ height: 10 }} />
        <SectionTitle color={accent} light>Skills</SectionTitle>
        <SkillGroups groups={model.skills} light />
        {model.languages.length ? <><View style={{ height: 8 }} /><SectionTitle color={accent} light>Languages</SectionTitle>{model.languages.map((line, index) => <Text key={index} style={{ color: "#ffffff", fontSize: 8.8 }}>{line}</Text>)}</> : null}
      </View>
      <View style={{ width: "67%", padding: 28, paddingLeft: 24 }}>
        {model.summary ? <><SectionTitle color={accent}>Profile</SectionTitle><Text style={{ marginBottom: 8 }}>{model.summary}</Text></> : null}
        <SectionTitle color={accent}>{model.experience.title}</SectionTitle><Entries section={model.experience} />
        <SectionTitle color={accent}>{model.education.title}</SectionTitle><Entries section={model.education} />
        {model.extras.map((section) => <View key={section.title}><SectionTitle color={accent}>{section.title}</SectionTitle><Entries section={section} /></View>)}
      </View>
    </View>
  </Page>;
}

function ModernDesign({ model, accent }: { model: ReturnType<typeof buildModel>; accent: string }) {
  return <Page size="A4" style={[base.page, { padding: 0 }]}>
    <View style={{ backgroundColor: accent, padding: 28, paddingBottom: 22, color: "#ffffff" }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 26, color: "#ffffff", lineHeight: 1.1 }}>{model.name}</Text>
      <Text style={{ fontSize: 11.5, color: "rgba(255,255,255,0.92)", marginTop: 3 }}>{model.headline}</Text>
      <Text style={{ fontSize: 8.8, color: "rgba(255,255,255,0.88)", marginTop: 8 }}>{[...model.contact, ...model.links].join("   ·   ")}</Text>
    </View>
    <View style={{ flexDirection: "row", padding: 26, paddingTop: 18 }}>
      <View style={{ width: "66%", paddingRight: 20 }}>
        {model.summary ? <><SectionTitle color={accent}>Profile</SectionTitle><Text style={{ marginBottom: 8 }}>{model.summary}</Text></> : null}
        <SectionTitle color={accent}>{model.experience.title}</SectionTitle><Entries section={model.experience} />
        {model.extras.map((section) => <View key={section.title}><SectionTitle color={accent}>{section.title}</SectionTitle><Entries section={section} /></View>)}
      </View>
      <View style={{ width: "34%", paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: "#e5e7eb", borderLeftStyle: "solid" }}>
        <SectionTitle color={accent}>Skills</SectionTitle><SkillGroups groups={model.skills} />
        <SectionTitle color={accent}>{model.education.title}</SectionTitle><Entries section={model.education} />
        {model.languages.length ? <><SectionTitle color={accent}>Languages</SectionTitle>{model.languages.map((line, index) => <Text key={index}>{line}</Text>)}</> : null}
      </View>
    </View>
  </Page>;
}

function MinimalDesign({ model, accent }: { model: ReturnType<typeof buildModel>; accent: string }) {
  return <Page size="A4" style={[base.page, { padding: 34, paddingTop: 30 }]}>
    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 24, color: accent, lineHeight: 1.1 }}>{model.name}</Text>
    <Text style={{ fontSize: 11, marginTop: 2 }}>{model.headline}</Text>
    <Text style={[base.small, { marginTop: 4 }]}>{[...model.contact, ...model.links].join("  ·  ")}</Text>
    <View style={{ height: 2, backgroundColor: accent, marginTop: 10, marginBottom: 10 }} />
    {model.summary ? <><SectionTitle color={accent} spaced>Profile</SectionTitle><Text style={{ marginBottom: 8 }}>{model.summary}</Text></> : null}
    <SectionTitle color={accent} spaced>{model.experience.title}</SectionTitle><Entries section={model.experience} />
    <SectionTitle color={accent} spaced>Skills</SectionTitle><SkillGroups groups={model.skills} />
    <View style={{ height: 6 }} />
    <SectionTitle color={accent} spaced>{model.education.title}</SectionTitle><Entries section={model.education} />
    {model.extras.map((section) => <View key={section.title}><SectionTitle color={accent} spaced>{section.title}</SectionTitle><Entries section={section} /></View>)}
    {model.languages.length ? <><SectionTitle color={accent} spaced>Languages</SectionTitle><Text>{model.languages.join("  ·  ")}</Text></> : null}
  </Page>;
}

export function CvDocument(input: CvDesignInput) {
  const model = buildModel(input);
  const accent = `#${input.accent}`;
  const title = `${model.name} — CV`;
  return <Document title={title} author={model.name} creator="NextJOB" producer="NextJOB">
    {input.design === "sidebar" ? <SidebarDesign model={model} accent={accent} /> : input.design === "modern" ? <ModernDesign model={model} accent={accent} /> : <MinimalDesign model={model} accent={accent} />}
  </Document>;
}

export async function renderCvPdf(input: CvDesignInput): Promise<Blob> {
  return pdf(<CvDocument {...input} />).toBlob();
}

/** Keeps `Link` in the client graph for designs that add clickable profiles later. */
export const cvDesignInternals = { buildModel, Link };
