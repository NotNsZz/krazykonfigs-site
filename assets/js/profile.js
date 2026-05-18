// --- TAG COLOR DICTIONARY ---
// (We re-declare it here since profile uses it specifically for badges)
let tagColorDictionary = { "OWNER": "#f1c40f", "DEVELOPER": "#2ecc71", "CONTRIBUTOR": "#9b59b6", "TUFF": "#e74c3c", "TESTER": "#e67e22" };

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

        // 1. Direct Unique Match Check via ID (Safest method)
        if (targetDiscordId) {
            const { data } = await _supabase.from('users').select('*').eq('discord_id', targetDiscordId).limit(1);
            if(data && data.length > 0) user = data[0];
        } 
        
        // 2. Encoded Parameter String Fallback (The Bug Fix: The Aggressive String Search)
        // Decodes URL spaces (e.g. "%20L" becomes " L")
        // This searches display_name OR username OR old #0 usernames case-insensitively!
        if (!user && targetName) {
            const cleanName = decodeURIComponent(targetName).trim(); 
            
            // Try exact Username match first
            let { data } = await _supabase.from('users').select('*').ilike('username', cleanName).limit(1);
            
            // Try exact Display Name match second
            if (!data || data.length === 0) {
                ({ data } = await _supabase.from('users').select('*').ilike('display_name', cleanName).limit(1));
            }
            
            // Absolute Last Resort: Fuzzy Match (.limit(1) guarantees it NEVER crashes like maybeSingle() did!)
            if (!data || data.length === 0) {
                ({ data } = await _supabase.from('users').select('*').or(`display_name.ilike.%${cleanName}%,username.ilike.%${cleanName}%`).limit(1));
            }

            if(data && data.length > 0) user = data[0];
        }

        // If STILL not found in the database, THEN we safely 404
        if (!user) return window.location.href = '/404.html';

        // (Fail-safe redirect has been removed. A bug now prints red text to the console.)

        // --- POPULATE THE UI (Matched strictly to your existing HTML skeleton) ---
        const dName = user.display_name || user.username.split('#')[0];
        const uName = user.username.split('#')[0]; 
        const namesToCheck = [user.username, dName, uName];

        // Fetch Creator Identification
        const { data: configs } = await _supabase.from('configs').select('id').in('creator', namesToCheck).limit(1);
        const isCreator = configs && configs.length > 0;

        // Fetch Reviews Left by User
        const { data: reviews } = await _supabase.from('reviews').select('*').eq('poster_id', user.discord_id).order('created_at', { ascending: false });
        userReviews = reviews || [];

        // Fetch Directory Tags (OWNER, DEVELOPER, etc.)
        const { data: contributorData } = await _supabase.from('contributors').select('tags').in('name', namesToCheck).limit(1);
        const tags = contributorData && contributorData[0]?.tags ? (Array.isArray(contributorData[0].tags) ? contributorData[0].tags : contributorData[0].tags.split(',')) : [];

        // Fetch Social Media, Views, and Verified Status (This is the new table)
        const { data: extProfile } = await _supabase.from('user_profiles').select('*').eq('id', user.id).single();

        // 1. Update User Card HTML
        const avatarEl = document.getElementById('p-avatar');
        const dnameEl = document.getElementById('p-dname');
        const unameEl = document.getElementById('p-uname');
        const joinedEl = document.getElementById('stat-joined');
        
        if(avatarEl) avatarEl.src = escapeHTML(user.avatar_url) || '/assets/images/logo.png';
        if(dnameEl) dnameEl.innerText = escapeHTML(dName);
        if(unameEl) unameEl.innerText = "@" + escapeHTML(uName).toLowerCase().replace(/\s/g, '');
        
        // Joined Date (Member since May 2026)
        if(joinedEl) {
            const rawDate = user.created_at || user.last_login;
            joinedEl.innerText = rawDate ? "Joined: " + new Date(rawDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Joined: Unknown';
        }

        // 2. Update Extended Profile Data (Socials, Bio, Views)
        if (extProfile) {
            // Bio
            const bioEl = document.getElementById('p-bio');
            // Characters Limited Bio: Displaying character counter
            if(bioEl) bioEl.innerText = escapeHTML(extProfile.bio) || "No bio yet.";

            // Views: views counter has been removed
            
            // Verified Badge (Verified Creator checkmark next to their name)
            const verifiedEl = document.getElementById('p-verified');
            if(extProfile.is_verified && verifiedEl) verifiedEl.style.display = 'inline-block';

            // Social Buttons
            const dcLinkEl = document.getElementById('p-discord-link');
            if(dcLinkEl) {
                if(extProfile.discord_link) dcLinkEl.href = escapeHTML(extProfile.discord_link);
                else dcLinkEl.style.display = 'none'; // No link, hide button
            }

            // Online Presence Status: mapped indicators
            const statusDot = document.getElementById('p-status-dot');
            if(statusDot) {
                const s = (extProfile.status || 'offline').toLowerCase();
                statusDot.className = `status-dot ${s}`;
                statusDot.title = s.charAt(0).toUpperCase() + s.slice(1);
            }
        }

        // Conditional Edit Button logic for Profile Owner only
        const editBtn = document.getElementById('p-edit-btn');
        if(editBtn && currentUser && currentUser.id === user.id) {
            editBtn.style.display = 'block';
        }

        // 3. Badges & Tags
        const badgesEl = document.getElementById('p-badges');
        if (badgesEl) {
            // Added the <i class="fas ..."> icons back in!
            badgesEl.innerHTML = isCreator ? `<span class="role-badge badge-creator"><i class="fas fa-hammer"></i> Creator</span>` : `<span class="role-badge badge-user"><i class="fas fa-user"></i> User</span>`;
        }

        const tagsContainer = document.getElementById('p-tags');
        if (tags.length > 0 && tagsContainer) {
            tagsContainer.style.display = 'flex';
            tagsContainer.style.gap = '8px'; // Adds spacing between the tags
            tagsContainer.style.flexWrap = 'wrap'; // Ensures they wrap to a new line on small screens
            
            tagsContainer.innerHTML = tags.map(t => {
                const color = typeof getBadgeColor === 'function' ? getBadgeColor(t) : '#666';
                return `<span class="con-tag" style="color: ${color}; border-color: ${color};">${escapeHTML(t.trim())}</span>`;
            }).join('');
        } else if (tagsContainer) {
            tagsContainer.style.display = 'none';
        }

        // 4. Populate Reviews History
        renderProfileReviews(user);

        // 5. Show More Reviews
        const showMoreBtn = document.getElementById('show-more-reviews-btn');
        if(showMoreBtn) {
            showMoreBtn.onclick = () => {
                visibleReviewCount += 4;
                renderProfileReviews(user);
            };
        }

    } catch (err) { console.error("Profile Engine Load Exception:", err); }
}

// (renderProfileReviews function remains the same, it's safe)
