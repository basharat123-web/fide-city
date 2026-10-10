/* Fide City Roleplay: small progressive-enhancement script.
   No inline scripts are used anywhere, so the Content-Security-Policy can stay strict. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  /* bfcache safety: always reset loader state when page is shown (back/forward navigation) */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      var gl = document.getElementById('fc-global-loader');
      var tl = document.getElementById('top-loader');
      if (gl) gl.classList.remove('is-active');
      if (tl) tl.classList.remove('active', 'complete');
      // Re-enable any loading buttons
      document.querySelectorAll('.btn.is-loading').forEach(function (b) {
        b.classList.remove('is-loading');
        var sp = b.querySelector('.btn-spinner');
        if (sp) sp.remove();
      });
    }
  });

  /* Mobile menu */
  var btn = document.querySelector('[data-menu]');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* Confirm destructive forms */
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  /* Copy-to-clipboard buttons */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy-target]');
    if (!b) return;
    var target = document.querySelector(b.getAttribute('data-copy-target'));
    if (!target) return;
    var text = target.textContent.trim();
    var done = function (ok) {
      var old = b.getAttribute('data-label') || b.textContent;
      b.setAttribute('data-label', old);
      b.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      setTimeout(function () { b.textContent = old; }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      var range = document.createRange();
      range.selectNodeContents(target);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      done(false);
    }
  });

  /* Live server status */
  var pill = document.querySelector('[data-status-pill]');
  var pillText = document.querySelector('[data-status-text]');
  var board = document.querySelector('[data-board]');

  function paint(s) {
    var state = s && s.state ? s.state : 'unknown';
    var label = state === 'online' ? s.players + ' online' : state === 'offline' ? 'City offline' : 'Status unavailable';
    if (pill) { pill.setAttribute('data-state', state); }
    if (pillText) { pillText.textContent = label; }
    if (board) {
      board.setAttribute('data-state', state);
      var st = board.querySelector('[data-board-state]');
      var pl = board.querySelector('[data-board-players]');
      var mx = board.querySelector('[data-board-max]');
      if (st) {
        st.innerHTML = '';
        var dot = document.createElement('span');
        dot.className = 'state-dot';
        dot.setAttribute('aria-hidden', 'true');
        st.appendChild(dot);
        st.appendChild(document.createTextNode(state === 'online' ? 'Online' : state === 'offline' ? 'Offline' : 'Unknown'));
      }
      if (pl) pl.textContent = state === 'online' ? String(s.players) : '0';
      if (mx && s && s.max) mx.textContent = String(s.max);
    }
  }

  function poll() {
    fetch('/api/status', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { paint(s || { state: 'unknown' }); })
      .catch(function () { paint({ state: 'unknown' }); });
  }

  if (pill || board) {
    poll();
    setInterval(function () { if (!document.hidden) poll(); }, 30000);
  }

  /* Professional Futuristic Loading HUD & Top Progress Indicator */
  var topLoader = document.getElementById('top-loader');
  var globalLoader = document.getElementById('fc-global-loader');
  var globalLoaderMsg = document.getElementById('fc-loader-msg');

  function startTopLoader() {
    if (!topLoader) return;
    topLoader.classList.remove('complete');
    topLoader.classList.add('active');
  }

  function finishTopLoader() {
    if (!topLoader) return;
    topLoader.classList.add('complete');
    setTimeout(function () {
      topLoader.classList.remove('active', 'complete');
    }, 400);
  }

  function showGlobalLoader(msg) {
    if (globalLoaderMsg && msg) globalLoaderMsg.textContent = msg;
    if (globalLoader) globalLoader.classList.add('is-active');
    startTopLoader();
  }

  function hideGlobalLoader() {
    if (globalLoader) globalLoader.classList.remove('is-active');
    finishTopLoader();
  }

  window.FC_LOADER = {
    start: startTopLoader,
    finish: finishTopLoader,
    showModal: showGlobalLoader,
    hideModal: hideGlobalLoader
  };

  /* Animated page navigation feedback on internal links */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link || !link.href) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    var rawHref = link.getAttribute('href') || '';
    if (rawHref.startsWith('#')) return;
    try {
      var url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
        startTopLoader();
      }
    } catch (_) {}
  });

  /* Form submit animated loading state */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (e.defaultPrevented) return;
    if (form.hasAttribute('data-no-loader')) return;

    var btn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (btn && !btn.classList.contains('is-loading')) {
      btn.classList.add('is-loading');
      if (btn.tagName === 'BUTTON') {
        var sp = document.createElement('span');
        sp.className = 'btn-spinner';
        sp.setAttribute('aria-hidden', 'true');
        btn.insertBefore(sp, btn.firstChild);
      }
    }
    startTopLoader();

    var action = form.getAttribute('action') || '';
    if (action.indexOf('/account/avatar') !== -1) {
      showGlobalLoader('SAVING PROFILE PICTURE');
    } else if (action.indexOf('/admin') !== -1) {
      showGlobalLoader('UPDATING CITIZEN ROSTER');
    } else if (action.indexOf('/login') !== -1) {
      showGlobalLoader('AUTHENTICATING CITIZEN');
    } else if (action.indexOf('/register') !== -1) {
      showGlobalLoader('INITIALIZING PASSPORT');
    }
  });

  /* Profile picture (DP) preview and canvas downscaling with animated spinner */
  var dpFile = document.getElementById('dp-file');
  var dpData = document.getElementById('dp-data');
  var dpUrl = document.getElementById('dp-url');
  var dpStatus = document.getElementById('dp-status');
  var avatarOverlay = document.getElementById('avatar-loading-overlay');

  function showAvatarSpinner() {
    if (avatarOverlay) avatarOverlay.style.display = 'flex';
  }
  function hideAvatarSpinner() {
    if (avatarOverlay) avatarOverlay.style.display = 'none';
  }

  function updateAvatarPreview(src) {
    var imgView = document.getElementById('avatar-img-view');
    var initView = document.getElementById('avatar-initial-view');
    if (imgView) {
      imgView.src = src;
    } else if (initView && initView.parentElement) {
      var parent = initView.parentElement;
      var newImg = document.createElement('img');
      newImg.id = 'avatar-img-view';
      newImg.src = src;
      newImg.style.width = '100%';
      newImg.style.height = '100%';
      newImg.style.objectFit = 'cover';
      initView.remove();
      if (avatarOverlay && avatarOverlay.parentElement === parent) {
        parent.insertBefore(newImg, avatarOverlay);
      } else {
        parent.appendChild(newImg);
      }
    }
  }

  if (dpFile && dpData) {
    dpFile.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      showAvatarSpinner();
      startTopLoader();
      if (dpStatus) dpStatus.textContent = 'Processing & optimizing photo...';
      var reader = new FileReader();
      reader.onload = function (evt) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var max = 160;
          var w = img.width;
          var h = img.height;
          if (w > h) {
            if (w > max) { h = Math.round((h * max) / w); w = max; }
          } else {
            if (h > max) { w = Math.round((w * max) / h); h = max; }
          }
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          dpData.value = dataUrl;
          if (dpUrl) dpUrl.value = '';
          updateAvatarPreview(dataUrl);
          hideAvatarSpinner();
          finishTopLoader();
          if (dpStatus) dpStatus.textContent = 'Photo ready to save! Click "Save Profile Picture" below.';
        };
        img.onerror = function () {
          hideAvatarSpinner();
          finishTopLoader();
          if (dpStatus) dpStatus.textContent = 'Could not load image file.';
        };
        img.src = evt.target.result;
      };
      reader.onerror = function () {
        hideAvatarSpinner();
        finishTopLoader();
      };
      reader.readAsDataURL(file);
    });
  }

  if (dpUrl) {
    dpUrl.addEventListener('input', function () {
      var val = (dpUrl.value || '').trim();
      if (val && /^https?:\/\//i.test(val)) {
        if (dpData) dpData.value = '';
        showAvatarSpinner();
        var testImg = new Image();
        testImg.onload = function () {
          updateAvatarPreview(val);
          hideAvatarSpinner();
        };
        testImg.onerror = function () {
          hideAvatarSpinner();
        };
        testImg.src = val;
      }
    });
  }
})();
