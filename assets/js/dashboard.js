let allConfigs = [];
let currentFilteredConfigs = [];
let currentVisibleCount = 9;
let currentPingTier = 'all';

// review & unlock state tracking
let activeConfigId = null;
let currentRatingInput = 5;
let replyingToId = null;
let cooldownTimer = null;
let userActiveUnlocks = []; 

let allContributors = [];
let visibleContributorsCount = 8;
let dashTagData = {}; 

async function loadDashTags() {
    try { 
        const res = await fetch('/assets/data/tags.json'); 
        if (res.ok) dashTagData = await res.json(); 
    } catch (e) { 
        console.warn("Failed to load tag data."); 
    }
}

function getDashTagData(t) {
    const cleanTag = t.trim().toUpperCase();
    if (dashTagData[cleanTag]) return dashTagData[cleanTag];
    
    for (const key in dashTagData) { 
        if (cleanTag.includes(key.toUpperCase())) return dashTagData[key]; 
    }
    return { color: '#666', icon: 'fas fa-tag' }; 
}

async function initDashboardLogic() {
    if (typeof bootSequence === 'function') await bootSequence();
    if (typeof initMusicPlayer === 'function') initMusicPlayer();
    
    await loadDashTags();
    fetchConfigs();
    fetchContributors();

    if (!sessionStorage.getItem('creatorPromoSeen')) {
        sessionStorage.setItem('creatorPromoSeen', 'true');
        document.getElementById('creatorPromoOverlay')?.classList.add('show');
    }
}

function closeCreatorPromo() {
    document.getElementById('creatorPromoOverlay')?.classList.remove('show');
}

async function fetchConfigs() {
    if (currentUser) {
        const { data: unlockData, error: unlockError } = await _supabase
            .from('user_unlocks')
            .select('config_id')
            .gt('expires_at', new Date().toISOString());
        
        if (unlockError) {
            console.warn("User unlocks fetch error:", unlockError);
        } else if (unlockData) {
            userActiveUnlocks = unlockData.map(u => String(u.config_id)); 
        }
    }

    const { data } = await _supabase.from('configs').select('*').eq('is_archived', 'false');
    const { data: allReviews } = await _supabase.from('reviews').select('config_id, rating').not('rating', 'is', null);
    
    let ratingMap = {};
    if (allReviews) {
        let sums = {};
        let counts = {};
        
        allReviews.forEach(r => {
            sums[r.config_id] = (sums[r.config_id] || 0) + r.rating;
            counts[r.config_id] = (counts[r.config_id] || 0) + 1;
        });
        
        for (let cid in sums) {
            ratingMap[cid] = (sums[cid] / counts[cid]).toFixed(1);
        }
    }

    allConfigs = (data || []).map(c => ({
        ...c, 
        calc_rating: ratingMap[c.id] || "0.0"
    })).sort((a, b) => (parseInt(a.priority) || 999) - (parseInt(b.priority) || 999));
    
    const creatorMap = new Map();
    allConfigs.forEach(c => {
        if (!c.creator) return;
        
        let displayName = '';
        let username = '';
        
        if (Array.isArray(c.creator)) {
            displayName = c.creator[0] || '';
            username = c.creator[1] || displayName;
        } else if (typeof c.creator === 'string') {
            const parts = c.creator.split(',');
            displayName = parts[0].trim();
            username = parts[1] ? parts[1].trim() : parts[0].trim();
        }
        
        if (username) {
            creatorMap.set(username, displayName); 
        }
    });

    const filter = document.getElementById('creatorFilter');
    if (filter) {
        let optionsHtml = '<option value="all">By Creator</option>';
        creatorMap.forEach((displayName, username) => {
            optionsHtml += `<option value="${escapeHTML(username)}">${escapeHTML(displayName)}</option>`;
        });
        filter.innerHTML = optionsHtml;
    }
    
    applyFilters(null, document.querySelector('.filter-btn.active'));
}

function applyFilters(tier = null, btn = null) {
    if (tier) {
        currentPingTier = tier;
        if (btn) { 
            document.querySelectorAll('#configs .filter-btn').forEach(b => b.classList.remove('active')); 
            btn.classList.add('active'); 
        }
    }
    
    currentVisibleCount = 9;
    
    const search = (document.getElementById('configSearch')?.value || '').toLowerCase();
    const creatorFilterVal = document.getElementById('creatorFilter')?.value || 'all';
    
    currentFilteredConfigs = allConfigs.filter(c => {
        const matchesTier = currentPingTier === 'all' || (c.ping_tier || '').toLowerCase().includes(currentPingTier);
        const matchesSearch = (c.title || '').toLowerCase().includes(search);
        
        let matchesCreator = true;
        if (creatorFilterVal !== 'all') {
            let uName = '';
            if (Array.isArray(c.creator)) {
                uName = c.creator[1] || c.creator[0];
            } else if (typeof c.creator === 'string') {
                const parts = c.creator.split(',');
                uName = parts[1] ? parts[1].trim() : parts[0].trim();
            }
            matchesCreator = (uName === creatorFilterVal);
        }
        
        return matchesTier && matchesSearch && matchesCreator;
    });
    
    renderConfigs();
}

function showMoreConfigs() { 
    currentVisibleCount += 9; 
    renderConfigs(); 
}

function renderConfigs() {
    const container = document.getElementById('config-container');
    const btnWrap = document.getElementById('showMoreConfigsBtnWrap');
    const toShow = currentFilteredConfigs.slice(0, currentVisibleCount);
    
    container.innerHTML = toShow.map(t => {
        let displayName = '';
        let username = '';
        
        if (Array.isArray(t.creator)) {
            displayName = t.creator[0] || '';
            username = t.creator[1] || displayName;
        } else if (typeof t.creator === 'string') {
            const parts = t.creator.split(',');
            displayName = parts[0].trim();
            username = parts[1] ? parts[1].trim() : parts[0].trim();
        }

        const isUnlocked = userActiveUnlocks.includes(String(t.id));

        const displaySimTimer = isUnlocked ? escapeHTML(t.sim_timer || '-') : Math.floor(Math.random() * 80 + 20);
        const displayPredInt = isUnlocked ? escapeHTML(t.pred_interval || '-') : Math.floor(Math.random() * 150 + 50);
        const displayVert = isUnlocked ? escapeHTML(t.vertical || '155') : Math.floor(Math.random() * 50 + 120);
        const displayHoriz = isUnlocked ? escapeHTML(t.horizontal || '165') : Math.floor(Math.random() * 50 + 130);
        const displayOffsets = isUnlocked ? escapeHTML(t.offsets || '0 / -5 / 0') : `${Math.floor(Math.random() * -20)} / ${Math.floor(Math.random() * -10)} / 0`;

        const blurStyle = isUnlocked ? '' : 'filter: blur(6px); opacity: 0.4; user-select: none; pointer-events: none;';

        const unlockOverlay = !isUnlocked ? `
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; z-index: 10;">
                <button onclick="initiateLootLabsUnlock('${t.id}')" style="background: var(--text-main); color: var(--bg-body); border: none; padding: 14px 32px; border-radius: 50px; font-weight: 900; font-size: 1.1rem; cursor: pointer; box-shadow: 0 10px 20px rgba(0,0,0,0.2); transition: 0.2s; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-eye"></i> View
                </button>
            </div>
        ` : '';

        const pingRangeHtml = t.ping_range 
            ? `<div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                 <i class="fas fa-signal" style="color: var(--accent); font-size: 0.7rem;"></i> Supports ${escapeHTML(t.ping_range)}
               </div>` 
            : '';

        return `
            <div class="config-card" style="display: flex; flex-direction: column;">
                
                <div class="card-head">
                    <div class="config-title">${escapeHTML(t.title)} | ${escapeHTML(t.ping_tier) || 'N/A'} PING</div>
                </div>
                
                <div style="position: relative; flex: 1; margin-bottom: 1rem;">
                    ${unlockOverlay}
                    
                    <div style="${blurStyle}">
                        <div class="data-section">
                            <span class="section-label"><i class="fas fa-eye"></i> PREDICTION</span>
                            <div class="data-row"><span class="data-label">Simulation Timer</span> <span class="data-val">${displaySimTimer}</span></div>
                            <div class="data-row"><span class="data-label">Prediction Interval</span> <span class="data-val">${displayPredInt}</span></div>
                        </div>
                        
                        <div class="data-section">
                            <span class="section-label"><i class="fas fa-toggle-on"></i> TOGGLES</span>
                            <div class="data-row"><span class="data-label">Prioritize Ping</span> <span class="data-val">ON</span></div>
                            <div class="data-row"><span class="data-label">Predict Jump</span> <span class="data-val">ON</span></div>
                            <div class="data-row"><span class="data-label">Predict Lag</span> <span class="data-val">ON</span></div>
                            <div class="data-row"><span class="data-label">Ping Predict</span> <span class="data-val">ON</span></div>
                        </div>
                        
                        <div class="data-section">
                            <span class="section-label"><i class="fas fa-rocket"></i> MULTIPLIERS</span>
                            <div class="data-row"><span class="data-label">Vertical</span> <span class="data-val">${displayVert}</span></div>
                            <div class="data-row"><span class="data-label">Horizontal</span> <span class="data-val">${displayHoriz}</span></div>
                        </div>
                        
                        <div class="data-section">
                            <span class="section-label"><i class="fas fa-crosshairs"></i> OFFSETS</span>
                            <div class="data-row"><span class="data-label">X / Y / Z</span> <span class="data-val">${displayOffsets}</span></div>
                        </div>
                    </div>
                </div>
                
                <div class="card-footer" style="flex-direction: column; align-items: stretch; gap: 15px; margin-top: 0; padding-top: 15px; border-top: 1px dashed var(--border);">
                    <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span class="system-tag">Revert | ${escapeHTML(t.hit_rate) || '85%'} Hit Rate | <i class="fas fa-star" style="color:#f1c40f;"></i> ${t.calc_rating}</span>
                            <span class="creator-tag">by <a href="profile.html?name=${encodeURIComponent(username)}" style="color:var(--text-main); font-weight:700;">${escapeHTML(displayName)}</a></span>
                        </div>
                        ${pingRangeHtml}
                    </div>
                    <button class="review-trigger-btn" onclick="openReviews('${t.id}')" style="width: 100%; padding: 10px; background: transparent; border: 1px solid var(--border); color: var(--text-main); border-radius: 6px; cursor: pointer; font-weight: 800; font-family: inherit; transition: 0.2s;" onmouseover="this.style.background='var(--text-main)'; this.style.color='var(--bg-body)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-main)';">
                        <i class="fas fa-comments"></i> View Reviews
                    </button>
                </div>
            </div>
        `;
    }).join('');
        
    if (toShow.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; grid-column: 1/-1; padding: 2rem;">No configs match your search criteria.</p>`;
    }
    
    if (btnWrap) {
        btnWrap.style.display = currentVisibleCount >= currentFilteredConfigs.length ? 'none' : 'block';
    }
}

// 🚨 LOOTLABS: The Trigger Function (UPDATED TO USE 'x' AND BYPASS DB WRITE)
async function initiateLootLabsUnlock(configId) {
    if (!currentUser) return await customAlert("You must be logged in with Discord to unlock configurations.", "Login Required");

    const baseLootLabsUrl = "https://loot-link.com/s?1fNjhACg"; 
    
    // Combine using the safe 'x' character so LootLabs doesn't break it
    const trackingId = `${currentUser.discord_id}x${configId}`;
    const finalUrl = `${baseLootLabsUrl}&uid=${trackingId}`;

    window.open(finalUrl, '_blank');
    
    await customAlert("We have opened your unlock link in a new tab! Once you complete the quick steps, close that tab, come back here, and refresh this page to see your unblurred config.", "Unlock Initiated");
}

async function fetchContributors() {
    const { data } = await _supabase.from('contributors').select('*');
    
    allContributors = (data || [])
        .filter(c => c.is_private !== true && c.is_private !== 'true') 
        .sort((a, b) => (parseInt(a.priority) || 999) - (parseInt(b.priority) || 999));
        
    renderContributors();
}

function renderContributors() {
    const container = document.getElementById('contributor-container');
    const btnWrap = document.getElementById('showMoreContributorsBtnWrap');
    
    if (!container) return;

    const toShow = allContributors.slice(0, visibleContributorsCount);
    
    container.innerHTML = toShow.map(t => {
        const tags = Array.isArray(t.tags) ? t.tags : (t.tags?.split(',').map(s => escapeHTML(s.trim())) || []);
        
        const badges = tags.map(tag => {
            const tData = getDashTagData(tag);
            return `<span class="con-tag" style="color: ${tData.color}; border-color: ${tData.color}; font-size: 0.75rem;"><i class="${tData.icon}"></i> ${escapeHTML(tag)}</span>`;
        }).join('');
        
        let displayName = '';
        let username = '';
        
        if (Array.isArray(t.name)) {
            displayName = t.name[0] || '';
            username = t.name[1] || displayName;
        } else if (typeof t.name === 'string') {
            const parts = t.name.split(',');
            displayName = parts[0].trim();
            username = parts[1] ? parts[1].trim() : parts[0].trim();
        }
        
        return `
            <div class="member-card" style="cursor: pointer; transition: 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'" onclick="window.location.href='profile.html?name=${encodeURIComponent(username)}'">
                <div class="member-header">
                    <i class="${t.role_icon ? escapeHTML(t.role_icon.trim()) : 'fa-solid fa-user'}" style="color: ${escapeHTML(t.icon_color) || '#ffffff'}; font-size: 1.2rem;"></i> 
                    <span style="font-weight: 900; font-size: 1.2rem;">${escapeHTML(displayName) || 'Unknown'}</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">${badges}</div>
            </div>
        `;
    }).join('');

    if (btnWrap) {
        btnWrap.style.display = visibleContributorsCount >= allContributors.length ? 'none' : 'block';
    }
}

function showMoreContributors() {
    visibleContributorsCount += 8;
    renderContributors();
}

function updateCharCount() {
    const input = document.getElementById('reviewTextInput');
    const counter = document.getElementById('charCounter');
    
    counter.innerText = `${input.value.length} / 112`;
    counter.style.color = input.value.length > 112 ? 'var(--danger)' : 'var(--text-muted)';
}

function showCooldownPopup(seconds) {
    const overlay = document.getElementById('customDialogOverlay');
    document.getElementById('dialogTitle').innerText = "Hold up! You're reviewing too fast";
    document.getElementById('dialogBtnCancel').style.display = 'none';
    
    const msg = document.getElementById('dialogMessage');
    const btn = document.getElementById('dialogBtnConfirm');
    
    btn.innerText = 'OK'; 
    btn.className = 'btn-primary';
    
    const update = (s) => { 
        msg.innerText = `You may comment again in:\n${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; 
    };
    
    update(seconds); 
    overlay.classList.add('show');
    
    if (cooldownTimer) clearInterval(cooldownTimer);
    
    cooldownTimer = setInterval(() => {
        seconds--;
        if (seconds <= 0) { 
            clearInterval(cooldownTimer); 
            msg.innerText = "You can post now!"; 
        } else {
            update(seconds);
        }
    }, 1000);
    
    const close = () => { 
        overlay.classList.remove('show'); 
        btn.removeEventListener('click', close); 
        if (cooldownTimer) clearInterval(cooldownTimer); 
    };
    
    btn.addEventListener('click', close);
}

function buildReviewTree(data) {
    const tree = [];
    const map = {};
    
    data.forEach(r => {
        map[r.id] = { ...r, children: [] };
    });
    
    data.forEach(r => { 
        if (r.replying_to_id && map[r.replying_to_id]) {
            map[r.replying_to_id].children.push(map[r.id]); 
        } else {
            tree.push(map[r.id]); 
        }
    });
    
    return tree;
}

function renderReviewNode(r, depth = 0) {
    const margin = depth > 0 ? 30 : 0;
    const stars = Array(5).fill(0).map((_,i) => i < r.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join('');
    
    const isMine = currentUser && String(r.poster_id) === String(currentUser.discord_id);
    const delBtn = isMine ? `<button class="delete-btn" title="Delete" onclick="deleteReview('${r.id}')"><i class="fas fa-trash"></i></button>` : '';
    
    const cleanUsername = escapeHTML(r.poster_username).split('#')[0];
    
    let html = `
        <div class="review-item" id="review-${r.id}" style="margin-left: ${margin}px; border-left: ${depth > 0 ? '2px solid var(--border)' : 'none'}; padding-left: ${depth > 0 ? '12px' : '0'}; margin-bottom: ${depth > 0 ? '10px' : '20px'};">
            <img src="${escapeHTML(r.poster_avatar) || '/assets/images/logo.png'}" class="review-avatar" onerror="this.src='/assets/images/logo.png'">
            <div class="review-content">
                <div class="review-user-row">
                    <a href="profile.html?name=${encodeURIComponent(cleanUsername)}" style="font-weight: 800; font-size:0.95rem; color:var(--text-main); text-decoration:none;">${cleanUsername}</a>
                    <div>
                        ${depth === 0 ? `<span class="review-stars" style="margin-right:8px; color:#f1c40f;">${stars}</span>` : ''}
                        ${delBtn}
                    </div>
                </div>
                <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom: 8px;">${escapeHTML(r.comment)}</p>
                <div style="display:flex; gap: 15px; font-size: 0.8rem; font-weight: 700;">
                    <span style="color:var(--text-muted); cursor:pointer; transition:0.2s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-muted)'" onclick="setReplyTo('${r.id}', '${cleanUsername}')"><i class="fas fa-reply"></i> Reply</span>
                    ${r.children.length > 0 ? `<span style="color:var(--accent); cursor:pointer;" onclick="toggleReplies('${r.id}')"><i class="fas fa-chevron-down"></i> View ${r.children.length} Replies</span>` : ''}
                </div>
            </div>
        </div>
    `;
    
    if (r.children.length > 0) {
        html += `<div id="replies-${r.id}" style="display:none; transition: var(--transition);">`;
        r.children.forEach(child => {
            html += renderReviewNode(child, depth + 1);
        });
        html += `</div>`;
    }
    
    return html;
}

async function openReviews(id) {
    activeConfigId = id; 
    replyingToId = null;
    
    document.getElementById('replyIndicator').style.display = 'none';
    document.getElementById('reviewTextInput').value = ''; 
    updateCharCount();
    document.getElementById('reviewModal').classList.add('show');
    
    const { data } = await _supabase.from('reviews').select('*').eq('config_id', id).order('created_at', { ascending: true });
    const list = document.getElementById('reviewList');
    
    if (!data || data.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding: 2rem 0;">No reviews yet. Be the first!</p>`;
        return;
    }
    
    list.innerHTML = buildReviewTree(data).map(r => renderReviewNode(r, 0)).join('');
}

function toggleReplies(id) {
    const el = document.getElementById(`replies-${id}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
}

function setReplyTo(id, user) {
    replyingToId = id;
    document.getElementById('replyIndicator').style.display = 'flex';
    document.getElementById('replyUsername').innerText = user;
    document.getElementById('reviewTextInput').focus();
}

function cancelReply() { 
    replyingToId = null; 
    document.getElementById('replyIndicator').style.display = 'none'; 
}

async function deleteReview(id) {
    if (await customConfirm("Are you sure you want to delete this comment?", "Delete", "Delete", true)) {
        const { error } = await _supabase.from('reviews').delete().eq('id', id);
        
        if (!error) {
            document.getElementById(`review-${id}`)?.remove();
        } else {
            await customAlert("Error deleting review.", "Error");
        }
    }
}

function closeReviews(e) {
    if (e && e.target !== document.getElementById('reviewModal')) return;
    
    document.getElementById('reviewModal').classList.remove('show');
    activeConfigId = null; 
    replyingToId = null;
    document.getElementById('replyIndicator').style.display = 'none';
    
    currentRatingInput = 5;
    document.querySelectorAll('.input-star').forEach(s => {
        s.classList.remove('far');
        s.classList.add('fas', 'active');
    });
}

document.addEventListener('click', (e) => {
    const star = e.target.closest('.input-star');
    if (star) {
        currentRatingInput = parseInt(star.getAttribute('data-val'));
        
        document.querySelectorAll('.input-star').forEach(s => {
            const val = parseInt(s.getAttribute('data-val'));
            s.classList.remove('fas', 'far', 'active');
            
            if (val <= currentRatingInput) {
                s.classList.add('fas', 'active'); 
            } else {
                s.classList.add('far'); 
            }
        });
    }
}, true); 

async function submitReview() {
    const input = document.getElementById('reviewTextInput');
    const text = input.value.trim();
    
    if (!currentUser) return await customAlert("You must be logged in to leave a review.", "Notice");
    if (!text || !activeConfigId) return;
    if (text.length > 112) return await customAlert(`${text.length}/112`, "Hold up! Your review is too long");
    if (/[<>{}=;]/.test(text)) return await customAlert("Your review contains unauthorized coding symbols.", "Security Block");
    
    input.disabled = true;
    
    const { data } = await _supabase.from('reviews').select('created_at').eq('poster_id', currentUser.discord_id).order('created_at', { ascending: false }).limit(1).single();
    
    if (data) {
        const timeDiff = new Date().getTime() - new Date(data.created_at).getTime();
        const cooldown = 3 * 60 * 1000; 
        if (timeDiff < cooldown) { 
            input.disabled = false; 
            return showCooldownPopup(Math.ceil((cooldown - timeDiff) / 1000)); 
        }
    }
    
    const { error } = await _supabase.rpc('submit_secure_review', { 
        p_config_id: activeConfigId, 
        p_poster_id: currentUser.discord_id, 
        p_poster_username: currentUser.username, 
        p_poster_avatar: currentUser.avatar_url, 
        p_rating: replyingToId ? null : currentRatingInput, 
        p_comment: text, 
        p_replying_to_id: replyingToId 
    });
    
    input.disabled = false;
    
    if (!error) { 
        input.value = ''; 
        updateCharCount(); 
        cancelReply(); 
        openReviews(activeConfigId); 
    } else if (error.code === '23505') {
        await customAlert("You have already reviewed this configuration. You may reply to existing reviews, but cannot submit a new rating.", "Review Limit Reached");
    } else if (error.message && error.message.includes('Cooldown active')) {
        await customAlert("The server blocked your request. You must wait 3 minutes.", "Security Block");
    } else {
        await customAlert("Failed to post review. Please try again.", "Error");
    }
}
