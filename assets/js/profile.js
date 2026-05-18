let userReviews = [], visibleReviewCount = 4;
let activeProfileUser = null; 
let extProfileData = null;

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
        activeProfileUser = user;

        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, uName];

        // Fetch Configs & Stats
        const { data: configs } = await _supabase.from('configs').select('id, hit_rate, rating').in('creator', namesToCheck);
        const configCount = configs ? configs.length : 0;
        const isCreator = configCount > 0;

        let avgHitRate = "-", avgRating = "0.0";
        if (isCreator) {
            let totalHit = 0, validHit = 0, totalRat = 0, validRat = 0;
            configs.forEach(c => {
                let hRate = parseInt((c.hit_rate || '').replace('%', ''));
                if (!isNaN(hRate)) { totalHit += hRate; validHit++; }
                let rRate = parseFloat(c.rating);
                if (!isNaN(rRate)) { totalRat += rRate; validRat++; }
            });
            if (validHit > 0) avgHitRate = Math.round(totalHit / validHit) + "%";
            if (validRat > 0) avgRating = (totalRat / validRat).toFixed(1);
        }

        // Fetch Log History & Tags
        const { data: reviews } = await _supabase.from('reviews').select('*').eq('poster_id', user.discord_id).order('created_at', { ascending: false });
        userReviews = reviews || [];
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', namesToCheck).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        // Fetch Extended Profile Data
        const { data: extProfile } = await _supabase.from('user_profiles').select('*').eq('id', user.id).single();
        extProfileData = extProfile;

        // --- DOM SYNCHRONIZATION ---
        if(document.getElementById('p-avatar')) document.getElementById('p-avatar').src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        if(document.getElementById('p-dname')) document.getElementById('p-dname').innerText = escapeHTML(dName);
        if(document.getElementById('p-uname')) document.getElementById('p-uname').innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        if(document.getElementById('stat-joined')) document.getElementById('stat-joined').innerText = user.created_at ? "Joined: " + new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Joined: Unknown';
        
        // Show Creator Card if applicable
        if (isCreator) {
            document.getElementById('creator-stats-card').style.display = 'flex';
            document.getElementById('stat-configs').innerText = configCount;
            document.getElementById('stat-rating').innerText = avgRating;
            document.getElementById('stat-hitrate').innerText = avgHitRate;
        }

        if (extProfile) {
            if(document.getElementById('p-bio')) document.getElementById('p-bio').innerText = escapeHTML(extProfile.bio) || "No bio set.";
            if(extProfile.is_verified && document.getElementById('p-verified')) document.getElementById('p-verified').style.display = 'inline-block';
            
            const dcLinkEl = document.getElementById('p-discord-link');
            if(dcLinkEl) {
                dcLinkEl.style.display = 'flex';
                dcLinkEl.href = `https://discord.com/users/${escapeHTML(extProfile.discord_id || user.discord_id)}`;
            }
            
            const statusDot = document.getElementById('p-status-dot');
            if (statusDot) {
                const status = (extProfile.status || 'offline').toLowerCase();
                statusDot.className = `status-dot ${status}`;
                statusDot.title = status.charAt(0).toUpperCase() + status.slice(1);
            }

            if (extProfile.theme_colors && extProfile.theme_colors.length >= 2) {
                const card = document.getElementById('p-card-bg');
                if (card) {
                    card.style.background = `linear-gradient(135deg, ${escapeHTML(extProfile.theme_colors[0])}, ${escapeHTML(extProfile.theme_colors[1])})`;
                    card.style.border = `1px solid ${escapeHTML(extProfile.theme_colors[1])}55`;
                }
            }

            // Apply Background Dot Texture Color
            if (extProfile.bg_texture_color) {
                document.documentElement.style.setProperty('--border', escapeHTML(extProfile.bg_texture_color));
            }
        } else {
            // Fallback for Discord Link if no profile row yet
            const dcLinkEl = document.getElementById('p-discord-link');
            if(dcLinkEl) { dcLinkEl.style.display = 'flex'; dcLinkEl.href = `https://discord.com/users/${escapeHTML(user.discord_id)}`; }
        }

        // Edit Button Logic
        const editBtn = document.getElementById('p-edit-btn');
        if(editBtn && currentUser && currentUser.id === user.id) editBtn.style.display = 'flex';

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

// --- EDIT PROFILE MODAL LOGIC ---
async function openEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if(!modal) return;

    // Populate current data
    if (extProfileData) {
        document.getElementById('edit-status').value = extProfileData.status || 'offline';
        document.getElementById('edit-bio').value = extProfileData.bio || '';
        document.getElementById('bio-counter').innerText = `${(extProfileData.bio || '').length} / 50`;
        
        if (extProfileData.theme_colors && extProfileData.theme_colors.length >= 2) {
            document.getElementById('edit-color-1').value = extProfileData.theme_colors[0];
            document.getElementById('edit-color-2').value = extProfileData.theme_colors[1];
            updateGradientPreview();
        }
        if (extProfileData.bg_texture_color) {
            document.getElementById('edit-bg-dot-color').value = extProfileData.bg_texture_color;
        }
    }

    // Populate Music Manifest
    try {
        const res = await fetch('/assets/music/music-manifest.json');
        const manifest = await res.json();
        const musicSelect = document.getElementById('edit-music');
        let optionsHtml = '<option value="">None</option>';
        manifest.forEach(track => {
            const selected = (extProfileData && extProfileData.music_track === track.src) ? 'selected' : '';
            optionsHtml += `<option value="${escapeHTML(track.src)}" ${selected}>${escapeHTML(track.title)}</option>`;
        });
        musicSelect.innerHTML = optionsHtml;
    } catch(err) { console.error("Failed to load music manifest", err); }

    modal.classList.add('show');
}

function closeEditProfileModal() { document.getElementById('editProfileModal').classList.remove('show'); }

// Handle Bio Char Counting & Gradient Preview
document.getElementById('edit-bio')?.addEventListener('input', (e) => {
    document.getElementById('bio-counter').innerText = `${e.target.value.length} / 50`;
});

function updateGradientPreview() {
    const c1 = document.getElementById('edit-color-1').value;
    const c2 = document.getElementById('edit-color-2').value;
    document.getElementById('gradient-preview').style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
}
document.getElementById('edit-color-1')?.addEventListener('input', updateGradientPreview);
document.getElementById('edit-color-2')?.addEventListener('input', updateGradientPreview);

// Save Changes
async function saveProfileChanges() {
    const status = document.getElementById('edit-status').value;
    const bio = document.getElementById('edit-bio').value.trim();
    const color1 = document.getElementById('edit-color-1').value;
    const color2 = document.getElementById('edit-color-2').value;
    const dotColor = document.getElementById('edit-bg-dot-color').value;
    const music = document.getElementById('edit-music').value;

    const { error } = await _supabase.from('user_profiles').update({
        status: status,
        bio: bio,
        theme_colors: [color1, color2],
        bg_texture_color: dotColor,
        music_track: music || null
    }).eq('id', currentUser.id);

    if (error) {
        alert("Failed to save profile.");
        console.error(error);
    } else {
        window.location.reload(); // Refresh to show changes immediately!
    }
}
