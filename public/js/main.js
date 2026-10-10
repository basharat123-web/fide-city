/* Fide City Roleplay: small progressive-enhancement script.
   No inline scripts are used anywhere, so the Content-Security-Policy can stay strict. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

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

  /* Profile picture (DP) preview and canvas downscaling */
  var dpFile = document.getElementById('dp-file');
  var dpData = document.getElementById('dp-data');
  var dpUrl = document.getElementById('dp-url');
  var dpStatus = document.getElementById('dp-status');

  function updateAvatarPreview(src) {
    var imgView = document.getElementById('avatar-img-view');
    var initView = document.getElementById('avatar-initial-view');
    if (imgView) {
      imgView.src = src;
    } else if (initView && initView.parentElement) {
      var newImg = document.createElement('img');
      newImg.id = 'avatar-img-view';
      newImg.src = src;
      newImg.style.width = '100%';
      newImg.style.height = '100%';
      newImg.style.objectFit = 'cover';
      initView.parentElement.innerHTML = '';
      initView.parentElement.appendChild(newImg);
    }
  }

  if (dpFile && dpData) {
    dpFile.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (dpStatus) dpStatus.textContent = 'Processing image...';
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
          if (dpStatus) dpStatus.textContent = 'Photo ready to save! Click "Save Profile Picture" below.';
        };
        img.onerror = function () {
          if (dpStatus) dpStatus.textContent = 'Could not load image file.';
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (dpUrl) {
    dpUrl.addEventListener('input', function () {
      var val = (dpUrl.value || '').trim();
      if (val && /^https?:\/\//i.test(val)) {
        if (dpData) dpData.value = '';
        updateAvatarPreview(val);
      }
    });
  }
})();
