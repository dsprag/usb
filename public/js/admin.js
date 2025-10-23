async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadSteps() {
  const steps = await fetchJSON('/api/steps');
  const sel = document.getElementById('stepSelect');
  sel.innerHTML = '';
  steps.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });
}

function renderList(rows) {
  const container = document.getElementById('listView');
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Order #</th>
        <th>Customer</th>
        <th>Step</th>
        <th>Status</th>
        <th>Channel</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.order_number}</td>
      <td>${r.customer_name || ''}</td>
      <td>${r.step || ''}</td>
      <td>${r.step_status || ''}</td>
      <td>${r.channel}</td>
    `;
    tbody.appendChild(tr);
  });
  container.appendChild(table);
}

function renderKanban(board) {
  const container = document.getElementById('kanbanView');
  container.innerHTML = '';
  const statuses = ['ready', 'in_progress', 'done'];
  const wrapper = document.createElement('div');
  wrapper.className = 'kanban-board';
  statuses.forEach((s) => {
    const col = document.createElement('div');
    col.className = 'kanban-col';
    col.innerHTML = `<h3>${s.replace('_', ' ')}</h3>`;
    const list = document.createElement('div');
    list.className = 'kanban-list';
    (board[s] || []).forEach((card) => {
      const item = document.createElement('div');
      item.className = 'kanban-card';
      item.textContent = `${card.order_number} — ${card.customer_name || ''}`;
      list.appendChild(item);
    });
    col.appendChild(list);
    wrapper.appendChild(col);
  });
  container.appendChild(wrapper);
}

async function refresh() {
  const mode = document.getElementById('viewMode').value;
  const step = document.getElementById('stepSelect').value;
  document.getElementById('listView').style.display = mode === 'list' ? '' : 'none';
  document.getElementById('kanbanView').style.display = mode === 'kanban' ? '' : 'none';

  if (mode === 'list') {
    const rows = await fetchJSON('/api/admin/orders');
    renderList(rows);
  } else {
    const board = await fetchJSON(`/api/admin/kanban/${encodeURIComponent(step)}`);
    renderKanban(board);
  }
}

(async function init() {
  await loadSteps();
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('viewMode').addEventListener('change', refresh);
  document.getElementById('stepSelect').addEventListener('change', refresh);
  await refresh();
})();
