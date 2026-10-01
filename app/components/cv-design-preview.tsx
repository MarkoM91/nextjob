"use client";

import type { CSSProperties } from "react";
import { buildCvModel, type CvDesignInput, type CvSection } from "./cv-design-model";

function Entries({ section }: { section: CvSection }) {
  return <section className="cv-preview-section"><h3>{section.title}</h3>{section.entries.map((entry, index) => <article key={index}>
    <h4>{entry.heading}</h4>{entry.meta && <p className="cv-preview-meta">{entry.meta}</p>}
    {entry.lines.length > 0 && <ul>{entry.lines.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ul>}
  </article>)}</section>;
}

/** Uses the export's content model and layout, without exposing a paid PDF URL. */
export function CvDesignPreview(input: CvDesignInput) {
  const model = buildCvModel(input);
  const identity = <header className="cv-preview-identity"><h2>{model.name}</h2><p>{model.headline}</p></header>;
  const contact = <div className="cv-preview-contact">{[...model.contact, ...model.links].map((line, index) => <p key={index}>{line}</p>)}</div>;
  const skills = <section className="cv-preview-section"><h3>Skills</h3>{model.skills.map((skill, index) => <div className="cv-preview-skill" key={index}><strong>{skill.name}</strong>{skill.keywords.length > 0 && <p>{skill.keywords.join(" · ")}</p>}</div>)}</section>;
  const languages = model.languages.length > 0 && <section className="cv-preview-section"><h3>Languages</h3><p>{model.languages.join(" · ")}</p></section>;
  const summary = model.summary && <section className="cv-preview-section"><h3>Profile</h3><p>{model.summary}</p></section>;
  const career = <>{summary}<Entries section={model.experience} />{model.extras.map((section) => <Entries key={section.title} section={section} />)}</>;
  return <section aria-label={`${input.design} CV preview`} data-cv-design={input.design} className={`cv-design-preview cv-design-${input.design}`} style={{ "--cv-accent": `#${input.accent}` } as CSSProperties}>
    {input.design === "sidebar" ? <><aside className="cv-preview-sidebar">{identity}<section className="cv-preview-section"><h3>Contact</h3>{contact}</section>{skills}{languages}</aside><div className="cv-preview-main">{career}<Entries section={model.education} /></div></>
      : input.design === "modern" ? <><div className="cv-preview-banner">{identity}{contact}</div><div className="cv-preview-columns"><div className="cv-preview-main">{career}</div><aside className="cv-preview-details">{skills}<Entries section={model.education} />{languages}</aside></div></>
        : <div className="cv-preview-main">{identity}{contact}{summary}<Entries section={model.experience} />{skills}<Entries section={model.education} />{model.extras.map((section) => <Entries key={section.title} section={section} />)}{languages}</div>}
  </section>;
}
