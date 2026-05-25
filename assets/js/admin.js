const _supabase = supabase.createClient(
    'https://unjdjduiqtldgoybgmnq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuamRqZHVpcXRsZGdveWJnbW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MzgzODEsImV4cCI6MjA5MzAxNDM4MX0.qMuQcBysiKuFD5ByoL17fs0KxClgI-FEyzyKYayNVdE'
);

let currentUser = null;
let activeDataStore = [];
let adminAllConfigs = [];
let adminFilteredConfigs = [];
let adminVisibleCount = 9;
let adminTagData = {}; 

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    const charMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
    return str.toString().replace(/[&<>'"]/g, tag => charMap[tag] || tag);
}

// Modals & UI flows
function customAlert(message, title = "Notice") {
    return new Promise(resolve => {
        const overlay = document.getElementById('customDialogOverlay');
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogMessage').innerText = message;
        
        document.getElementById('dialogBtnCancel').style.display = 'none';
        
        const btn = document.getElementById('dialogBtnConfirm');
        btn.innerText = 'OK';
        btn.className = 'btn-primary';
        
        const close = () => {
            overlay.classList.remove('show');
            btn.removeEventListener('click', close);
            resolve(true);
        };
        
        btn.addEventListener('click', close);
        overlay.classList.add('show');
    });
}

function customConfirm(message, title = "Confirm Action", confirmText = "Confirm", isDanger = false) {
    return new Promise(resolve => {
        const overlay = document.getElementById('customDialogOverlay');
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogMessage').innerText = message;
        
        const cancelBtn = document.getElementById('dialogBtnCancel');
        const confirmBtn = document.getElementById('dialogBtnConfirm');
        
        cancelBtn.style.display = 'inline-block';
        confirmBtn.innerText = confirmText;
        confirmBtn.className = isDanger ? 'btn-danger' : 'btn-primary';
        
        const cleanup = () => {
            overlay.classList.remove('show');
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
        };
        
        const onCancel = () => { cleanup(); resolve(false); };
        const onConfirm = () => { cleanup(); resolve(true); };
        
        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        
        overlay.classList.add('show');
    });
}

// Session validation
async function verifyAdminAuth() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return false;
    
    const { data } = await _supabase.from('users').select('rank').eq('id', session.user.id).single();
    return data?.rank === 'admin';
}

async function bootSequence() {
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) return window.location.href = 'dashboard.html';
        
        const user = session.user;
        const meta = user.user_metadata;
        const discordId = meta.provider_id || user.id;
        
        const { data: dbUser } = await _supabase.from('users').select('rank, isBlacklisted').eq('id', user.id).single();
        
        if (dbUser?.isBlacklisted === 'true') {
            await _supabase.auth.signOut();
            return window.location.href = 'maintenance.html';
        }
        
        // bounce if not admin
        if (dbUser?.rank !== 'admin') return window.location.href = 'dashboard.html';

        currentUser = {
            id: user.id,
            discord_id: discordId,
            username: meta.full_name || meta.name || 'Admin',
            avatar_url: meta.avatar_url
        };

        document.getElementById('adminName').innerText = escapeHTML(currentUser.username);
        document.getElementById('adminPfp').src = escapeHTML(currentUser.avatar_url) || '/assets/images/logo.png';
        document.getElementById('myProfileLink').href = `profile.html?user=${currentUser.discord_id}`;

        document.getElementById('security-guard').style.display = 'none';
        document.body.classList.add('ready');
        
        await loadAdminTags(); 
        
        // force default view
        loadModule('home', document.querySelector('.nav-btn.active'));

    } catch (err) {
        console.error("Admin init failed:", err);
        window.location.href = 'dashboard.html';
    }
}
bootSequence();

function toggleDropdown(e) {
    e.stopPropagation();
    document.getElementById('profileDropdown').classList.toggle('active');
}

window.onclick = () => {
    const dd = document.getElementById('profileDropdown');
    if (dd) dd.classList.remove('active');
};

async function handleLogoutClick() {
    if (await customConfirm("Are you sure you want to log out?", "Logout", "Log Out", true)) {
        await _supabase.auth.signOut();
        window.location.href = 'login.html';
    }
}

// Router
async function loadModule(moduleName, btnElement) {
    const container = document.getElementById('dynamic-container');
    container.innerHTML = '<div class="guard-spinner" style="margin: 3rem auto;"></div>';
    
    if (btnElement) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }

    let html = '';
    try {
        if (moduleName === 'home') html = await renderHome();
        else if (moduleName === 'users') html = await renderUsers();
        else if (moduleName === 'profiles') html = await renderProfiles(); 
        else if (moduleName === 'rank') html = await renderRank();
        else if (moduleName === 'blacklist') html = await renderBlacklist();
        else if (moduleName === 'config-editor') html = await renderConfigs('false');
        else if (moduleName === 'drafts') html = await renderConfigs('true');
        else if (moduleName === 'reviews') html = await renderReviews();
        else if (moduleName === 'contributors') html = await renderContributors(); 
        else if (moduleName === 'private-tags') html = await renderPrivateTags();
        else if (moduleName === 'db') html = await renderDB();
        else if (moduleName === 'settings') html = await renderSettings();
    } catch (err) {
        html = `<p style="color: var(--danger);">Error loading module: ${escapeHTML(err.message)}</p>`;
    }
    
    container.innerHTML = html;
}

function refreshCurrentView() {
    const activeBtn = document.querySelector('.nav-btn.active');
    if (activeBtn) activeBtn.click();
}

// View Renders
async function renderHome() { 
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
    const todayStr = new Date().toISOString().split('T')[0];

    const [uData, cData, pData, lData] = await Promise.all([
        _supabase.from('users').select('id', { count: 'exact', head: true }),
        _supabase.from('configs').select('id', { count: 'exact', head: true }),
        _supabase.from('contributors').select('id', { count: 'exact', head: true }).eq('is_private', false),
        _supabase.from('users').select('id', { count: 'exact', head: true }).gte('last_login', todayStr)
    ]);

    return `
        <div class="stat-banner">
            <h2>${greeting}, ${escapeHTML(currentUser.username)}</h2>
            <p style="color:var(--text-dim); font-size:1.1rem; margin:0;">Welcome to the KrazyKonfigs Administration Dashboard.</p>
        </div>
        
        <div class="config-grid">
            <div class="item-card" style="align-items:center; text-align:center;">
                <i class="fas fa-users" style="font-size:2rem; color:var(--accent); margin-bottom:10px;"></i>
                <h3 style="border:none; padding:0; margin:0;">Total Users</h3>
                <h2 style="font-size:2.5rem; font-weight:900; margin:5px 0 0 0;">${uData.count || 0}</h2>
            </div>
            <div class="item-card" style="align-items:center; text-align:center;">
                <i class="fas fa-file-code" style="font-size:2rem; color:var(--success); margin-bottom:10px;"></i>
                <h3 style="border:none; padding:0; margin:0;">Total Configs</h3>
                <h2 style="font-size:2.5rem; font-weight:900; margin:5px 0 0 0;">${cData.count || 0}</h2>
            </div>
            <div class="item-card" style="align-items:center; text-align:center;">
                <i class="fas fa-address-book" style="font-size:2rem; color:#f1c40f; margin-bottom:10px;"></i>
                <h3 style="border:none; padding:0; margin:0;">Public Contributors</h3>
                <h2 style="font-size:2.5rem; font-weight:900; margin:5px 0 0 0;">${pData.count || 0}</h2>
            </div>
            <div class="item-card" style="align-items:center; text-align:center;">
                <i class="fas fa-sign-in-alt" style="font-size:2rem; color:#e0d484; margin-bottom:10px;"></i>
                <h3 style="border:none; padding:0; margin:0;">Logins Today</h3>
                <h2 style="font-size:2.5rem; font-weight:900; margin:5px 0 0 0;">${lData.count || 0}</h2>
            </div>
        </div>
    `; 
}

async function renderProfiles() {
    const { data: users } = await _supabase.from('users').select('id, username, discord_id');
    const { data: profiles, error } = await _supabase.from('user_profiles').select('*');

    if (error || !profiles) return `<p>No profiles found.</p>`;

    // merge user handles onto profile data
    const mergedProfiles = profiles.map(p => {
        const u = (users || []).find(x => String(x.id) === String(p.id)) || {};
        return { ...p, username: u.username || 'Unknown', discord_id: u.discord_id || 'N/A' };
    });

    let rowsHtml = mergedProfiles.map(p => {
        const isVerified = p.is_verified 
            ? '<span style="color:#2ecc71;"><i class="fas fa-check-circle"></i> Yes</span>' 
            : '<span style="color:var(--text-dim);">No</span>';
        
        return `
            <tr>
                <td style="font-weight:700;">${escapeHTML(p.username)}</td>
                <td style="font-size:0.85rem; color:var(--text-dim); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHTML(p.bio || 'None')}
                </td>
                <td>${isVerified}</td>
                <td>
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="toggleVerification('${p.id}', ${!!p.is_verified})">
                        <i class="fas fa-certificate"></i> Toggle Verif.
                    </button>
                    <button class="btn-danger" style="padding: 4px 8px; font-size: 0.8rem; margin-left: 5px;" title="Reset Bio/Colors/Music" onclick="resetProfile('${p.id}')">
                        <i class="fas fa-bomb"></i> Nuke Profile
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="page-header">
            <h1>Profile Moderation</h1>
            <p style="color:var(--text-dim); margin-top:5px;">Manage Verification Badges and moderate custom profiles.</p>
        </div>
        <div class="table-viewer-wrap">
            <table class="data-table">
                <thead><tr><th>Username</th><th>Custom Bio</th><th>Verified Status</th><th>Actions</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

async function toggleVerification(id, isCurrentlyVerified) {
    const confirmed = await customConfirm(`Toggle verification status to ${!isCurrentlyVerified}?`, "Verify Profile", "Yes, Toggle");
    if (!confirmed) return;
    
    const { error } = await _supabase.from('user_profiles').update({ is_verified: !isCurrentlyVerified }).eq('id', id);
    if (error) {
        await customAlert("Error toggling verification: " + error.message, "Database Error");
    } else {
        refreshCurrentView();
    }
}

async function resetProfile(id) {
    const confirmed = await customConfirm("Are you sure? This will permanently delete their custom background, colors, bio, and music.", "Nuke Profile", "Nuke It", true);
    if (!confirmed) return;
    
    const { error } = await _supabase.from('user_profiles').update({
        bio: null, 
        theme_colors: null, 
        bg_color: null, 
        text_color: null, 
        nav_color: null, 
        ui_box_color: null, 
        music_track: null
    }).eq('id', id);
    
    if (error) {
        await customAlert("Failed to nuke profile: " + error.message, "Error");
    } else {
        refreshCurrentView();
    }
}

async function renderConfigs(isArchivedStr) {
    const title = isArchivedStr === 'true' ? 'Draft & Archive' : 'Config Editor';
    
    const { data: configs } = await _supabase.from('configs').select('*').eq('is_archived', isArchivedStr).order('priority', { ascending: true });
    const { data: allReviews } = await _supabase.from('reviews').select('config_id, rating').not('rating', 'is', null);
    
    let ratingMap = {};
    if (allReviews) {
        let sums = {};
        let counts = {};
        
        allReviews.forEach(r => {
            sums[r.config_id] = (sums[r.config_id] || 0) + r.rating;
            counts[r.config_id] = (counts[r.config_id] || 0) + 1;
        });
        
        for (let cid in sums) {
            ratingMap[cid] = (sums[cid] / counts[cid]).toFixed(1);
        }
    }

    activeDataStore = configs || [];
    adminAllConfigs = (configs || []).map(c => ({...c, calc_rating: ratingMap[c.id] || "0.0"}));
    adminFilteredConfigs = [...adminAllConfigs];
    adminVisibleCount = 9;

    const creators = [...new Set(adminAllConfigs.map(c => Array.isArray(c.creator) ? c.creator.join(', ') : c.creator).filter(Boolean))];
    const dropdownOptions = '<option value="all">By Creator</option>' + creators.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');

    return `
        <div class="page-header">
            <h1>${title}</h1>
            <div style="display:flex; gap: 10px; align-items:center;">
                <input type="text" id="adminConfigSearch" class="search-bar" placeholder="Search configs..." oninput="adminApplyFilters()">
                <select id="adminCreatorFilter" class="status-select" onchange="adminApplyFilters()">${dropdownOptions}</select>
                <button class="btn-primary" onclick="openConfigModal()"><i class="fas fa-plus"></i> Create New</button>
            </div>
        </div>
        
        <div class="config-grid" id="admin-config-container">
            ${buildAdminConfigGridHTML(adminFilteredConfigs.slice(0, adminVisibleCount))}
        </div>
        
        <div id="adminShowMoreWrap" style="text-align:center; margin-top:2rem; display:${adminFilteredConfigs.length > adminVisibleCount ? 'block' : 'none'};">
            <button class="btn-secondary" style="width:100%; padding:15px;" onclick="adminShowMoreConfigs()">SHOW MORE CONFIGS</button>
        </div>
    `;
}

function adminApplyFilters() {
    const search = (document.getElementById('adminConfigSearch')?.value || '').toLowerCase();
    const creator = document.getElementById('adminCreatorFilter')?.value || 'all';
    
    adminFilteredConfigs = adminAllConfigs.filter(c => {
        const creatorStr = Array.isArray(c.creator) ? c.creator.join(', ') : c.creator;
        return (c.title || '').toLowerCase().includes(search) && (creator === 'all' || creatorStr === creator);
    });
    
    adminVisibleCount = 9;
    document.getElementById('admin-config-container').innerHTML = buildAdminConfigGridHTML(adminFilteredConfigs.slice(0, adminVisibleCount));
    
    const showMoreWrapper = document.getElementById('adminShowMoreWrap');
    if (showMoreWrapper) {
        showMoreWrapper.style.display = adminVisibleCount >= adminFilteredConfigs.length ? 'none' : 'block';
    }
}

function adminShowMoreConfigs() {
    adminVisibleCount += 9;
    document.getElementById('admin-config-container').innerHTML = buildAdminConfigGridHTML(adminFilteredConfigs.slice(0, adminVisibleCount));
    
    const showMoreWrapper = document.getElementById('adminShowMoreWrap');
    if (showMoreWrapper) {
        showMoreWrapper.style.display = adminVisibleCount >= adminFilteredConfigs.length ? 'none' : 'block';
    }
}

function buildAdminConfigGridHTML(configs) {
    return configs.map(c => {
        const actionBtnTxt = c.is_archived === 'true' ? 'Publish' : 'Archive';
        const newArchivedVal = c.is_archived === 'true' ? 'false' : 'true';
        const displayCreator = Array.isArray(c.creator) ? c.creator.join(', ') : c.creator;
        
        return `
            <div class="item-card">
                <h3>${escapeHTML(c.title)}</h3>
                <div class="card-section">
                    <div class="data-row">
                        <span class="data-label">Status:</span> 
                        <span class="data-val" style="color: #f1c40f;"><i class="fas fa-star"></i> ${c.calc_rating} Avg Rating</span>
                    </div>
                    <div class="data-row">
                        <span class="data-label">Creator:</span> 
                        <span class="data-val">${escapeHTML(displayCreator)}</span>
                    </div>
                    <div class="data-row">
                        <span class="data-label">Pri:</span> 
                        <span class="data-val">${escapeHTML(c.priority)}</span>
                    </div>
                </div>
                <div class="card-actions" style="justify-content:flex-end;">
                    <button class="btn-secondary" onclick="openConfigModal('${c.id}')"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn-secondary" onclick="updateDB('configs', '${c.id}', 'is_archived', '${newArchivedVal}', true)">${actionBtnTxt}</button>
                    <button class="btn-danger" title="Delete" onclick="deleteRecord('configs', '${c.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadAdminTags() {
    try { 
        const res = await fetch('/assets/data/tags.json'); 
        if (res.ok) adminTagData = await res.json(); 
    } catch (e) { 
        console.warn("Failed to load tag data."); 
    }
}

function getAdminTagData(t) {
    const cleanTag = t.trim().toUpperCase();
    if (adminTagData[cleanTag]) return adminTagData[cleanTag];
    
    for (const key in adminTagData) { 
        if (cleanTag.includes(key.toUpperCase())) return adminTagData[key]; 
    }
    return { color: '#666', icon: 'fas fa-tag' }; 
}

// Contributors List (Public)
async function renderContributors() {
    const { data } = await _supabase.from('contributors').select('*').order('priority', { ascending: true });
    activeDataStore = data || [];
    
    const publicData = activeDataStore.filter(c => c.is_private !== true && c.is_private !== 'true');

    let gridHtml = publicData.map(c => {
        const rawTags = Array.isArray(c.tags) ? c.tags : (c.tags?.split(',').map(s => escapeHTML(s.trim())) || []);
        
        const renderedTags = rawTags.map(tag => {
            const tData = getAdminTagData(tag);
            return `<span class="con-tag" style="color: ${tData.color}; border-color: ${tData.color}; margin-top: 5px;"><i class="${tData.icon}"></i> ${escapeHTML(tag)}</span>`;
        }).join(' ');

        const displayName = Array.isArray(c.name) ? c.name.join(', ') : c.name;

        return `
            <div class="item-card">
                <h3 style="display:flex; align-items:center; gap: 10px;">
                    <i class="${escapeHTML(c.role_icon)}" style="color:${escapeHTML(c.icon_color)}"></i> 
                    ${escapeHTML(displayName)}
                </h3>
                <div style="margin-bottom: 15px;">${renderedTags}</div>
                <div class="card-actions" style="justify-content:flex-end; margin-top:auto;">
                    <button class="btn-secondary" onclick="openContributorModal('${c.id}', false)"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn-danger" title="Delete" onclick="deleteRecord('contributors', '${c.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="page-header">
            <div>
                <h1>Public Directory</h1>
                <p style="color:var(--text-dim); margin-top:5px;">Users shown here will be visible on the main dashboard.</p>
            </div>
            <button class="btn-primary" onclick="openContributorModal(null, false)"><i class="fas fa-plus"></i> Create Public Contributor</button>
        </div>
        <div class="config-grid">${gridHtml}</div>
    `;
}

// Tags List (Private)
async function renderPrivateTags() {
    const { data } = await _supabase.from('contributors').select('*');
    activeDataStore = data || [];
    
    const privateData = activeDataStore.filter(c => c.is_private === true || c.is_private === 'true');

    let gridHtml = privateData.map(c => {
        const rawTags = Array.isArray(c.tags) ? c.tags : (c.tags?.split(',').map(s => escapeHTML(s.trim())) || []);
        const renderedTags = rawTags.map(tag => {
            const tData = getAdminTagData(tag);
            return `<span class="con-tag" style="color: ${tData.color}; border-color: ${tData.color}; margin-top: 5px;"><i class="${tData.icon}"></i> ${escapeHTML(tag)}</span>`;
        }).join(' ');

        const displayName = Array.isArray(c.name) ? c.name.join(', ') : c.name;

        return `
            <div class="item-card" style="border-style: dashed; border-color: var(--text-dim);">
                <h3 style="display:flex; align-items:center; gap: 10px; color: var(--text-dim);">
                    <i class="fas fa-user-secret"></i> 
                    ${escapeHTML(displayName)}
                </h3>
                <div style="margin-bottom: 15px;">${renderedTags}</div>
                <div class="card-actions" style="justify-content:flex-end; margin-top:auto;">
                    <button class="btn-secondary" onclick="openContributorModal('${c.id}', true)"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn-danger" title="Delete" onclick="deleteRecord('contributors', '${c.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="page-header">
            <div>
                <h1>Private Tags Archive</h1>
                <p style="color:var(--text-dim); margin-top:5px;">Hidden from the dashboard directory, but tags still show on configs/reviews.</p>
            </div>
            <button class="btn-primary" style="background: var(--text-dim);" onclick="openContributorModal(null, true)"><i class="fas fa-plus"></i> Create Private Tag</button>
        </div>
        <div class="config-grid">${gridHtml}</div>
    `;
}

async function renderUsers() {
    const { data, error } = await _supabase.from('users').select('*').order('last_login', { ascending: false }).limit(50);
    
    if (error || !data || data.length === 0) {
        return `<div class="page-header"><h1>Users Overview</h1></div><p style="color:var(--text-dim)">No data.</p>`;
    }
    
    const tableRows = data.map(u => `
        <tr>
            <td style="font-weight:700;">${escapeHTML(u.username)}</td>
            <td style="color:var(--text-dim); font-size:0.85rem;">${escapeHTML(u.discord_id)}</td>
            <td style="color:${u.rank === 'admin' ? 'var(--accent)' : 'inherit'}; font-weight:${u.rank === 'admin' ? '900' : 'normal'};">${escapeHTML(u.rank)}</td>
            <td>${u.isBlacklisted === 'true' ? '<span style="color:var(--danger); font-weight:800;">True</span>' : 'False'}</td>
            <td style="color:var(--text-dim); font-size:0.85rem;">${u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
        </tr>
    `).join('');

    return `
        <div class="page-header"><h1>Users Overview</h1></div>
        <div class="table-viewer-wrap">
            <table class="data-table">
                <thead><tr><th>Username</th><th>Discord ID</th><th>Rank</th><th>Blacklisted</th><th>Last Login</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;
}

async function renderRank() {
    const { data } = await _supabase.from('users').select('*').order('username', { ascending: true });
    
    const tableRows = (data || []).map(u => `
        <tr>
            <td>${escapeHTML(u.username)}</td>
            <td>${escapeHTML(u.rank)}</td>
            <td>
                <select class="status-select" onchange="updateDB('users', '${u.id}', 'rank', this.value)">
                    <option value="user" ${u.rank !== 'admin' ? 'selected' : ''}>User</option>
                    <option value="admin" ${u.rank === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
        </tr>
    `).join('');

    return `
        <div class="page-header"><h1>Rank Management</h1></div>
        <div class="table-viewer-wrap">
            <table class="data-table">
                <thead><tr><th>Username</th><th>Current Rank</th><th>Action</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;
}

async function renderBlacklist() {
    const { data } = await _supabase.from('users').select('*').order('username', { ascending: true });
    
    const tableRows = (data || []).map(u => `
        <tr>
            <td>${escapeHTML(u.username)}</td>
            <td>${u.isBlacklisted === 'true' ? '<span style="color:var(--danger);">Blacklisted</span>' : 'Active'}</td>
            <td>
                <label class="toggle-switch">
                    <input type="checkbox" ${u.isBlacklisted === 'true' ? 'checked' : ''} onchange="updateBlacklist('${u.id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </td>
        </tr>
    `).join('');

    return `
        <div class="page-header"><h1>Account Blacklisting</h1></div>
        <div class="table-viewer-wrap">
            <table class="data-table">
                <thead><tr><th>Username</th><th>Status</th><th>Toggle</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;
}

async function renderReviews() {
    const { data } = await _supabase.from('reviews').select('*').order('created_at', { ascending: false });
    
    const tableRows = (data || []).map(r => `
        <tr>
            <td style="color:var(--text-dim);">${r.id}</td>
            <td style="color:var(--accent); font-weight:bold;">${r.replying_to_id ? `#${r.replying_to_id}` : '-'}</td>
            <td style="font-weight:bold;">${r.config_id}</td>
            <td>${escapeHTML(r.poster_username)}</td>
            <td style="max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(r.comment)}</td>
            <td style="color:#f1c40f;">${r.rating || '-'} <i class="fas fa-star"></i></td>
            <td>
                <button class="btn-danger" style="padding: 6px 12px;" onclick="deleteRecord('reviews', '${r.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    return `
        <div class="page-header"><h1>Global Reviews DB</h1></div>
        <div class="table-viewer-wrap">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Reply To</th><th>Config ID</th><th>User</th><th>Comment</th><th>Stars</th><th>Action</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    `;
}

async function renderDB() {
    const tables = ['users', 'configs', 'contributors', 'reviews', 'user_profiles'];
    let html = `
        <div class="page-header"><h1>Database Overview</h1></div>
        <div class="config-grid">
    `;
    
    for (let table of tables) {
        const { count } = await _supabase.from(table).select('*', { count: 'exact', head: true });
        
        html += `
            <div class="item-card">
                <h3 style="text-transform:capitalize;">${table}</h3>
                <div class="data-row">
                    <span class="data-label">Rows:</span> 
                    <span class="data-val">${count || 0}</span>
                </div>
                <div class="card-actions">
                    <button class="btn-secondary" style="width:100%;" onclick="viewTableData('${table}')">
                        <i class="fas fa-table"></i> View Data
                    </button>
                </div>
            </div>
        `;
    }
    return html + `</div>`;
}

async function renderSettings() {
    const { data } = await _supabase.from('settings').select('maintenance_mode').eq('id', 1).single();
    
    return `
        <div class="page-header"><h1>Website Settings</h1></div>
        <div class="item-card" style="max-width: 600px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h3>Maintenance Mode</h3>
                    <p style="font-size:0.85rem; color:var(--text-dim);">Redirects non-admins.</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="maintenanceToggle" ${data?.maintenance_mode ? 'checked' : ''} onchange="toggleMaintenanceMode(this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    `;
}

// DB Modifiers
async function updateDB(table, id, column, value, refresh = false) {
    try {
        const { error } = await _supabase.from(table).update({ [column]: value }).eq('id', id);
        if (error) throw error;
        
        if (refresh) refreshCurrentView();
    } catch (err) { 
        await customAlert("Error: " + err.message, "Error"); 
    }
}

async function updateBlacklist(id, isBlacklisted) {
    const val = isBlacklisted ? 'true' : 'false';
    await _supabase.from('users').update({ isBlacklisted: val }).eq('id', id);
    refreshCurrentView();
}

async function deleteRecord(table, id) {
    const confirmed = await customConfirm("Are you sure you want to permanently delete this record?", "Delete Record", "Delete", true);
    if (!confirmed) return;
    
    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (!error) {
        refreshCurrentView(); 
    } else {
        await customAlert("Error: " + error.message, "Error");
    }
}

async function toggleMaintenanceMode(isMaintenance) {
    const confirmed = await customConfirm(`Turn ${isMaintenance ? 'ON' : 'OFF'} maintenance mode?`, "Maintenance Mode");
    
    if (!confirmed) {
        // revert toggle switch UI
        document.getElementById('maintenanceToggle').checked = !isMaintenance;
        return;
    }
    
    const { error } = await _supabase.from('settings').update({ maintenance_mode: isMaintenance }).eq('id', 1);
    
    if (error) {
        await customAlert("Failed to update.", "Error");
        document.getElementById('maintenanceToggle').checked = !isMaintenance;
    }
}

function openModal(title, htmlContent) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerHTML = htmlContent;
    document.getElementById('adminModal').classList.add('show');
}

function closeModal(e) {
    // only close if they clicked the backdrop
    if (e && e.target !== document.getElementById('adminModal')) return;
    document.getElementById('adminModal').classList.remove('show');
}

async function viewTableData(table) {
    const { data, error } = await _supabase.from(table).select('*').limit(20);
    
    if (error || !data || data.length === 0) {
        return await customAlert("No data to show.", "Notice");
    }
    
    const keys = Object.keys(data[0]);
    
    const thead = keys.map(k => `<th>${escapeHTML(k)}</th>`).join('');
    const tbody = data.map(row => {
        const tds = keys.map(k => `<td>${row[k] === null ? 'null' : escapeHTML(String(row[k]).substring(0, 30))}</td>`).join('');
        return `<tr>${tds}</tr>`;
    }).join('');

    openModal(`Viewing ${escapeHTML(table)}`, `
        <div class="table-viewer-wrap" style="max-height: 60vh;">
            <table class="data-table" style="min-width: 800px;">
                <thead><tr>${thead}</tr></thead>
                <tbody>${tbody}</tbody>
            </table>
        </div>
    `);
    
    document.querySelector('.modal-content').style.maxWidth = "90%";
}

function openConfigModal(id = null) {
    document.querySelector('.modal-content').style.maxWidth = "650px";
    let obj = id ? activeDataStore.find(t => String(t.id) === String(id)) : {};
    
    const displayCreator = Array.isArray(obj.creator) ? obj.creator.join(', ') : (obj.creator || '');

    openModal(id ? 'Edit Config' : 'Create New Config', `
        <form id="configForm" onsubmit="saveForm(event, 'configs', '${id || ''}')">
            <div class="form-grid">
                <div class="form-group full">
                    <label>Title</label>
                    <input type="text" name="title" class="form-control" value="${escapeHTML(obj.title || '')}" required>
                </div>
                <div class="form-group">
                    <label>Ping Tier</label>
                    <input type="text" name="ping_tier" class="form-control" value="${escapeHTML(obj.ping_tier || 'Mid')}">
                </div>
                <div class="form-group">
                    <label>Ping Range</label>
                    <input type="text" name="ping_range" class="form-control" value="${escapeHTML(obj.ping_range || '')}" placeholder="e.g. 50-100ms">
                </div>
                <div class="form-group">
                    <label>Creator (Display Name, Username)</label>
                    <input type="text" name="creator" class="form-control" value="${escapeHTML(displayCreator)}" placeholder="e.g. Kriz, krizzster">
                </div>
                <div class="form-group">
                    <label>Sim Timer</label>
                    <input type="number" name="sim_timer" class="form-control" value="${escapeHTML(obj.sim_timer || 123)}">
                </div>
                <div class="form-group">
                    <label>Pred Interval</label>
                    <input type="text" name="pred_interval" class="form-control" value="${escapeHTML(obj.pred_interval || '')}">
                </div>
                <div class="form-group">
                    <label>Vertical Multiplier</label>
                    <input type="number" name="vertical" class="form-control" value="${escapeHTML(obj.vertical || 155)}">
                </div>
                <div class="form-group">
                    <label>Horizontal Multiplier</label>
                    <input type="number" name="horizontal" class="form-control" value="${escapeHTML(obj.horizontal || 165)}">
                </div>
                <div class="form-group">
                    <label>Offsets (X/Y/Z)</label>
                    <input type="text" name="offsets" class="form-control" value="${escapeHTML(obj.offsets || '0 / 0 / 0')}">
                </div>
                <div class="form-group">
                    <label>Hit Rate</label>
                    <input type="text" name="hit_rate" class="form-control" value="${escapeHTML(obj.hit_rate || '85%')}">
                </div>
                <div class="form-group full">
                    <label>Priority (Lower = Higher)</label>
                    <input type="number" name="priority" class="form-control" value="${escapeHTML(obj.priority || 1)}" required>
                </div>
                <div class="form-group full">
                    <label>Is Archived (Draft)</label>
                    <select name="is_archived" class="form-control">
                        <option value="false" ${obj.is_archived === 'false' ? 'selected' : ''}>False (Published)</option>
                        <option value="true" ${obj.is_archived === 'true' ? 'selected' : ''}>True (Archived/Draft)</option>
                    </select>
                </div>
            </div>
            <div style="text-align:right; margin-top:20px; border-top:1px solid var(--border); padding-top:15px;">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-primary" style="margin-left:10px; display:inline-flex;">Save Config</button>
            </div>
        </form>
    `);
}

function openContributorModal(id = null, isPrivate = false) {
    document.querySelector('.modal-content').style.maxWidth = "500px";
    let obj = id ? activeDataStore.find(t => String(t.id) === String(id)) : {};
    
    let extraFields = isPrivate ? '' : `
        <div class="form-grid">
            <div class="form-group">
                <label>Role Icon (FontAwesome)</label>
                <input type="text" name="role_icon" class="form-control" value="${escapeHTML(obj.role_icon || 'fas fa-crown')}">
            </div>
            <div class="form-group">
                <label>Icon Color (Hex)</label>
                <input type="text" name="icon_color" class="form-control" value="${escapeHTML(obj.icon_color || '#ffffff')}">
            </div>
        </div>
        <div class="form-group">
            <label>Display Priority (Lower is first)</label>
            <input type="number" name="priority" class="form-control" value="${escapeHTML(obj.priority || 1)}" required>
        </div>
    `;

    const title = id 
        ? (isPrivate ? 'Edit Private Tag' : 'Edit Contributor') 
        : (isPrivate ? 'Create Private Tag' : 'Create Contributor');
        
    const displayName = Array.isArray(obj.name) ? obj.name.join(', ') : (obj.name || '');

    openModal(title, `
        <form id="contributorForm" onsubmit="saveContributorForm(event, '${id || ''}', ${isPrivate})">
            <div class="form-group">
                <label>Name (Display Name, Username)</label>
                <input type="text" name="name" class="form-control" value="${escapeHTML(displayName)}" required placeholder="e.g. Kriz, krizzster">
            </div>
            
            ${extraFields}
            
            <div class="form-group">
                <label>Tags (Comma separated)</label>
                <input type="text" name="tags" class="form-control" value="${escapeHTML((obj.tags || []).join(', '))}">
            </div>
            
            <div style="text-align:right; margin-top:20px; border-top:1px solid var(--border); padding-top:15px;">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-primary" style="margin-left:10px; display:inline-flex;">Save Data</button>
            </div>
        </form>
    `);
}

async function saveForm(e, table, id) {
    e.preventDefault();
    if (!(await verifyAdminAuth())) {
        return await customAlert("Security Error: Admin rights required.", "Access Denied");
    }
    
    const formData = Object.fromEntries(new FormData(e.target).entries());
    
    // Auto-parse arrays
    if (formData.creator) {
        formData.creator = formData.creator.split(',').map(s => s.trim());
    }
    
    if (id) formData.id = id;

    const { error } = await _supabase.from(table).upsert(formData);
    
    if (error) {
        await customAlert("Save Error: " + error.message, "Error");
    } else {
        closeModal(); 
        refreshCurrentView(); 
    }
}

async function saveContributorForm(e, id, isPrivate) {
    e.preventDefault();
    if (!(await verifyAdminAuth())) {
        return await customAlert("Security Error: Admin rights required.", "Access Denied");
    }
    
    const formData = Object.fromEntries(new FormData(e.target).entries());
    
    if (formData.tags) {
        formData.tags = formData.tags.split(',').map(s => s.trim());
    }
    if (formData.name) {
        formData.name = formData.name.split(',').map(s => s.trim());
    }
    
    if (id) formData.id = id;

    if (isPrivate) {
        formData.is_private = true;
        formData.role_icon = null;
        formData.icon_color = null;
        formData.priority = null;
    } else {
        formData.is_private = false;
    }

    const { error } = await _supabase.from('contributors').upsert(formData);
    
    if (error) {
        await customAlert("Save Error: " + error.message, "Error");
    } else {
        closeModal(); 
        refreshCurrentView(); 
    }
}
