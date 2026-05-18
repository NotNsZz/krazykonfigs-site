let userReviews = [];
let visibleReviewCount = 4;

async function initProfileLogic() {
    if(typeof bootSequence === 'function') await bootSequence();
    if(typeof initMusicPlayer === 'function') initMusicPlayer();

    const urlParams = new URLSearchParams(window.location.search);
    const targetDiscordId = urlParams.get('user');
    const targetName = urlParams.get('name'); 

    if (!targetDiscordId && !targetName) return window.location.href = '/404.html';

    try {
        let user = null;

        // 1. Direct Unique Match Check via ID
        if (targetDiscordId) {
            const { data } = await _supabase.from('users').select('*').eq('discord_id', targetDiscordId).limit(1);
            if(data && data.length > 0) user = data[0];
        } 
        
        // 2. Encoded Parameter String Fallback
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

        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, uName];

        // Creator Identification Lookup
        const { data: configs } = await _supabase.from('configs').select('id').in('creator', namesToCheck).limit(1);
        const isCreator = configs && configs.length > 0;

        // Fetch Complete Log History For Pagination Handling
        const { data: reviews } = await _supabase.from('reviews').select('*').eq('poster_id', user.discord_id).order('created_at', { ascending: false });
        userReviews = reviews || [];

        // Check Directory Specifications
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', namesToCheck).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        // DOM Synchronization
        const avatarEl = document.getElementById('p-avatar');
        const dnameEl = document.getElementById('p-dname');
        const unameEl = document.getElementById('p-uname');
        const joinedEl = document.getElementById('stat-joined');
        
        if(avatarEl) avatarEl.src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        if(dnameEl) dnameEl.innerText = escapeHTML(dName);
        if(unameEl) unameEl.innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        
        if(joinedEl) {
            const rawDate = user.created_at || user.last_login;
            joinedEl.innerText = rawDate ? "Joined: " + new Date(rawDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Joined: Unknown';
        }

        const guildEl = document.getElementById('p-guild');
        if(guildEl) guildEl.innerHTML = user.guild_tag ? `<span class="guild-tag">${escapeHTML(user.guild_tag)}</span>` : '';

        // --- BADGES & TAGS (Properly Placed!) ---
        const badgesEl = document.getElementById('p-badges');
        if (badgesEl) {
            badgesEl.innerHTML = isCreator ? `<span class="role-badge badge-creator"><i class="fas fa-hammer"></i> Creator</span>` : `<span class="role-badge badge-user"><i class="fas fa-user"></i> User</span>`;
        }

        const tagsContainer = document.getElementById('p-tags');
        if (tags.length > 0 && tagsContainer) {
            tagsContainer.style.display = 'flex';
            tagsContainer.style.gap = '8px';
            tagsContainer.style.flexWrap = 'wrap';
            
            tagsContainer.innerHTML = tags.map(t => {
                const color = typeof getBadgeColor === 'function' ? getBadgeColor(t) : '#666';
                return `<span class="con-tag" style="color: ${color}; border-color: ${color};">${escapeHTML(t.trim())}</span>`;
            }).join('');
        } else if (tagsContainer) {
            tagsContainer.style.display = 'none';
        }

        renderProfileReviews();

        const showMoreBtn = document.getElementById('show-more-reviews-btn');
        if(showMoreBtn) {
            showMoreBtn.onclick = () => {
                visibleReviewCount += 4;
                renderProfileReviews();
            };
        }

    } catch (err) {
        console.error("Profile Load Exception Core Engine Handler:", err);
    }
}

function renderProfileReviews() {
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
        
        // Uses the avatar tied to the review in case the user changes their Discord PFP later
        const avatarToUse = escapeHTML(r.poster_avatar || '/assets/images/logo.png');

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

    if(showMoreBtn) {
        showMoreBtn.style.display = visibleReviewCount >= userReviews.length ? 'none' : 'block';
    }
}
