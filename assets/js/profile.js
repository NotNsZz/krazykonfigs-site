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
        
        // 2. FALLBACK TIER: Intelligent Name Search
        if (!user && targetName) {
            const cleanName = decodeURIComponent(targetName).trim(); 
            
            // Try exact Username match first (Usernames are usually unique)
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

        // If STILL not found, redirect to 404
        if (!user) return window.location.href = '/404.html';

        // --- POPULATE THE UI ---
        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, user.username.split('#')[0]];

        // Fetch Configs created by this user
        const { data: configs } = await _supabase.from('configs').select('id, hit_rate').in('creator', namesToCheck);
        const configCount = configs ? configs.length : 0;
        const isCreator = configCount > 0;

        // Calculate average hit rate if they are a creator
        let avgHitRate = "-";
        if (isCreator && configs.length > 0) {
            let total = 0, validConfigs = 0;
            configs.forEach(c => {
                let rate = parseInt((c.hit_rate || '').replace('%', ''));
                if (!isNaN(rate)) { total += rate; validConfigs++; }
            });
            if (validConfigs > 0) avgHitRate = Math.round(total / validConfigs) + "%";
        }

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
        document.getElementById('stat-hitrate').innerText = avgHitRate;
        
        // Format Joined Date
        const joinDate = user.last_login ? new Date(user.last_login).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';
        document.getElementById('stat-joined').innerText = joinDate;

        // Badges (Uses the getBadgeColor function from core.js!)
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
                return `
                <div class="review-item">
                    <div class="review-content">
                        <div class="review-meta">
                            <a href="dashboard.html#configs" class="review-target">Commented on Config #${escapeHTML(r.config_id)}</a>
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
