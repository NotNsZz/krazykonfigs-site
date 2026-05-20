// Simple Static Tab Switcher
function switchTab(tabId) {
    // 1. Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });

    // 2. Add active class to the clicked nav item
    const clickedItem = event.currentTarget;
    if (clickedItem) clickedItem.classList.add('active');

    // 3. Hide all tabs
    document.querySelectorAll('.dashboard-tab').forEach(el => {
        el.classList.remove('active');
    });

    // 4. Show the selected tab
    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    }
}
