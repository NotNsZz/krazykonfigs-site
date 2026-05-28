async function initCreatorDashboard() {
    // 1. Inject the navbar and modals first
    if (typeof injectComponents === 'function') {
        await injectComponents();
    }

    // 2. Run the core authentication and global setup
    if (typeof bootSequence === 'function') {
        await bootSequence();
    }

    // 3. Dynamic Greeting (Replacing the hardcoded 'krizzster')
    if (typeof currentUser !== 'undefined' && currentUser) {
        const greeting = document.getElementById('creator-greeting');
        if (greeting) {
            const hour = new Date().getHours();
            let timeOfDay = 'Evening';
            if (hour < 12) timeOfDay = 'Morning';
            else if (hour < 18) timeOfDay = 'Afternoon';

            greeting.innerText = `Good ${timeOfDay}, ${currentUser.username}`;
        }
    } else {
        // Failsafe to make the page visible even if auth fails
        document.body.classList.add('ready');
    }
}

// Fire the initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', initCreatorDashboard);

function switchTab(tabId) {
    // Drop active state from sidebar
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });

    const clickedItem = event.currentTarget;
    if (clickedItem) {
        clickedItem.classList.add('active');
    }

    // Hide everything
    document.querySelectorAll('.dashboard-tab').forEach(el => {
        el.classList.remove('active');
    });

    // Reveal target tab
    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    }
}
