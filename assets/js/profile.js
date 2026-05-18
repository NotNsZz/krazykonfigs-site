// Borrows tagColorDictionary from core.js
async function loadProfileTags() {
    try { const res = await fetch('/assets/data/tags.json'); if (res.ok) tagColorDictionary = await res.json(); } 
    catch (e) { console.warn("Using fallback tag colors."); }
}
loadProfileTags();

// --- MAIN PROFILE INITIALIZATION ---
async function initProfileLogic() {
    if(typeof bootSequence === 'function') await bootSequence();

    const urlParams = new URLSearchParams(window.location.search);
    const targetDiscordId = urlParams.get('user');
    const targetName = urlParams.get('name'); 

    if (!targetDiscordId && !targetName) return window.location.href = '/404.html';

    try {
        let user = null;

        // 1. BULLETPROOF TIER: Discord ID
        if (targetDiscordId) {
            const { data } = await _supabase.from('users').select('*').eq('discord_id', targetDiscordId).limit(1);
            if(data && data.length > 0) user = data[0];
        } 
        
        // 2. FALLBACK TIER: Intelligent Name Search
        if (!user && targetName) {
            const cleanName = decodeURIComponent(targetName).trim(); 
            
            let { data } = await _supabase.from('users').select('*').ilike('username', cleanName).limit(1);
            
            if (!data || data.length === 0) {
                ({ data } = await _supabase.from('users').select('*').ilike('display_name', cleanName).limit(1));
            }
            
            if (!data || data.length === 0) {
                ({ data } = await _supabase.from('users').select('*').or(`display_name.ilike.%${cleanName}%,username.ilike.%${cleanName}%`).limit(1));
            }

            if(data && data.length > 0) user = data[0];
        }

        if (!user) return window.location.href = '/404.html';

        // --- POPULATE THE UI ---
        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, uName];

        // Fetch Configs
        const { data: configs } = await _supabase.from('configs').select('id').in('creator', namesToCheck);
        const configCount = configs ? configs.length : 0;
        const isCreator = configCount > 0;

        // Fetch Contributor Tags
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', namesToCheck).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        // Update DOM
        const avatarEl = document.getElementById('p-avatar');
        const dnameEl = document.getElementById('p-dname');
        const unameEl = document.getElementById('p-uname');
        const configsEl = document.getElementById('stat-configs');
        const joinedEl = document.getElementById('stat-joined');
        
        if(avatarEl) avatarEl.src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        if(dnameEl) dnameEl.innerText = escapeHTML(dName);
        if(unameEl) unameEl.innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        if(configsEl) configsEl.innerText = configCount;
        
        if(joinedEl) joinedEl.innerText = user.last_login ? new Date(user.last_login).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';

        // Badges & Tags
        const badgesEl = document.getElementById('p-badges');
        if (badgesEl) {
            badgesEl.innerHTML = isCreator ? `<span class="role-badge badge-creator"><i class="fas fa-hammer"></i> Creator</span>` : `<span class="role-badge badge-user"><i class="fas fa-user"></i> User</span>`;
        }

        const tagsContainer = document.getElementById('p-tags');
        if (tags.length > 0 && tagsContainer) {
            tagsContainer.style.display = 'flex';
            tagsContainer.innerHTML = tags.map(t => {
                const color = typeof getBadgeColor === 'function' ? getBadgeColor(t) : '#666';
                return `<span class="con-tag" style="color: ${color}; border-color: ${color};">${escapeHTML(t.trim())}</span>`;
            }).join('');
        }

    } catch (err) {
        console.error("Profile Load Error:", err);
    }
}
