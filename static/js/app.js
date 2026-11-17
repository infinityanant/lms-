(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const state = { user: null, books: [], loans: [], category: '', query: '', authMode: 'login' };
  const csrf = () => document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1] || '';
  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { 'Accept': 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRFToken'] = csrf();
    const response = await fetch(`/api/${path}`, { credentials: 'same-origin', ...options, method, headers });
    if (response.status === 204) return null;
    let data; try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.');
    return data;
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tone = id => `tone-${Math.abs(Number(id) * 7 + Number(id) % 5) % 8}`;
  function toast(message, isError = false) {
    const node = $('#toast'); node.textContent = message; node.classList.toggle('error', isError); node.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2800);
  }
  function setModal(id, open) { $(`#${id}`).classList.toggle('hidden', !open); document.body.classList.toggle('modal-open', open); }
  function updateHeader() {
    const area = $('#account-area');
    if (!state.user) {
      area.innerHTML = '<button class="text-button" id="login-open">Log in</button><button class="button button-dark button-small" id="register-open">Join the library <span aria-hidden="true">↗</span></button>';
      $$('.signed-only, .superuser-only').forEach(el => el.classList.add('hidden')); $('#librarian-section').classList.add('hidden'); $('#blocked-page-section').classList.add('hidden');
    } else {
      const first = esc((state.user.name || state.user.username).split(' ')[0]);
      area.innerHTML = `<span class="user-greeting">Hi, ${first}</span><button class="text-button" id="logout-button">Log out</button>`;
      $$('.signed-only').forEach(el => el.classList.remove('hidden'));
      $('#librarian-section').classList.toggle('hidden', state.user.role !== 'librarian');
      $$('.superuser-only').forEach(el => el.classList.toggle('hidden', !state.user.is_superuser));
      $('#blocked-page-section').classList.toggle('hidden', !state.user.is_superuser);
    }
  }
  async function loadBooks() {
    const params = new URLSearchParams(); if (state.query) params.set('q', state.query);
    if (state.category) params.set('category', state.category);
    const query = params.toString(); state.books = await api(`books/${query ? `?${query}` : ''}`);
    renderBooks(); renderCategories(); renderStats(); if (state.user?.role === 'librarian') renderManage();
  }
  function renderStats() {
    $('#stat-books').textContent = state.books.length;
    $('#stat-copies').textContent = state.books.reduce((sum, b) => sum + b.available_copies, 0);
    $('#all-count').textContent = state.books.length;
  }
  function renderCategories() {
    const categories = [...new Set(state.books.map(b => b.category).filter(Boolean))].sort();
    const filters = $('#filters');
    filters.innerHTML = `<button class="filter-chip ${state.category ? '' : 'active'}" data-category="">All books <span>${state.books.length}</span></button>` +
      categories.map(c => `<button class="filter-chip ${state.category === c ? 'active' : ''}" data-category="${esc(c)}">${esc(c)}</button>`).join('');
  }
  function renderBooks() {
    const grid = $('#book-grid'); const empty = $('#empty-state');
    if (!state.books.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    grid.innerHTML = state.books.map(book => `<article class="book-card">
      <div class="cover-wrap"><span class="availability ${book.available_copies ? '' : 'sold'}">${book.available_copies ? `${book.available_copies} available` : (state.user?.is_superuser ? 'Admin access' : 'All borrowed')}</span>
        <div class="book-cover ${tone(book.id)}"><span class="cover-mark">✳</span><span class="cover-title">${esc(book.title)}</span><span class="cover-author">${esc(book.author)}</span></div></div>
      <div class="book-meta"><div class="book-meta-main"><h3 class="book-title" title="${esc(book.title)}">${esc(book.title)}</h3><div class="book-author">${esc(book.author)}</div></div>${state.user?.role !== 'librarian' ? `<div class="book-copy-count">${book.available_copies ? '↗' : '·'}</div>` : ''}</div>
      <div class="book-category">${esc(book.category || 'General')}</div>
      ${state.user?.is_superuser || state.user?.role === 'member' ? `<div class="book-card-actions"><button class="select-book-button ${state.user?.blocked ? 'is-blocked' : ''}" data-select="${book.id}">${state.user?.blocked ? 'Borrowing blocked' : (state.user ? 'Select book' : 'Sign in to borrow')} <span>↗</span></button></div>` : ''}
      ${state.user?.role === 'librarian' ? `<div class="card-manage-actions"><button data-card-edit="${book.id}">Edit</button><button data-card-delete="${book.id}">Delete</button></div>` : ''}
    </article>`).join('');
    // Cards remain browsable to everyone; clicking a cover offers the relevant action.
    $$('.book-card').forEach((card, index) => card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const book = state.books[index]; if (!book) return;
      if (state.user?.role === 'librarian' && !state.user.is_superuser) toast(`${book.available_copies} of ${book.total_copies} copies available.`);
      else openBookSelection(book);
    }));
  }
  async function loadLoans() {
    if (!state.user) return;
    state.loans = await api('loans/');
    state.user.blocked = state.loans.some(loan => loan.borrower_id === state.user.id && loan.user_blocked && !loan.returned_at);
    renderLoans(); if (state.books.length) renderBooks();
    $('#loan-count').textContent = state.loans.filter(l => !l.returned_at).length;
  }
  function renderLoans() {
    const active = state.loans.filter(l => !l.returned_at);
    const fines = state.loans.reduce((sum, l) => sum + l.fine, 0);
    $('#member-blocked-notice').classList.toggle('hidden', !state.user?.blocked);
    $('#loan-summary').innerHTML = `<div class="summary-card"><strong>${active.length}<span style="font-size:11px"> / 5</span></strong><span>books on loan</span></div><div class="summary-card"><strong>₹${fines}</strong><span>current late fines</span></div><div class="summary-card"><strong>${state.loans.length - active.length}</strong><span>books returned</span></div>`;
    renderBlockedMembers();
    const list = $('#loan-list');
    if (!state.loans.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">✳</div><h3>Your next read is out there.</h3><p>Borrow a book from the collection to see it here.</p></div>'; return; }
    list.innerHTML = state.loans.map(loan => {
      const due = new Date(loan.due_at); const activeLoan = !loan.returned_at;
      const dueText = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const status = activeLoan ? (loan.is_overdue ? 'Overdue' : 'On loan') : 'Returned';
      return `<div class="loan-row"><div class="loan-book"><div class="mini-cover ${tone(loan.book.id)}">${esc(loan.book.title)}</div><div><strong>${esc(loan.book.title)}</strong><span>${esc(loan.book.author)}${state.user.role === 'librarian' ? ` · ${esc(loan.username || '')}` : ''}</span></div></div>
        <div class="loan-detail"><strong>${activeLoan ? 'Due' : 'Returned'} ${activeLoan ? dueText : new Date(loan.returned_at).toLocaleDateString()}</strong><span>Borrowed ${new Date(loan.borrowed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
        <div>${loan.fine ? `<span class="status-pill overdue">₹${loan.fine} fine · ₹5/day</span>` : `<span class="status-pill ${loan.is_overdue ? 'overdue' : ''}">${status}</span>`}</div>
        <div>${activeLoan ? `<button class="return-button" data-return="${loan.id}">Return book ↗</button>` : `<span class="book-copy-count">${status}</span>`}</div></div>`;
    }).join('');
  }
  function renderBlockedMembers() {
    const panel = $('#blocked-page-section');
    if (!state.user?.is_superuser) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const grouped = new Map();
    state.loans.filter(loan => loan.user_blocked && !loan.returned_at).forEach(loan => {
      if (!grouped.has(loan.borrower_id)) grouped.set(loan.borrower_id, { id: loan.borrower_id, username: loan.username, loans: [] });
      grouped.get(loan.borrower_id).loans.push(loan);
    });
    $('#blocked-count').textContent = grouped.size;
    $('#blocked-count-nav').textContent = grouped.size;
    $('#blocked-users-list').innerHTML = grouped.size ? [...grouped.values()].map(member => `<div class="blocked-user-row"><div><strong>${esc(member.username)}</strong><span>${member.loans.length} overdue ${member.loans.length === 1 ? 'book' : 'books'} · borrowing blocked</span><button class="unblock-button" data-unblock="${member.id}">Unblock borrowing</button></div><div>${member.loans.map(loan => `<span class="blocked-book">${esc(loan.book.title)} · due ${new Date(loan.due_at).toLocaleDateString()} · ₹${loan.fine}</span>`).join('')}</div></div>`).join('') : '<p class="blocked-empty">No members are blocked for overdue books.</p>';
  }
  function renderManage() {
    $('#manage-list').innerHTML = state.books.length ? state.books.map(b => `<div class="manage-row"><div><strong>${esc(b.title)}</strong><br><span>${esc(b.author)} · ${esc(b.isbn)}</span></div><span>${esc(b.category)}</span><span>${b.available_copies}/${b.total_copies} available</span><div class="manage-actions"><button data-edit="${b.id}">Edit</button><button data-delete="${b.id}">Delete</button></div></div>`).join('') : '<div class="empty-state"><h3>The shelves are waiting.</h3><p>Add the first book to your collection.</p></div>';
  }
  function openAuth(mode) {
    state.authMode = mode; $('#auth-form').reset(); $('#auth-error').textContent = '';
    $$('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.authMode === mode));
    const registering = mode === 'register'; $('#name-wrap').classList.toggle('hidden', !registering); $('#email-wrap').classList.toggle('hidden', !registering);
    $('#auth-title').textContent = registering ? 'Make room for a good book.' : 'Welcome back to Stacks.';
    $('#auth-sub').textContent = registering ? 'Create an account and join the campus collection.' : 'Sign in to borrow from the campus collection.';
    $('#auth-submit').innerHTML = registering ? 'Create my account <span>↗</span>' : 'Log in <span>↗</span>';
    $('#auth-form [name=password]').autocomplete = registering ? 'new-password' : 'current-password'; setModal('auth-modal', true);
  }
  async function borrow(id) {
    if (!state.user) { openAuth('login'); return; }
    try { await api('loans/', { method: 'POST', body: JSON.stringify({ book_id: id }) }); toast('Book borrowed. Happy reading!'); await Promise.all([loadBooks(), loadLoans()]); }
    catch (error) { toast(error.message, true); }
  }
  function openBookSelection(book) {
    $('#select-title').textContent = book.title;
    $('#select-author').textContent = book.author;
    $('#select-category').textContent = book.category || 'GENERAL';
    $('#select-description').textContent = book.description || 'A title from the campus library collection.';
    $('#select-cover-title').textContent = book.title;
    $('#select-cover-author').textContent = book.author;
    $('#select-cover').className = `book-cover ${tone(book.id)}`;
    const canBorrow = (book.can_borrow ?? book.available_copies > 0) && !state.user?.blocked;
    $('#selection-details').textContent = state.user?.blocked ? 'Borrowing is paused because your account has an overdue book. Return it to restore access.' : (book.available_copies > 0 ? `${book.available_copies} ${book.available_copies === 1 ? 'copy' : 'copies'} currently available` : (state.user?.is_superuser ? 'Superuser access: checkout is available even when all copies are on loan.' : 'All copies are currently on loan.'));
    $('#select-error').textContent = '';
    const button = $('#confirm-borrow');
    button.disabled = !state.user || !canBorrow;
    button.innerHTML = !state.user ? 'Sign in to borrow <span>↗</span>' : (state.user.blocked ? 'Borrowing blocked' : (!canBorrow ? 'Currently unavailable' : 'Borrow this book <span>↗</span>'));
    button.dataset.bookId = book.id;
    if (!state.user) button.onclick = () => { setModal('select-modal', false); openAuth('login'); };
    else button.onclick = async () => {
      button.disabled = true; $('#select-error').textContent = '';
      try { await api('loans/', { method: 'POST', body: JSON.stringify({ book_id: Number(button.dataset.bookId) }) }); setModal('select-modal', false); toast('Book borrowed. Happy reading!'); await Promise.all([loadBooks(), loadLoans()]); }
      catch (error) { $('#select-error').textContent = error.message; button.disabled = false; }
    };
    setModal('select-modal', true);
  }
  function showView(view) {
    $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === view));
    const isLoans = view === 'loans' && !!state.user;
    const isBlockedView = view === 'blocked' && !!state.user?.is_superuser;
    $('#loans-section').classList.toggle('hidden', !isLoans);
    $('#blocked-page-section').classList.toggle('hidden', !state.user?.is_superuser || isLoans);
    $('#catalog-section').classList.toggle('hidden', isLoans || isBlockedView);
    $('#hero').classList.toggle('hidden', isLoans || isBlockedView); $('#stats-row').classList.toggle('hidden', isLoans || isBlockedView);
    if (isLoans) $('#loans-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (isBlockedView) $('#blocked-page-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('#account-area').addEventListener('click', async e => {
    if (e.target.closest('#login-open')) openAuth('login');
    if (e.target.closest('#register-open')) openAuth('register');
    if (e.target.closest('#logout-button')) { try { await api('auth/logout/', { method: 'POST' }); state.user = null; state.loans = []; updateHeader(); await loadBooks(); showView('discover'); toast('You are signed out.'); } catch (err) { toast(err.message, true); } }
  });
  $$('.nav-link').forEach(link => link.addEventListener('click', () => showView(link.dataset.view)));
  $('#explore').addEventListener('click', () => $('#catalog-section').scrollIntoView({ behavior: 'smooth' }));
  $('#filters').addEventListener('click', e => { const chip = e.target.closest('[data-category]'); if (!chip) return; state.category = chip.dataset.category; loadBooks().catch(err => toast(err.message, true)); });
  let searchTimer;
  $('#search').addEventListener('input', e => { clearTimeout(searchTimer); state.query = e.target.value.trim(); searchTimer = setTimeout(() => loadBooks().catch(err => toast(err.message, true)), 220); });
  $('#clear-search').addEventListener('click', () => { state.category = ''; state.query = ''; $('#search').value = ''; loadBooks(); });
  $('#book-grid').addEventListener('click', async e => {
    const selection = e.target.closest('[data-select]');
    if (selection) { const book = state.books.find(b => b.id === Number(selection.dataset.select)); if (book) openBookSelection(book); return; }
    const edit = e.target.closest('[data-card-edit]'), del = e.target.closest('[data-card-delete]');
    if (edit) { openBookModal(state.books.find(b => b.id === Number(edit.dataset.cardEdit))); return; }
    if (del) { await deleteBook(Number(del.dataset.cardDelete)); return; }
    const button = e.target.closest('[data-borrow]'); if (button) borrow(button.dataset.borrow);
  });
  $('#loan-list').addEventListener('click', async e => { const button = e.target.closest('[data-return]'); if (!button) return; try { const result = await api(`loans/${button.dataset.return}/return/`, { method: 'POST', body: '{}' }); toast(result.fine ? `Returned. Late fine: ₹${result.fine} (₹5 per day).` : 'Book returned. Thank you!'); await Promise.all([loadLoans(), loadBooks()]); } catch (err) { toast(err.message, true); } });
  $('#blocked-users-list').addEventListener('click', async e => {
    const button = e.target.closest('[data-unblock]'); if (!button) return;
    button.disabled = true;
    try { await api(`users/${button.dataset.unblock}/unblock/`, { method: 'POST', body: '{}' }); toast('Borrowing access restored for this member.'); await loadLoans(); }
    catch (err) { toast(err.message, true); button.disabled = false; }
  });
  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => openAuth(tab.dataset.authMode)));
  $$('.modal-close').forEach(btn => btn.addEventListener('click', () => setModal(btn.dataset.close, false)));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', e => { if (e.target === backdrop) setModal(backdrop.id, false); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal-backdrop:not(.hidden)').forEach(m => setModal(m.id, false)); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); } });
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const registering = state.authMode === 'register';
    const body = { username: form.get('username'), password: form.get('password') };
    if (registering) Object.assign(body, { name: form.get('name'), email: form.get('email') });
    $('#auth-submit').disabled = true; $('#auth-error').textContent = '';
    try { const result = await api(`auth/${registering ? 'register' : 'login'}/`, { method: 'POST', body: JSON.stringify(body) }); state.user = result.user; setModal('auth-modal', false); updateHeader(); await Promise.all([loadBooks(), loadLoans()]); toast(`Welcome${state.user.name ? `, ${state.user.name.split(' ')[0]}` : ''}!`); }
    catch (err) { $('#auth-error').textContent = err.message; }
    finally { $('#auth-submit').disabled = false; }
  });
  $('#add-book').addEventListener('click', () => openBookModal());
  function openBookModal(book = null) {
    const form = $('#book-form'); form.reset(); form.elements.book_id.value = book?.id || '';
    $('#book-modal-title').textContent = book ? 'Edit this book' : 'Add a book'; $('#book-error').textContent = '';
    if (book) for (const key of ['title', 'author', 'isbn', 'category', 'description', 'total_copies']) form.elements[key].value = book[key] ?? '';
    setModal('book-modal', true);
  }
  $('#manage-list').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-delete]');
    if (edit) { openBookModal(state.books.find(b => b.id === Number(edit.dataset.edit))); return; }
    if (del) await deleteBook(Number(del.dataset.delete));
  });
  async function deleteBook(id) {
    const book = state.books.find(b => b.id === id);
    if (!book || !window.confirm(`Delete “${book.title}” from the catalog?`)) return;
    try { await api(`books/${book.id}/`, { method: 'DELETE' }); toast('Book removed from the catalog.'); await loadBooks(); }
    catch (err) { toast(err.message, true); }
  }
  $('#book-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const id = form.get('book_id');
    const body = Object.fromEntries(['title', 'author', 'isbn', 'category', 'description', 'total_copies'].map(k => [k, form.get(k)])); body.total_copies = Number(body.total_copies);
    try { await api(`books/${id ? `${id}/` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }); setModal('book-modal', false); toast(id ? 'Book details updated.' : 'Book added to the catalog.'); await loadBooks(); }
    catch (err) { $('#book-error').textContent = err.message; }
  });
  async function init() {
    await api('auth/csrf/');
    try { const result = await api('auth/me/'); state.user = result.user; } catch { state.user = null; }
    updateHeader();
    try { await loadBooks(); if (state.user) await loadLoans(); }
    catch (error) { $('#book-grid').innerHTML = `<div class="loading-state">${esc(error.message)}</div>`; }
  }
  init();
})();
