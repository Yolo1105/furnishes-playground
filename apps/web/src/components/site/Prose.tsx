import type { Section } from "./copy";

/** a page's sections in the home page's language: a caps heading and
    its paragraphs, each section reachable by its id */
export function Prose({ sections }: { sections: Section[] }) {
  return (
    <div className="home-prose">
      {sections.map((s) => (
        <section key={s.id} id={s.id}>
          <h2 className="home-eye">{s.head}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="home-sub">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
