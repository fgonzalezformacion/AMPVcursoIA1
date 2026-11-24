(function () {
  'use strict';

  const root = document.querySelector('#app');
  const profileButton = document.querySelector('#profile-button');
  const status = document.querySelector('#status');
  const backupFile = document.querySelector('#backup-file');
  const storageKey = `obras-pintura:v1:${location.pathname.replace(/index\.html$/, '')}`;
  const numberFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });
  const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const id = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  const format = n => numberFormat.format(n);
  const date = value => dateFormat.format(new Date(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const samePaint = value => value.trim().toLocaleLowerCase('es');
  const defaultPaint = 'Pintura principal';
  const roomSurfaces = [
    ['walls', 'Cuatro paredes'],
    ['ceiling', 'Techo'],
    ['walls-and-ceiling', 'Cuatro paredes y techo'],
    ['width-wall', 'Una pared del lado ancho'],
    ['length-wall', 'Una pared del lado largo']
  ];
  const materialsById = new Map(paintMaterials.map(material => [material.id, material]));

  let users = readUsers();
  let activeId = null;
  try { activeId = sessionStorage.getItem(storageKey); } catch {}
  let workId = null;
  let screen = activeUser() ? 'works' : 'profiles';
  let toastTimer;

  function readUsers() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveUsers(next) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      users = next;
      return true;
    } catch {
      alert('No se pudieron guardar los datos. Comprueba el espacio y los permisos de almacenamiento del navegador.');
      return false;
    }
  }

  function activeUser() { return users.find(user => user.id === activeId); }
  function activeWork() { return activeUser()?.works.find(work => work.id === workId); }

  function updateUser(user) {
    return saveUsers([...readUsers().filter(item => item.id !== user.id), user]);
  }

  function selectUser(user, message) {
    activeId = user.id;
    workId = null;
    try { sessionStorage.setItem(storageKey, activeId); } catch {}
    navigate('works');
    if (message) announce(message);
  }

  function announce(message) {
    clearTimeout(toastTimer);
    status.textContent = message;
    status.hidden = false;
    toastTimer = setTimeout(() => { status.hidden = true; }, 4200);
  }

  function navigate(next) {
    screen = next;
    render();
    root.focus();
    window.scrollTo(0, 0);
  }

  function button(label, action, type = 'ghost', data = '') {
    return `<button type="button" class="button ${type}" data-action="${action}" ${data}>${label}</button>`;
  }

  function textField(name, label, value = '', options = '') {
    return `<label class="field"><span>${label}</span><input name="${name}" value="${escape(value)}" ${options}></label>`;
  }

  function decimalField(name, label, value) {
    return textField(name, label, value === '' ? '' : String(value).replace('.', ','), 'inputmode="decimal" maxlength="16" required');
  }

  function decimal(value) {
    const text = String(value ?? '').trim();
    return /^\d+(?:[.,]\d{1,6})?$/.test(text) ? Number(text.replace(',', '.')) : NaN;
  }

  function grossArea({ mode, area, height, width, length, roomSurface }) {
    if (mode === 'area') return area;
    if (mode === 'dimensions') return width * height;

    const walls = 2 * (width + length) * height;
    const ceiling = width * length;
    switch (roomSurface) {
      case 'walls': return walls;
      case 'ceiling': return ceiling;
      case 'walls-and-ceiling': return walls + ceiling;
      case 'width-wall': return width * height;
      case 'length-wall': return length * height;
      default: return NaN;
    }
  }

  function paintCalculation(surface) {
    const openings = surface.openings.reduce((sum, opening) => sum + opening.width * opening.height, 0);
    const area = grossArea(surface) - openings;
    const effective = surface.coverage * surface.percent / 100;
    return { area, effective, liters: area * surface.coats / effective };
  }

  function recommend(liters, sizes) {
    if (!sizes.length || liters <= 0) return [];
    const ordered = [...sizes].sort((a, b) => b - a);
    const toUnits = value => Math.round(value * 1000);
    let remaining = Math.ceil(liters * 1000 - 1e-7);
    const counts = new Map();
    for (const size of ordered) {
      const units = toUnits(size);
      const count = Math.floor(remaining / units);
      if (count) counts.set(size, count);
      remaining -= units * count;
    }
    if (remaining > 0) {
      const smallest = ordered[ordered.length - 1];
      counts.set(smallest, (counts.get(smallest) || 0) + 1);
    }
    return [...counts];
  }

  function groupsFor(work) {
    const groups = new Map();
    for (const surface of work.surfaces) {
      const key = samePaint(surface.paint);
      if (!groups.has(key)) {
        const setting = work.sizes.find(item => item.key === key);
        groups.set(key, { key, name: surface.paint, liters: 0, sizes: setting?.values || [] });
      }
      groups.get(key).liters += paintCalculation(surface).liters;
    }
    return [...groups.values()];
  }

  function renderProfiles() {
    const list = users.length ? `<ul class="work-list">${users.map(user =>
      `<li><button class="work-link row" data-action="select" data-id="${escape(user.id)}"><strong>${escape(user.name)}</strong><span class="muted small">${user.works.length} ${user.works.length === 1 ? 'obra' : 'obras'}</span></button></li>`
    ).join('')}</ul>` : '';
    return `<section class="panel intro stack">
      <h1>Tu espacio de trabajo</h1>
      ${list}
      <form id="profile-form" class="stack">
        ${textField('name', 'Nombre o identificador', '', 'required maxlength="60" autocomplete="nickname" placeholder="Ej. Ana García"')}
        <p class="error" data-error hidden role="alert"></p>
        <button class="button primary">Crear espacio</button>
      </form>
      <div class="settings">${button('Importar copia', 'import')}</div>
    </section>`;
  }

  function renderWorks(user) {
    const works = [...user.works].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const list = works.length ? `<ul class="work-list">${works.map(work =>
      `<li><button class="work-link row" data-action="open" data-id="${escape(work.id)}"><strong>${escape(work.name)}</strong><span class="muted small">${work.surfaces.length} ${work.surfaces.length === 1 ? 'superficie' : 'superficies'} · ${date(work.updatedAt)}</span></button></li>`
    ).join('')}</ul>` : '<p class="muted">Crea una obra para guardar tus medidas y calcular la pintura.</p>';

    return `<div class="heading"><h1>Mis obras</h1>${button('+ Nueva obra', 'new-work', 'primary')}</div>
      <div class="grid">
        <section class="panel stack"><h2>Obras de ${escape(user.name)}</h2>${list}</section>
        <aside class="panel stack">
          <h2>Pasar obras a otro dispositivo</h2>
          <p class="muted">Descarga una copia e impórtala en el otro dispositivo. Las obras se guardan en este navegador.</p>
          <div class="actions">${button('Exportar copia', 'export')}${button('Importar copia', 'import')}</div>
        </aside>
      </div>`;
  }

  function renderWorkForm(work) {
    const action = work ? 'work' : 'home';
    return `${buttonBack(work ? work.name : 'Mis obras', action)}
      <div class="heading"><h1>${work ? 'Editar obra' : 'Nueva obra'}</h1></div>
      <form id="work-form" class="panel stack">
        ${textField('name', 'Nombre de la obra', work?.name, 'required maxlength="100" placeholder="Ej. Pintura del piso"')}
        <p class="error" data-error hidden role="alert"></p>
        <div class="actions"><button class="button primary">Guardar obra</button>${button('Cancelar', action)}</div>
      </form>`;
  }

  function buttonBack(label, action) {
    return `<button class="back" type="button" data-action="${action}">${escape(label)}</button>`;
  }

  function renderSurfaces(work) {
    if (!work.surfaces.length) return '<p class="muted">Añade una pared, un techo u otra superficie para empezar el cálculo.</p>';
    const rows = work.surfaces.map(surface => {
      const { area, liters } = paintCalculation(surface);
      const edit = button('Editar', 'edit-surface', 'ghost', `data-id="${escape(surface.id)}"`);
      return { surface, area, liters, edit };
    });

    return `<table aria-label="Superficies de la obra">
      <thead><tr><th scope="col">Superficie</th><th scope="col">Área</th><th scope="col">Manos</th><th scope="col">Rend.</th><th scope="col">Litros</th><th scope="col">Editar</th></tr></thead>
      <tbody>${rows.map(({ surface, area, liters, edit }) =>
        `<tr><td>${escape(surface.name)}<br><span class="muted small">${escape(surface.paint)}</span></td><td>${format(area)} m²</td><td>${surface.coats}</td><td>${format(surface.percent)} %</td><td>${format(liters)} L</td><td>${edit}</td></tr>`).join('')}</tbody>
      </table>
      <div class="surface-cards">${rows.map(({ surface, area, liters, edit }) =>
        `<article class="surface-card stack"><div class="section-heading"><h3>${escape(surface.name)}</h3>${edit}</div>
        <p class="muted">${escape(surface.paint)} · ${format(area)} m² · ${surface.coats} ${surface.coats === 1 ? 'mano' : 'manos'}</p>
        <div class="metric"><span>Rendimiento aplicado ${format(surface.percent)} %</span><strong>${format(liters)} L</strong></div></article>`).join('')}</div>`;
  }

  function renderGroup(group, multiple) {
    const cans = recommend(group.liters, group.sizes);
    const bought = cans.reduce((sum, [size, count]) => sum + size * count, 0);
    const cansLabel = cans.map(([size, count]) => `${format(count)} ${count === 1 ? 'bote' : 'botes'} de ${format(size)} L`).join(' + ');
    return `<div class="group stack">
      ${multiple ? `<h3>${escape(group.name)} · ${format(group.liters)} L</h3>` : ''}
      ${cans.length ? `<div><h3>Botes recomendados</h3><p>${cansLabel}</p><p class="muted small">${format(bought)} L de compra · ${format(Math.max(0, bought - group.liters))} L de sobra</p></div>` : ''}
      <form class="sizes-form stack" data-paint="${escape(group.key)}">
        ${textField('sizes', 'Tamaños disponibles (L)', group.sizes.map(size => String(size).replace('.', ',')).join(' / '), 'placeholder="Ej. 10 / 4 / 2,5" maxlength="160" aria-label="Tamaños disponibles en litros, separados por barras"')}
        <p class="error" data-error hidden role="alert"></p>
        <button class="button ghost">Guardar tamaños</button>
      </form>
    </div>`;
  }

  function renderWork(work) {
    const groups = groupsFor(work);
    return `${buttonBack('Mis obras', 'home')}
      <div class="heading"><h1>${escape(work.name)}</h1>${button('Editar nombre', 'edit-work')}</div>
      <div class="grid">
        <section class="panel stack">
          <div class="section-heading"><h2>Superficies</h2>${button('+ Añadir superficie', 'add-surface', 'primary')}</div>
          ${renderSurfaces(work)}
          <details class="history"><summary>Historial de la obra</summary><ul>${[...work.history].reverse().map(event =>
            `<li><strong>${escape(event.actor)}</strong> · ${escape(event.action)} <span class="muted small">(${date(event.at)})</span></li>`).join('')}</ul></details>
        </section>
        <aside class="panel tinted summary">
          <h2>Pintura necesaria</h2>
          <p class="total">${format(groups.reduce((sum, group) => sum + group.liters, 0))} L</p>
          ${groups.map(group => renderGroup(group, groups.length > 1)).join('')}
        </aside>
      </div>`;
  }

  function renderOpening(opening = {}) {
    return `<div class="opening" data-opening>
      <div class="row"><label>Categoría <select name="opening-type" aria-label="Categoría del hueco">
        ${['Puerta', 'Ventana', 'Otro hueco'].map(name => `<option${opening.type === name ? ' selected' : ''}>${name}</option>`).join('')}
      </select></label>${button('Quitar hueco', 'remove-opening', 'ghost danger')}</div>
      <div class="fields">${decimalField('opening-width', 'Ancho del hueco (m)', opening.width ?? '')}${decimalField('opening-height', 'Alto del hueco (m)', opening.height ?? '')}</div>
    </div>`;
  }

  function renderMaterialPicker(selectedId) {
    const categories = [...new Set(paintMaterials.map(material => material.category))];
    return `<label class="field"><span>Material</span><select name="material">
      <option value="">Introducir material manualmente</option>
      ${categories.map(category => `<optgroup label="${escape(category)}">
        ${paintMaterials.filter(material => material.category === category).map(material =>
          `<option value="${escape(material.id)}"${material.id === selectedId ? ' selected' : ''}>${escape(material.name)}</option>`
        ).join('')}
      </optgroup>`).join('')}
    </select></label>
    <div class="material-details small" data-material-details hidden>
      <p data-material-coverage></p>
      <a data-material-sheet target="_blank" rel="noopener noreferrer">Abrir ficha técnica (PDF)</a>
    </div>`;
  }

  function renderSurfaceForm(work, surface) {
    const mode = surface?.mode || 'room';
    const legacyMode = surface?.mode === 'dimensions';
    const paints = [...new Set(work.surfaces.map(item => item.paint))];
    const coverageOptions = ['Ficha técnica', 'Estimación orientativa'];
    return `${buttonBack(work.name, 'work')}
      <div class="heading"><h1>${surface ? 'Editar superficie' : 'Añadir superficie'}</h1></div>
      <form id="surface-form" class="grid" data-id="${escape(surface?.id)}">
        <section class="panel stack">
          ${textField('name', 'Nombre', surface?.name, 'required maxlength="100" placeholder="Ej. Pared del salón"')}
          <div class="mode" role="group" aria-label="Modo de medición">
            <label><input type="radio" name="mode" value="room"${mode === 'room' ? ' checked' : ''}>Alto, ancho y largo</label>
            <label><input type="radio" name="mode" value="area"${mode === 'area' ? ' checked' : ''}>Introducir m²</label>
            ${legacyMode ? '<label><input type="radio" name="mode" value="dimensions" checked>Medidas guardadas</label>' : ''}
          </div>
          <div class="stack" data-mode="area">${decimalField('area', 'Superficie a pintar (m²)', surface?.area || '')}</div>
          <div class="stack" data-mode="room dimensions">
            <div class="fields room-measures">
              ${decimalField('height', 'Alto (m)', surface?.height || '')}
              ${decimalField('width', 'Ancho (m)', surface?.width || '')}
              <div data-mode="room">${decimalField('length', 'Largo (m)', surface?.length || '')}</div>
            </div>
            <label class="field" data-mode="room"><span>Qué vas a pintar</span><select name="room-surface">
              ${roomSurfaces.map(([key, label]) => `<option value="${key}"${surface?.roomSurface === key ? ' selected' : ''}>${label}</option>`).join('')}
            </select></label>
            <div class="section-heading"><h2>Huecos a descontar</h2>${button('+ Añadir hueco', 'add-opening')}</div>
            <div class="stack" id="openings">${(surface?.openings || []).map(renderOpening).join('')}</div>
          </div>
          <div class="settings stack">
            <h2>Material y rendimiento</h2>
            ${renderMaterialPicker(surface?.materialId)}
            ${textField('paint', 'Nombre o referencia del material', surface?.paint || paints[0] || defaultPaint, 'required maxlength="100" list="paint-options"')}
            <datalist id="paint-options">${paints.map(paint => `<option value="${escape(paint)}"></option>`).join('')}</datalist>
            <div class="fields">
              ${textField('coats', 'Manos', surface?.coats ?? 2, 'required inputmode="numeric" maxlength="3"')}
              <label class="field"><span>Origen del rendimiento</span><select name="source">
                ${coverageOptions.map(name => `<option${surface?.source === name ? ' selected' : ''}>${name}</option>`).join('')}
              </select></label>
              ${decimalField('coverage', 'Rendimiento (m²/L)', surface?.coverage ?? '')}
              ${decimalField('percent', 'Porcentaje aplicado (%)', surface?.percent ?? 100)}
            </div>
          </div>
          <p class="error" data-error hidden role="alert"></p>
          <div class="actions"><button class="button primary">Guardar superficie</button>${button('Cancelar', 'work')}${surface ? button('Eliminar superficie', 'delete-surface', 'ghost danger', `data-id="${escape(surface.id)}"`) : ''}</div>
        </section>
        <aside class="panel tinted estimator">
          <h2>Cálculo de la superficie</h2>
          <div class="metric"><span>Área neta</span><strong id="net-area">—</strong></div>
          <div class="metric"><span>Rendimiento efectivo</span><strong id="effective">—</strong></div>
          <div><h3>Pintura necesaria</h3><p class="total" id="surface-liters" aria-live="polite">—</p></div>
        </aside>
      </form>`;
  }

  function render() {
    const user = activeUser();
    profileButton.hidden = !user || screen === 'profiles';
    profileButton.textContent = user?.name ?? '';
    if (!user || screen === 'profiles') {
      root.innerHTML = renderProfiles();
      return;
    }

    const work = activeWork();
    if (screen === 'work-form') root.innerHTML = renderWorkForm(work);
    else if (work && screen === 'work') root.innerHTML = renderWork(work);
    else if (work && screen === 'surface') {
      root.innerHTML = renderSurfaceForm(work, work.surfaces.find(surface => surface.id === editingSurface));
      const form = root.querySelector('#surface-form');
      refreshMaterial(form);
      refreshSurface(form);
    } else root.innerHTML = renderWorks(user);
  }

  function readSurface(form) {
    const data = new FormData(form);
    const mode = data.get('mode');
    return {
      id: form.dataset.id || id(),
      name: data.get('name').trim(),
      paint: data.get('paint').trim(),
      materialId: data.get('material') || null,
      mode,
      area: mode === 'area' ? decimal(data.get('area')) : 0,
      width: mode !== 'area' ? decimal(data.get('width')) : 0,
      height: mode !== 'area' ? decimal(data.get('height')) : 0,
      length: mode === 'room' ? decimal(data.get('length')) : 0,
      roomSurface: mode === 'room' ? data.get('room-surface') : null,
      openings: mode !== 'area' ? [...form.querySelectorAll('[data-opening]')].map(opening => ({
        type: opening.querySelector('[name="opening-type"]').value,
        width: decimal(opening.querySelector('[name="opening-width"]').value),
        height: decimal(opening.querySelector('[name="opening-height"]').value)
      })) : [],
      coats: decimal(data.get('coats')),
      source: data.get('source'),
      coverage: decimal(data.get('coverage')),
      percent: decimal(data.get('percent'))
    };
  }

  function positive(value, max = 1000000) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
  }

  function validArea(s) {
    const hasDimensions = positive(s.width) && positive(s.height);
    const hasRoom = s.mode === 'room' && hasDimensions && positive(s.length);
    const hasRectangle = s.mode === 'dimensions' && hasDimensions;
    const hasArea = s.mode === 'area' && positive(s.area) && s.openings.length === 0;
    return (hasRoom || hasRectangle || hasArea)
      && s.openings.every(o => positive(o.width) && positive(o.height))
      && positive(paintCalculation(s).area, 1000000000);
  }

  function validCoverage(s) {
    return positive(s.coverage, 10000) && positive(s.percent, 100);
  }

  function validCoats(s) {
    return Number.isInteger(s.coats) && positive(s.coats, 999);
  }

  function validLiters(liters) {
    return positive(liters, 1000000000);
  }

  function refreshMaterial(form, applyDefaults = false) {
    const material = materialsById.get(form.elements.material.value);
    const details = form.querySelector('[data-material-details]');
    details.hidden = !material;
    if (!material) return;

    const range = material.min === material.max ? format(material.min) : `${format(material.min)}–${format(material.max)}`;
    const condition = material.condition ? ` (${material.condition})` : '';
    details.querySelector('[data-material-coverage]').textContent = `Rendimiento de ficha · ${range} m²/L${condition}`;
    details.querySelector('[data-material-sheet]').href = material.sheet;

    if (applyDefaults) {
      form.elements.paint.value = material.name;
      form.elements.coverage.value = String(material.min).replace('.', ',');
      form.elements.source.value = 'Ficha técnica';
    }
  }

  function refreshSurface(form) {
    const mode = form.querySelector('[name="mode"]:checked').value;
    for (const section of form.querySelectorAll('[data-mode]')) {
      section.hidden = !section.dataset.mode.split(' ').includes(mode);
      for (const input of section.querySelectorAll('input, select')) input.disabled = section.hidden;
    }
    const surface = readSurface(form);
    const { area, effective, liters } = paintCalculation(surface);
    form.querySelector('#net-area').textContent = validArea(surface) ? `${format(area)} m²` : '—';
    form.querySelector('#effective').textContent = validCoverage(surface) ? `${format(effective)} m²/L` : '—';
    form.querySelector('#surface-liters').textContent =
      validArea(surface) && validCoverage(surface) && validCoats(surface) && validLiters(liters)
        ? `${format(liters)} L` : '—';
  }

  function showError(form, message) {
    const error = form.querySelector('[data-error]');
    error.textContent = message;
    error.hidden = false;
    error.scrollIntoView({ block: 'nearest' });
  }

  function storeWork(work, action) {
    const user = readUsers().find(item => item.id === activeId);
    if (!user) return false;
    const now = new Date().toISOString();
    const updated = { ...work, updatedAt: now, history: [...work.history, { actor: user.name, action, at: now }] };
    return updateUser({ ...user, works: [...user.works.filter(item => item.id !== work.id), updated] });
  }

  function removeSurface(surfaceId) {
    users = readUsers();
    const work = activeWork();
    const surface = work.surfaces.find(item => item.id === surfaceId);
    if (!surface || !confirm(`¿Eliminar «${surface.name}» de esta obra?`)) return;
    if (storeWork({ ...work, surfaces: work.surfaces.filter(item => item.id !== surfaceId) }, `Eliminó ${surface.name}`)) {
      navigate('work');
      announce('Superficie eliminada');
    }
  }

  function exportBackup() {
    const user = activeUser();
    const blob = new Blob([JSON.stringify({ version: 1, user }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `obras-pintura-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function isName(value, max) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  }

  function isId(value) { return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value); }
  function isDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }

  function validBackup(data) {
    const user = data?.user;
    return data?.version === 1 && isId(user?.id) && isName(user.name, 60) && Array.isArray(user.works)
      && user.works.every(work => isId(work?.id) && isName(work.name, 100) && isDate(work.updatedAt)
        && Array.isArray(work.surfaces) && work.surfaces.every(s => isId(s?.id) && isName(s.name, 100)
          && isName(s.paint, 100) && (s.materialId == null || isName(s.materialId, 60))
          && ['Ficha técnica', 'Estimación orientativa'].includes(s.source)
          && Array.isArray(s.openings) && s.openings.every(o => o && ['Puerta', 'Ventana', 'Otro hueco'].includes(o.type))
          && validArea(s) && validCoverage(s) && validCoats(s) && validLiters(paintCalculation(s).liters))
        && Array.isArray(work.sizes) && work.sizes.every(setting => isName(setting?.key, 200)
          && Array.isArray(setting.values) && setting.values.every(validSize))
        && Array.isArray(work.history) && work.history.every(event => isName(event?.actor, 60)
          && isName(event.action, 220) && isDate(event.at)));
  }

  function validSize(size) {
    return positive(size, 1000000) && size >= .001 && Math.abs(size * 1000 - Math.round(size * 1000)) < 1e-6;
  }

  async function importBackup(file) {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!validBackup(data)) throw new Error('Formato inválido');
    } catch {
      alert('Elige una copia JSON válida exportada desde esta app.');
      return;
    }
    const incoming = data.user;
    const existing = readUsers().find(user => user.id === incoming.id);
    const works = new Map((existing?.works || []).map(work => [work.id, work]));
    let conflicts = 0;
    for (const work of incoming.works) {
      const current = works.get(work.id);
      if (!current || work.history.some(event => event.at === current.updatedAt)) {
        if (!current || Date.parse(work.updatedAt) > Date.parse(current.updatedAt)) works.set(work.id, work);
      } else if (current.updatedAt !== work.updatedAt && !current.history.some(event => event.at === work.updatedAt)) {
        const objectMatches = current.name === work.name && JSON.stringify(current.surfaces) === JSON.stringify(work.surfaces)
          && JSON.stringify(current.sizes) === JSON.stringify(work.sizes);
        const alreadyImported = [...works.values()].some(item => item.updatedAt === work.updatedAt && item.name === work.name);
        if (!objectMatches && !alreadyImported) {
          const copy = { ...work, id: id() };
          works.set(copy.id, copy);
          conflicts += 1;
        }
      }
    }
    const user = { ...incoming, works: [...works.values()] };
    if (updateUser(user)) selectUser(user, conflicts ? 'Copia importada. Se conservaron las dos versiones de las obras editadas en ambos dispositivos.' : 'Copia importada');
  }

  let editingSurface = null;
  document.addEventListener('click', event => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;
    const form = root.querySelector('#surface-form');

    switch (target.dataset.action) {
      case 'profiles':
        activeId = null;
        workId = null;
        try { sessionStorage.removeItem(storageKey); } catch {}
        navigate('profiles');
        break;
      case 'home':
        workId = null;
        navigate(activeUser() ? 'works' : 'profiles');
        break;
      case 'select': {
        const user = users.find(item => item.id === target.dataset.id);
        if (user) selectUser(user);
        break;
      }
      case 'new-work':
        workId = null;
        navigate('work-form');
        break;
      case 'open':
        workId = target.dataset.id;
        navigate('work');
        break;
      case 'work':
        navigate('work');
        break;
      case 'edit-work':
        navigate('work-form');
        break;
      case 'add-surface':
      case 'edit-surface':
        editingSurface = target.dataset.id || null;
        navigate('surface');
        break;
      case 'add-opening':
        form.querySelector('#openings').insertAdjacentHTML('beforeend', renderOpening());
        form.querySelector('[data-opening]:last-child select').focus();
        refreshSurface(form);
        break;
      case 'remove-opening':
        target.closest('[data-opening]').remove();
        form.querySelector('[data-action="add-opening"]').focus();
        refreshSurface(form);
        break;
      case 'delete-surface':
        removeSurface(target.dataset.id);
        break;
      case 'export':
        exportBackup();
        break;
      case 'import':
        backupFile.click();
        break;
    }
  });

  root.addEventListener('input', event => {
    const form = event.target.closest('#surface-form');
    if (!form) return;
    if (event.target.name === 'material') refreshMaterial(form, true);
    if (event.target.name === 'source' && event.target.value === 'Estimación orientativa' && !form.elements.coverage.value) {
      form.elements.coverage.value = '10';
    }
    refreshSurface(form);
  });

  root.addEventListener('submit', event => {
    const form = event.target;
    event.preventDefault();
    users = readUsers();
    const data = new FormData(form);
    const work = activeWork();
    if (form.id === 'profile-form') {
      const name = data.get('name').trim();
      if (!isName(name, 60)) return showError(form, 'Escribe un nombre o identificador.');
      if (users.some(user => samePaint(user.name) === samePaint(name))) {
        return showError(form, 'Ese nombre ya está guardado en este navegador. Selecciona tu espacio arriba o crea otro con un identificador distinto.');
      }
      const user = { id: id(), name, works: [] };
      if (updateUser(user)) selectUser(user, 'Espacio creado');
    } else if (form.id === 'work-form') {
      const name = data.get('name').trim();
      if (!isName(name, 100)) return showError(form, 'Escribe un nombre para la obra.');
      const next = { ...(work || { id: id(), surfaces: [], sizes: [], history: [] }), name };
      if (storeWork(next, work ? 'Cambió el nombre de la obra' : 'Creó la obra')) {
        workId = next.id;
        navigate('work');
        announce('Obra guardada');
      }
    } else if (form.id === 'surface-form' && work) {
      const surface = readSurface(form);
      if (!isName(surface.name, 100) || !isName(surface.paint, 100)) return showError(form, 'Escribe el nombre de la superficie y el del material.');
      if (surface.mode === 'room' && ![surface.height, surface.width, surface.length].every(value => positive(value))) {
        return showError(form, 'Introduce un alto, un ancho y un largo mayores que cero.');
      }
      if (!validArea(surface)) return showError(form, 'Revisa las medidas. Los huecos deben dejar una superficie a pintar mayor que cero.');
      if (!validCoats(surface)) return showError(form, 'Indica un número entero de manos mayor que cero.');
      if (!validCoverage(surface)) return showError(form, 'Indica un rendimiento positivo y un porcentaje mayor que 0 y de hasta 100 %.');
      if (!validLiters(paintCalculation(surface).liters)) return showError(form, 'El cálculo supera el límite de litros. Revisa los datos de la superficie.');
      const index = work.surfaces.findIndex(item => item.id === surface.id);
      const surfaces = [...work.surfaces];
      if (index < 0) surfaces.push(surface);
      else surfaces[index] = surface;
      if (storeWork({ ...work, surfaces }, `${index < 0 ? 'Añadió' : 'Editó'} ${surface.name}`)) {
        navigate('work');
        announce('Superficie guardada');
      }
    } else if (form.classList.contains('sizes-form') && work) {
      const key = form.dataset.paint;
      const raw = data.get('sizes').trim();
      const parsed = raw ? raw.split(/[\/;\n]+/).map(decimal) : [];
      if (parsed.some(size => !validSize(size))) return showError(form, 'Introduce tamaños positivos separados por barras, por ejemplo 10 / 4 / 2,5.');
      const sizes = work.sizes.filter(item => item.key !== key);
      if (parsed.length) sizes.push({ key, values: [...new Set(parsed)].sort((a, b) => b - a) });
      const group = groupsFor(work).find(group => group.key === key);
      if (group && storeWork({ ...work, sizes }, `Cambió los tamaños de ${group.name}`)) {
        render();
        root.querySelector('.summary').scrollIntoView({ block: 'nearest' });
        announce('Tamaños guardados');
      }
    }
  });

  backupFile.addEventListener('change', () => {
    const [file] = backupFile.files;
    backupFile.value = '';
    importBackup(file);
  });

  render();
})();
