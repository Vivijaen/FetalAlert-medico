/* ============================
   CONFIGURACIÓN
   ============================ */
const APPS_URL = 'https://script.google.com/macros/s/TU_DEPLOY_ID/exec'; // <-- pega tu URL de Apps Script Web App
const READ_KEY = 'TU_READ_KEY_SEGURA'; // <-- tu READ_KEY (no la publiques)

/* ============================
   UTILIDADES
   ============================ */
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return document.querySelectorAll(sel); }

function getQueryParams(){
  const p = new URLSearchParams(window.location.search);
  return {
    key:       p.get('key')       || READ_KEY,
    patientId: p.get('patientId') || ''
  };
}

function statusHR(hr){
  if (hr == null) return '–';
  if (hr < 60 || hr > 120) return 'Fuera de rango. Acuda a un médico.';
  if (hr < 65 || hr > 110) return 'Precaución, vuelva a medir.';
  return 'Todo normal.';
}
function statusSpO2(s){
  if (s == null) return '–';
  if (s < 90) return 'Fuera de rango. Acuda a un médico.';
  if (s < 94) return 'Precaución, vuelva a medir.';
  return 'Todo normal.';
}

/* ============================
   RENDER
   ============================ */
function renderConnection(state){
  const el = qs('#md-conn');
  if (state==='ok'){
    el.textContent = 'Conectado';
    el.className = 'md-conn md-conn--ok';
  }else if(state==='err'){
    el.textContent = 'Error de conexión';
    el.className = 'md-conn md-conn--err';
  }else{
    el.textContent = 'Conectando…';
    el.className = 'md-conn md-conn--idle';
  }
}

function renderSummary(last){
  qs('#last-date').textContent = last?.fecha || '--';
  qs('#last-time').textContent = last?.hora || '--';
  qs('#last-hr').textContent   = (last?.fc ?? '--');
  qs('#last-spo2').textContent = (last?.spo2 ?? '--');
  qs('#last-mov').textContent  = (last?.patadas ?? '--');

  const hrMsg   = (typeof last?.fc === 'number') ? statusHR(last.fc) : '–';
  const spo2Msg = (typeof last?.spo2 === 'number') ? statusSpO2(last.spo2) : '–';

  qs('#last-hr-status').textContent   = hrMsg;
  qs('#last-spo2-status').textContent = spo2Msg;

  // Estado global (prioriza error > precaución > ok)
  const st = qs('#md-status');
  if (hrMsg.includes('Fuera') || spo2Msg.includes('Fuera')) {
    st.textContent = 'ALERTA: Parámetros fuera de rango';
    st.className   = 'md-status md-status--err';
  } else if (hrMsg.includes('Precaución') || spo2Msg.includes('Precaución')) {
    st.textContent = 'Precaución';
    st.className   = 'md-status md-status--warn';
  } else if (last) {
    st.textContent = 'En rango';
    st.className   = 'md-status md-status--ok';
  } else {
    st.textContent = 'Esperando datos…';
    st.className   = 'md-status md-status--idle';
  }
}

function renderTable(rows){
  const tb = qs('#tbl-body');
  tb.innerHTML = '';
  if (!rows || rows.length === 0){
    tb.innerHTML = `<tr><td colspan="5" class="md-empty">Sin datos…</td></tr>`;
    return;
  }
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.fecha}</td>
      <td>${r.hora}</td>
      <td>${r.fc}</td>
      <td>${r.spo2}</td>
      <td>${r.patadas}</td>
    `;
    tb.appendChild(tr);
  });
}

/* Exportar CSV del lado del navegador */
function exportCSV(rows){
  if(!rows || !rows.length){ alert('No hay datos para exportar'); return; }
  const header = ['FECHA','HORA','FC','SpO2','PATADAS'];
  const lines  = rows.map(r => [r.fecha, r.hora, r.fc, r.spo2, r.patadas].join(','));
  const csv    = [header.join(','), ...lines].join('\n');
  const blob   = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url    = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'historial_fetalalert.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ============================
   FETCH
   ============================ */
async function fetchData(params){
  const url = new URL(APPS_URL);
  url.searchParams.set('key', params.key);
  if (params.patientId) url.searchParams.set('patientId', params.patientId);
  // Filtrado por fecha (opcional)
  const f = qs('#fld-from').value;
  const t = qs('#fld-to').value;
  if (f) url.searchParams.set('from', f);
  if (t) url.searchParams.set('to', t);

  try{
    renderConnection('idle');
    const res = await fetch(url.toString(), { method:'GET' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if (!json.ok) throw new Error('Respuesta no OK');
    renderConnection('ok');

    // Recorta a 50 para tabla si es muy grande
    const rows = json.data || [];
    const last = rows[0] || null;
    renderSummary(last);
    renderTable(rows.slice(0,50));

    return rows;
  }catch(e){
    console.warn('Error fetch:', e);
    renderConnection('err');
    renderSummary(null);
    renderTable([]);
    return [];
  }
}

/* ============================
   INIT
   ============================ */
document.addEventListener('DOMContentLoaded', ()=>{
  const params = getQueryParams();

  // Pinta el patientId si vino en la URL
  if (params.patientId) qs('#fld-patient').value = params.patientId;

  // Botón aplicar
  qs('#btn-apply').addEventListener('click', ()=>{
    const pid = qs('#fld-patient').value.trim();
    const search = new URLSearchParams(window.location.search);
    if (pid) search.set('patientId', pid); else search.delete('patientId');
    if (params.key) search.set('key', params.key);
    history.replaceState({},'', `${location.pathname}?${search.toString()}`);
    fetchData(getQueryParams());
  });

  // Exportar CSV (de los datos actuales filtrados)
  qs('#btn-export').addEventListener('click', async ()=>{
    const rows = await fetchData(getQueryParams());
    exportCSV(rows);
  });

  // Primera carga
  fetchData(params);

  // Auto-refresh cada 60s (opcional)
  setInterval(()=> fetchData(getQueryParams()), 60000);
});
