// choose-role.js — version pro using WC.apiFetch if present
(() => {
  const form = document.getElementById('chooseRoleForm');
  const chooseMsg = document.getElementById('chooseMsg');
  const jobRow = document.getElementById('citizenJobRow');
  const jobSelect = document.getElementById('jobSelect');
  const radios = Array.from(document.querySelectorAll('input[name="role"]'));
  const API = window.WC && typeof window.WC.apiFetch === 'function' ? window.WC.apiFetch : async (u,o)=> {
    const r = await fetch(u,o); const ct=r.headers.get('content-type')||''; const data = ct.includes('application/json')? await r.json() : await r.text(); return r.ok? {ok:true,data}:{ok:false,error:data};
  };

  function setMsg(t='', type='info') {
    if (!chooseMsg) return;
    chooseMsg.textContent = t;
    chooseMsg.classList.remove('msg-error','msg-success','msg-info');
    if (!t) return;
    chooseMsg.classList.add(type==='success'?'msg-success': type==='error'?'msg-error':'msg-info');
  }

  radios.forEach(r => r.addEventListener('change', () => {
    if (r.value === 'citizen' && r.checked) jobRow.classList.remove('hidden'); else jobRow.classList.add('hidden');
  }));

  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('', 'info');
    const roleEl = document.querySelector('input[name="role"]:checked');
    if (!roleEl) { setMsg('Choisis un rôle.', 'error'); return; }
    const role = roleEl.value === 'minister' ? 'minister' : 'citizen';
    const job = (jobSelect.value && jobSelect.value !== 'none') ? jobSelect.value : null;

    try {
      const r = await API('/api/user/assign-role', { method: 'POST', body: JSON.stringify({ role, job }) });
      if (!r.ok) {
        setMsg('Erreur : ' + (r.error || r.data?.error || 'Impossible d\'enregistrer le rôle'), 'error');
        return;
      }
      setMsg('Rôle enregistré — redirection...', 'success');
      setTimeout(()=> window.location.href = 'dashboard.html', 700);
    } catch (err) {
      console.error(err);
      setMsg('Erreur réseau — réessaie plus tard.', 'error');
    }
  });
})();
