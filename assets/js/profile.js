// --- TAG COLOR DICTIONARY ---
// (We removed 'let tagColorDictionary' to stop the crash, core.js handles it!)
async function loadProfileTags() {
    try { const res = await fetch('/assets/data/tags.json'); if (res.ok) tagColorDictionary = await res.json(); } 
    catch (e) { console.warn("Using fallback tag colors."); }
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

        // 1. BULLETPROOF TIER: Discord ID
        if (targetDiscordId) {
            const { data } = await _supabase.from('users').select('*').eq('discord_id', targetDiscordId).limit(1);
            if(data && data.length > 0) user = data[0];
        } 
        
        // 2. FALLBACK TIER: Intelligent Name Search (Fixes the zlxcyyy "! L" bug)
        if (!user && targetName) {
            const cleanName = decodeURIComponent(targetName).trim(); 
            
            // Try exact Username match first
            let { data } = await _supabase.from('users').select('*').ilike('username', cleanName).limit(1);
            
            // Try exact Display Name match second
            if (!data || data.length === 0) {
                ({ data } = await _supabase.from('users').select('*').ilike('display_name', cleanName).limit(1));
            }
            
            // Absolute Last Resort: Fuzzy Match
            if (!data || data.length === 0) {
                ({ data } = await _supabase.from('users').select('*').or(`display_name.ilike.%${cleanName}%,username.ilike.%${cleanName}%`).limit(1));
            }

            if(data && data.length > 0) user = data[0];
        }

        // If STILL not found in the database, THEN we safely 404
        if (!user) return window.location.href = '/404.html';

        // --- POPULATE THE UI (Matched strictly to your existing HTML skeleton) ---
        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, uName];

        // Fetch Configs created by this user
        const { data: configs } = await _supabase.from('configs').select('id').in('creator', namesToCheck).limit(1);
        const isCreator = configs && configs.length > 0;

        // Fetch Reviews left by this user
        const { data: reviews } = await _supabase.from('reviews').select('*').eq('poster_id', user.discord_id).order('created_at', { ascending: false }).limit(10);

        // Fetch Contributor Tags
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', namesToCheck).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        // 1. Update User Card HTML
        const avatarEl = document.getElementById('p-avatar');
        const dnameEl = document.getElementById('p-dname');
        const unameEl = document.getElementById('p-uname');
        const guildEl = document.getElementById('p-guild');
        
        if(avatarEl) avatarEl.src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        if(dnameEl) dnameEl.innerText = escapeHTML(dName);
        if(unameEl) unameEl.innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        if(guildEl) guildEl.innerHTML = user.guild_tag ? `<span class="guild-tag">${escapeHTML(user.guild_tag)}</span>` : '';

        // 2. Update Badges & Tags
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

        // 3. Populate Reviews Feed
        const reviewsContainer = document.getElementById('p-reviews-container');
        if (reviewsContainer) {
            if (!reviews || reviews.length === 0) {
                reviewsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; font-weight:600;">This user hasn't left any reviews yet.</p>`;
            } else {
                reviewsContainer.innerHTML = reviews.map(r => {
                    const stars = Array(5).fill(0).map((_, i) => i < r.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join('');
                    const cleanReviewerName = escapeHTML(r.poster_username).split('#')[0];
                    return `
                    <div class="review-item">
                        <img src="${escapeHTML(r.poster_avatar)}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid var(--border);">
                        <div class="review-content">
                            <div class="review-meta">
                                <a href="dashboard.html#configs" class="review-target">Config ID: #${escapeHTML(r.config_id)}</a>
                                <span class="review-stars">${r.rating ? stars : '<i class="fas fa-reply" style="color:var(--text-muted)"></i> Reply'}</span>
                            </div>
                            <p class="review-text"><a href="profile.html?user=${r.poster_id}" class="profile-review-username">${cleanReviewerName}</a>: ${escapeHTML(r.comment)}</p>
                        </div>
                    </div>`;
                }).join('');
            }
        }

    } catch (err) {
        // FIX: I have removed the window.location.href = '/404.html' command from here!
        // If a bug ever happens again, it won't violently kick you off the page.
        console.error("Profile Load Error (Data fetched, but a DOM element is missing):", err);
    }
}
