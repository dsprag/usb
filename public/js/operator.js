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

function renderOrders(rows, step) {
  const container = document.getElementById('orders');
  container.innerHTML = '';
  if (!rows.length) {
    container.textContent = 'No orders';
    return;
  }
  const list = document.createElement('div');
  list.className = 'order-list';
  rows.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'order-item';
    item.innerHTML = `
      <div>
        <div class="order-num">${r.order_number}</div>
        <div class="order-customer">${r.customer_name || ''}</div>
      </div>
      <div class="order-actions"></div>
    `;
    const actions = item.querySelector('.order-actions');

    if (r.status === 'ready') {
      const btn = document.createElement('button');
      btn.textContent = 'Start';
      btn.onclick = async () => {
        await fetchJSON(`/api/operator/${encodeURIComponent(step)}/orders/${r.order_id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        await refresh();
      };
      actions.appendChild(btn);
    } else if (r.status === 'in_progress') {
      const btn = document.createElement('button');
      btn.textContent = 'Complete';
      btn.onclick = async () => {
        await fetchJSON(`/api/operator/${encodeURIComponent(step)}/orders/${r.order_id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        await refresh();
      };
      actions.appendChild(btn);
    }

    list.appendChild(item);
  });
  container.appendChild(list);
}

async function refresh() {
  const step = document.getElementById('stepSelect').value;
  const status = document.getElementById('statusSelect').value;
  const rows = await fetchJSON(`/api/operator/${encodeURIComponent(step)}/orders?status=${encodeURIComponent(status)}`);
  renderOrders(rows, step);
}

(async function init() {
  await loadSteps();
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('stepSelect').addEventListener('change', refresh);
  document.getElementById('statusSelect').addEventListener('change', refresh);
  await refresh();
})();
