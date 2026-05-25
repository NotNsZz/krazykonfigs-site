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
