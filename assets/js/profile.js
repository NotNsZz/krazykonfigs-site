// --- TAG COLOR DICTIONARY ---
// (We re-declare it here since profile uses it specifically for badges)
let tagColorDictionary = { "OWNER": "#f1c40f", "DEVELOPER": "#2ecc71", "CONTRIBUTOR": "#9b59b6", "TUFF": "#e74c3c", "TESTER": "#e67e22" };

async function loadProfileTags() {
    try { const res = await fetch('/assets/data/tags.json'); if (res.ok) tagColorDictionary = await res.json(); } 
    catch (e) { console.warn("Using fallback tag colors."); }
}
function getBadgeColor(t){
    const cleanTag = t.trim().toUpperCase();
    if (tagColorDictionary[cleanTag]) return tagColorDictionary[cleanTag];
    for (const key in tagColorDictionary) { if (cleanTag.includes(key.toUpperCase())) return tagColorDictionary[key]; }
    return 'var(--text-muted)';
}
loadProfileTags();

// --- MAIN PROFILE INITIALIZATION ---
async function initProfileLogic() {
    if(typeof bootSequence === 'function') await bootSequence();
    if(typeof initMusicPlayer === 'function') initMusicPlayer();

    const urlParams = new URLSearchParams(window.location.search);
    const targetDiscordId = urlParams.get('user');
    const targetName = urlParams.get('name'); 

    if (!targetDiscordId && !targetName) return window.location.href = '/404.html';

    try {
        let user = null;

        // 1. Try fetching by Discord ID first (Safest method)
        if (targetDiscordId) {
            const { data } = await _supabase.from('users').select('*').eq('discord_id', targetDiscordId).limit(1);
            if(data && data.length > 0) user = data[0];
        } 
        
        // 2. THE BUG FIX: The Aggressive String Search
        if (!user && targetName) {
            // Decodes URL spaces (e.g. "%20L" becomes " L")
            const cleanName = decodeURIComponent(targetName).trim(); 
            
            // This searches display_name OR username OR old #0 usernames case-insensitively!
            // .limit(1) guarantees it NEVER crashes like maybeSingle() did!
            const { data } = await _supabase.from('users')
                .select('*')
                .or(`display_name.ilike.%${cleanName}%,username.ilike.%${cleanName}%`)
                .limit(1);
                
            if(data && data.length > 0) user = data[0];
        }

        // If STILL not found, redirect to 404
        if (!user) return window.location.href = '/404.html';

        // --- POPULATE THE UI ---
        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, cleanNameFallback(user.username)];

        function cleanNameFallback(name) { return name ? name.split('#')[0] : ''; }

        // Fetch Configs created by this user
        const { data: configs } = await _supabase.from('configs').select('id').in('creator', namesToCheck);
        const configCount = configs ? configs.length : 0;
        const isCreator = configCount > 0;

        // Fetch Reviews left by this user
        const { data: reviews } = await _supabase.from('reviews').select('*').eq('poster_id', user.discord_id).order('created_at', { ascending: false }).limit(10);
        const reviewCount = reviews ? reviews.length : 0;

        // Fetch Contributor Tags
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', namesToCheck).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        // Update User Card HTML
        document.getElementById('p-avatar').src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        document.getElementById('p-dname').innerText = escapeHTML(dName);
        document.getElementById('p-uname').innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        
        // Update Stats
        document.getElementById('stat-configs').innerText = configCount;
        document.getElementById('stat-reviews').innerText = reviewCount;
        
        // Format Joined Date (e.g. "May 2026")
        const joinDate = user.last_login ? new Date(user.last_login).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';
        document.getElementById('stat-joined').innerText = joinDate;

        // Badges
        let badgeHTML = isCreator ? `<span class="role-badge badge-creator"><i class="fas fa-hammer"></i> Creator</span>` : `<span class="role-badge badge-user"><i class="fas fa-user"></i> User</span>`;
        if (tags.length > 0) {
            badgeHTML += tags.map(t => {
                const color = getBadgeColor(t);
                return `<span class="role-badge" style="color: ${color}; border: 1px solid ${color}; background: transparent;">${escapeHTML(t.trim())}</span>`;
            }).join('');
        }
        document.getElementById('p-badges').innerHTML = badgeHTML;

        // Populate Reviews Feed
        const reviewsContainer = document.getElementById('p-reviews-container');
        if (reviewCount === 0) {
            reviewsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; font-weight:600; text-align:center;">This user hasn't left any reviews yet.</p>`;
        } else {
            reviewsContainer.innerHTML = reviews.map(r => {
                const stars = Array(5).fill(0).map((_, i) => i < r.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join('');
                const safeConfigId = escapeHTML(r.config_id);
                return `
                <div class="review-item">
                    <div class="review-content">
                        <div class="review-meta">
                            <a href="dashboard.html#configs" class="review-target">Commented on Config #${safeConfigId}</a>
                            <span class="review-stars">${r.rating ? stars : '<i class="fas fa-reply" style="color:var(--text-muted)"></i> Reply'}</span>
                        </div>
                        <p class="review-text">${escapeHTML(r.comment)}</p>
                    </div>
                </div>`;
            }).join('');
        }

    } catch (err) {
        console.error("Profile Load Error:", err);
        window.location.href = '/404.html';
    }
}
