/* Fide City Roleplay: small progressive-enhancement script.
   No inline scripts are used anywhere, so the Content-Security-Policy can stay strict. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  /* Loader reset utility: ensure stuck overlays never block the user */
  function resetAllLoaders() {
    var gl = document.getElementById('fc-global-loader');
    var tl = document.getElementById('top-loader');
    var ao = document.getElementById('avatar-loading-overlay');
    if (gl) gl.classList.remove('is-active');
    if (tl) tl.classList.remove('active', 'complete');
    if (ao) {
      ao.classList.remove('is-active');
      ao.style.display = 'none';
    }
    document.querySelectorAll('.btn.is-loading').forEach(function (b) {
      b.classList.remove('is-loading');
      var sp = b.querySelector('.btn-spinner');
      if (sp) sp.remove();
    });
  }
  resetAllLoaders();
  window.addEventListener('DOMContentLoaded', resetAllLoaders);
  window.addEventListener('pageshow', resetAllLoaders);

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

  var topLoaderTimer = null;
  function startTopLoader() {
    if (!topLoader) return;
    topLoader.classList.remove('complete');
    topLoader.classList.add('active');
    if (topLoaderTimer) clearTimeout(topLoaderTimer);
    topLoaderTimer = setTimeout(function () {
      finishTopLoader();
    }, 4000);
  }

  function finishTopLoader() {
    if (!topLoader) return;
    if (topLoaderTimer) { clearTimeout(topLoaderTimer); topLoaderTimer = null; }
    topLoader.classList.add('complete');
    setTimeout(function () {
      topLoader.classList.remove('active', 'complete');
    }, 400);
  }

  var globalLoaderTimer = null;
  function showGlobalLoader(msg) {
    if (globalLoaderMsg && msg) globalLoaderMsg.textContent = msg;
    if (globalLoader) globalLoader.classList.add('is-active');
    startTopLoader();
    if (globalLoaderTimer) clearTimeout(globalLoaderTimer);
    globalLoaderTimer = setTimeout(function () {
      hideGlobalLoader();
    }, 6000);
  }

  function hideGlobalLoader() {
    if (globalLoader) globalLoader.classList.remove('is-active');
    if (globalLoaderTimer) { clearTimeout(globalLoaderTimer); globalLoaderTimer = null; }
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
    if (avatarOverlay) {
      avatarOverlay.classList.add('is-active');
      avatarOverlay.style.display = 'flex';
    }
  }
  function hideAvatarSpinner() {
    if (avatarOverlay) {
      avatarOverlay.classList.remove('is-active');
      avatarOverlay.style.display = 'none';
    }
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

  /* Forum UI interactions: Collapse sections, search box toggle, subnav dropdowns */
  document.addEventListener('click', function (e) {
    var collapseBtn = e.target.closest('[data-toggle-target]');
    if (collapseBtn) {
      var targetId = collapseBtn.getAttribute('data-toggle-target');
      var section = document.getElementById(targetId);
      if (section) {
        section.classList.toggle('is-collapsed');
      }
      return;
    }

    var toggleAll = e.target.closest('#toggle-all-sections');
    if (toggleAll) {
      var allSections = document.querySelectorAll('.fc-category-section');
      var anyExpanded = false;
      allSections.forEach(function (s) {
        if (!s.classList.contains('is-collapsed')) anyExpanded = true;
      });
      allSections.forEach(function (s) {
        if (anyExpanded) s.classList.add('is-collapsed');
        else s.classList.remove('is-collapsed');
      });
      return;
    }

    var searchToggle = e.target.closest('#btn-toggle-search');
    if (searchToggle) {
      e.preventDefault();
      var sBox = document.getElementById('forum-search-box');
      if (sBox) {
        var isHidden = sBox.style.display === 'none' || !sBox.style.display;
        sBox.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          var input = sBox.querySelector('input');
          if (input) input.focus();
        }
      }
      return;
    }

    var dropBtn = e.target.closest('.dropdown-toggle');
    if (dropBtn) {
      var dropWrap = dropBtn.closest('.subnav-dropdown');
      if (dropWrap) {
        dropWrap.classList.toggle('is-open');
        dropBtn.setAttribute('aria-expanded', dropWrap.classList.contains('is-open') ? 'true' : 'false');
      }
    } else {
      document.querySelectorAll('.subnav-dropdown.is-open').forEach(function (d) {
        d.classList.remove('is-open');
      });
    }
  });

  /* ---------------------------------------------------------
     Real-Time Forum Prefix & Status System (Grand RP Style)
     --------------------------------------------------------- */
  function renderPrefixBadgeHtml(status) {
    if (!status) return '<span class="tag-no-prefix">(No prefix)</span>';
    var s = String(status).trim();
    var lower = s.toLowerCase();
    if (lower === 'important') return '<span class="forum-tag tag-important">IMPORTANT</span>';
    if (lower === 'approved') return '<span class="forum-tag tag-approved">Approved</span>';
    if (lower === 'rejected') return '<span class="forum-tag tag-rejected">Rejected</span>';
    if (lower === 'reviewed') return '<span class="forum-tag tag-reviewed">Reviewed</span>';
    if (lower === 'on consideration' || lower === 'consideration') return '<span class="forum-tag tag-consideration">On Consideration</span>';
    if (lower === 'pending review' || lower === 'pending') return '<span class="forum-tag tag-pending">Pending Review</span>';
    return '<span class="forum-tag tag-default">' + s + '</span>';
  }

  function showPrefixToast(msg, isError) {
    var oldToast = document.querySelector('.fc-prefix-toast');
    if (oldToast) oldToast.remove();
    var t = document.createElement('div');
    t.className = 'fc-prefix-toast' + (isError ? ' is-error' : '');
    t.innerHTML = (isError ? '⚠️ ' : '✅ ') + msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 350);
    }, 2800);
  }

  // Handle prefix button click on thread page and new thread view
  document.addEventListener('click', function (e) {
    var prefixToggle = e.target.closest('#btn-prefix-badge-toggle');
    var prefixCard = document.getElementById('prefix-dropdown-card');
    if (prefixToggle && prefixCard) {
      e.stopPropagation();
      var isShown = prefixCard.style.display !== 'none';
      prefixCard.style.display = isShown ? 'none' : 'block';
      prefixToggle.setAttribute('aria-expanded', isShown ? 'false' : 'true');
      return;
    }

    var prefixOpt = e.target.closest('#prefix-dropdown-card .prefix-card-btn');
    if (prefixOpt) {
      e.preventDefault();
      var ctrl = document.getElementById('thread-prefix-ctrl');
      if (!ctrl) return;
      var threadId = ctrl.getAttribute('data-thread-id');
      var csrf = ctrl.getAttribute('data-csrf');
      var newStatus = prefixOpt.getAttribute('data-status') || '';
      var titleBadge = document.getElementById('thread-title-badge');

      if (prefixCard) prefixCard.style.display = 'none';
      if (prefixToggle) prefixToggle.setAttribute('aria-expanded', 'false');

      // Instant optimistic UI update (real-time zero lag)
      if (titleBadge) {
        titleBadge.innerHTML = renderPrefixBadgeHtml(newStatus);
      }

      // Sync moderation select if present
      var modSelect = document.querySelector('.status-mod-select');
      if (modSelect) {
        modSelect.value = newStatus;
      }

      // Send async request to persist
      fetch('/forum/thread/' + encodeURIComponent(threadId) + '/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({ _csrf: csrf, status: newStatus }).toString(),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Status update failed');
          return res.json().catch(function () { return { ok: true }; });
        })
        .then(function () {
          showPrefixToast(newStatus ? 'Prefix updated to ' + newStatus : 'Prefix removed', false);
        })
        .catch(function (err) {
          showPrefixToast('Error saving prefix: ' + (err.message || 'Network error'), true);
        });
      return;
    }

    // Close thread prefix menu if clicked outside
    if (prefixCard && prefixCard.style.display !== 'none' && !e.target.closest('#thread-prefix-ctrl')) {
      prefixCard.style.display = 'none';
      var pToggle = document.getElementById('btn-prefix-badge-toggle');
      if (pToggle) pToggle.setAttribute('aria-expanded', 'false');
    }

    // New thread prefix selector
    var newThreadToggle = e.target.closest('#btn-new-thread-prefix');
    var newThreadCard = document.getElementById('new-thread-prefix-card');
    if (newThreadToggle && newThreadCard) {
      e.stopPropagation();
      var isNewShown = newThreadCard.style.display !== 'none';
      newThreadCard.style.display = isNewShown ? 'none' : 'block';
      newThreadToggle.setAttribute('aria-expanded', isNewShown ? 'false' : 'true');
      return;
    }

    var newThreadOpt = e.target.closest('#new-thread-prefix-card .prefix-card-btn');
    if (newThreadOpt) {
      e.preventDefault();
      var chosen = newThreadOpt.getAttribute('data-new-status') || '';
      var hiddenInput = document.getElementById('new-thread-status-input');
      var displaySpan = document.getElementById('new-thread-prefix-display');
      if (hiddenInput) hiddenInput.value = chosen;
      if (displaySpan) displaySpan.innerHTML = renderPrefixBadgeHtml(chosen);
      if (newThreadCard) newThreadCard.style.display = 'none';
      if (newThreadToggle) newThreadToggle.setAttribute('aria-expanded', 'false');
      return;
    }

    // Close new thread prefix card if clicked outside
    if (newThreadCard && newThreadCard.style.display !== 'none' && !e.target.closest('#new-thread-prefix-wrap')) {
      newThreadCard.style.display = 'none';
      if (newThreadToggle) newThreadToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Background real-time polling: Keep status live if multiple admins are viewing thread
  var threadCtrl = document.getElementById('thread-prefix-ctrl');
  if (threadCtrl) {
    var tId = threadCtrl.getAttribute('data-thread-id');
    if (tId) {
      setInterval(function () {
        if (document.hidden) return;
        fetch('/forum/thread/' + encodeURIComponent(tId) + '/status-check', {
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.ok) {
              var badge = document.getElementById('thread-title-badge');
              if (badge) {
                var currentHtml = badge.innerHTML;
                var updatedHtml = renderPrefixBadgeHtml(data.status);
                var pCard = document.getElementById('prefix-dropdown-card');
                var isMenuOpen = pCard && pCard.style.display !== 'none';
                if (currentHtml !== updatedHtml && !isMenuOpen) {
                  badge.innerHTML = updatedHtml;
                }
              }
            }
          })
          .catch(function () {});
      }, 10000);
    }
  }
})();
