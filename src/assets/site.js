(function(){
  var hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if(hasFinePointer){
    var heart = document.getElementById('cursorHeart');

    if(heart){
      var mouse = {x: window.innerWidth/2, y: window.innerHeight/2};
      var heartPos = {x: mouse.x, y: mouse.y};

      window.addEventListener('mousemove', function(e){
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      });

      window.addEventListener('mousedown', function(){
        heart.classList.add('clicked');
      });
      window.addEventListener('mouseup', function(){
        heart.classList.remove('clicked');
      });

      var hoverTargets = 'a, button, .cta';
      document.addEventListener('mouseover', function(e){
        if(e.target.closest(hoverTargets)) heart.classList.add('active');
      });
      document.addEventListener('mouseout', function(e){
        if(e.target.closest(hoverTargets)) heart.classList.remove('active');
      });

      function lerp(a,b,t){ return a + (b-a)*t; }

      function tick(){
        heartPos.x = lerp(heartPos.x, mouse.x, 0.35);
        heartPos.y = lerp(heartPos.y, mouse.y, 0.35);
        heart.style.transform = 'translate(' + heartPos.x + 'px,' + heartPos.y + 'px)';

        requestAnimationFrame(tick);
      }
      tick();
    }
  }

  // ---------- subscribe forms: save the email so it can be added to Substack ----------
  function wireSubscribeForm(form){
    if(!form) return;
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var email = input ? input.value.trim() : '';
      if(!email) return;
      var page = (location.pathname.split('/').pop() || 'home').replace('.html','') || 'home';
      form.classList.add('submitted');
      try {
        fetch('/.netlify/functions/subscribe', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email: email, source: page })
        }).catch(function(){});
      } catch(err) {}
    });
  }
  document.querySelectorAll('.subscribe-form').forEach(wireSubscribeForm);

  // ---------- letter card eases in as the reader reaches the end of a post ----------
  (function(){
    var cards = document.querySelectorAll('.letter-card');
    if(!cards.length || !('IntersectionObserver' in window)) return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.remove('lc-pending'); io.unobserve(en.target); }
      });
    }, { threshold: 0.2 });
    cards.forEach(function(c){
      var r = c.getBoundingClientRect();
      if(r.top > window.innerHeight){ c.classList.add('lc-pending'); io.observe(c); }
    });
  })();

  // ---------- paid-member mailing address form (/mail) ----------
  (function(){
    var form = document.getElementById('addressForm');
    if(!form) return;
    var err = document.getElementById('addressError');
    var done = document.getElementById('addressDone');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      err.textContent = '';
      var data = {};
      Array.prototype.forEach.call(form.elements, function(el){ if(el.name) data[el.name] = el.value; });
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending\u2026';
      fetch('/.netlify/functions/mail-address', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
        .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { ok:r.ok, j:j }; }); })
        .then(function(res){
          if(res.ok){ form.hidden = true; done.hidden = false; window.scrollTo({ top: 0, behavior:'smooth' }); }
          else { err.textContent = (res.j && res.j.error) || 'Something went wrong. Please try again.'; btn.disabled = false; btn.textContent = label; }
        })
        .catch(function(){ err.textContent = 'Something went wrong. Please try again, or message me through the footer.'; btn.disabled = false; btn.textContent = label; });
    });
  })();

  // ---------- nav solidifies on scroll ----------
  var headerEl = document.querySelector('header');
  if(headerEl){
    function onScroll(){
      if(window.scrollY > 60){
        headerEl.classList.add('scrolled');
      } else {
        headerEl.classList.remove('scrolled');
      }
    }
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();
  }

  // ---------- testimonial rotation (only runs if present on the page) ----------
  var testimonials = [
    { quote: "I love starting my Thursdays by reading last night's latest episode of What Sheridan Said. I feel like I'm right there with Sheridan, and we are best friends.", cite: "Ashlee H, WA" },
    { quote: "Sheridan lures you with her web of words like a gifted black widow. By the time you notice the spell, you're already completely captivated by her world.", cite: "Mark C, TN" },
    { quote: "What Sheridan Said is my favorite email newsletter. Every time I tune in, I'm pleasantly shocked, surprised, or taken on a beautiful moral lesson through her storytelling.", cite: "Nick V, TX" }
  ];
  var tIndex = 0;
  var quoteEl = document.getElementById('testimonialQuote');
  var citeEl = document.getElementById('testimonialCite');
  if(quoteEl && citeEl && testimonials.length > 1){
    setInterval(function(){
      tIndex = (tIndex + 1) % testimonials.length;
      quoteEl.style.opacity = 0;
      citeEl.style.opacity = 0;
      setTimeout(function(){
        quoteEl.textContent = '\u201C' + testimonials[tIndex].quote + '\u201D';
        citeEl.textContent = testimonials[tIndex].cite;
        quoteEl.style.opacity = 1;
        citeEl.style.opacity = 1;
      }, 400);
    }, 6000);
  }

  // ---------- homepage: "sure you don't want to subscribe first?" nudge on the thread buttons ----------
  (function(){
    var threadsBox = document.getElementById('homeThreads');
    var nudge = document.getElementById('threadNudge');
    var nudgeText = document.getElementById('threadNudgeText');
    var nudgeGo = document.getElementById('threadNudgeGo');
    if(!threadsBox || !nudge) return;
    var LABELS = { 'love-interest': 'Love Interest', 'heroine-arc': 'The Heroine Arc', 'b-roll': 'B-Roll' };
    var armed = null;
    function reset(){
      armed = null; nudge.style.display = 'none';
      threadsBox.querySelectorAll('.thread-link').forEach(function(b){ b.classList.remove('armed'); });
    }
    threadsBox.querySelectorAll('.thread-link').forEach(function(btn){
      btn.addEventListener('click', function(){
        var thread = btn.getAttribute('data-thread');
        if(armed === thread){
          window.location.href = 'archive.html?thread=' + encodeURIComponent(thread);
          return;
        }
        reset();
        armed = thread; btn.classList.add('armed');
        nudgeText.textContent = 'Sure you don\u2019t want to subscribe first?';
        nudgeGo.textContent = 'Take me to ' + LABELS[thread] + ' \u2192';
        nudge.style.display = 'flex';
      });
    });
    nudgeGo.addEventListener('click', function(){
      if(armed) window.location.href = 'archive.html?thread=' + encodeURIComponent(armed);
    });
  })();

  // ---------- sliders (fixed-count rows with arrow controls) ----------
  document.querySelectorAll('.slider-wrap').forEach(function(wrap){
    var row = wrap.querySelector('.row');
    var leftBtn = wrap.querySelector('.slider-arrow.left');
    var rightBtn = wrap.querySelector('.slider-arrow.right');
    if(!row) return;

    function maxScroll(){ return Math.max(0, row.scrollWidth - row.clientWidth); }

    // how far one "page" is: as many whole cards as fit in view (at least one)
    function pageStep(){
      var cards = row.children;
      if(cards.length < 2) return row.clientWidth;
      var step = cards[1].offsetLeft - cards[0].offsetLeft;
      if(step <= 0) return row.clientWidth;
      var gap = step - cards[0].offsetWidth;
      var count = Math.max(1, Math.floor((row.clientWidth + gap + 2) / step));
      return step * count;
    }

    function go(dir){
      var target = row.scrollLeft + dir * pageStep();
      target = Math.min(maxScroll(), Math.max(0, target));
      row.scrollTo({ left: target, behavior: 'smooth' });
    }

    function sync(){
      var x = row.scrollLeft, m = maxScroll();
      if(leftBtn){ leftBtn.disabled = x <= 8; leftBtn.classList.toggle('is-off', x <= 8); }
      if(rightBtn){ rightBtn.disabled = x >= m - 8; rightBtn.classList.toggle('is-off', x >= m - 8); }
    }

    if(leftBtn) leftBtn.addEventListener('click', function(){ go(-1); });
    if(rightBtn) rightBtn.addEventListener('click', function(){ go(1); });
    row.addEventListener('scroll', sync, { passive:true });
    window.addEventListener('resize', sync);
    sync();
  });

  // ---------- archive: thread filter, season filter, sort, and pagination ----------
  var archiveGrid = document.getElementById('archiveGrid');
  if(archiveGrid){
    var sortBtn = document.getElementById('sortToggle');
    var paginationEl = document.getElementById('pagination');
    var cards = Array.prototype.slice.call(archiveGrid.querySelectorAll('.card'));
    var PAGE_SIZE = 20;

    var params = new URLSearchParams(window.location.search);
    var urlThread = params.get('thread');
    var VALID_THREADS = ['love-interest', 'heroine-arc', 'b-roll'];
    var state = { thread: (urlThread && VALID_THREADS.indexOf(urlThread) > -1) ? urlThread : 'all', season: 'all', sort: 'desc', page: 1 };
    if(state.thread !== 'all'){
      document.querySelectorAll('.filter-tabs [data-thread]').forEach(function(b){
        b.classList.toggle('active', b.getAttribute('data-thread') === state.thread);
      });
    }

    function sortKey(card){
      return parseInt(card.getAttribute('data-season'), 10) * 1000 + parseInt(card.getAttribute('data-episode'), 10);
    }

    function render(){
      // sort
      var sorted = cards.slice().sort(function(a, b){
        return state.sort === 'desc' ? sortKey(b) - sortKey(a) : sortKey(a) - sortKey(b);
      });
      sorted.forEach(function(card){ archiveGrid.appendChild(card); });

      // filter
      var visible = sorted.filter(function(card){
        var matchesThread = state.thread === 'all' || card.getAttribute('data-thread') === state.thread;
        var matchesSeason = state.season === 'all' || card.getAttribute('data-season') === state.season;
        return matchesThread && matchesSeason;
      });

      // paginate
      var totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
      if(state.page > totalPages) state.page = totalPages;
      var start = (state.page - 1) * PAGE_SIZE;
      var end = start + PAGE_SIZE;
      var visibleSet = new Set(visible.slice(start, end));

      sorted.forEach(function(card){
        card.classList.toggle('is-hidden', !visibleSet.has(card));
      });

      renderPagination(totalPages);
    }

    function renderPagination(totalPages){
      if(!paginationEl) return;
      paginationEl.innerHTML = '';
      if(totalPages <= 1) return;

      var prev = document.createElement('button');
      prev.textContent = 'Prev';
      prev.disabled = state.page === 1;
      prev.addEventListener('click', function(){ state.page--; render(); window.scrollTo({top: archiveGrid.offsetTop - 100, behavior:'smooth'}); });
      paginationEl.appendChild(prev);

      for(var i = 1; i <= totalPages; i++){
        (function(pageNum){
          var btn = document.createElement('button');
          btn.textContent = pageNum;
          if(pageNum === state.page) btn.classList.add('active');
          btn.addEventListener('click', function(){ state.page = pageNum; render(); window.scrollTo({top: archiveGrid.offsetTop - 100, behavior:'smooth'}); });
          paginationEl.appendChild(btn);
        })(i);
      }

      var next = document.createElement('button');
      next.textContent = 'Next';
      next.disabled = state.page === totalPages;
      next.addEventListener('click', function(){ state.page++; render(); window.scrollTo({top: archiveGrid.offsetTop - 100, behavior:'smooth'}); });
      paginationEl.appendChild(next);
    }

    document.querySelectorAll('.filter-tabs [data-thread]').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.filter-tabs [data-thread]').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        state.thread = btn.getAttribute('data-thread');
        state.page = 1;
        render();
      });
    });

    document.querySelectorAll('.filter-tabs [data-season]').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('.filter-tabs [data-season]').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        state.season = btn.getAttribute('data-season');
        state.page = 1;
        render();
      });
    });

    if(sortBtn){
      sortBtn.addEventListener('click', function(){
        state.sort = state.sort === 'desc' ? 'asc' : 'desc';
        sortBtn.textContent = state.sort === 'desc' ? 'Newest First' : 'Oldest First';
        state.page = 1;
        render();
      });
    }

    render();
  }
})();
