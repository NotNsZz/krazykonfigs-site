let allConfigs = [], currentFilteredConfigs = [], currentVisibleCount = 9, currentPingTier = 'all';
let activeConfigId = null, currentRatingInput = 5, replyingToId = null, cooldownTimer = null;

// --- INITIALIZATION ---
// We removed the DOMContentLoaded and the 500ms timer. 
// Now, this function waits patiently until dashboard.html explicitly tells it to run.
function initDashboardLogic() {
    if(typeof bootSequence === 'function') bootSequence();
    if(typeof initMusicPlayer === 'function') initMusicPlayer();
    
    fetchConfigs();
    fetchContributors();

    if(!sessionStorage.getItem('creatorPromoSeen')){
        sessionStorage.setItem('creatorPromoSeen', 'true');
        document.getElementById('creatorPromoOverlay')?.classList.add('show');
    }
}

// --- CONFIG LOGIC ---
async function fetchConfigs() {
    const {data} = await _supabase.from('configs').select('*').eq('is_archived', 'false');
    allConfigs = (data || []).sort((a, b) => (parseInt(a.priority) || 999) - (parseInt(b.priority) || 999));
    const creators = [...new Set(allConfigs.map(c => c.creator).filter(Boolean))];
    const filter = document.getElementById('creatorFilter');
    if(filter) filter.innerHTML = '<option value="all">By Creator</option>' + creators.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    applyFilters(null, document.querySelector('.filter-btn.active'));
}

function applyFilters(tier = null, btn = null) {
    if(tier) {
        currentPingTier = tier;
        if(btn) { document.querySelectorAll('#configs .filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
    }
    currentVisibleCount = 9;
    const search = (document.getElementById('configSearch')?.value || '').toLowerCase();
    const creator = document.getElementById('creatorFilter')?.value || 'all';
    currentFilteredConfigs = allConfigs.filter(c => (currentPingTier === 'all' || (c.ping_tier || '').toLowerCase().includes(currentPingTier)) && (c.title || '').toLowerCase().includes(search) && (creator === 'all' || c.creator === creator));
    renderConfigs();
}

function showMoreConfigs() { currentVisibleCount += 9; renderConfigs(); }

function renderConfigs() {
    const container = document.getElementById('config-container'), btnWrap = document.getElementById('showMoreConfigsBtnWrap');
    const toShow = currentFilteredConfigs.slice(0, currentVisibleCount);
    container.innerHTML = toShow.map(t => `
        <div class="config-card">
            <div>
                <div class="card-head">${escapeHTML(t.title)} | ${escapeHTML(t.ping_tier) || 'N/A'} PING</div>
                <div class="card-divider"></div>
                <div style="margin-bottom: 1.2rem;">
                    <div class="section-label">🎯 PREDICTION</div>
                    <div class="data-row"><span style="color:var(--text-muted)">Simulation Timer</span> <span class="data-val">${escapeHTML(t.sim_timer) ?? '-'}</span></div>
                    <div class="data-row"><span style="color:var(--text-muted)">Prediction Interval</span> <span class="data-val">${escapeHTML(t.pred_interval) || '-'}</span></div>
                </div>
                <div style="margin-bottom: 1.2rem;">
                    <div class="section-label"><i class="fas fa-sliders-h" style="color:var(--accent);"></i> MULTIPLIERS</div>
                    <div class="data-row"><span style="color:var(--text-muted)">Vertical</span> <span class="data-val">${escapeHTML(t.vertical) ?? '155'}</span></div>
                    <div class="data-row"><span style="color:var(--text-muted)">Horizontal</span> <span class="data-val">${escapeHTML(t.horizontal) ?? '165'}</span></div>
                </div>
            </div>
            <div>
                <div class="card-footer-box">
                    <div><div class="revert-badge">REVERT | ${escapeHTML(t.hit_rate) || '85%'} HIT RATE</div></div>
                    <div style="text-align: right;"><span style="font-size:0.8rem; font-style:italic; font-weight: 600; color:var(--text-muted); display: block;">by <a href="profile.html?name=${encodeURIComponent(t.creator)}" style="color:var(--text-main); text-decoration:underline; cursor:pointer;">${escapeHTML(t.creator)}</a></span></div>
                </div>
                <button class="review-trigger-btn" onclick="openReviews(${t.id})"><i class="fas fa-comments"></i> View Reviews</button>
            </div>
        </div>`).join('');
    if(toShow.length === 0) container.innerHTML = `<p style="color:var(--text-muted); text-align:center; grid-column: 1/-1; padding: 2rem;">No configs match your search criteria.</p>`;
    if(btnWrap) btnWrap.style.display = currentVisibleCount >= currentFilteredConfigs.length ? 'none' : 'block';
}

// --- CONTRIBUTORS LOGIC ---
async function fetchContributors() {
    const {data} = await _supabase.from('contributors').select('*');
    const sorted = (data || []).sort((a,b) => (parseInt(a.priority) || 999) - (parseInt(b.priority) || 999));
    document.getElementById('contributor-container').innerHTML = sorted.map(t => {
        const tags = Array.isArray(t.tags) ? t.tags : (t.tags?.split(',').map(s => escapeHTML(s.trim())) || []);
        const badges = tags.map(tag => `<span class="badge-tag" style="color: ${getBadgeColor(tag)};">${tag}</span>`).join('');
        return `<div class="member-card"><div class="member-header"><i class="${t.role_icon ? escapeHTML(t.role_icon.trim()) : 'fa-solid fa-user'}" style="color: ${escapeHTML(t.icon_color) || '#ffffff'}; font-size: 1.2rem;"></i> <span style="font-weight: 900; font-size: 1.2rem;">${escapeHTML(t.name) || 'Unknown'}</span></div><div style="display:flex; flex-wrap:wrap; gap:8px;">${badges}</div></div>`;
    }).join('');
}

// --- REVIEWS LOGIC ---
function updateCharCount(){
    const input = document.getElementById('reviewTextInput'), counter = document.getElementById('charCounter');
    counter.innerText = `${input.value.length} / 112`;
    counter.style.color = input.value.length > 112 ? 'var(--danger)' : 'var(--text-muted)';
}

function showCooldownPopup(seconds){
    const overlay = document.getElementById('customDialogOverlay');
    document.getElementById('dialogTitle').innerText = "Hold up! You're reviewing too fast";
    document.getElementById('dialogBtnCancel').style.display = 'none';
    const msg = document.getElementById('dialogMessage'), btn = document.getElementById('dialogBtnConfirm');
    btn.innerText = 'OK'; btn.className = 'btn-modal-primary';
    
    const update = (s) => { msg.innerText = `You may comment again in:\n${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; };
    update(seconds); overlay.classList.add('show');
    if(cooldownTimer) clearInterval(cooldownTimer);
    
    cooldownTimer = setInterval(() => {
        seconds--;
        if(seconds <= 0) { clearInterval(cooldownTimer); msg.innerText = "You can post now!"; } else update(seconds);
    }, 1000);
    
    const close = () => { overlay.classList.remove('show'); btn.removeEventListener('click', close); if(cooldownTimer) clearInterval(cooldownTimer); };
    btn.addEventListener('click', close);
}

function buildReviewTree(data){
    const tree = [], map = {};
    data.forEach(r => map[r.id] = {...r, children: []});
    data.forEach(r => { if(r.replying_to_id && map[r.replying_to_id]) map[r.replying_to_id].children.push(map[r.id]); else tree.push(map[r.id]); });
    return tree;
}

function renderReviewNode(r, depth=0) {
    const margin = depth > 0 ? 30 : 0;
    const stars = Array(5).fill(0).map((_,i) => i < r.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join('');
    const isMine = currentUser && String(r.poster_id) === String(currentUser.discord_id);
    const delBtn = isMine ? `<button class="delete-btn" title="Delete" onclick="deleteReview(${r.id})"><i class="fas fa-trash"></i></button>` : '';
    
    let html = `
    <div class="review-item" id="review-${r.id}" style="margin-left: ${margin}px; border-left: ${depth > 0 ? '2px solid var(--border)' : 'none'}; padding-left: ${depth > 0 ? '12px' : '0'}; margin-bottom: ${depth > 0 ? '10px' : '20px'};">
        <img src="${escapeHTML(r.poster_avatar) || 'https://via.placeholder.com/40'}" class="review-avatar">
        <div class="review-content">
            <div class="review-user-row">
                <a href="profile.html?user=${r.poster_id}" style="font-weight: 800; font-size:0.95rem; color:var(--text-main); text-decoration:none;">${escapeHTML(r.poster_username)}</a>
                <div>${depth === 0 ? `<span class="review-stars" style="margin-right:8px;">${stars}</span>` : ''}${delBtn}</div>
            </div>
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom: 8px;">${escapeHTML(r.comment)}</p>
            <div style="display:flex; gap: 15px; font-size: 0.8rem; font-weight: 700;">
                <span style="color:var(--text-muted); cursor:pointer; transition:0.2s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-muted)'" onclick="setReplyTo(${r.id}, '${escapeHTML(r.poster_username)}')"><i class="fas fa-reply"></i> Reply</span>
                ${r.children.length > 0 ? `<span style="color:var(--accent); cursor:pointer;" onclick="toggleReplies(${r.id})"><i class="fas fa-chevron-down"></i> View ${r.children.length} Replies</span>` : ''}
            </div>
        </div>
    </div>`;
    
    if(r.children.length > 0) {
        html += `<div id="replies-${r.id}" style="display:none; transition: var(--transition);">`;
        r.children.forEach(child => html += renderReviewNode(child, depth + 1));
        html += `</div>`;
    }
    return html;
}

async function openReviews(id) {
    activeConfigId = id; replyingToId = null;
    document.getElementById('replyIndicator').style.display = 'none';
    document.getElementById('reviewTextInput').value = ''; updateCharCount();
    document.getElementById('reviewModal').classList.add('show');
    
    const {data} = await _supabase.from('reviews').select('*').eq('config_id', id).order('created_at', {ascending: true});
    const list = document.getElementById('reviewList');
    if(!data || data.length === 0) return list.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding: 2rem 0;">No reviews yet. Be the first!</p>`;
    
    list.innerHTML = buildReviewTree(data).map(r => renderReviewNode(r, 0)).join('');
}

function toggleReplies(id) {
    const el = document.getElementById(`replies-${id}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function setReplyTo(id, user) {
    replyingToId = id;
    document.getElementById('replyIndicator').style.display = 'flex';
    document.getElementById('replyUsername').innerText = user;
    document.getElementById('reviewTextInput').focus();
}

function cancelReply() { replyingToId = null; document.getElementById('replyIndicator').style.display = 'none'; }

async function deleteReview(id) {
    if(await customConfirm("Are you sure you want to delete this comment?", "Delete", "Delete", true)) {
        const {error} = await _supabase.from('reviews').delete().eq('id', id);
        if(!error) document.getElementById(`review-${id}`).remove();
        else await customAlert("Error deleting review.", "Error");
    }
}

function closeReviews(e) {
    if(e && e.target !== document.getElementById('reviewModal')) return;
    document.getElementById('reviewModal').classList.remove('show');
    activeConfigId = null; replyingToId = null;
    document.getElementById('replyIndicator').style.display = 'none';
    document.querySelectorAll('.input-star').forEach(el => el.classList.toggle('active', parseInt(el.getAttribute('data-val')) <= 5));
    currentRatingInput = 5;
}

document.querySelectorAll('.input-star').forEach(t => {
    t.addEventListener('click', e => {
        currentRatingInput = parseInt(e.target.getAttribute('data-val'));
        document.querySelectorAll('.input-star').forEach(s => s.classList.toggle('active', parseInt(s.getAttribute('data-val')) <= currentRatingInput));
    });
});

async function submitReview() {
    const input = document.getElementById('reviewTextInput'), text = input.value.trim();
    if(!currentUser) return await customAlert("You must be logged in to leave a review.", "Notice");
    if(!text || !activeConfigId) return;
    if(text.length > 112) return await customAlert(`${text.length}/112`, "Hold up! Your review is too long");
    if(/[<>{}=;]/.test(text)) return await customAlert("Your review contains unauthorized coding symbols.", "Security Block");
    
    input.disabled = true;
    const {data} = await _supabase.from('reviews').select('created_at').eq('poster_id', currentUser.discord_id).order('created_at', {ascending: false}).limit(1).single();
    if(data) {
        const timeDiff = new Date().getTime() - new Date(data.created_at).getTime(), cooldown = 3 * 60 * 1000;
        if(timeDiff < cooldown) { input.disabled = false; return showCooldownPopup(Math.ceil((cooldown - timeDiff)/1000)); }
    }
    
    const {error} = await _supabase.rpc('submit_secure_review', { p_config_id: activeConfigId, p_poster_id: currentUser.discord_id, p_poster_username: currentUser.username, p_poster_avatar: currentUser.avatar_url, p_rating: replyingToId ? null : currentRatingInput, p_comment: text, p_replying_to_id: replyingToId });
    input.disabled = false;
    
    if(!error) { input.value = ''; updateCharCount(); cancelReply(); openReviews(activeConfigId); } 
    else if(error.message.includes('Cooldown active')) await customAlert("The server blocked your request. You must wait 3 minutes.", "Security Block");
    else await customAlert("Failed to post review.", "Error");
}
