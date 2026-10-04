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
  return <View>{items.map((line, index) => <View key={index} style={base.bullet} wrap={false}><Text style={base.bulletDot}>•</Text><Text style={base.bulletText}>{line}</Text></View>)}</View>;
}

function Entries({ section }: { section: Section }) {
  return <View>{section.entries.map((entry, index) => <View key={index} style={base.entry}><View wrap={false} minPresenceAhead={30}><Text style={base.entryHeading}>{entry.heading}</Text>{entry.meta ? <Text style={base.entryMeta}>{entry.meta}</Text> : null}</View><Bullets items={entry.lines} /></View>)}</View>;
}

function ProfessionalEntries({ section }: { section: Section }) {
  return <View>{section.entries.map((entry, index) => <View key={index} wrap={entry.lines.length > 3 || entry.lines.join(" ").length > 900} style={{ marginBottom: 14 }}>
    <View wrap={false} minPresenceAhead={36} style={{ marginBottom: 4 }}>
      {entry.period ? <Text style={{ fontSize: 8.8, color: "#52595b", marginBottom: 3 }}>{entry.period}</Text> : null}
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5 }}>{[entry.company, entry.heading].filter(Boolean).join(" / ")}</Text>
      {entry.location ? <Text style={{ fontSize: 9, marginTop: 2, color: "#52595b" }}>{entry.location}</Text> : null}
    </View>
    <Bullets items={entry.lines} />
  </View>)}</View>;
}

function ProfessionalTitle({ children, light = false }: { children: string; light?: boolean }) {
  return <Text minPresenceAhead={55} style={{ fontFamily: "Helvetica-Bold", fontSize: light ? 10 : 11.5, letterSpacing: 1.3, textTransform: "uppercase", color: light ? "#ffffff" : "#262d2d", borderBottomWidth: 0.7, borderBottomColor: light ? "#727b7b" : "#626c6b", paddingBottom: 7, marginBottom: 11, marginTop: 7 }}>{children}</Text>;
}

function mutedAccent(accent: string) {
  // Dark accents are softened for a quiet header; a pale chosen colour stays intact.
  const channels = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16));
  const mix = Math.max(...channels) < 180 ? 0.62 : 0;
  return `#${channels.map(channel => Math.round(channel + (255 - channel) * mix).toString(16).padStart(2, "0")).join("")}`;
}

/** Independent main flow keeps long careers paginated within generous A4 margins. */
function ProfessionalDesign({ model, accent }: { model: ReturnType<typeof buildModel>; accent: string }) {
  const sidebarLines = [...model.contact, ...model.links, ...model.education.entries.flatMap(entry => [entry.heading, entry.meta, ...entry.lines]), ...model.languages];
  const detailsInSidebar = sidebarLines.reduce((height, line) => height + Math.ceil(line.length / 28) * 14 + 8, 0) + model.education.entries.length * 14 + 140 < 650;
  return <Page size="A4" style={[base.page, { color: "#303637", fontSize: 10, lineHeight: 1.5, paddingLeft: 222, paddingRight: 30, paddingTop: 134, paddingBottom: 42 }]}>
    <View fixed style={{ position: "absolute", top: 24, left: 28, right: 28, height: 91, backgroundColor: mutedAccent(accent) }} />
    <View fixed style={{ position: "absolute", top: 24, height: 794, left: 28, width: 172, backgroundColor: "#353f40" }} />
    <View fixed style={{ position: "absolute", top: 48, left: 222, right: 30 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: model.name.length > 28 ? 19 : 24, lineHeight: 1.1, letterSpacing: 1.8, textTransform: "uppercase" }}>{model.name}</Text>
      <Text style={{ fontSize: 10.5, marginTop: 7 }}>{model.headline}</Text>
    </View>
    <View style={{ position: "absolute", top: 137, left: 43, width: 142, color: "#ffffff", fontSize: 9, lineHeight: 1.5 }}>
      <ProfessionalTitle light>{model.labels.contact}</ProfessionalTitle>
      {[...model.contact, ...model.links].map((line, index) => <Text key={index} style={{ marginBottom: 6 }}>{line}</Text>)}
      {detailsInSidebar && model.education.entries.length ? <View style={{ marginTop: 18 }}><ProfessionalTitle light>{model.education.title}</ProfessionalTitle>{model.education.entries.map((entry, index) => <View key={index} wrap={false} style={{ marginBottom: 13 }}><Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 3 }}>{entry.heading}</Text>{entry.meta ? <Text>{entry.meta}</Text> : null}{entry.lines.map((line, lineIndex) => <Text key={lineIndex}>{line}</Text>)}</View>)}</View> : null}
      {detailsInSidebar && model.languages.length ? <View style={{ marginTop: 14 }}><ProfessionalTitle light>{model.labels.languages}</ProfessionalTitle>{model.languages.map((line, index) => <Text key={index} style={{ marginBottom: 8 }}>{line}</Text>)}</View> : null}
    </View>
    {model.summary ? <View style={{ marginBottom: 14 }}><ProfessionalTitle>{model.labels.profile}</ProfessionalTitle><Text>{model.summary}</Text></View> : null}
    {model.experience.entries.length ? <><ProfessionalTitle>{model.experience.title}</ProfessionalTitle><ProfessionalEntries section={model.experience} /></> : null}
    {model.skills.length ? <><ProfessionalTitle>{model.labels.skills}</ProfessionalTitle><View style={{ flexDirection: "row", flexWrap: "wrap" }}>{model.skills.map((group, index) => <View key={index} wrap={false} style={{ width: "50%", paddingRight: 12, marginBottom: 9 }}><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5 }}>{group.name}</Text>{group.keywords.length ? <Text style={{ fontSize: 9, color: "#52595b" }}>{group.keywords.join(" · ")}</Text> : null}</View>)}</View></> : null}
    {model.extras.map(section => <View key={section.title}><ProfessionalTitle>{section.title}</ProfessionalTitle><Entries section={section} /></View>)}
    {!detailsInSidebar && model.education.entries.length ? <><ProfessionalTitle>{model.education.title}</ProfessionalTitle><Entries section={model.education} /></> : null}
    {!detailsInSidebar && model.languages.length ? <><ProfessionalTitle>{model.labels.languages}</ProfessionalTitle>{model.languages.map((line, index) => <Text key={index}>{line}</Text>)}</> : null}
    <Text fixed style={{ position: "absolute", top: 816, right: 30, fontSize: 8, color: "#667270" }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
  </Page>;
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
    {input.design === "professional" ? <ProfessionalDesign model={model} accent={accent} /> : input.design === "sidebar" ? <SidebarDesign model={model} accent={accent} /> : input.design === "modern" ? <ModernDesign model={model} accent={accent} /> : <MinimalDesign model={model} accent={accent} />}
  </Document>;
}

export async function renderCvPdf(input: CvDesignInput): Promise<Blob> {
  return pdf(<CvDocument {...input} />).toBlob();
}

/** Keeps `Link` in the client graph for designs that add clickable profiles later. */
export const cvDesignInternals = { buildModel, Link };
