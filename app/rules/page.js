import content from '../../data/content.js';

export const metadata = { title: 'Server rules' };

export default function RulesPage() {
  return <div className="wrap prose-wrap">
    <h1 className="page-title">Server rules</h1>
    <p className="page-lead">By joining Fide City you agree to follow these rules. Rule numbers are used when staff reference a decision.</p>
    <nav className="toc" aria-label="Rule sections"><ul>{content.rules.map((section, index) => <li key={section.title}><a href={`#rules-${index + 1}`}>{section.title}</a></li>)}</ul></nav>
    {content.rules.map((section, index) => <section className="rules-section" id={`rules-${index + 1}`} key={section.title}><h2>{section.title}</h2><ol className="rule-list">{section.items.map((rule) => <li key={rule}>{rule}</li>)}</ol></section>)}
  </div>;
}
