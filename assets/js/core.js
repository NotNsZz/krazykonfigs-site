// --- 0. INSTANT GLOBAL THEME SYNC ---
if(localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
}

// --- 1. GLOBAL VARIABLES & SUPABASE ---
const _supabase = supabase.createClient('https://unjdjduiqtldgoybgmnq.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuamRqZHVpcXRsZGdveWJnbW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MzgzODEsImV4cCI6MjA5MzAxNDM4MX0.qMuQcBysiKuFD5ByoL17fs0KxClgI-FEyzyKYayNVdE');
let currentUser = null;

function escapeHTML(str) {
    if(!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag] || tag));
}

// --- 2. AUTHENTICATION & BOOT LOGIC ---
async function bootSequence() {
    try {
        const {data: t} = await _supabase.from('settings').select('maintenance_mode').eq('id', 1).single();
        const isMaintenance = t?.maintenance_mode === true;
        const {data: {session: n}} = await _supabase.auth.getSession();
        
        if(!n) {
            if(isMaintenance) return window.location.href = 'maintenance.html';
            document.body.classList.add('ready'); 
            return;
        }
        
        const i = n.user, c = i.user_metadata, o = c.provider_id || i.id;
        const {data: r} = await _supabase.from('users').select('rank, isBlacklisted').eq('id', i.id).single();
        
        if(r?.isBlacklisted === 'true') {
            await _supabase.auth.signOut();
            return window.location.href = 'maintenance.html';
        }
        if(isMaintenance && r?.rank !== 'admin') return window.location.href = 'maintenance.html';
        
        const dName = c.custom_claims?.global_name || c.full_name || c.name || 'User';
        const uName = c.preferred_username || c.name || 'user';

        currentUser = {
            id: i.id, discord_id: o, 
            username: uName, display_name: dName, 
            avatar_url: c.avatar_url, rank: r?.rank || 'user'
        };
        
        await _supabase.from('users').upsert({
            id: currentUser.id, discord_id: currentUser.discord_id, 
            username: currentUser.username, display_name: currentUser.display_name, 
            avatar_url: currentUser.avatar_url, last_login: new Date().toISOString()
        });

        const navName = document.getElementById('navName');
        const navPfp = document.getElementById('navPfp');
        const adminBtn = document.getElementById('adminPanelOption');

        if(navName) navName.innerText = escapeHTML(currentUser.display_name);
        if(navPfp) navPfp.src = escapeHTML(currentUser.avatar_url) || '/assets/images/logo.png';
        if(adminBtn && currentUser.rank.toLowerCase() === "admin") adminBtn.style.display = 'flex';
        
        document.body.classList.add('ready'); 
    } catch(err) {
        console.error(err);
        document.body.classList.add('ready');
    }
}

// --- 3. THE COMPONENT INJECTOR ---
async function injectComponents() {
    const elements = document.querySelectorAll('[data-include]');
    for (let el of elements) {
        const file = el.getAttribute('data-include');
        try {
            const response = await fetch(file);
            if (response.ok) el.innerHTML = await response.text();
        } catch (e) { console.error('Failed to load component:', file); }
    }
    
    // Auto-update theme toggle icons
    const isDark = document.body.classList.contains('dark-mode');
    const tBtn = document.getElementById('themeBtn');
    if(tBtn) tBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// --- 4. TAG DICTIONARY LOADER ---
let tagColorDictionary = { "OWNER": "#f1c40f", "DEVELOPER": "#2ecc71", "CONTRIBUTOR": "#9b59b6", "TUFF": "#e74c3c", "TESTER": "#e67e22" };
async function loadTagColors() {
    try { 
        const response = await fetch('/assets/data/tags.json'); 
        if (response.ok) tagColorDictionary = await response.json(); 
    } catch (error) { console.warn("Using fallback tag colors."); }
}
function getBadgeColor(t){
    const cleanTag = t.trim().toUpperCase();
    if (tagColorDictionary[cleanTag]) return tagColorDictionary[cleanTag];
    for (const key in tagColorDictionary) { if (cleanTag.includes(key.toUpperCase())) return tagColorDictionary[key]; }
    return 'var(--text-muted)';
}
loadTagColors();

// --- 5. SMOOTH CURSOR LOGIC ---
const cursor = document.getElementById('smooth-cursor');
let curX = window.innerWidth/2, curY = window.innerHeight/2, tgX = curX, tgY = curY;
window.addEventListener('mousemove', e => { tgX = e.clientX; tgY = e.clientY; });

function animateCursor() {
    curX += (tgX - curX) * 0.15; curY += (tgY - curY) * 0.15;
    if(cursor) { cursor.style.left = curX + 'px'; cursor.style.top = curY + 'px'; }
    requestAnimationFrame(animateCursor);
}
function initCursorHovers() {
    document.querySelectorAll('a, button, .lib-item, .item-card, .profile-trigger, .nav-btn, .config-card, .review-trigger-btn, .input-star, .lib-close, .control-btn, .util-btn, .dropdown-item').forEach(e => {
        e.addEventListener('mouseenter', () => cursor.style.transform = 'translate(-50%, -50%) scale(1.5)');
        e.addEventListener('mouseleave', () => cursor.style.transform = 'translate(-50%, -50%) scale(1)');
    });
}
animateCursor();

// --- 6. GLOBAL UTILS (Modals, Theme, Logout) ---
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    const tBtn = document.getElementById('themeBtn');
    if(tBtn) tBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleUserDropdown(e) { e.stopPropagation(); document.getElementById('userDropdown')?.classList.toggle('show'); }
window.onclick = () => document.getElementById('userDropdown')?.classList.remove('show');

function customAlert(msg, title="Notice") {
    return new Promise(resolve => {
        const overlay = document.getElementById('customDialogOverlay');
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogMessage').innerText = msg;
        document.getElementById('dialogBtnCancel').style.display = 'none';
        const confirmBtn = document.getElementById('dialogBtnConfirm');
        confirmBtn.innerText = 'OK';
        
        const close = () => { overlay.classList.remove('show'); confirmBtn.removeEventListener('click', close); resolve(true); };
        confirmBtn.addEventListener('click', close);
        document.getElementById('dialogCloseX')?.addEventListener('click', close);
        overlay.classList.add('show');
    });
}

function customConfirm(msg, title="Confirm", btnText="Confirm", isDanger=false) {
    return new Promise(resolve => {
        const overlay = document.getElementById('customDialogOverlay');
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogMessage').innerText = msg;
        const cancelBtn = document.getElementById('dialogBtnCancel');
        const confirmBtn = document.getElementById('dialogBtnConfirm');
        
        cancelBtn.style.display = 'block';
        confirmBtn.innerText = btnText;
        confirmBtn.className = isDanger ? 'btn-modal-danger' : 'btn-modal-primary';

        const closeAll = () => { overlay.classList.remove('show'); cancelBtn.removeEventListener('click', onCancel); confirmBtn.removeEventListener('click', onConfirm); };
        const onCancel = () => { closeAll(); resolve(false); };
        const onConfirm = () => { closeAll(); resolve(true); };

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        document.getElementById('dialogCloseX')?.addEventListener('click', onCancel);
        overlay.classList.add('show');
    });
}

async function handleLogoutClick() {
    if(await customConfirm("Are you sure you want to log out?", "Logout", "Log Out", true)) {
        await _supabase.auth.signOut();
        window.location.href = 'login.html';
    }
}
