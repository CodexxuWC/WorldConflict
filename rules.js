(() => {
  // Insert current year
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Print button
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Build TOC from sections (h3 inside .section)
  const tocList = document.getElementById('tocList');
  const content = document.getElementById('rulesContent');
  if (tocList && content) {
    const sections = Array.from(content.querySelectorAll('.section'));
    sections.forEach((sec, index) => {
      const h3 = sec.querySelector('h3');
      if (!h3) return;
      // ensure id exists
      if (!sec.id) {
        sec.id = 'section-' + (index + 1);
      }
      const title = h3.textContent.trim();
      const a = document.createElement('a');
      a.href = '#' + sec.id;
      a.textContent = title;
      a.addEventListener('click', (e) => {
        // smooth scroll + focus
        e.preventDefault();
        const el = document.getElementById(sec.id);
        if (el) {
          window.history.replaceState(null, '', '#' + sec.id);
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.setAttribute('tabindex', '-1');
          el.focus({ preventScroll: true });
        }
      });
      tocList.appendChild(a);
    });
  }

  // Lightweight search/filter for the rules (client-side)
  const searchInput = document.getElementById('rulesSearch');
  if (searchInput && content) {
    const sections = Array.from(content.querySelectorAll('.section'));
    let lastTimer = null;

    function normalizeText(s) {
      return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    }

    searchInput.addEventListener('input', (e) => {
      const q = normalizeText(e.target.value.trim());
      if (lastTimer) clearTimeout(lastTimer);
      lastTimer = setTimeout(() => {
        if (!q) {
          sections.forEach(s => { s.style.display = ''; });
          return;
        }
        sections.forEach(s => {
          const text = normalizeText(s.textContent || '');
          s.style.display = text.includes(q) ? '' : 'none';
        });
      }, 160);
    });
  }

  // Accessibility: allow keyboard navigation in TOC
  if (tocList) {
    tocList.addEventListener('keydown', (e) => {
      const items = Array.from(tocList.querySelectorAll('a'));
      const idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[Math.min(items.length - 1, Math.max(0, idx + 1))];
        next?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[Math.max(0, idx - 1)];
        prev?.focus();
      }
    });
  }

})();
