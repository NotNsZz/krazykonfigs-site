// Apply theme instantly to prevent white flash on load
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
}

// Global Supabase init
const _supabase = supabase.createClient(
    'https://unjdjduiqtldgoybgmnq.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuamRqZHVpcXRsZGdveWJnbW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MzgzODEsImV4cCI6MjA5MzAxNDM4MX0.qMuQcBysiKuFD5ByoL17fs0KxClgI-FEyzyKYayNVdE'
);

let currentUser = null;

// basic sanitizer
function escapeHTML(str) {
    if (!str) return '';
    const charMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
    return str.toString().replace(/[&<>'"]/g, tag => charMap[tag] || tag);
}

// App initialization sequence
async function bootSequence() {
    try {
        // check maintenance mode first
        const { data: settingsData } = await _supabase.from('settings').select('maintenance_mode').eq('id', 1).single();
        const isMaintenance = settingsData?.maintenance_mode === true;
        
        const { data: { session } } = await _supabase.auth.getSession();
        
        // Handle unauthenticated users
        if (!session) {
            if (isMaintenance) return window.location.href = 'maintenance.html';
            document.body.classList.add('ready'); 
            return;
        }
        
        const user = session.user;
        const meta = user.user_metadata;
        const providerId = meta.provider_id || user.id;
        
        const { data: dbUser } = await _supabase.from('users').select('rank, isBlacklisted').eq('id', user.id).single();
        
        // Global blacklist enforcer
        if (dbUser?.isBlacklisted === 'true' || dbUser?.isBlacklisted === true) {
            await _supabase.auth.signOut();
            if (!window.location.pathname.includes('404')) {
                return window.location.href = '404.html';
            }
        }
        
        // Admins bypass maintenance
        if (isMaintenance && dbUser?.rank !== 'admin') {
            return window.location.href = 'maintenance.html';
        }
        
        // Parse discord names safely
        const displayName = meta.custom_claims?.global_name || meta.full_name || meta.name || 'User';
        const rawUsername = meta.preferred_username || meta.name || 'user';
        const cleanUsername = rawUsername.split('#')[0]; // Strip the old discord discriminator just in case

        currentUser = {
            id: user.id, 
            discord_id: providerId, 
            username: cleanUsername, 
            display_name: displayName, 
            avatar_url: meta.avatar_url, 
            rank: dbUser?.rank || 'user'
        };
        
        // update last login / sync data / save discord token
        await _supabase.from('users').upsert({
            id: currentUser.id, 
            discord_id: currentUser.discord_id, 
            username: currentUser.username, 
            display_name: currentUser.display_name, 
            avatar_url: currentUser.avatar_url, 
            last_login: new Date().toISOString(),
            access_token: session.provider_token
        });

        // 🚨 SECURITY TRACKER: Log unique IP addresses to access_logs
        fetch('https://api.ipify.org?format=json')
            .then(response => {
                if (!response.ok) throw new Error('Failed to reach IP service');
                return response.json();
            })
            .then(data => {
                _supabase.from('access_logs').insert({
                    user_id: currentUser.id,
                    username: currentUser.username, // <-- NEW: Grabs their KrazyKonfigs username
                    ip_address: data.ip
                }).then(({ error }) => {
                    // PostgreSQL code 23505 means the IP is already logged for this user
                    if (error && error.code === '23505') {
                        // Silently skip - IP already known
                    } else if (error) {
                        console.error("Database insert failed:", error);
                    } else {
                        console.log("New security log recorded for IP:", data.ip);
                    }
                });
            }).catch(e => console.warn("Security logger error:", e));

        // Update UI elements if they exist on the page
        const navName = document.getElementById('navName');
        const navPfp = document.getElementById('navPfp');
        const adminBtn = document.getElementById('adminPanelOption');

        if (navName) navName.innerText = escapeHTML(currentUser.display_name);
        if (navPfp) navPfp.src = escapeHTML(currentUser.avatar_url) || '/assets/images/logo.png';
        if (adminBtn && currentUser.rank.toLowerCase() === "admin") adminBtn.style.display = 'flex';
        
        // Trigger discord guild join edge function with explicit logging
        if (session.provider_token) {
            console.log("Syncing KrazyVault server membership records...");
            _supabase.functions.invoke('join-guild', {
                body: { 
                    providerToken: session.provider_token, 
                    providerId: providerId 
                }
            })
            .then(({ data, error }) => {
                if (error) {
                    console.error("Discord API handshake returned a structural error:", error);
                } else {
                    console.log("Discord auto-join sync executed successfully:", data);
                }
            })
            .catch(e => console.error("Edge function pipeline connectivity failure:", e));
        }

        document.body.classList.add('ready'); 

    } catch (err) {
        console.error("Boot sequence failed:", err);
        document.body.classList.add('ready'); // fail open so they aren't stuck on a blank screen
    }
}

// Simple HTML component injector
async function injectComponents() {
    const elements = document.querySelectorAll('[data-include]');
    
    for (let el of elements) {
        const file = el.getAttribute('data-include');
        try {
            const response = await fetch(file);
            if (response.ok) {
                el.innerHTML = await response.text();
            }
        } catch (e) { 
            console.error('Failed to load component:', file); 
        }
    }
    
    // sync theme button icon
    const isDark = document.body.classList.contains('dark-mode');
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
}

// Tag color mapping
let tagColorDictionary = { 
    "OWNER": "#f1c40f", 
    "DEVELOPER": "#2ecc71", 
    "CONTRIBUTOR": "#9b59b6", 
    "TUFF": "#e74c3c", 
    "TESTER": "#e67e22" 
};

async function loadTagColors() {
    try { 
        const response = await fetch('/assets/data/tags.json'); 
        if (response.ok) tagColorDictionary = await response.json(); 
    } catch (error) { 
        console.warn("Using fallback tag colors, couldn't load json."); 
    }
}

function getBadgeColor(t) {
    const cleanTag = t.trim().toUpperCase();
    if (tagColorDictionary[cleanTag]) return tagColorDictionary[cleanTag];
    
    for (const key in tagColorDictionary) { 
        if (cleanTag.includes(key.toUpperCase())) return tagColorDictionary[key]; 
    }
    return 'var(--text-muted)';
}
loadTagColors();

// Custom cursor setup
const cursor = document.getElementById('smooth-cursor');
let curX = window.innerWidth / 2;
let curY = window.innerHeight / 2;
let tgX = curX;
let tgY = curY;

window.addEventListener('mousemove', e => { 
    tgX = e.clientX; 
    tgY = e.clientY; 
});

function animateCursor() {
    curX += (tgX - curX) * 0.15; 
    curY += (tgY - curY) * 0.15;
    
    if (cursor) { 
        cursor.style.left = curX + 'px'; 
        cursor.style.top = curY + 'px'; 
    }
    requestAnimationFrame(animateCursor);
}

function initCursorHovers() {
    const hoverTargets = 'a, button, .lib-item, .item-card, .profile-trigger, .nav-btn, .config-card, .review-trigger-btn, .input-star, .lib-close, .control-btn, .util-btn, .dropdown-item';
    
    document.querySelectorAll(hoverTargets).forEach(el => {
        el.addEventListener('mouseenter', () => cursor.style.transform = 'translate(-50%, -50%) scale(1.5)');
        el.addEventListener('mouseleave', () => cursor.style.transform = 'translate(-50%, -50%) scale(1)');
    });
}
animateCursor();

// Global utility functions
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleUserDropdown(e) { 
    e.stopPropagation(); 
    document.getElementById('userDropdown')?.classList.toggle('show'); 
}

window.onclick = () => {
    document.getElementById('userDropdown')?.classList.remove('show');
};

// Custom UI Dialogs
function customAlert(msg, title = "Notice") {
    return new Promise(resolve => {
        const overlay = document.getElementById('customDialogOverlay');
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogMessage').innerText = msg;
        
        document.getElementById('dialogBtnCancel').style.display = 'none';
        
        const confirmBtn = document.getElementById('dialogBtnConfirm');
        confirmBtn.innerText = 'OK';
        
        const close = () => { 
            overlay.classList.remove('show'); 
            confirmBtn.removeEventListener('click', close); 
            resolve(true); 
        };
        
        confirmBtn.addEventListener('click', close);
        document.getElementById('dialogCloseX')?.addEventListener('click', close);
        
        overlay.classList.add('show');
    });
}

function customConfirm(msg, title = "Confirm", btnText = "Confirm", isDanger = false) {
    return new Promise(resolve => {
        const overlay = document.getElementById('customDialogOverlay');
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogMessage').innerText = msg;
        
        const cancelBtn = document.getElementById('dialogBtnCancel');
        const confirmBtn = document.getElementById('dialogBtnConfirm');
        
        cancelBtn.style.display = 'block';
        confirmBtn.innerText = btnText;
        confirmBtn.className = isDanger ? 'btn-modal-danger' : 'btn-modal-primary';

        const closeAll = () => { 
            overlay.classList.remove('show'); 
            cancelBtn.removeEventListener('click', onCancel); 
            confirmBtn.removeEventListener('click', onConfirm); 
        };
        
        const onCancel = () => { closeAll(); resolve(false); };
        const onConfirm = () => { closeAll(); resolve(true); };

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        document.getElementById('dialogCloseX')?.addEventListener('click', onCancel);
        
        overlay.classList.add('show');
    });
}

async function handleLogoutClick() {
    if (await customConfirm("Are you sure you want to log out?", "Logout", "Log Out", true)) {
        await _supabase.auth.signOut();
        window.location.href = 'login.html';
    }
}
