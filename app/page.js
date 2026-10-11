import content from '../data/content.js';
import { getPublishedStories, isSupabaseConfigured } from '../lib/next/content.js';
import config from '../lib/config.js';

export const revalidate = 60;

export const metadata = {
  title: 'Fide City Roleplay | GTA V roleplay community',
  description: 'Your story. Your city. Join the Fide City Roleplay community in Los Santos.',
};

export default async function HomePage() {
  const stories = isSupabaseConfigured ? await getPublishedStories(3) : [];
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1 id="hero-title">{content.hero.headline}</h1>
            <p className="lead">{content.hero.sub}</p>
            <div className="cta-row">
              <a className="btn btn-primary btn-lg" href="#how-to-play">Start your story</a>
              {config.links.discord && <a className="btn btn-gold btn-lg" href={config.links.discord} rel="noopener noreferrer" target="_blank">Join the Discord</a>}
            </div>
            <div className="dispatch" data-board>
              <div className="readout"><span className="readout-label">City status</span><span className="readout-value" data-board-state>Checking</span></div>
              <div className="readout"><span className="readout-label">Players in the city</span><span className="readout-value"><span data-board-players>0</span><small> / <span data-board-max>{config.server.maxPlayers}</span></small></span></div>
              <div className="plate-wrap">
                <span className="readout-label" id="connect-label">Connect from the F8 console</span>
                <div className="plate" aria-labelledby="connect-label"><span className="plate-top">Fide City</span><code className="plate-text" data-connect>{config.server.connect}</code><button className="plate-copy" type="button" data-copy-target="[data-connect]">Copy</button></div>
              </div>
            </div>
          </div>
          <div className="hero-art"><img className="neon-logo" src="/img/logo-640.webp" width="640" height="640" alt="Fide City Roleplay logo" fetchPriority="high" /></div>
        </div>
      </section>
      <section className="section" aria-labelledby="why-title">
        <div className="wrap">
          <h2 id="why-title" className="section-title">A new life in Los Santos</h2>
          <p className="section-lead">From law enforcement to business and crime to everyday life, create a character, shape your future and play it your way.</p>
          <ul className="highlights">{content.highlights.map((item) => <li key={item.title}><h3>{item.title}</h3><p>{item.text}</p></li>)}</ul>
        </div>
      </section>
      <section className="section section-tint" id="how-to-play" aria-labelledby="how-title">
        <div className="wrap">
          <h2 id="how-title" className="section-title">Four steps to the city</h2>
          <p className="section-lead">No application form, no quiz. Follow these in order and you are in.</p>
          <ol className="steps">{content.steps.map((step) => <li key={step.title}><div className="step-body"><h3>{step.title}</h3><p>{step.text}</p>{step.link && <a className="btn btn-ghost" href={step.link.href} rel="noopener noreferrer" target="_blank">{step.link.label}</a>}{step.discord && config.links.discord && <a className="btn btn-ghost" href={config.links.discord} rel="noopener noreferrer" target="_blank">Join the Discord</a>}{step.connect && <div className="plate plate-small"><code className="plate-text" data-connect-copy>{config.server.connect}</code><button className="plate-copy" type="button" data-copy-target="[data-connect-copy]">Copy</button></div>}</div></li>)}</ol>
        </div>
      </section>
      <section className="section" id="organizations" aria-labelledby="orgs-title">
        <div className="wrap">
          <h2 id="orgs-title" className="section-title">Organizations</h2>
          <p className="section-lead">Join the departments, businesses and crews that keep Los Santos running.</p>
          <div className="org-groups">{content.organizations.map((group) => <section className="org-group" aria-label={group.group} key={group.group}><div className="org-intro"><h3>{group.group}</h3><p>{group.blurb}</p></div><ul className="org-list">{group.items.map((item) => <li key={item.short}><span className="org-tag" aria-hidden="true">{item.short}</span><div><h4>{item.name}</h4><p>{item.text}</p></div></li>)}</ul></section>)}</div>
        </div>
      </section>
      {stories.length > 0 && <section className="section" aria-labelledby="news-title"><div className="wrap"><div className="section-head"><h2 id="news-title" className="section-title">Latest news</h2><a className="more" href="/news">All news</a></div><ul className="news-list">{stories.map((story) => <li key={story.id}><a href={`/news/${story.slug}`}><time dateTime={new Date(Number(story.created_at)).toISOString()}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(Number(story.created_at))}</time><h3>{story.title}</h3><p>{story.summary}</p></a></li>)}</ul></div></section>}
      <section className="section section-tint" id="faq" aria-labelledby="faq-title">
        <div className="wrap narrow"><h2 id="faq-title" className="section-title">Questions players ask</h2><p className="section-lead">Still unsure? Ask on Discord and a real person will answer.</p><div className="faq">{content.faq.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></div>
      </section>
      <section className="section final-cta" aria-labelledby="cta-title"><div className="wrap narrow center"><h2 id="cta-title" className="section-title">Ready to play?</h2><p className="section-lead">Create an account to post on the forum, share your stories and hear about updates first.</p><div className="cta-row center-row"><a className="btn btn-primary btn-lg" href="/register">Create account</a>{config.links.discord && <a className="btn btn-gold btn-lg" href={config.links.discord} rel="noopener noreferrer" target="_blank">Join the Discord</a>}</div></div></section>
    </>
  );
}
