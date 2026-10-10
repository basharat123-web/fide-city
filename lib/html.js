'use strict';
// Tiny auto-escaping HTML template tag.
// Anything interpolated into html`...` is escaped unless it is already a SafeHtml
// (i.e. the result of another html`...` call) or created with raw().
// This makes XSS-by-default impossible for normal template use.

class SafeHtml {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

function escape(v) {
  return String(v).replace(/[&<>"'`]/g, (c) => ESC[c]);
}

function render(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return escape(v);
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Mark trusted markup (only use for static strings you wrote yourself). */
const raw = (s) => new SafeHtml(String(s));

module.exports = { html, raw, escape, SafeHtml };
