export function Card({ id, title, desc, children, icon }) {
  return (
    <section id={id} className="st-card">
      <div className="st-card-head">{icon}<div><h3>{title}</h3>{desc && <p>{desc}</p>}</div></div>
      <div className="st-card-body">{children}</div>
    </section>
  );
}
