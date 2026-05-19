let userReviews = [], visibleReviewCount = 4;
let activeProfileUser = null; 
let extProfileData = null;
let profileAudio = null;

// Context Maps for Reviews
let reviewConfigsMap = {};
let parentReviewMap = {};

let profileTagData = {}; 

async function loadProfileTags() {
    try { 
        const res = await fetch('/assets/data/tags.json'); 
        if (res.ok) profileTagData = await res.json(); 
    } catch (e) { console.warn("Failed to load tag data."); }
}

function getTagData(t) {
    const cleanTag = t.trim().toUpperCase();
    if (profileTagData[cleanTag]) return profileTagData[cleanTag];
    for (const key in profileTagData) { 
        if (cleanTag.includes(key.toUpperCase())) return profileTagData[key]; 
    }
    return { color: '#666', icon: 'fas fa-tag' }; 
}

loadProfileTags();

async function initProfileLogic() {
    if(typeof bootSequence === 'function') await bootSequence();

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

        const cleanDName = dName.toLowerCase().trim();
        const cleanUName = uName.toLowerCase().trim();
        const { data: allConfigs } = await _supabase.from('configs').select('id, hit_rate, title, creator');
        
        let userConfigs = [];
        let dNameMatch = (allConfigs || []).filter(c => {
            if(!c.creator) return false;
            const cr = c.creator.toLowerCase().trim();
            return cr === cleanDName || cr.includes(cleanDName) || cleanDName.includes(cr);
        });

        if (dNameMatch.length > 0) {
            userConfigs = dNameMatch;
        } else {
            let uNameMatch = (allConfigs || []).filter(c => {
                if(!c.creator) return false;
                const cr = c.creator.toLowerCase().trim();
                return cr === cleanUName || cr.includes(cleanUName) || cleanUName.includes(cr);
            });
            if (uNameMatch.length > 0) userConfigs = uNameMatch;
        }
        
        const isCreator = userConfigs.length > 0;
        let avgHitRate = "-", avgRating = "0.0";
        
        if (isCreator) {
            let totalHit = 0, validHit = 0;
            userConfigs.forEach(c => {
                let hRate = parseInt((c.hit_rate || '').replace('%', ''));
                if (!isNaN(hRate)) { totalHit += hRate; validHit++; }
            });
            if (validHit > 0) avgHitRate = Math.round(totalHit / validHit) + "%";

            // Smart Rating Math
            const configIds = userConfigs.map(c => c.id);
            if (configIds.length > 0) {
                const { data: configReviews } = await _supabase.from('reviews').select('config_id, rating').in('config_id', configIds).not('rating', 'is', null);

                if (configReviews && configReviews.length > 0) {
                    let configSums = {}, configCounts = {};

                    configReviews.forEach(r => {
                        if (!configSums[r.config_id]) { configSums[r.config_id] = 0; configCounts[r.config_id] = 0; }
                        configSums[r.config_id] += r.rating;
                        configCounts[r.config_id] += 1;
                    });

                    let totalAvgSum = 0;
                    let validConfigCount = 0;
                    for (let cid in configSums) {
                        if (configCounts[cid] > 0) { 
                            let cAvg = configSums[cid] / configCounts[cid];
                            totalAvgSum += cAvg;
                            validConfigCount++;
                        }
                    }

                    if (validConfigCount > 0) {
                        avgRating = (totalAvgSum / validConfigCount).toFixed(1);
                    }
                }
            }
        }

        const { data: reviews } = await _supabase.from('reviews').select('*').eq('poster_id', user.discord_id).order('created_at', { ascending: false });
        userReviews = reviews || [];
        
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', [user.username, dName, uName]).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        const configIds = [...new Set(userReviews.map(r => r.config_id))];
        if(configIds.length > 0) {
            const {data: rConfigs} = await _supabase.from('configs').select('id, title').in('id', configIds);
            if(rConfigs) rConfigs.forEach(c => reviewConfigsMap[c.id] = c.title);
        }
        const parentIds = [...new Set(userReviews.filter(r => r.replying_to_id).map(r => r.replying_to_id))];
        if(parentIds.length > 0) {
            const {data: pReviews} = await _supabase.from('reviews').select('id, poster_username').in('id', parentIds);
            if(pReviews) pReviews.forEach(r => parentReviewMap[r.id] = r.poster_username.split('#')[0]);
        }

        const { data: extProfile } = await _supabase.from('user_profiles').select('*').eq('id', user.id).single();
        extProfileData = extProfile;

        // --- DOM SYNCHRONIZATION ---
        if(document.getElementById('p-avatar')) document.getElementById('p-avatar').src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        if(document.getElementById('p-dname')) document.getElementById('p-dname').innerText = escapeHTML(dName);
        if(document.getElementById('p-uname')) document.getElementById('p-uname').innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        if(document.getElementById('stat-joined')) document.getElementById('stat-joined').innerText = user.created_at ? "Joined: " + new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Joined: Unknown';
        
        if (isCreator) {
            document.getElementById('creator-stats-card').style.display = 'flex';
            document.getElementById('stat-configs').innerText = userConfigs.length;
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

            if (extProfile.theme_colors && extProfile.theme_colors.length > 0) {
                const c1 = escapeHTML(extProfile.theme_colors[0]);
                const c2 = extProfile.theme_colors.length > 1 ? escapeHTML(extProfile.theme_colors[1]) : c1;
                
                document.querySelectorAll('.profile-card, .history-card').forEach(card => {
                    card.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
                    card.style.border = `1px solid ${c2}55`;
                });
            }

            // BACKGROUND COLOR
            if (extProfile.bg_color) document.body.style.setProperty('background-color', escapeHTML(extProfile.bg_color), 'important');

            // --- BULLETPROOF THEME INJECTION (FIXED FOR HEADINGS) ---
            const customThemeStyle = document.createElement('style');
            let themeCSS = '';

            // Get base text color
            let finalTextColor = extProfile.text_color ? escapeHTML(extProfile.text_color) : '#ffffff';
            
            // Failsafe: If nav_color is the old legacy black (#0a0a0c) or pure black, overwrite it with the text color!
            let finalHeadingColor = extProfile.nav_color;
            if (!finalHeadingColor || finalHeadingColor === '#0a0a0c' || finalHeadingColor === '#000000') {
                finalHeadingColor = finalTextColor; 
            } else {
                finalHeadingColor = escapeHTML(finalHeadingColor);
            }

            themeCSS += `
                .profile-container, .modal-overlay, .profile-card, .history-card, .modal-content {
                    color: ${finalTextColor} !important;
                    --text-main: ${finalTextColor} !important;
                    --text-muted: ${finalTextColor}cc !important;
                }
                
                .profile-bio, .profile-username, .stat-label,
                .review-text, .profile-review-username, .joined-date,
                .history-card p, .modal-body label {
                    color: var(--text-main) !important;
                }

                /* HEADINGS NOW USE THE SMART FALLBACK */
                .profile-card h1, .profile-card h2, .profile-card h3,
                .history-card h1, .history-card h2, .history-card h3,
                .modal-content h2,
                .profile-name, .history-title, .stat-value {
                    color: ${finalHeadingColor} !important;
                }
            `;

            customThemeStyle.innerHTML = themeCSS;
            document.head.appendChild(customThemeStyle);

            // UI BOX COLOR
            if (extProfile.ui_box_color) {
                const uiColor = escapeHTML(extProfile.ui_box_color);
                document.documentElement.style.setProperty('--card-bg', uiColor);
                document.documentElement.style.setProperty('--card-inner', uiColor);
                
                const modalEl = document.querySelector('.modal-content');
                if (modalEl) modalEl.style.backgroundColor = uiColor;
                
                document.querySelectorAll('.review-item').forEach(item => { item.style.backgroundColor = uiColor; });
            }

            // MUSIC
            if (extProfile.music_track) {
                profileAudio = new Audio(extProfile.music_track);
                profileAudio.loop = true;
                profileAudio.volume = 0.5;
                
                profileAudio.play().catch(() => {
                    const nameRow = document.getElementById('p-name-row');
                    if(nameRow) {
                        const playBtn = document.createElement('button');
                        playBtn.className = 'social-icon-btn';
                        playBtn.style.color = 'var(--accent)';
                        playBtn.title = "Play Theme Song";
                        playBtn.innerHTML = '<i class="fas fa-play-circle"></i>';
                        playBtn.onclick = () => { profileAudio.play(); playBtn.style.display = 'none'; };
                        nameRow.appendChild(playBtn);
                    }
                });
            }
        } else {
            const dcLinkEl = document.getElementById('p-discord-link');
            if(dcLinkEl) { dcLinkEl.style.display = 'flex'; dcLinkEl.href = `https://discord.com/users/${escapeHTML(user.discord_id)}`; }
        }

        const editBtn = document.getElementById('p-edit-btn');
        if(editBtn && currentUser && currentUser.id === user.id) editBtn.style.display = 'flex';

        const badgesEl = document.getElementById('p-badges');
        if (badgesEl) badgesEl.innerHTML = isCreator ? `<span class="role-badge badge-creator"><i class="fas fa-hammer"></i> Creator</span>` : `<span class="role-badge badge-user"><i class="fas fa-user"></i> User</span>`;

        const tagsContainer = document.getElementById('p-tags');
        if (tags.length > 0 && tagsContainer) {
            tagsContainer.style.display = 'flex'; tagsContainer.style.gap = '8px'; tagsContainer.style.flexWrap = 'wrap';
            tagsContainer.innerHTML = tags.map(t => {
                const tData = getTagData(t);
                return `<span class="con-tag" style="color: ${tData.color}; border-color: ${tData.color};"><i class="${tData.icon}"></i> ${escapeHTML(t.trim())}</span>`;
            }).join('');
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

        let contextText = `<span style="color:var(--text-muted); font-size:0.8rem; display:block; margin-bottom:4px;">Reviewed <strong style="color:inherit;">${escapeHTML(reviewConfigsMap[r.config_id] || `Config #${r.config_id}`)}</strong></span>`;
        if (r.replying_to_id && parentReviewMap[r.replying_to_id]) {
            contextText = `<span style="color:var(--text-muted); font-size:0.8rem; display:block; margin-bottom:4px;">Reply to <strong style="color:var(--accent);">@${escapeHTML(parentReviewMap[r.replying_to_id])}</strong> on <strong style="color:inherit;">${escapeHTML(reviewConfigsMap[r.config_id] || `Config #${r.config_id}`)}</strong></span>`;
        }

        return `
        <div class="review-item">
            <img src="${avatarToUse}" class="review-avatar" onerror="this.src='/assets/images/logo.png'">
            <div class="review-content">
                ${contextText}
                <div class="review-meta">
                    <span class="profile-review-username" style="color:inherit;">${cleanReviewerName}</span>
                    <span class="review-stars">${r.rating ? stars : '<i class="fas fa-reply" style="color:var(--text-muted)"></i> Reply'}</span>
                </div>
                <p class="review-text" style="color:inherit;">${escapeHTML(r.comment)}</p>
            </div>
        </div>`;
    }).join('');

    if(showMoreBtn) showMoreBtn.style.display = visibleReviewCount >= userReviews.length ? 'none' : 'block';
}

async function openEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if(!modal) return;

    if (extProfileData) {
        document.getElementById('edit-status').value = extProfileData.status || 'offline';
        document.getElementById('edit-bio').value = extProfileData.bio || '';
        document.getElementById('bio-counter').innerText = `${(extProfileData.bio || '').length} / 150`;
        
        if (extProfileData.theme_colors && extProfileData.theme_colors.length > 0) {
            document.getElementById('edit-color-1').value = extProfileData.theme_colors[0];
            if(extProfileData.theme_colors.length > 1 && extProfileData.theme_colors[0] !== extProfileData.theme_colors[1]) {
                document.getElementById('edit-color-mode').value = 'gradient';
                document.getElementById('edit-color-2').value = extProfileData.theme_colors[1];
            } else {
                document.getElementById('edit-color-mode').value = 'static';
            }
        }
        
        document.getElementById('edit-bg-color').value = extProfileData.bg_color || '#0a0a0c';
        document.getElementById('edit-text-color').value = extProfileData.text_color || '#ffffff';
        document.getElementById('edit-ui-color').value = extProfileData.ui_box_color || '#16161e';
        
        // Failsafe: Prevent loading the old black legacy color into the modal UI
        let safeNavColor = extProfileData.nav_color || '#ffffff';
        if (safeNavColor === '#0a0a0c' || safeNavColor === '#000000') {
            safeNavColor = extProfileData.text_color || '#ffffff';
        }
        document.getElementById('edit-nav-color').value = safeNavColor;
    }
    
    toggleColorMode();

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

document.getElementById('edit-bio')?.addEventListener('input', (e) => {
    document.getElementById('bio-counter').innerText = `${e.target.value.length} / 150`;
});

function toggleColorMode() {
    const mode = document.getElementById('edit-color-mode').value;
    if(mode === 'static') {
        document.getElementById('color-2-wrap').style.display = 'none';
    } else {
        document.getElementById('color-2-wrap').style.display = 'flex';
    }
    updateGradientPreview();
}

function updateGradientPreview() {
    const mode = document.getElementById('edit-color-mode').value;
    const c1 = document.getElementById('edit-color-1').value;
    const c2 = mode === 'gradient' ? document.getElementById('edit-color-2').value : c1;
    document.getElementById('gradient-preview').style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
}
document.getElementById('edit-color-1')?.addEventListener('input', updateGradientPreview);
document.getElementById('edit-color-2')?.addEventListener('input', updateGradientPreview);

async function saveProfileChanges() {
    const status = document.getElementById('edit-status').value;
    const bio = document.getElementById('edit-bio').value.trim();
    const mode = document.getElementById('edit-color-mode').value;
    const color1 = document.getElementById('edit-color-1').value;
    const color2 = mode === 'gradient' ? document.getElementById('edit-color-2').value : color1;
    const bgColor = document.getElementById('edit-bg-color').value;
    const textColor = document.getElementById('edit-text-color').value;
    const navColor = document.getElementById('edit-nav-color').value;
    const uiColor = document.getElementById('edit-ui-color').value;
    const music = document.getElementById('edit-music').value;

    const { error } = await _supabase.from('user_profiles').upsert({
        id: currentUser.id,
        discord_id: currentUser.discord_id,
        status: status,
        bio: bio,
        theme_colors: [color1, color2],
        bg_color: bgColor,
        text_color: textColor,
        nav_color: navColor,
        ui_box_color: uiColor,
        music_track: music || null
    }, { onConflict: 'id' });

    if (error) {
        alert("Failed to save profile.");
        console.error(error);
    } else {
        window.location.reload(); 
    }
}
