let userReviews = [], visibleReviewCount = 4;

async function loadProfileTags() {
    try { const res = await fetch('/assets/data/tags.json'); if (res.ok) tagColorDictionary = await res.json(); } 
    catch (e) { console.warn("Using fallback tag colors."); }
}
loadProfileTags();

async function initProfileLogic() {
    if(typeof bootSequence === 'function') await bootSequence();
    if(typeof initMusicPlayer === 'function') initMusicPlayer();

    const urlParams = new URLSearchParams(window.location.search);
    const targetDiscordId = urlParams.get('user');
    const targetName = urlParams.get('name'); 

    if (!targetDiscordId && !targetName) return window.location.href = '/404.html';

    try {
        let user = null;

        if (targetDiscordId) {
            const { data } = await _supabase.from('users').select('*').eq('discord_id', targetDiscordId).limit(1);
            if(data && data.length > 0) user = data[0];
        } 
        
        if (!user && targetName) {
            const cleanName = decodeURIComponent(targetName).trim(); 
            let { data } = await _supabase.from('users').select('*').ilike('username', cleanName).limit(1);
            if (!data || data.length === 0) ({ data } = await _supabase.from('users').select('*').ilike('display_name', cleanName).limit(1));
            if (!data || data.length === 0) ({ data } = await _supabase.from('users').select('*').or(`display_name.ilike.%${cleanName}%,username.ilike.%${cleanName}%`).limit(1));
            if(data && data.length > 0) user = data[0];
        }

        if (!user) return window.location.href = '/404.html';

        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, uName];

        // Fetch Configs, Reviews, and Directory Tags
        const { data: configs } = await _supabase.from('configs').select('id').in('creator', namesToCheck).limit(1);
        const isCreator = configs && configs.length > 0;
        const { data: reviews } = await _supabase.from('reviews').select('*').eq('poster_id', user.discord_id).order('created_at', { ascending: false });
        userReviews = reviews || [];
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', namesToCheck).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        // NEW: Fetch Extended Profile Data
        const { data: extProfile } = await _supabase.from('user_profiles').select('*').eq('id', user.id).single();

        // Increase View Counter (Fires silently in the background)
        if (extProfile) {
            _supabase.from('user_profiles').update({ views: (extProfile.views || 0) + 1 }).eq('id', user.id).then();
        }

        // --- DOM SYNCHRONIZATION ---
        if(document.getElementById('p-avatar')) document.getElementById('p-avatar').src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        if(document.getElementById('p-dname')) document.getElementById('p-dname').innerText = escapeHTML(dName);
        if(document.getElementById('p-uname')) document.getElementById('p-uname').innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        if(document.getElementById('stat-joined')) document.getElementById('stat-joined').innerText = user.created_at ? "Joined: " + new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Joined: Unknown';
        
        // Extended Profile UI Injections
        if (extProfile) {
            // Bio
            if(document.getElementById('p-bio')) document.getElementById('p-bio').innerText = escapeHTML(extProfile.bio);
            // Views
            if(document.getElementById('p-views')) document.getElementById('p-views').innerText = (extProfile.views || 0) + 1;
            // Verified Badge
            if(extProfile.is_verified && document.getElementById('p-verified')) document.getElementById('p-verified').style.display = 'inline-block';
            // Discord Link Generation
            if(document.getElementById('p-discord-link')) document.getElementById('p-discord-link').href = `https://discord.com/users/${escapeHTML(extProfile.discord_id)}`;
            
            // Discord Status Dot Mapping
            const statusDot = document.getElementById('p-status-dot');
            if (statusDot) {
                const status = (extProfile.status || 'offline').toLowerCase();
                statusDot.className = `status-dot ${status}`;
                statusDot.title = status.charAt(0).toUpperCase() + status.slice(1); // Capitalizes title
            }

            // Custom Background Gradient
            if (extProfile.theme_colors && extProfile.theme_colors.length >= 2) {
                const card = document.getElementById('p-card-bg');
                if (card) {
                    card.style.background = `linear-gradient(135deg, ${escapeHTML(extProfile.theme_colors[0])}, ${escapeHTML(extProfile.theme_colors[1])})`;
                    card.style.border = `1px solid ${escapeHTML(extProfile.theme_colors[1])}55`; // Adds a subtle matching border glow!
                }
            }
        }

        const badgesEl = document.getElementById('p-badges');
        if (badgesEl) badgesEl.innerHTML = isCreator ? `<span class="role-badge badge-creator"><i class="fas fa-hammer"></i> Creator</span>` : `<span class="role-badge badge-user"><i class="fas fa-user"></i> User</span>`;

        const tagsContainer = document.getElementById('p-tags');
        if (tags.length > 0 && tagsContainer) {
            tagsContainer.style.display = 'flex'; tagsContainer.style.gap = '8px'; tagsContainer.style.flexWrap = 'wrap';
            tagsContainer.innerHTML = tags.map(t => `<span class="con-tag" style="color: ${typeof getBadgeColor === 'function' ? getBadgeColor(t) : '#666'}; border-color: ${typeof getBadgeColor === 'function' ? getBadgeColor(t) : '#666'};">${escapeHTML(t.trim())}</span>`).join('');
        } else if (tagsContainer) tagsContainer.style.display = 'none';

        renderProfileReviews(user);

        const showMoreBtn = document.getElementById('show-more-reviews-btn');
        if(showMoreBtn) showMoreBtn.onclick = () => { visibleReviewCount += 4; renderProfileReviews(user); };

    } catch (err) { console.error("Profile Engine Load Error:", err); }
}

function renderProfileReviews(userObj) {
    const reviewsContainer = document.getElementById('p-reviews-container');
    const showMoreBtn = document.getElementById('show-more-reviews-btn');
    if (!reviewsContainer) return;

    if (userReviews.length === 0) {
        reviewsContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; font-weight:600; text-align:center; padding: 1rem 0;">This user hasn't left any reviews yet.</p>`;
        if(showMoreBtn) showMoreBtn.style.display = 'none';
        return;
    }

    const activeSlice = userReviews.slice(0, visibleReviewCount);
    reviewsContainer.innerHTML = activeSlice.map(r => {
        const stars = Array(5).fill(0).map((_, i) => i < r.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join('');
        const cleanReviewerName = escapeHTML(r.poster_username).split('#')[0];
        const avatarToUse = escapeHTML(userObj.avatar_url || '/assets/images/logo.png');

        return `
        <div class="review-item">
            <img src="${avatarToUse}" class="review-avatar" onerror="this.src='/assets/images/logo.png'">
            <div class="review-content">
                <div class="review-meta">
                    <span class="profile-review-username">${cleanReviewerName}</span>
                    <span class="review-stars">${r.rating ? stars : '<i class="fas fa-reply" style="color:var(--text-muted)"></i> Reply'}</span>
                </div>
                <p class="review-text">${escapeHTML(r.comment)}</p>
            </div>
        </div>`;
    }).join('');

    if(showMoreBtn) showMoreBtn.style.display = visibleReviewCount >= userReviews.length ? 'none' : 'block';
}
