// --- BADGES & TAGS FIX ---
        const badgesEl = document.getElementById('p-badges');
        if (badgesEl) {
            // Added the <i class="fas ..."> icons back in!
            badgesEl.innerHTML = isCreator ? `<span class="role-badge badge-creator"><i class="fas fa-hammer"></i> Creator</span>` : `<span class="role-badge badge-user"><i class="fas fa-user"></i> User</span>`;
        }

        const tagsContainer = document.getElementById('p-tags');
        if (tags.length > 0 && tagsContainer) {
            tagsContainer.style.display = 'flex';
            tagsContainer.style.gap = '8px'; // FIX: Adds spacing between the tags
            tagsContainer.style.flexWrap = 'wrap'; // FIX: Ensures they wrap to a new line on small screens
            
            tagsContainer.innerHTML = tags.map(t => {
                const color = typeof getBadgeColor === 'function' ? getBadgeColor(t) : '#666';
                return `<span class="con-tag" style="color: ${color}; border-color: ${color};">${escapeHTML(t.trim())}</span>`;
            }).join('');
        } else if (tagsContainer) {
            tagsContainer.style.display = 'none';
        }
