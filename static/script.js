// ==========================================
// 1. Initialization and Layout Navigation
// ==========================================

const LAST_SECTION_KEY = 'vbt_last_section';
const SIDEBAR_TOGGLED_KEY = 'vbt_sidebar_toggled';
const SIDEBAR_PINNED_KEY = 'vbt_sidebar_pinned';
const THEME_MODE_KEY = 'vbt_theme_mode';
const sectionLoadState = {};

document.addEventListener('DOMContentLoaded', () => {
    // 1. 取得目前的權限狀態
    const savedUsername = localStorage.getItem('vbt_username');
    const savedRole = localStorage.getItem('vbt_role');

    // 2. 執行權限 UI 刷新 (確保 Guest, Member, Captain 看到的都不一樣)
    refreshUIByRole(savedRole);
    applySavedSidebarState();
    applySavedThemeMode();

    // 3. 預設顯示首頁
    showSection(getInitialSection(savedRole));

    // 4. 如果有存檔的資訊，更新使用者名稱等 UI
    if (savedUsername && savedRole) {
        applyLoginUI(savedUsername, savedRole);
    }

    initializeCompatibilityFallbacks();
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
            closeSidebar();
        });
    }

    const appTitle = document.getElementById('app-title');
    if (appTitle) {
        appTitle.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            showSection('home');
        });
    }

});

function getActionButton(trigger) {
    if (trigger && trigger.currentTarget && trigger.currentTarget.tagName === 'BUTTON') return trigger.currentTarget;
    if (trigger && trigger.target && trigger.target.tagName === 'BUTTON') return trigger.target;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return document.activeElement;
    return null;
}

async function withButtonLoading(trigger, loadingText, task) {
    const button = getActionButton(trigger);
    const originalHtml = button ? button.innerHTML : '';

    if (button) {
        if (button.dataset.loading === 'true') return;
        button.dataset.loading = 'true';
        button.disabled = true;
        button.classList.add('is-loading');
        button.innerHTML = `<span class="btn-loading-spinner" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span>`;
    }

    try {
        return await task();
    } finally {
        if (button) {
            button.innerHTML = originalHtml;
            button.disabled = false;
            button.classList.remove('is-loading');
            delete button.dataset.loading;
        }
    }
}

function normalizeMonthString(value) {
    const normalized = String(value || '').trim();
    return /^\d{4}-\d{2}$/.test(normalized) ? normalized : '';
}

function normalizeDateString(value) {
    const normalized = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function applyTextInputFallback(inputId, format) {
    const input = document.getElementById(inputId);
    if (!input || input.type === format) return;

    input.placeholder = format === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.pattern = format === 'month' ? '\\d{4}-\\d{2}' : '\\d{4}-\\d{2}-\\d{2}';

    input.addEventListener('blur', () => {
        const normalized = format === 'month' ? normalizeMonthString(input.value) : normalizeDateString(input.value);
        if (!input.value || normalized) return;
        input.setCustomValidity(format === 'month' ? '請輸入 YYYY-MM' : '請輸入 YYYY-MM-DD');
        input.reportValidity();
    });

    input.addEventListener('input', () => {
        input.setCustomValidity('');
    });
}

function syncCustomCheckboxState(root = document) {
    root.querySelectorAll('.custom-checkbox').forEach((label) => {
        const input = label.querySelector('input[type="checkbox"]');
        if (!input) return;
        label.classList.toggle('is-checked', input.checked);
    });
}

function initializeCompatibilityFallbacks() {
    ['lottery-month-picker', 'probability-start-month', 'probability-end-month'].forEach((id) => {
        applyTextInputFallback(id, 'month');
    });

    ['config-start', 'config-end', 'strategy-date-picker'].forEach((id) => {
        applyTextInputFallback(id, 'date');
    });

    syncCustomCheckboxState();
    document.addEventListener('change', (event) => {
        if (!event.target.matches('.custom-checkbox input[type="checkbox"]')) return;
        const container = event.target.closest('.checkbox-grid') || document;
        syncCustomCheckboxState(container);
    });
}

// 🌟 核心函數：根據角色決定誰該出現、誰該消失
function refreshUIByRole(role) {
    const authItems = document.querySelectorAll('.auth-only');
    const captainItems = document.querySelectorAll('.captain-only');

    // 如果是 Captain，兩者都要開
    if (role === 'captain') {
        authItems.forEach(el => el.style.setProperty('display', 'flex', 'important'));
        captainItems.forEach(el => el.style.setProperty('display', 'flex', 'important'));
    } 
    // 如果是 Member，只開 auth，關掉 captain
    else if (role === 'member') {
        authItems.forEach(el => el.style.setProperty('display', 'flex', 'important'));
        captainItems.forEach(el => el.style.setProperty('display', 'none', 'important'));
    } 
    // 訪客模式，全部關掉
    else {
        authItems.forEach(el => el.style.setProperty('display', 'none', 'important'));
        captainItems.forEach(el => el.style.setProperty('display', 'none', 'important'));
    }
}

function toggleSidebar() {
    const mainApp = document.getElementById('main-app');
    if (!mainApp) return;
    if (mainApp.classList.contains('sidebar-pinned')) {
        closeSidebar();
        syncSidebarPinButton();
        return;
    }
    mainApp.classList.toggle('sidebar-toggled');
    sessionStorage.setItem(SIDEBAR_TOGGLED_KEY, String(mainApp.classList.contains('sidebar-toggled')));
    syncSidebarPinButton();
    updateShowcaseCropGuide();
}

function closeSidebar() {
    const mainApp = document.getElementById('main-app');
    if (!mainApp || mainApp.classList.contains('sidebar-toggled')) return;
    if (mainApp.classList.contains('sidebar-pinned')) {
        mainApp.classList.remove('sidebar-pinned');
        localStorage.setItem(SIDEBAR_PINNED_KEY, 'false');
    }
    mainApp.classList.add('sidebar-toggled');
    sessionStorage.setItem(SIDEBAR_TOGGLED_KEY, 'true');
    syncSidebarPinButton();
    updateShowcaseCropGuide();
}

function applySavedSidebarState() {
    const mainApp = document.getElementById('main-app');
    if (!mainApp) return;
    const pinnedValue = localStorage.getItem(SIDEBAR_PINNED_KEY);
    const isPinned = pinnedValue === 'true';
    mainApp.classList.toggle('sidebar-pinned', isPinned);
    const savedValue = sessionStorage.getItem(SIDEBAR_TOGGLED_KEY);
    if (isPinned) {
        mainApp.classList.remove('sidebar-toggled');
        syncSidebarPinButton();
        return;
    }
    if (savedValue === null) {
        mainApp.classList.add('sidebar-toggled'); // 無紀錄時預設收合
        return;
    }
    mainApp.classList.toggle('sidebar-toggled', savedValue === 'true');
    syncSidebarPinButton();
}

function toggleSidebarPin() {
    const mainApp = document.getElementById('main-app');
    if (!mainApp) return;

    const shouldPin = !mainApp.classList.contains('sidebar-pinned');
    mainApp.classList.toggle('sidebar-pinned', shouldPin);
    localStorage.setItem(SIDEBAR_PINNED_KEY, String(shouldPin));

    if (shouldPin) {
        mainApp.classList.remove('sidebar-toggled');
        sessionStorage.setItem(SIDEBAR_TOGGLED_KEY, 'false');
    } else {
        mainApp.classList.add('sidebar-toggled');
        sessionStorage.setItem(SIDEBAR_TOGGLED_KEY, 'true');
    }

    syncSidebarPinButton();
    updateShowcaseCropGuide();
}

function hexToRgba(hex, alpha) {
    const normalized = String(hex || '').replace('#', '').trim();
    if (!/^[\da-fA-F]{6}$/.test(normalized)) return `rgba(0, 0, 0, ${alpha})`;
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getCssVariableValue(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function mixHex(colorA, colorB, ratio) {
    const normalize = (value) => String(value || '').replace('#', '').trim();
    const a = normalize(colorA);
    const b = normalize(colorB);
    if (!/^[\da-fA-F]{6}$/.test(a) || !/^[\da-fA-F]{6}$/.test(b)) return colorA || colorB || '#000000';
    const weight = Math.max(0, Math.min(1, Number(ratio) || 0));
    const mix = (index) => {
        const first = parseInt(a.slice(index, index + 2), 16);
        const second = parseInt(b.slice(index, index + 2), 16);
        return Math.round(first + ((second - first) * weight)).toString(16).padStart(2, '0');
    };
    return `#${mix(0)}${mix(2)}${mix(4)}`;
}

function syncSidebarPinButton() {
    const mainApp = document.getElementById('main-app');
    const pinButtons = document.querySelectorAll('.sidebar-pin-btn:not(.sidebar-theme-btn)');
    if (!mainApp || pinButtons.length === 0) return;

    const isPinned = mainApp.classList.contains('sidebar-pinned');
    pinButtons.forEach((pinButton) => {
        pinButton.classList.toggle('active', isPinned);
        pinButton.setAttribute('aria-pressed', String(isPinned));
        pinButton.title = isPinned ? '取消釘選側邊欄' : '釘選側邊欄';
    });
}

function applyThemeMode(mode) {
    const resolvedMode = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.themeMode = resolvedMode;
    localStorage.setItem(THEME_MODE_KEY, resolvedMode);
    syncThemeModeButton();
    refreshThemeSensitiveViews();
}

function applySavedThemeMode() {
    const savedMode = localStorage.getItem(THEME_MODE_KEY);
    applyThemeMode(savedMode === 'dark' ? 'dark' : 'light');
}

function toggleThemeMode() {
    const currentMode = document.documentElement.dataset.themeMode === 'dark' ? 'dark' : 'light';
    applyThemeMode(currentMode === 'dark' ? 'light' : 'dark');
}

function syncThemeModeButton() {
    const isDarkMode = document.documentElement.dataset.themeMode === 'dark';
    const themeButton = document.getElementById('sidebar-theme-btn');
    if (!themeButton) return;
    const icon = themeButton.querySelector('i');
    themeButton.classList.toggle('active', isDarkMode);
    themeButton.setAttribute('aria-pressed', String(isDarkMode));
    themeButton.title = isDarkMode ? '切換白天模式' : '切換黑夜模式';

    if (icon) {
        icon.classList.toggle('fa-moon', !isDarkMode);
        icon.classList.toggle('fa-sun', isDarkMode);
    }
}

function refreshThemeSensitiveViews() {
    const strategySection = document.getElementById('strategy');
    if (!strategySection || strategySection.style.display !== 'block') return;
    loadLotteryDashboard().catch((error) => {
        console.error('Failed to refresh strategy views after theme change:', error);
    });
}

function canAccessSection(sectionId, role) {
    const targetSection = document.getElementById(sectionId);
    if (!targetSection) return false;
    if (targetSection.classList.contains('captain-only')) return role === 'captain';
    if (targetSection.classList.contains('auth-only')) return role === 'captain' || role === 'member';
    return true;
}

function getInitialSection(role) {
    const savedSection = sessionStorage.getItem(LAST_SECTION_KEY) || 'home';
    return canAccessSection(savedSection, role) ? savedSection : 'home';
}

function showSection(sectionId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.style.display = 'none';
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
        sessionStorage.setItem(LAST_SECTION_KEY, sectionId);
    } else {
        console.error('Element with ID "' + sectionId + '" not found.');
        return; 
    }

    const menuItems = document.querySelectorAll('.menu-list li');
    menuItems.forEach(item => {
        item.classList.remove('active');
    });

    const activeItem = Array.from(menuItems).find(item => {
        const onclickAttr = item.getAttribute('onclick') || '';
        return onclickAttr.includes(`'${sectionId}'`) || onclickAttr.includes(`"${sectionId}"`);
    });

    if (activeItem) {
        activeItem.classList.add('active');
    }

    const mainApp = document.getElementById('main-app');
    if (mainApp && !mainApp.classList.contains('sidebar-pinned')) {
        closeSidebar();
    }

    ensureSectionDataLoaded(sectionId).catch((error) => {
        console.error(`Failed to load section data for ${sectionId}`, error);
    });
}

function resetSectionLoadState() {
    Object.keys(sectionLoadState).forEach((key) => {
        delete sectionLoadState[key];
    });
}

async function ensureSectionDataLoaded(sectionId, options = {}) {
    const force = options.force === true;
    if (!force && sectionLoadState[sectionId]) return;

    if (sectionId === 'home') {
        await loadGallery();
    } else if (sectionId === 'schedule') {
        await loadCourtStatus();
    } else if (sectionId === 'strategy') {
        renderIndependentAccountPlanSection();
        await Promise.all([loadLotteryBids(), loadLotteryDashboard()]);
    } else if (sectionId === 'videos') {
        await loadVideoSections();
        initVideoImprovementPanel();
    } else if (sectionId === 'team-data') {
        await loadTeamResources();
    } else if (sectionId === 'approval' && localStorage.getItem('vbt_role') === 'captain') {
        await Promise.all([loadPendingUsers(), loadTeamMembers()]);
    }

    sectionLoadState[sectionId] = true;
}

// ==========================================
// 2. Authentication & Account Management
// ==========================================

function openLogin() {
    document.getElementById('login-overlay').style.setProperty('display', 'flex', 'important');
    toggleAuthMode('login'); 
}

function closeLogin() {
    document.getElementById('login-overlay').style.setProperty('display', 'none', 'important');
}

function toggleAuthMode(mode) {
    const loginForm = document.getElementById('login-form-container');
    const registerForm = document.getElementById('register-form-container');
    const errorMsg = document.getElementById('login-error');
    const regMsg = document.getElementById('reg-message');

    if (errorMsg) errorMsg.style.display = 'none';
    if (regMsg) regMsg.innerText = '';

    if (!loginForm || !registerForm) {
        console.error("找不到登入或註冊表單。");
        return;
    }

    if (mode === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

function togglePasswordVisibility(inputId, spanElement) {
    const passwordInput = document.getElementById(inputId);
    const iconElement = spanElement.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        iconElement.classList.remove('fa-eye-slash');
        iconElement.classList.add('fa-eye');
    } else {
        passwordInput.type = 'password';
        iconElement.classList.remove('fa-eye');
        iconElement.classList.add('fa-eye-slash');
    }
}

async function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const role = document.getElementById('reg-role').value;
    const password = document.getElementById('reg-password').value;
    const messageEl = document.getElementById('reg-message');

    if (!username || !password) {
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '請填寫所有欄位。';
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const data = await response.json();

        if (response.ok) {
            messageEl.style.color = '#2ecc71'; 
            messageEl.innerText = data.message;
            
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
            
            setTimeout(() => toggleAuthMode('login'), 2000);
        } else {
            messageEl.style.color = '#ff4757';
            messageEl.innerText = data.error || '註冊失敗。';
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '伺服器錯誤。';
    }
}

async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    if (!username || !password) {
        errorMsg.innerText = '請輸入姓名與密碼。';
        errorMsg.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();

        if (response.ok) {
            errorMsg.style.display = 'none';
            closeLogin();
            
            // Save login state to browser memory
            localStorage.setItem('vbt_username', username);
            localStorage.setItem('vbt_role', data.role);
            
            // Update UI
            applyLoginUI(username, data.role);
            showSection('home');

        } else {
            errorMsg.innerText = data.error || '登入失敗。';
            errorMsg.style.display = 'block';
            document.getElementById('login-password').value = '';
        }
    } catch (error) {
        console.error('Error:', error);
        errorMsg.innerText = '伺服器連線失敗。';
        errorMsg.style.display = 'block';
    }
}

/**
 * Helper function to apply UI changes after a successful login (manual or auto)
 */
function applyLoginUI(username, role) {
    // 1. 基本用戶資訊更新
    document.getElementById('guest-zone').style.display = 'none';
    document.getElementById('user-zone').style.display = 'flex';
    document.getElementById('display-avatar').innerText = username.charAt(0).toUpperCase();
    
    const roleDisplay = document.getElementById('display-role');
    if (roleDisplay) {
        let roleName = role.toUpperCase();
        if (role === 'captain') roleName = '隊長';
        else if (role === 'member') roleName = '隊員';
        else if (role === 'guest') roleName = '訪客';
        
        roleDisplay.innerText = roleName;
        roleDisplay.classList.remove('captain');
        if (role === 'captain') roleDisplay.classList.add('captain');
    }

    // 🌟 2. 權限全域刷新 (關鍵修改)
    const allAuthItems = document.querySelectorAll('.auth-only');
    const allCaptainItems = document.querySelectorAll('.captain-only');

    // 先處理所有登入者可見的
    allAuthItems.forEach(item => {
        if (role === 'captain' || role === 'member') {
            // 如果是 Member 且該元素同時又是 Captain-only，就隱藏
            if (role === 'member' && item.classList.contains('captain-only')) {
                item.style.setProperty('display', 'none', 'important');
            } else {
                item.style.setProperty('display', 'flex', 'important');
            }
        } else {
            item.style.setProperty('display', 'none', 'important');
        }
    });

    // 🌟 額外處理「純 Captain」的元素 (例如你的 Scraper Panel)
    allCaptainItems.forEach(item => {
        if (role === 'captain') {
            item.style.setProperty('display', 'flex', 'important');
        } else {
            item.style.setProperty('display', 'none', 'important');
        }
    });

    resetSectionLoadState();
    const activeSection = sessionStorage.getItem(LAST_SECTION_KEY) || 'home';
    ensureSectionDataLoaded(activeSection, { force: true }).catch((error) => {
        console.error(`Failed to load active section data for ${activeSection}`, error);
    });
}

function handleLogout() {
    // Clear browser memory on logout
    localStorage.removeItem('vbt_username');
    localStorage.removeItem('vbt_role');
    location.reload(); 
}

function toggleAvatarMenu(event) {
    event.stopPropagation(); 
    const menu = document.getElementById('avatarMenu');
    if(menu) menu.classList.toggle('active');
}

window.onclick = function(event) {
    if (!event.target.closest('.avatar-dropdown-container')) {
        const dropdowns = document.getElementsByClassName("avatar-dropdown-menu");
        for (let i = 0; i < dropdowns.length; i++) {
            if (dropdowns[i].classList.contains('active')) {
                dropdowns[i].classList.remove('active');
            }
        }
    }
}


// ==========================================
// 3. Captain Panel: Role & User Management
// ==========================================

async function loadPendingUsers() {
    const container = document.getElementById('pending-users-container');
    if (!container) return;
    
    try {
        const response = await fetch('/api/pending_users');
        const users = await response.json();
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 20px;">目前沒有待審核申請。</p>';
            return;
        }
        
        let html = '<ul style="list-style: none; padding: 0;">';
        users.forEach(user => {
            html += `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee;">
                    <div>
                        <strong style="font-size: 1.1em;">${user.username}</strong> 
                        <span style="color: var(--accent-soft-text); font-size: 0.9em; margin-left: 10px; background: var(--accent-soft-bg); padding: 4px 8px; border-radius: 6px;">申請身分：${user.role === 'captain' ? '隊長' : '隊員'}</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="approveUser(${user.id}, 'approve')" class="primary-btn-sm" style="background: var(--interactive-color);">通過</button>
                        <button onclick="approveUser(${user.id}, 'reject')" class="primary-btn-sm" style="background: var(--danger-color);">拒絕</button>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p style="text-align:center; color:var(--danger-color);">資料載入失敗。</p>';
    }
}

async function approveUser(userId, action) {
    if (!confirm(`確定要${action === 'approve' ? '通過' : '拒絕'}這位使用者嗎？`)) return;
    
    try {
        const response = await fetch('/api/approve_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, action: action })
        });
        
        if (response.ok) {
            loadPendingUsers(); 
            loadTeamMembers();
        } else {
            alert('操作失敗。');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadTeamMembers() {
    const container = document.getElementById('team-members-container');
    if (!container) return;
    
    try {
        const response = await fetch('/api/team_members');
        const users = await response.json();
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 20px;">目前沒有其他隊員。</p>';
            return;
        }
        
        let html = '<ul style="list-style: none; padding: 0;">';
        users.forEach(user => {
            const isCaptain = user.role === 'captain' ? 'selected' : '';
            const isMember = user.role === 'member' ? 'selected' : '';
            
            html += `
                <li style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee;">
                    <div>
                        <strong style="font-size: 1.1em;">${user.username}</strong> 
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <select onchange="changeUserRole(${user.id}, this.value)" style="padding: 6px 10px; border-radius: 6px; width: auto; margin-bottom: 0;">
                            <option value="member" ${isMember}>隊員</option>
                            <option value="captain" ${isCaptain}>隊長</option>
                        </select>
                        <button onclick="deleteUser(${user.id})" class="primary-btn-sm" style="background: var(--danger-color);">刪除</button>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = '<p style="text-align:center; color:var(--danger-color);">名單載入失敗。</p>';
    }
}

async function deleteUser(userId) {
    if (!confirm('確定要永久刪除此帳號嗎？')) return;
    
    try {
        const response = await fetch('/api/delete_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        
        if (response.ok) {
            loadTeamMembers(); 
        } else {
            alert('刪除使用者失敗。');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function changeUserRole(userId, newRole) {
    if (!confirm(`確定要把這位使用者的身分改成${newRole === 'captain' ? '隊長' : '隊員'}嗎？`)) {
        loadTeamMembers(); 
        return;
    }
    
    try {
        const response = await fetch('/api/update_role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, new_role: newRole })
        });
        
        if (response.ok) {
            alert(`身分已更新為${newRole === 'captain' ? '隊長' : '隊員'}。`);
            loadTeamMembers(); 
        } else {
            alert('更新身分失敗。');
        }
    } catch (error) {
        console.error('Error updating role:', error);
    }
}


// ==========================================
// 4. Match Analysis & Videos
// ==========================================

let videoSectionsState = [];
let activeVideoNotesSectionId = null;
let teamResourceSectionsState = [];
let activeTeamResourceNotesSectionId = null;
let activeNotesScope = 'video';
let sectionDragState = null;
let videoCardDragState = null;
const FRAME_ANALYSIS_FPS = 30;
const FRAME_ANALYSIS_ORIENTATION_KEY = 'vbt_frame_analysis_orientation';
const frameAnalysisState = {
    mode: 'none',
    localObjectUrl: '',
    youtubePlayer: null,
    youtubeApiReady: false,
    youtubeApiPromise: null,
    viewerScale: 100,
    viewerOrientation: 'landscape',
};

function getYouTubeVideoId(url) {
    return parseYouTubeResource(url).videoId;
}

function parseYouTubeResource(url) {
    let rawUrl = String(url || '').trim();
    if (!rawUrl) {
        return { kind: null, videoId: null, playlistId: null };
    }
    if (!rawUrl.includes('://') && /^(www\.youtube\.com|youtube\.com|m\.youtube\.com|youtu\.be)\//.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
    }

    let videoId = null;
    let playlistId = null;

    try {
        const parsed = new URL(rawUrl);
        const host = parsed.hostname.toLowerCase();
        const isYouTubeHost = host.endsWith('youtube.com') || host.endsWith('youtu.be') || host.endsWith('youtube-nocookie.com');
        if (!isYouTubeHost) {
            return { kind: null, videoId: null, playlistId: null };
        }

        playlistId = parsed.searchParams.get('list') || null;
        if (host.endsWith('youtu.be')) {
            videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || null;
        } else if (parsed.pathname.includes('/embed/')) {
            videoId = parsed.pathname.split('/embed/')[1]?.split('/')[0] || null;
        } else {
            videoId = parsed.searchParams.get('v') || null;
        }
    } catch (error) {
        const videoMatch = rawUrl.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
        const playlistMatch = rawUrl.match(/[?&]list=([^#&?]+)/);
        videoId = (videoMatch && videoMatch[2] && videoMatch[2].length === 11) ? videoMatch[2] : null;
        playlistId = playlistMatch && playlistMatch[1] ? playlistMatch[1] : null;
    }

    if (videoId && videoId.length !== 11) videoId = null;
    if (!playlistId) playlistId = null;

    return {
        kind: playlistId ? 'playlist' : (videoId ? 'video' : null),
        videoId,
        playlistId,
    };
}

function getFrameAnalysisElements() {
    return {
        fileInput: document.getElementById('frame-analysis-file'),
        urlInput: document.getElementById('frame-analysis-url'),
        empty: document.getElementById('frame-analysis-empty'),
        status: document.getElementById('frame-analysis-status'),
        video: document.getElementById('frame-analysis-video'),
        youtube: document.getElementById('frame-analysis-youtube'),
        viewer: document.getElementById('frame-analysis-viewer'),
        scaleInput: document.getElementById('frame-analysis-scale'),
        scaleValue: document.getElementById('frame-analysis-scale-value'),
        orientationButton: document.getElementById('frame-analysis-orientation-btn'),
    };
}

function getDefaultFrameAnalysisOrientation() {
    return window.matchMedia('(max-width: 768px)').matches ? 'portrait' : 'landscape';
}

function readFrameAnalysisOrientationPreference() {
    const saved = localStorage.getItem(FRAME_ANALYSIS_ORIENTATION_KEY);
    return saved === 'portrait' || saved === 'landscape' ? saved : '';
}

function applyFrameAnalysisOrientation(orientation) {
    const { viewer, orientationButton } = getFrameAnalysisElements();
    const normalized = orientation === 'portrait' ? 'portrait' : 'landscape';
    frameAnalysisState.viewerOrientation = normalized;
    if (viewer) {
        viewer.classList.toggle('is-portrait', normalized === 'portrait');
        viewer.classList.toggle('is-landscape', normalized === 'landscape');
    }
    if (orientationButton) {
        orientationButton.textContent = normalized === 'portrait' ? '切換為橫式' : '切換為直式';
        orientationButton.setAttribute('aria-label', normalized === 'portrait' ? '切換為橫式' : '切換為直式');
        orientationButton.title = normalized === 'portrait' ? '目前為直式' : '目前為橫式';
    }
}

function syncFrameAnalysisOrientation(force = false) {
    const preferred = readFrameAnalysisOrientationPreference();
    if (preferred && !force) {
        applyFrameAnalysisOrientation(preferred);
        return;
    }
    applyFrameAnalysisOrientation(getDefaultFrameAnalysisOrientation());
}

function setFrameAnalysisOrientation(orientation, savePreference = true) {
    applyFrameAnalysisOrientation(orientation);
    if (savePreference) {
        localStorage.setItem(FRAME_ANALYSIS_ORIENTATION_KEY, frameAnalysisState.viewerOrientation);
    }
}

function toggleFrameAnalysisOrientation() {
    const nextOrientation = frameAnalysisState.viewerOrientation === 'portrait' ? 'landscape' : 'portrait';
    setFrameAnalysisOrientation(nextOrientation, true);
}

function applyFrameAnalysisViewerScale(scalePercent) {
    const { viewer, scaleInput, scaleValue } = getFrameAnalysisElements();
    const nextScale = Math.max(70, Math.min(100, Number(scalePercent) || 100));
    frameAnalysisState.viewerScale = nextScale;
    if (viewer) viewer.style.setProperty('--frame-analysis-viewer-width', `${nextScale}%`);
    if (scaleInput) scaleInput.value = String(nextScale);
    if (scaleValue) scaleValue.textContent = `${nextScale}%`;
}

function setFrameAnalysisViewerScale(scalePercent) {
    applyFrameAnalysisViewerScale(scalePercent);
}

function formatFrameAnalysisTime(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const wholeSeconds = Math.floor(safeSeconds % 60);
    const fraction = Math.round((safeSeconds % 1) * 100);
    const base = `${String(minutes).padStart(hours ? 2 : 1, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
    return hours ? `${hours}:${base}` : base;
}

function updateFrameAnalysisStatus() {
    const { status, video } = getFrameAnalysisElements();
    if (!status) return;
    syncFrameAnalysisToggleButton();

    if (frameAnalysisState.mode === 'local' && video) {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        const stateLabel = video.paused ? '暫停中' : '播放中';
        status.textContent = `本機影片｜${stateLabel}｜${formatFrameAnalysisTime(current)} / ${duration ? formatFrameAnalysisTime(duration) : '--:--.--'}`;
        return;
    }

    if (frameAnalysisState.mode === 'youtube' && frameAnalysisState.youtubePlayer && frameAnalysisState.youtubeApiReady) {
        const player = frameAnalysisState.youtubePlayer;
        const current = Number(player.getCurrentTime?.() || 0);
        const duration = Number(player.getDuration?.() || 0);
        const playerState = Number(player.getPlayerState?.());
        const stateLabel = playerState === 1 ? '播放中' : '暫停中';
        status.textContent = `YouTube｜${stateLabel}｜${formatFrameAnalysisTime(current)} / ${duration ? formatFrameAnalysisTime(duration) : '--:--.--'}`;
        return;
    }

    status.textContent = '尚未載入影片';
}

function isFrameAnalysisPlaying() {
    const { video } = getFrameAnalysisElements();
    if (frameAnalysisState.mode === 'local' && video) return !video.paused;
    if (frameAnalysisState.mode === 'youtube' && frameAnalysisState.youtubePlayer) {
        return Number(frameAnalysisState.youtubePlayer.getPlayerState?.()) === 1;
    }
    return false;
}

function syncFrameAnalysisToggleButton() {
    const toggleButton = document.getElementById('frame-analysis-play-toggle');
    if (!toggleButton) return;
    const icon = toggleButton.querySelector('i');
    const label = toggleButton.querySelector('span');
    const isPlaying = isFrameAnalysisPlaying();

    toggleButton.title = isPlaying ? '暫停' : '播放';
    toggleButton.setAttribute('aria-label', isPlaying ? '暫停' : '播放');

    if (icon) {
        icon.classList.toggle('fa-play', !isPlaying);
        icon.classList.toggle('fa-pause', isPlaying);
    }
    if (label) {
        label.textContent = isPlaying ? '暫停' : '播放';
    }
}

function setFrameAnalysisMode(mode) {
    const { empty, video, youtube } = getFrameAnalysisElements();
    frameAnalysisState.mode = mode;
    if (empty) empty.style.display = mode === 'none' ? 'flex' : 'none';
    if (video) {
        video.style.display = mode === 'local' ? 'block' : 'none';
    }
    if (youtube) {
        youtube.style.display = mode === 'youtube' ? 'block' : 'none';
    }
    updateFrameAnalysisStatus();
}

function cleanupFrameAnalysisLocalVideo() {
    const { video, fileInput } = getFrameAnalysisElements();
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }
    if (frameAnalysisState.localObjectUrl) {
        URL.revokeObjectURL(frameAnalysisState.localObjectUrl);
        frameAnalysisState.localObjectUrl = '';
    }
    if (fileInput) fileInput.value = '';
}

function stopFrameAnalysisYouTube() {
    if (!frameAnalysisState.youtubePlayer) return;
    try {
        frameAnalysisState.youtubePlayer.pauseVideo?.();
        frameAnalysisState.youtubePlayer.stopVideo?.();
        frameAnalysisState.youtubePlayer.destroy?.();
    } catch (error) {
        console.error('Failed to stop YouTube frame analysis player', error);
    } finally {
        frameAnalysisState.youtubePlayer = null;
    }
}

function resetFrameAnalysisPlayback(nextMode = 'none') {
    if (nextMode !== 'local') cleanupFrameAnalysisLocalVideo();
    if (nextMode !== 'youtube') stopFrameAnalysisYouTube();
    setFrameAnalysisMode(nextMode);
}

function attachFrameAnalysisVideoEvents() {
    const { video } = getFrameAnalysisElements();
    if (!video || video.dataset.bound === 'true') return;
    video.dataset.bound = 'true';
    ['loadedmetadata', 'play', 'pause', 'timeupdate', 'seeked', 'ended'].forEach((eventName) => {
        video.addEventListener(eventName, updateFrameAnalysisStatus);
    });
}

function loadFrameAnalysisLocalVideo(file) {
    const { video, empty, urlInput } = getFrameAnalysisElements();
    if (!video || !file) return;
    cleanupFrameAnalysisLocalVideo();
    resetFrameAnalysisPlayback('local');
    if (urlInput) urlInput.value = '';
    if (empty) empty.style.display = 'none';
    frameAnalysisState.localObjectUrl = URL.createObjectURL(file);
    video.src = frameAnalysisState.localObjectUrl;
    video.currentTime = 0;
    video.load();
    setFrameAnalysisMode('local');
    updateFrameAnalysisStatus();
}

function handleFrameAnalysisFileChange(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    loadFrameAnalysisLocalVideo(file);
}

function ensureYouTubeIframeApi() {
    if (window.YT && typeof window.YT.Player === 'function') {
        frameAnalysisState.youtubeApiReady = true;
        return Promise.resolve();
    }

    if (frameAnalysisState.youtubeApiPromise) return frameAnalysisState.youtubeApiPromise;

    frameAnalysisState.youtubeApiPromise = new Promise((resolve) => {
        const previousReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            frameAnalysisState.youtubeApiReady = true;
            if (typeof previousReady === 'function') previousReady();
            resolve();
        };
        if (!document.querySelector('script[data-youtube-iframe-api="true"]')) {
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.async = true;
            script.dataset.youtubeIframeApi = 'true';
            document.head.appendChild(script);
        }
    });

    return frameAnalysisState.youtubeApiPromise;
}

async function loadFrameAnalysisYouTube() {
    const { urlInput, youtube, empty } = getFrameAnalysisElements();
    const url = urlInput ? urlInput.value.trim() : '';
    const videoId = getYouTubeVideoId(url);
    if (!videoId) {
        alert('請輸入有效的 YouTube 連結。');
        return;
    }

    resetFrameAnalysisPlayback('youtube');
    await ensureYouTubeIframeApi();
    if (!youtube) return;
    if (empty) empty.style.display = 'none';
    youtube.innerHTML = '<div id="frame-analysis-youtube-player"></div>';

    frameAnalysisState.youtubePlayer = new window.YT.Player('frame-analysis-youtube-player', {
        videoId,
        playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
        },
        events: {
            onReady: () => {
                setFrameAnalysisMode('youtube');
                updateFrameAnalysisStatus();
            },
            onStateChange: updateFrameAnalysisStatus,
        },
    });
}

function getFrameAnalysisCurrentTime() {
    const { video } = getFrameAnalysisElements();
    if (frameAnalysisState.mode === 'local' && video) return Number(video.currentTime || 0);
    if (frameAnalysisState.mode === 'youtube' && frameAnalysisState.youtubePlayer) {
        return Number(frameAnalysisState.youtubePlayer.getCurrentTime?.() || 0);
    }
    return 0;
}

function getFrameAnalysisDuration() {
    const { video } = getFrameAnalysisElements();
    if (frameAnalysisState.mode === 'local' && video) return Number.isFinite(video.duration) ? video.duration : 0;
    if (frameAnalysisState.mode === 'youtube' && frameAnalysisState.youtubePlayer) {
        return Number(frameAnalysisState.youtubePlayer.getDuration?.() || 0);
    }
    return 0;
}

function seekFrameAnalysisTo(timeInSeconds) {
    const nextTime = Math.max(0, Math.min(getFrameAnalysisDuration() || Number.MAX_SAFE_INTEGER, Number(timeInSeconds) || 0));
    const { video } = getFrameAnalysisElements();

    if (frameAnalysisState.mode === 'local' && video) {
        video.currentTime = nextTime;
        updateFrameAnalysisStatus();
        return;
    }

    if (frameAnalysisState.mode === 'youtube' && frameAnalysisState.youtubePlayer) {
        frameAnalysisState.youtubePlayer.seekTo(nextTime, true);
        updateFrameAnalysisStatus();
    }
}

function playFrameAnalysisVideo() {
    const { video } = getFrameAnalysisElements();
    if (frameAnalysisState.mode === 'local' && video) {
        video.play().catch((error) => console.error('Failed to play local frame analysis video', error));
        return;
    }
    if (frameAnalysisState.mode === 'youtube' && frameAnalysisState.youtubePlayer) {
        frameAnalysisState.youtubePlayer.playVideo?.();
        updateFrameAnalysisStatus();
    }
}

function pauseFrameAnalysisVideo() {
    const { video } = getFrameAnalysisElements();
    if (frameAnalysisState.mode === 'local' && video) {
        video.pause();
        updateFrameAnalysisStatus();
        return;
    }
    if (frameAnalysisState.mode === 'youtube' && frameAnalysisState.youtubePlayer) {
        frameAnalysisState.youtubePlayer.pauseVideo?.();
        updateFrameAnalysisStatus();
    }
}

function toggleFrameAnalysisPlayback() {
    if (isFrameAnalysisPlaying()) {
        pauseFrameAnalysisVideo();
        return;
    }
    playFrameAnalysisVideo();
}

function stepFrameAnalysisFrame(direction) {
    const frameOffset = (Number(direction) || 0) / FRAME_ANALYSIS_FPS;
    pauseFrameAnalysisVideo();
    seekFrameAnalysisTo(getFrameAnalysisCurrentTime() + frameOffset);
}

function adjustFrameAnalysisTime(deltaSeconds) {
    seekFrameAnalysisTo(getFrameAnalysisCurrentTime() + (Number(deltaSeconds) || 0));
}

function initFrameAnalysisDashboard() {
    const { fileInput } = getFrameAnalysisElements();
    attachFrameAnalysisVideoEvents();
    if (fileInput && fileInput.dataset.bound !== 'true') {
        fileInput.dataset.bound = 'true';
        fileInput.addEventListener('change', handleFrameAnalysisFileChange);
    }
    syncFrameAnalysisOrientation();
    applyFrameAnalysisViewerScale(frameAnalysisState.viewerScale);
    setFrameAnalysisMode('none');
}

function getVideoImprovementElements() {
    return {
        receive: document.getElementById('video-improvement-receive'),
        set: document.getElementById('video-improvement-set'),
        spike: document.getElementById('video-improvement-spike'),
        serve: document.getElementById('video-improvement-serve'),
        other: document.getElementById('video-improvement-other'),
        status: document.getElementById('video-improvement-status'),
        saveButton: document.getElementById('video-improvement-save-btn'),
        count: document.getElementById('frame-analysis-notes-count'),
    };
}

function getCurrentUsername() {
    return (localStorage.getItem('vbt_username') || '').trim();
}

function setVideoImprovementStatus(message) {
    const { status } = getVideoImprovementElements();
    if (status) status.textContent = message;
}

function normalizeVideoImprovementPanelText() {
    const elements = getVideoImprovementElements();
    if (elements.receive) {
        elements.receive.previousElementSibling.textContent = '接球';
        elements.receive.placeholder = '例如：接發時肩膀容易歪掉會接歪';
    }
    if (elements.set) {
        elements.set.previousElementSibling.textContent = '舉球';
        elements.set.placeholder = '例如：出手點太低導致球太流';
    }
    if (elements.spike) {
        elements.spike.previousElementSibling.textContent = '扣球';
        elements.spike.placeholder = '例如：手沒有伸直擊中球';
    }
    if (elements.serve) {
        elements.serve.previousElementSibling.textContent = '發球';
        elements.serve.placeholder = '例如：拋球位置要再右邊再往前一點';
    }
    if (elements.other) {
        elements.other.previousElementSibling.textContent = '其他';
        elements.other.placeholder = '例如：步伐、溝通、判斷或其他想補充的記錄。';
    }
    if (elements.saveButton) elements.saveButton.textContent = '儲存筆記';
}

function updateFrameAnalysisNotesCount(goals = {}) {
    const { count } = getVideoImprovementElements();
    if (!count) return;
    const filled = ['receive', 'set', 'spike', 'serve', 'other'].filter((key) => String(goals?.[key] || '').trim()).length;
    count.textContent = String(filled);
}

function applyVideoImprovementGoals(goals = {}) {
    const elements = getVideoImprovementElements();
    if (elements.receive) elements.receive.value = goals.receive || '';
    if (elements.set) elements.set.value = goals.set || '';
    if (elements.spike) elements.spike.value = goals.spike || '';
    if (elements.serve) elements.serve.value = goals.serve || '';
    if (elements.other) elements.other.value = goals.other || '';
    updateFrameAnalysisNotesCount(goals);
}

function updateVideoImprovementEditability() {
    const canEdit = !!getCurrentUsername();
    const { receive, set, spike, serve, other, saveButton } = getVideoImprovementElements();
    [receive, set, spike, serve, other].forEach((field) => {
        if (!field) return;
        field.disabled = !canEdit;
        field.readOnly = !canEdit;
    });
    if (saveButton) saveButton.disabled = !canEdit;
}

async function loadVideoImprovementGoals() {
    const viewerUsername = getCurrentUsername();
    if (!viewerUsername) {
        applyVideoImprovementGoals({});
        setVideoImprovementStatus('登入後可儲存自己的筆記。');
        return;
    }

    updateVideoImprovementEditability();
    setVideoImprovementStatus('載入中...');

    try {
        const params = new URLSearchParams({
            viewer_username: viewerUsername,
            username: viewerUsername,
        });
        const response = await fetch(`/api/video_improvement_goals?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
            setVideoImprovementStatus(data.error || '載入失敗');
            return;
        }
        applyVideoImprovementGoals(data.goals || {});
        setVideoImprovementStatus('');
        updateVideoImprovementEditability();
    } catch (error) {
        console.error('Failed to load video improvement goals', error);
        setVideoImprovementStatus('載入失敗');
    }
}

async function saveVideoImprovementGoals() {
    const username = getCurrentUsername();
    if (!username) {
        alert('請先登入。');
        return;
    }

    const { receive, set, spike, serve, other } = getVideoImprovementElements();
    setVideoImprovementStatus('儲存中...');

    try {
        const response = await fetch('/api/video_improvement_goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                receive: receive ? receive.value.trim() : '',
                set: set ? set.value.trim() : '',
                spike: spike ? spike.value.trim() : '',
                serve: serve ? serve.value.trim() : '',
                other: other ? other.value.trim() : '',
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            setVideoImprovementStatus(data.error || '儲存失敗');
            return;
        }
        updateFrameAnalysisNotesCount({
            receive: receive ? receive.value.trim() : '',
            set: set ? set.value.trim() : '',
            spike: spike ? spike.value.trim() : '',
            serve: serve ? serve.value.trim() : '',
            other: other ? other.value.trim() : '',
        });
        const updatedAt = data.goals?.updated_at ? `，上次儲存 ${String(data.goals.updated_at).replace('T', ' ')}` : '';
        setVideoImprovementStatus(`已儲存自己的筆記${updatedAt}`);
    } catch (error) {
        console.error('Failed to save video improvement goals', error);
        setVideoImprovementStatus('儲存失敗');
    }
}

function initVideoImprovementPanel() {
    normalizeVideoImprovementPanelText();
    updateVideoImprovementEditability();
    loadVideoImprovementGoals();
}

function openFrameAnalysisNotesModal() {
    const modal = document.getElementById('frame-analysis-notes-modal');
    if (!modal) return;
    normalizeVideoImprovementPanelText();
    updateVideoImprovementEditability();
    loadVideoImprovementGoals();
    modal.style.display = 'flex';
}

function closeFrameAnalysisNotesModal() {
    const modal = document.getElementById('frame-analysis-notes-modal');
    if (modal) modal.style.display = 'none';
}

function isCaptainRole() {
    return localStorage.getItem('vbt_role') === 'captain';
}

function buildSectionReorderHandle(scope, sectionId) {
    if (!isCaptainRole()) return '';
    return `
        <button
            type="button"
            class="section-reorder-handle"
            draggable="true"
            title="拖曳調整順序"
            ondragstart="handleSectionDragStart(event, '${scope}', '${sectionId}')"
            ondragend="handleSectionDragEnd()"
        >
            <i class="fas fa-grip-vertical"></i>
        </button>
    `;
}

function buildSectionCardDndAttrs(scope, sectionId) {
    if (!isCaptainRole()) return '';
    return `ondragover="handleSectionDragOver(event, '${scope}', '${sectionId}')" ondrop="handleSectionDrop(event, '${scope}', '${sectionId}')" ondragleave="handleSectionDragLeave(event)"`;
}

function buildSectionRenameButton(scope, sectionId, currentTitle) {
    if (!isCaptainRole()) return '';
    const encodedTitle = encodeURIComponent(String(currentTitle || ''));
    return `
        <button
            type="button"
            class="video-section-card__icon-btn"
            title="更改 session 名稱"
            onclick="renameSection('${scope}', '${sectionId}', decodeURIComponent('${encodedTitle}'))"
        >
            <i class="fas fa-pen"></i>
        </button>
    `;
}

function updateVideoSectionSelect() {
    const select = document.getElementById('video-section-select');
    if (!select) return;
    const sections = Array.isArray(videoSectionsState) ? videoSectionsState : [];
    if (!sections.length) {
        select.innerHTML = '<option value="">請先建立分類</option>';
        return;
    }
    select.innerHTML = '<option value="">選擇分類</option>' + sections.map((section) => `
        <option value="${section.id}">${escapeHtml(section.title)}</option>
    `).join('');
}

function renderVideoThumbnailCard(video, sectionId) {
    const resource = parseYouTubeResource(video.url);
    const isPlaylist = resource.kind === 'playlist';
    const thumbnailUrl = resource.videoId ? `https://img.youtube.com/vi/${resource.videoId}/mqdefault.jpg` : '';
    const title = video.title && video.title.trim()
        ? video.title.trim()
        : (isPlaylist ? 'YouTube 播放清單' : '比賽影片');
    const previewClass = `video-preview${isPlaylist ? ' video-preview--playlist' : ''}`;
    const preview = thumbnailUrl
        ? `<div class="${previewClass}" style="background-image: url('${thumbnailUrl}'); height: 160px; background-size: cover;">
                <span class="video-preview__badge">${isPlaylist ? '播放清單' : '影片'}</span>
           </div>`
        : `<div class="${previewClass}" style="height: 160px;">
                <span class="video-preview__badge">${isPlaylist ? '播放清單' : '影片'}</span>
                <span class="play-label">${isPlaylist ? '開啟播放清單' : '開啟影片'}</span>
           </div>`;
    const urlLabel = isPlaylist ? 'YouTube 播放清單' : 'YouTube 影片';
    const dragAttrs = isCaptainRole()
        ? `draggable="true" ondragstart="handleVideoCardDragStart(event, ${video.id}, ${sectionId})" ondragend="handleVideoCardDragEnd()" ondragover="handleVideoCardDragOver(event, ${video.id}, ${sectionId})" ondrop="handleVideoCardDrop(event, ${video.id}, ${sectionId})" ondragleave="handleVideoCardDragLeave(event)"`
        : '';
    return `
        <div class="video-card" data-video-id="${video.id}" data-section-id="${sectionId}" ${dragAttrs}>
            <button class="delete-btn" onclick="deleteVideoItem(${video.id}, ${sectionId})">刪除</button>
            <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: inherit;">
                ${preview}
                <div class="video-info">
                    <h5>${escapeHtml(title)}</h5>
                    <p>${escapeHtml(urlLabel)}</p>
                </div>
            </a>
        </div>
    `;
}

function renderVideoSections() {
    const container = document.getElementById('video-sections-container');
    if (!container) return;
    const sections = Array.isArray(videoSectionsState) ? videoSectionsState : [];
    if (!sections.length) {
        container.innerHTML = '<div class="card"><p style="color:#7b8c9b; margin:0;">目前還沒有比賽分類，請先在上方建立分類。</p></div>';
        updateVideoSectionSelect();
        return;
    }

    container.innerHTML = sections.map((section) => `
        <div class="video-section-card" data-section-scope="video" data-section-id="${section.id}" ${buildSectionCardDndAttrs('video', section.id)}>
            <div class="video-section-card__header">
                <div class="video-section-card__title">
                    ${buildSectionReorderHandle('video', section.id)}
                    <h4>${escapeHtml(section.title)}</h4>
                    <button type="button" class="video-section-card__meta" onclick="openVideoNotesModal(${section.id})">
                        <i class="fas fa-file-alt"></i>
                        <span>筆記</span>
                        <small>${Array.isArray(section.notes) ? section.notes.length : 0}</small>
                    </button>
                </div>
                <div class="video-section-card__actions">
                    ${buildSectionRenameButton('video', section.id, section.title)}
                    ${isCaptainRole() ? `<button type="button" class="video-section-card__delete" onclick="deleteVideoSection(${section.id})">刪除</button>` : ''}
                </div>
            </div>
            <div class="video-section-card__body">
                ${section.videos && section.videos.length
                    ? `<div class="video-section-card__scroller">${section.videos.map((video) => renderVideoThumbnailCard(video, section.id)).join('')}</div>`
                    : '<div class="video-section-card__empty">這個分類目前沒有影片或播放清單。</div>'}
            </div>
        </div>
    `).join('');
    updateVideoSectionSelect();
}

async function loadVideoSections() {
    try {
        const response = await fetch('/api/video_sections');
        videoSectionsState = await response.json();
        renderVideoSections();
    } catch (error) {
        console.error('Failed to load video sections', error);
    }
}

function updateTeamResourceSectionSelect() {
    const select = document.getElementById('team-resource-section-select');
    if (!select) return;
    const sections = Array.isArray(teamResourceSectionsState) ? teamResourceSectionsState : [];
    if (!sections.length) {
        select.innerHTML = '<option value="">請先建立資料分類</option>';
        return;
    }
    select.innerHTML = '<option value="">選擇資料分類</option>' + sections.map((section) => `
        <option value="${section.id}">${escapeHtml(section.title)}</option>
    `).join('');
}

function renderTeamResourceSections() {
    const container = document.getElementById('team-resource-sections-container');
    if (!container) return;
    const sections = Array.isArray(teamResourceSectionsState) ? teamResourceSectionsState : [];
    if (!sections.length) {
        container.innerHTML = '<div class="card"><p style="color:#7b8c9b; margin:0;">目前還沒有球隊資料，隊長可以先建立分類並加入 Google 文件、Google 表單或 Notion 連結。</p></div>';
        updateTeamResourceSectionSelect();
        return;
    }

    container.innerHTML = sections.map((section) => `
        <div class="video-section-card" data-section-scope="team_resource" data-section-id="${section.id}" ${buildSectionCardDndAttrs('team_resource', section.id)}>
            <div class="video-section-card__header">
                <div class="video-section-card__title">
                    ${buildSectionReorderHandle('team_resource', section.id)}
                    <h4>${escapeHtml(section.title)}</h4>
                    <button type="button" class="video-section-card__meta" onclick="openTeamResourceNotesModal('${section.id}')">
                        <i class="fas fa-file-alt"></i>
                        <span>筆記</span>
                        <small>${Array.isArray(section.notes) ? section.notes.length : 0}</small>
                    </button>
                    ${isCaptainRole() ? `<span class="resource-visibility-chip">${section.visibility === 'all' ? '隊長隊員可見' : '只有隊長可見'}</span>` : ''}
                </div>
                <div class="video-section-card__actions">
                    ${buildSectionRenameButton('team_resource', section.id, section.title)}
                    ${isCaptainRole() ? `<button type="button" class="video-section-card__delete" onclick="deleteTeamResourceSection('${section.id}')">刪除</button>` : ''}
                </div>
            </div>
            <div class="video-section-card__body">
                ${section.resources && section.resources.length
                    ? `<div class="video-section-card__scroller">${section.resources.map((item) => renderTeamResourceCard(item, section.id)).join('')}</div>`
                    : '<div class="video-section-card__empty">這個分類目前沒有檔案。</div>'}
            </div>
        </div>
    `).join('');
    updateTeamResourceSectionSelect();
}

async function loadTeamResources() {
    try {
        const role = localStorage.getItem('vbt_role') || '';
        const response = await fetch(`/api/team_resources?role=${encodeURIComponent(role)}`);
        teamResourceSectionsState = await response.json();
        renderTeamResourceSections();
    } catch (error) {
        console.error('Failed to load team resources', error);
    }
}

async function createTeamResourceSection() {
    const input = document.getElementById('team-resource-section-title');
    const visibilityInput = document.getElementById('team-resource-section-visibility');
    const title = input ? input.value.trim() : '';
    const visibility = visibilityInput ? visibilityInput.value : 'captain';
    if (!title) {
        alert('請輸入分類名稱。');
        return;
    }

    const response = await fetch('/api/team_resources/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, visibility }),
    });
    if (!response.ok) {
        alert('建立分類失敗。');
        return;
    }

    if (input) input.value = '';
    if (visibilityInput) visibilityInput.value = 'captain';
    await loadTeamResources();
}

async function addTeamResourceItem() {
    const urlInput = document.getElementById('team-resource-url');
    const titleInput = document.getElementById('team-resource-title');
    const sectionSelect = document.getElementById('team-resource-section-select');
    const url = urlInput ? urlInput.value.trim() : '';
    const title = titleInput ? titleInput.value.trim() : '';
    const sectionId = sectionSelect ? sectionSelect.value : '';

    if (!sectionId) return alert('請先選擇資料分類。');
    if (!url) return alert('請先貼上 Google Docs、Google Sheets、Google Forms 或 Notion 連結。');

    const response = await fetch('/api/team_resources/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, section_id: sectionId }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || '新增資料失敗。');
        return;
    }

    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    await loadTeamResources();
}

async function deleteTeamResourceItem(itemId, sectionId) {
    if (!confirm('確定要刪除這份球隊資料嗎？')) return;
    const response = await fetch(`/api/team_resources/items/${itemId}`, { method: 'DELETE' });
    if (!response.ok) {
        alert('刪除資料失敗。');
        return;
    }
    await loadTeamResources();
    if (activeTeamResourceNotesSectionId === sectionId) {
        openTeamResourceNotesModal(sectionId);
    }
}

async function deleteTeamResourceSection(sectionId) {
    if (!confirm('確定要刪除這個資料分類嗎？裡面的 Google 文件與 notes 也會一起刪除。')) return;
    const response = await fetch(`/api/team_resources/sections/${sectionId}`, { method: 'DELETE' });
    if (!response.ok) {
        alert('刪除資料分類失敗。');
        return;
    }
    if (activeTeamResourceNotesSectionId === sectionId) closeVideoNotesModal();
    await loadTeamResources();
}

async function renameSection(scope, sectionId, currentTitle) {
    if (!isCaptainRole()) return;
    const nextTitle = window.prompt('請輸入新的 session 名稱', currentTitle || '');
    if (nextTitle === null) return;
    const title = nextTitle.trim();
    if (!title || title === String(currentTitle || '').trim()) return;

    const endpoint = scope === 'video'
        ? `/api/video_sections/${sectionId}`
        : `/api/team_resources/sections/${sectionId}`;

    const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || '更改 session 名稱失敗。');
        return;
    }

    if (scope === 'video') await loadVideoSections();
    else await loadTeamResources();
}

function clearSectionDragIndicators() {
    document.querySelectorAll('.video-section-card.section-drop-before, .video-section-card.section-drop-after, .video-section-card.is-section-dragging').forEach((card) => {
        card.classList.remove('section-drop-before', 'section-drop-after', 'is-section-dragging');
    });
}

function handleSectionDragStart(event, scope, sectionId) {
    if (!isCaptainRole()) return;
    sectionDragState = { scope, sectionId: String(sectionId) };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(sectionDragState));
    const card = event.target.closest('.video-section-card');
    if (card) card.classList.add('is-section-dragging');
}

function handleSectionDragEnd() {
    sectionDragState = null;
    clearSectionDragIndicators();
}

function clearVideoCardDragIndicators() {
    document.querySelectorAll('.video-card.video-drop-before, .video-card.video-drop-after, .video-card.is-video-dragging').forEach((card) => {
        card.classList.remove('video-drop-before', 'video-drop-after', 'is-video-dragging');
    });
}

function handleVideoCardDragStart(event, videoId, sectionId) {
    if (!isCaptainRole()) return;
    videoCardDragState = { kind: 'video_card', videoId: Number(videoId), sectionId: Number(sectionId) };
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(videoCardDragState));
    const card = event.currentTarget;
    if (card) card.classList.add('is-video-dragging');
}

function handleVideoCardDragEnd() {
    videoCardDragState = null;
    clearVideoCardDragIndicators();
}

function handleVideoCardDragOver(event, targetVideoId, sectionId) {
    if (!isCaptainRole()) return;
    if (!videoCardDragState || videoCardDragState.kind !== 'video_card') return;
    if (videoCardDragState.sectionId !== Number(sectionId) || videoCardDragState.videoId === Number(targetVideoId)) return;
    event.preventDefault();
    event.stopPropagation();
    clearVideoCardDragIndicators();
    const card = event.currentTarget;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const before = event.clientX < rect.left + (rect.width / 2);
    card.classList.add(before ? 'video-drop-before' : 'video-drop-after');
}

function handleVideoCardDragLeave(event) {
    const card = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (card && relatedTarget && card.contains(relatedTarget)) return;
    if (card) card.classList.remove('video-drop-before', 'video-drop-after');
}

function reorderVideoCardsInState(sectionId, draggedVideoId, targetVideoId, insertBefore) {
    const nextSections = videoSectionsState.map((section) => {
        if (Number(section.id) !== Number(sectionId)) return section;
        const nextVideos = [...(section.videos || [])];
        const fromIndex = nextVideos.findIndex((video) => Number(video.id) === Number(draggedVideoId));
        const targetIndex = nextVideos.findIndex((video) => Number(video.id) === Number(targetVideoId));
        if (fromIndex < 0 || targetIndex < 0) return section;
        const [moved] = nextVideos.splice(fromIndex, 1);
        let insertIndex = targetIndex;
        if (!insertBefore && fromIndex < targetIndex) insertIndex = targetIndex;
        else if (!insertBefore) insertIndex = targetIndex + 1;
        else if (insertBefore && fromIndex < targetIndex) insertIndex = targetIndex - 1;
        insertIndex = Math.max(0, Math.min(insertIndex, nextVideos.length));
        nextVideos.splice(insertIndex, 0, moved);
        return { ...section, videos: nextVideos };
    });
    videoSectionsState = nextSections;
    return nextSections;
}

async function persistVideoCardOrder(sectionId) {
    const section = videoSectionsState.find((item) => Number(item.id) === Number(sectionId));
    if (!section) return;
    const order = (section.videos || []).map((video) => video.id);
    const response = await fetch(`/api/video_sections/${sectionId}/videos/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
    });
    if (!response.ok) throw new Error('Failed to reorder videos');
}

async function handleVideoCardDrop(event, targetVideoId, sectionId) {
    if (!isCaptainRole()) return;
    event.preventDefault();
    event.stopPropagation();
    try {
        const payload = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (!payload || payload.kind !== 'video_card') return;
        if (Number(payload.sectionId) !== Number(sectionId) || Number(payload.videoId) === Number(targetVideoId)) return;
        const card = event.currentTarget;
        const rect = card.getBoundingClientRect();
        const insertBefore = event.clientX < rect.left + (rect.width / 2);
        reorderVideoCardsInState(sectionId, payload.videoId, targetVideoId, insertBefore);
        renderVideoSections();
        await persistVideoCardOrder(sectionId);
    } catch (error) {
        console.error('Failed to reorder video cards', error);
        await loadVideoSections();
    } finally {
        handleVideoCardDragEnd();
    }
}

function handleSectionDragOver(event, scope, sectionId) {
    if (!isCaptainRole()) return;
    event.preventDefault();
    const card = event.currentTarget;
    if (!card || !sectionDragState || sectionDragState.scope !== scope || sectionDragState.sectionId === String(sectionId)) return;
    clearSectionDragIndicators();
    const rect = card.getBoundingClientRect();
    const before = event.clientY < rect.top + (rect.height / 2);
    card.classList.add(before ? 'section-drop-before' : 'section-drop-after');
}

function handleSectionDragLeave(event) {
    const card = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (card && relatedTarget && card.contains(relatedTarget)) return;
    if (card) card.classList.remove('section-drop-before', 'section-drop-after');
}

function reorderSectionState(scope, draggedId, targetId, insertBefore) {
    const sourceState = scope === 'video' ? videoSectionsState : teamResourceSectionsState;
    const nextState = [...sourceState];
    const fromIndex = nextState.findIndex((section) => String(section.id) === String(draggedId));
    const targetIndex = nextState.findIndex((section) => String(section.id) === String(targetId));
    if (fromIndex < 0 || targetIndex < 0) return null;
    const [moved] = nextState.splice(fromIndex, 1);
    let insertIndex = targetIndex;
    if (!insertBefore && fromIndex < targetIndex) insertIndex = targetIndex;
    else if (!insertBefore) insertIndex = targetIndex + 1;
    else if (insertBefore && fromIndex < targetIndex) insertIndex = targetIndex - 1;
    insertIndex = Math.max(0, Math.min(insertIndex, nextState.length));
    nextState.splice(insertIndex, 0, moved);
    if (scope === 'video') videoSectionsState = nextState;
    else teamResourceSectionsState = nextState;
    return nextState;
}

async function persistSectionOrder(scope, sections) {
    const endpoint = scope === 'video' ? '/api/video_sections/reorder' : '/api/team_resources/reorder';
    const order = (sections || []).map((section) => section.id);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
    });
    if (!response.ok) throw new Error(`Failed to reorder ${scope} sections`);
}

async function handleSectionDrop(event, scope, targetId) {
    if (!isCaptainRole()) return;
    event.preventDefault();
    const card = event.currentTarget;
    try {
        const payload = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (!payload || payload.scope !== scope || String(payload.sectionId) === String(targetId)) return;
        const rect = card.getBoundingClientRect();
        const insertBefore = event.clientY < rect.top + (rect.height / 2);
        const nextState = reorderSectionState(scope, payload.sectionId, targetId, insertBefore);
        if (!nextState) return;
        if (scope === 'video') renderVideoSections();
        else renderTeamResourceSections();
        await persistSectionOrder(scope, nextState);
    } catch (error) {
        console.error('Failed to reorder sections', error);
        if (scope === 'video') await loadVideoSections();
        else await loadTeamResources();
    } finally {
        handleSectionDragEnd();
    }
}

async function createVideoSection() {
    const input = document.getElementById('video-section-title');
    const title = input ? input.value.trim() : '';
    if (!title) {
        alert('請輸入分類名稱。');
        return;
    }

    const response = await fetch('/api/video_sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!response.ok) {
        alert('建立分類失敗。');
        return;
    }

    if (input) input.value = '';
    await loadVideoSections();
}

async function addVideo() {
    const urlInput = document.getElementById('video-url');
    const titleInput = document.getElementById('video-title');
    const sectionSelect = document.getElementById('video-section-select');
    const url = urlInput ? urlInput.value.trim() : '';
    const title = titleInput ? titleInput.value.trim() : '';
    const sectionId = sectionSelect ? sectionSelect.value : '';

    if (!sectionId) return alert('請先選擇一個分類。');
    if (!url) return alert('請輸入 YouTube 影片或播放清單連結。');

    const response = await fetch('/add_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, section_id: Number(sectionId) }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || '影片資料儲存失敗。');
        return;
    }

    if (urlInput) urlInput.value = '';
    if (titleInput) titleInput.value = '';
    await loadVideoSections();
}

async function deleteVideoItem(videoId, sectionId) {
    if (!confirm('確定要從這個分類刪除這個影片項目嗎？')) return;
    try {
        const response = await fetch('/delete_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: videoId }),
        });
        if (!response.ok) {
            alert('從資料庫刪除影片失敗。');
            return;
        }
        await loadVideoSections();
        if (activeVideoNotesSectionId === sectionId) {
            openVideoNotesModal(sectionId);
        }
    } catch (error) {
        console.error('Error deleting video:', error);
    }
}

async function deleteVideoSection(sectionId) {
    if (!confirm('確定要刪除整個比賽分類嗎？包含底下的影片與筆記。')) return;
    const response = await fetch(`/api/video_sections/${sectionId}`, { method: 'DELETE' });
    if (!response.ok) {
        alert('刪除分類失敗。');
        return;
    }
    if (activeVideoNotesSectionId === sectionId) closeVideoNotesModal();
    await loadVideoSections();
}

function buildVideoNoteRow(note = {}) {
    if (activeNotesScope === 'team_resource') {
        return `
            <div class="video-note-row video-note-row--simple">
                <div class="video-note-row__top">
                    <button type="button" class="video-note-row__remove" onclick="removeVideoNoteRow(this)">移除</button>
                </div>
                <textarea class="video-note-content" placeholder="筆記">${escapeHtml(note.notes || '')}</textarea>
            </div>
        `;
    }
    return `
        <div class="video-note-row">
            <div class="video-note-row__top">
                <input type="text" class="video-note-match" placeholder="比賽名稱" value="${escapeHtml(note.match_name || '')}">
                <input type="text" class="video-note-score" placeholder="比分" value="${escapeHtml(note.score || '')}">
                <button type="button" class="video-note-row__remove" onclick="removeVideoNoteRow(this)">移除</button>
            </div>
            <textarea class="video-note-content" placeholder="筆記">${escapeHtml(note.notes || '')}</textarea>
        </div>
    `;
}

function addVideoNoteRow(note = {}) {
    const list = document.getElementById('video-notes-list');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', buildVideoNoteRow(note));
    applyNotesModalMode();
}

function removeVideoNoteRow(button) {
    const row = button.closest('.video-note-row');
    if (row) row.remove();
}

function applyNotesModalMode() {
    const isTeamResource = activeNotesScope === 'team_resource';
    const readOnly = isTeamResource && !isCaptainRole();
    const addButton = document.querySelector('#video-notes-modal .video-notes-modal__toolbar .court-btn');
    const saveButton = document.querySelector('#video-notes-modal .video-notes-modal__actions .court-btn:last-child');
    const removeButtons = document.querySelectorAll('#video-notes-list .video-note-row__remove');
    const inputs = document.querySelectorAll('#video-notes-list .video-note-match, #video-notes-list .video-note-score, #video-notes-list .video-note-content');
    if (addButton) addButton.style.display = isTeamResource || readOnly ? 'none' : 'inline-flex';
    if (saveButton) saveButton.style.display = readOnly ? 'none' : 'inline-flex';
    removeButtons.forEach((button) => {
        button.style.display = isTeamResource || readOnly ? 'none' : 'inline-flex';
    });
    inputs.forEach((input) => {
        input.disabled = readOnly;
        if (input.tagName === 'TEXTAREA') {
            input.readOnly = readOnly;
        }
    });
}

function openNotesModal(titleText, notes) {
    const modal = document.getElementById('video-notes-modal');
    const title = document.getElementById('video-notes-modal-title');
    const list = document.getElementById('video-notes-list');
    if (!modal || !title || !list) return;

    title.textContent = titleText;
    list.innerHTML = '';
    const nextNotes = activeNotesScope === 'team_resource'
        ? [Array.isArray(notes) && notes.length ? notes[0] : {}]
        : (Array.isArray(notes) && notes.length ? notes : [{}]);
    nextNotes.forEach((note) => addVideoNoteRow(note));
    applyNotesModalMode();
    modal.style.display = 'flex';
}

function openVideoNotesModal(sectionId) {
    const section = videoSectionsState.find((item) => item.id === sectionId);
    if (!section) return;

    activeNotesScope = 'video';
    activeVideoNotesSectionId = sectionId;
    activeTeamResourceNotesSectionId = null;
    openNotesModal(section.title, section.notes);
}

function openTeamResourceNotesModal(sectionId) {
    const section = teamResourceSectionsState.find((item) => item.id === sectionId);
    if (!section) return;

    activeNotesScope = 'team_resource';
    activeTeamResourceNotesSectionId = sectionId;
    activeVideoNotesSectionId = null;
    openNotesModal(section.title, section.notes);
}

function closeVideoNotesModal() {
    const modal = document.getElementById('video-notes-modal');
    if (modal) modal.style.display = 'none';
    activeVideoNotesSectionId = null;
    activeTeamResourceNotesSectionId = null;
    activeNotesScope = 'video';
}

async function saveVideoNotes() {
    if (activeNotesScope === 'team_resource' && !isCaptainRole()) return;
    const currentScope = activeNotesScope;
    const targetId = currentScope === 'team_resource' ? activeTeamResourceNotesSectionId : activeVideoNotesSectionId;
    if (!targetId) return;
    const rows = Array.from(document.querySelectorAll('#video-notes-list .video-note-row'));
    const notes = rows.map((row) => ({
        match_name: currentScope === 'team_resource' ? '' : (row.querySelector('.video-note-match')?.value.trim() || ''),
        score: currentScope === 'team_resource' ? '' : (row.querySelector('.video-note-score')?.value.trim() || ''),
        notes: row.querySelector('.video-note-content')?.value.trim() || '',
    })).filter((item) => item.match_name || item.score || item.notes);

    const endpoint = currentScope === 'team_resource'
        ? `/api/team_resources/sections/${targetId}/notes`
        : `/api/video_sections/${targetId}/notes`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
    });
    if (!response.ok) {
        alert('儲存筆記失敗。');
        return;
    }

    closeVideoNotesModal();
    if (currentScope === 'team_resource') await loadTeamResources();
    else await loadVideoSections();
}

window.addEventListener('load', initFrameAnalysisDashboard);
window.addEventListener('load', initVideoImprovementPanel);
window.addEventListener('load', initCourtWeekdayFilters);

// ==========================================
// 5. Application Feature Functions (Mocks & Tools)
// ==========================================
async function uploadPhotos() {
    const fileInput = document.getElementById('photo-upload');
    const uploadBtn = fileInput.nextElementSibling;

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('請先選擇要上傳的照片。');
        return;
    }

    // Prepare files to be sent to the backend
    const formData = new FormData();
    Array.from(fileInput.files).forEach(file => {
        formData.append('file', file);
    });
    
    // Attach uploader name from LocalStorage
    const uploader = localStorage.getItem('vbt_username') || '訪客';
    formData.append('uploader', uploader);

    // Update UI to show loading state
    const originalText = uploadBtn.innerText;
    uploadBtn.innerText = '上傳中...';
    uploadBtn.disabled = true;

    try {
        const response = await fetch('/api/upload-photo', {
            method: 'POST',
            body: formData // No Headers needed, browser handles FormData boundary automatically
        });
        
        const data = await response.json();
        
        if (response.ok) {
            fileInput.value = ''; 
            document.getElementById('file-chosen-text').innerText = '尚未選擇檔案';
            document.getElementById('file-chosen-text').style.color = '#666';
            loadGallery();
        } else {                alert(data.message || '系統拒絕存取。請登入台大場地系統後，再試著重新爬取。');
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('上傳時發生伺服器錯誤。');
    } finally {
        uploadBtn.innerText = originalText;
        uploadBtn.disabled = false;
    }
}

const GALLERY_TOUCH_HOLD_MS = 220;
const GALLERY_TOUCH_MOVE_TOLERANCE = 12;
const SHOWCASE_SWIPE_THRESHOLD = 42;

const gallerySortState = {
    draggingElement: null,
    placeholder: null,
    pointerId: null,
    holdTimer: null,
    touchDragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    offsetX: 0,
    offsetY: 0,
    suppressClickUntil: 0,
};

function clearGallerySortHold() {
    window.clearTimeout(gallerySortState.holdTimer);
    gallerySortState.holdTimer = null;
}

function getGalleryElement() {
    return document.querySelector('.photo-gallery');
}

function setGallerySortingState(isSorting) {
    const gallery = getGalleryElement();
    if (!gallery) return;
    gallery.classList.toggle('is-sorting', Boolean(isSorting));
}

function getGalleryOrderedFilenames() {
    return Array.from(document.querySelectorAll('.photo-gallery .photo-card[data-filename]'))
        .map((card) => card.dataset.filename || '')
        .filter(Boolean);
}

async function persistGalleryOrder() {
    const photos = getGalleryOrderedFilenames();
    if (!photos.length) return;
    await fetch('/api/gallery/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos })
    });
    await loadShowcaseSlider();
}

function createGallerySortPlaceholder(sourceCard) {
    const placeholder = document.createElement('div');
    placeholder.className = 'photo-card photo-card--placeholder';
    placeholder.style.height = `${sourceCard.offsetHeight}px`;
    return placeholder;
}

function getGalleryTargetCard(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    const card = target ? target.closest('.photo-card') : null;
    if (!card || card === gallerySortState.draggingElement || card.classList.contains('photo-card--placeholder')) return null;
    return card.closest('.photo-gallery') ? card : null;
}

function moveGalleryPlaceholder(clientX, clientY) {
    const gallery = getGalleryElement();
    const placeholder = gallerySortState.placeholder;
    if (!gallery || !placeholder) return;

    const targetCard = getGalleryTargetCard(clientX, clientY);
    if (!targetCard) {
        if (gallery.lastElementChild !== placeholder) {
            gallery.appendChild(placeholder);
        }
        return;
    }

    const rect = targetCard.getBoundingClientRect();
    const isUpperHalf = clientY < rect.top + (rect.height / 2);
    const isLeftHalf = clientX < rect.left + (rect.width / 2);
    const shouldInsertBefore = isUpperHalf || (Math.abs(clientY - (rect.top + rect.height / 2)) < rect.height * 0.2 && isLeftHalf);
    const referenceNode = shouldInsertBefore ? targetCard : targetCard.nextSibling;
    if (referenceNode === placeholder || placeholder.nextSibling === referenceNode) return;
    gallery.insertBefore(placeholder, referenceNode);
}

function finalizeGalleryDragPosition() {
    const placeholder = gallerySortState.placeholder;
    const draggingElement = gallerySortState.draggingElement;
    if (!placeholder || !draggingElement || !placeholder.parentElement) return false;
    placeholder.parentElement.insertBefore(draggingElement, placeholder);
    return true;
}

function resetGalleryDraggingStyles() {
    const draggingElement = gallerySortState.draggingElement;
    if (draggingElement) {
        draggingElement.classList.remove('is-dragging', 'is-touch-dragging');
        draggingElement.style.removeProperty('width');
        draggingElement.style.removeProperty('height');
        draggingElement.style.removeProperty('left');
        draggingElement.style.removeProperty('top');
    }
    if (gallerySortState.placeholder) {
        gallerySortState.placeholder.remove();
    }
}

function resetGallerySortState() {
    clearGallerySortHold();
    resetGalleryDraggingStyles();
    setGallerySortingState(false);
    gallerySortState.draggingElement = null;
    gallerySortState.placeholder = null;
    gallerySortState.pointerId = null;
    gallerySortState.touchDragging = false;
}

function startGalleryDesktopDrag(card) {
    gallerySortState.draggingElement = card;
    gallerySortState.placeholder = createGallerySortPlaceholder(card);
    setGallerySortingState(true);
    card.classList.add('is-dragging');
    card.parentElement.insertBefore(gallerySortState.placeholder, card.nextSibling);
}

function startGalleryTouchDrag(card) {
    const rect = card.getBoundingClientRect();
    gallerySortState.touchDragging = true;
    gallerySortState.placeholder = createGallerySortPlaceholder(card);
    setGallerySortingState(true);
    card.parentElement.insertBefore(gallerySortState.placeholder, card.nextSibling);
    card.classList.add('is-touch-dragging');
    card.style.width = `${rect.width}px`;
    card.style.height = `${rect.height}px`;
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    gallerySortState.offsetX = gallerySortState.lastX - rect.left;
    gallerySortState.offsetY = gallerySortState.lastY - rect.top;
    moveGalleryTouchCard(gallerySortState.lastX, gallerySortState.lastY);
}

function moveGalleryTouchCard(clientX, clientY) {
    const draggingElement = gallerySortState.draggingElement;
    if (!draggingElement) return;
    draggingElement.style.left = `${clientX - gallerySortState.offsetX}px`;
    draggingElement.style.top = `${clientY - gallerySortState.offsetY}px`;
}

async function finishGallerySort(shouldPersist = true) {
    const moved = finalizeGalleryDragPosition();
    resetGallerySortState();
    if (moved && shouldPersist) {
        await persistGalleryOrder();
    }
}

function initGallerySortInteractions() {
    const gallery = getGalleryElement();
    if (!gallery || gallery.dataset.sortBound === 'true') return;
    gallery.dataset.sortBound = 'true';

    gallery.addEventListener('dragstart', (event) => {
        const card = event.target.closest('.photo-card');
        if (!card || event.target.closest('button')) {
            event.preventDefault();
            return;
        }
        startGalleryDesktopDrag(card);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', card.dataset.filename || '');
        }
    });

    gallery.addEventListener('dragover', (event) => {
        if (!gallerySortState.draggingElement || gallerySortState.touchDragging) return;
        event.preventDefault();
        moveGalleryPlaceholder(event.clientX, event.clientY);
    });

    gallery.addEventListener('drop', (event) => {
        if (!gallerySortState.draggingElement || gallerySortState.touchDragging) return;
        event.preventDefault();
    });

    gallery.addEventListener('dragend', async () => {
        if (!gallerySortState.draggingElement || gallerySortState.touchDragging) return;
        await finishGallerySort(true);
    });

    gallery.addEventListener('pointerdown', (event) => {
        if (!window.PointerEvent || event.pointerType === 'mouse' || !event.isPrimary) return;
        if (event.target.closest('button, input, textarea, select, a, label')) return;
        const card = event.target.closest('.photo-card');
        if (!card) return;

        clearGallerySortHold();
        gallerySortState.draggingElement = card;
        gallerySortState.pointerId = event.pointerId;
        gallerySortState.startX = event.clientX;
        gallerySortState.startY = event.clientY;
        gallerySortState.lastX = event.clientX;
        gallerySortState.lastY = event.clientY;
        gallerySortState.touchDragging = false;
        gallerySortState.holdTimer = window.setTimeout(() => {
            gallerySortState.suppressClickUntil = Date.now() + 400;
            startGalleryTouchDrag(card);
            moveGalleryPlaceholder(gallerySortState.lastX, gallerySortState.lastY);
        }, GALLERY_TOUCH_HOLD_MS);
    }, { passive: true });

    gallery.addEventListener('pointermove', (event) => {
        if (event.pointerId !== gallerySortState.pointerId) return;
        gallerySortState.lastX = event.clientX;
        gallerySortState.lastY = event.clientY;

        if (!gallerySortState.touchDragging) {
            const distanceX = Math.abs(event.clientX - gallerySortState.startX);
            const distanceY = Math.abs(event.clientY - gallerySortState.startY);
            if (distanceX > GALLERY_TOUCH_MOVE_TOLERANCE || distanceY > GALLERY_TOUCH_MOVE_TOLERANCE) {
                clearGallerySortHold();
                gallerySortState.draggingElement = null;
                gallerySortState.pointerId = null;
            }
            return;
        }

        event.preventDefault();
        moveGalleryTouchCard(event.clientX, event.clientY);
        moveGalleryPlaceholder(event.clientX, event.clientY);
    }, { passive: false });

    const finishPointerSort = async (event, shouldPersist) => {
        if (event.pointerId !== gallerySortState.pointerId) return;
        clearGallerySortHold();
        const isDragging = gallerySortState.touchDragging;
        gallerySortState.pointerId = null;
        if (!isDragging) {
            gallerySortState.draggingElement = null;
            return;
        }
        await finishGallerySort(shouldPersist);
    };

    gallery.addEventListener('pointerup', (event) => {
        finishPointerSort(event, true);
    }, { passive: false });

    gallery.addEventListener('pointercancel', (event) => {
        finishPointerSort(event, false);
    }, { passive: false });

    gallery.addEventListener('click', (event) => {
        if (Date.now() > gallerySortState.suppressClickUntil) return;
        if (!event.target.closest('.photo-card')) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
}

async function loadGallery() {
    const gallery = document.querySelector('.photo-gallery');
    if (!gallery) return;
    initGallerySortInteractions();

    const currentRole = localStorage.getItem('vbt_role');
    const canDelete = currentRole === 'member' || currentRole === 'captain';
    const canSelect = currentRole === 'member' || currentRole === 'captain'; // 隊長跟隊員都可以決定輪播照片

    try {
        // 同時抓取所有照片，以及「被選中」的照片名單
        const [galleryRes, selectedRes] = await Promise.all([
            fetch('/api/gallery'),
            fetch('/api/showcase_photos')
        ]);
        
        const photos = await galleryRes.json();
        const selectedPhotos = await selectedRes.json();
        
        gallery.innerHTML = ''; 
        if (photos.length === 0) {
            gallery.innerHTML = '<p style="color:#999; grid-column: 1 / -1;">目前還沒有照片。來上傳第一張照片吧！</p>';
            return;
        }

        photos.forEach((photo) => {
            const filename = photo.filename;
            const card = document.createElement('div');
            card.className = 'photo-card';
            card.draggable = true;
            card.dataset.filename = filename;
            const imgPath = photo.src;
            const isSelected = selectedPhotos.includes(filename);
            
            if (isSelected) {
                card.classList.add('selected');
            }
            
            let actionBtnsHtml = '';
            if (canDelete) {
                actionBtnsHtml += `<button class="photo-delete-btn" onclick="deletePhoto('${filename}', this)">刪除</button>`;
            }
            // 新增：加入輪播圖的按鈕
            if (canSelect) {
                const btnText = isSelected ? '★ 輪播中' : '☆ 選擇';
                actionBtnsHtml += `<button class="photo-toggle-btn" onclick="toggleShowcasePhoto('${filename}', this)">${btnText}</button>`;
            }
            card.innerHTML = `
                ${actionBtnsHtml}
                <img src="${imgPath}" alt="${filename}" class="gallery-img" onclick="openLightbox('${imgPath}')">
            `;
            gallery.appendChild(card);
        });
        updateShowcaseCropGuide();
    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

function updateShowcaseCropGuide() {
    const root = document.documentElement;
    if (!root) return;
    const mainApp = document.getElementById('main-app');
    const showcase = document.getElementById('showcase-slider-container');
    const mainContent = document.querySelector('.main-content');
    if (!mainApp || !showcase || !mainContent) return;

    const originalToggled = mainApp.classList.contains('sidebar-toggled');
    const originalDisplay = showcase.style.display;
    const originalVisibility = showcase.style.visibility;
    if (getComputedStyle(showcase).display === 'none') {
        showcase.style.visibility = 'hidden';
        showcase.style.display = 'block';
    }

    const measureInsets = (toggled) => {
        mainApp.classList.toggle('sidebar-toggled', toggled);
        const showcaseRect = showcase.getBoundingClientRect();
        const mainRect = mainContent.getBoundingClientRect();
        const visibleLeft = Math.max(showcaseRect.left, mainRect.left);
        const visibleRight = Math.min(showcaseRect.right, mainRect.right);
        const width = showcaseRect.width || 1;
        return {
            left: Math.max(0, ((visibleLeft - showcaseRect.left) / width) * 100),
            right: Math.max(0, ((showcaseRect.right - visibleRight) / width) * 100),
        };
    };

    const openInsets = measureInsets(false);
    const closedInsets = measureInsets(true);

    mainApp.classList.toggle('sidebar-toggled', originalToggled);
    showcase.style.display = originalDisplay;
    showcase.style.visibility = originalVisibility;

    root.style.setProperty('--showcase-open-left-inset', `${openInsets.left}%`);
    root.style.setProperty('--showcase-open-right-inset', `${openInsets.right}%`);
    root.style.setProperty('--showcase-closed-left-inset', `${closedInsets.left}%`);
    root.style.setProperty('--showcase-closed-right-inset', `${closedInsets.right}%`);
}

const showcaseCropState = {
    filename: null,
    imageSrc: null,
    naturalWidth: 0,
    naturalHeight: 0,
    baseScale: 1,
    scaleMultiplier: 1,
    offsetX: 0,
    offsetY: 0,
    dragStartX: 0,
    dragStartY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pointerId: null,
    triggerButton: null,
};

function getShowcaseCropElements() {
    return {
        modal: document.getElementById('showcase-crop-modal'),
        stage: document.getElementById('showcase-crop-stage'),
        image: document.getElementById('showcase-crop-image'),
        zoom: document.getElementById('showcase-crop-zoom'),
    };
}

function applyShowcaseCropTransform() {
    const { stage, image } = getShowcaseCropElements();
    if (!stage || !image || !showcaseCropState.naturalWidth || !showcaseCropState.naturalHeight) return;
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const scale = showcaseCropState.baseScale * showcaseCropState.scaleMultiplier;
    const displayWidth = showcaseCropState.naturalWidth * scale;
    const displayHeight = showcaseCropState.naturalHeight * scale;
    const maxOffsetX = Math.max(0, (displayWidth - stageWidth) / 2);
    const maxOffsetY = Math.max(0, (displayHeight - stageHeight) / 2);
    showcaseCropState.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, showcaseCropState.offsetX));
    showcaseCropState.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, showcaseCropState.offsetY));
    image.style.transform = `translate(-50%, -50%) translate(${showcaseCropState.offsetX}px, ${showcaseCropState.offsetY}px) scale(${scale})`;
}

function nudgeShowcaseCrop(deltaX, deltaY) {
    if (!showcaseCropState.filename) return;
    showcaseCropState.offsetX += deltaX;
    showcaseCropState.offsetY += deltaY;
    applyShowcaseCropTransform();
}

function initShowcaseCropInteractions() {
    const { stage, zoom } = getShowcaseCropElements();
    if (!stage || stage.dataset.bound === 'true') return;
    stage.dataset.bound = 'true';

    stage.addEventListener('pointerdown', (event) => {
        if (!showcaseCropState.filename) return;
        showcaseCropState.pointerId = event.pointerId;
        showcaseCropState.dragStartX = event.clientX;
        showcaseCropState.dragStartY = event.clientY;
        showcaseCropState.startOffsetX = showcaseCropState.offsetX;
        showcaseCropState.startOffsetY = showcaseCropState.offsetY;
        stage.classList.add('is-dragging');
        stage.setPointerCapture(event.pointerId);
    });

    stage.addEventListener('pointermove', (event) => {
        if (showcaseCropState.pointerId !== event.pointerId) return;
        showcaseCropState.offsetX = showcaseCropState.startOffsetX + (event.clientX - showcaseCropState.dragStartX);
        showcaseCropState.offsetY = showcaseCropState.startOffsetY + (event.clientY - showcaseCropState.dragStartY);
        applyShowcaseCropTransform();
    });

    const endDrag = (event) => {
        if (showcaseCropState.pointerId !== event.pointerId) return;
        showcaseCropState.pointerId = null;
        stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    if (zoom) {
        zoom.addEventListener('input', () => {
            showcaseCropState.scaleMultiplier = Number.parseFloat(zoom.value) || 1;
            applyShowcaseCropTransform();
        });
    }
}

async function openShowcaseCropModal(filename, btnElement) {
    const { modal, stage, image, zoom } = getShowcaseCropElements();
    if (!modal || !stage || !image || !zoom) return;
    initShowcaseCropInteractions();
    updateShowcaseCropGuide();

    showcaseCropState.filename = filename;
    const galleryResponse = await fetch('/api/gallery');
    const galleryPhotos = await galleryResponse.json();
    const selectedPhoto = galleryPhotos.find((photo) => photo.filename === filename);
    if (!selectedPhoto) return;

    showcaseCropState.imageSrc = selectedPhoto.src;
    showcaseCropState.triggerButton = btnElement || null;
    showcaseCropState.offsetX = 0;
    showcaseCropState.offsetY = 0;
    showcaseCropState.scaleMultiplier = 1.12;
    zoom.value = '1.12';
    modal.style.display = 'flex';

    const loader = new Image();
    loader.crossOrigin = 'anonymous';
    loader.onload = () => {
        showcaseCropState.naturalWidth = loader.naturalWidth;
        showcaseCropState.naturalHeight = loader.naturalHeight;
        image.crossOrigin = 'anonymous';
        image.src = showcaseCropState.imageSrc;
        requestAnimationFrame(() => {
            showcaseCropState.baseScale = Math.max(stage.clientWidth / loader.naturalWidth, stage.clientHeight / loader.naturalHeight);
            applyShowcaseCropTransform();
        });
    };
    loader.onerror = () => {
        alert('載入裁切圖片失敗。');
        closeShowcaseCropModal();
    };
    loader.src = showcaseCropState.imageSrc;
}

function closeShowcaseCropModal() {
    const { modal } = getShowcaseCropElements();
    if (modal) modal.style.display = 'none';
    showcaseCropState.filename = null;
    showcaseCropState.triggerButton = null;
    showcaseCropState.pointerId = null;
}

async function saveShowcaseCrop() {
    const { stage } = getShowcaseCropElements();
    if (!stage || !showcaseCropState.filename || !showcaseCropState.naturalWidth || !showcaseCropState.naturalHeight) return;

    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const outputWidth = 1600;
    const outputHeight = Math.round(outputWidth * (stageHeight / stageWidth));
    const scale = showcaseCropState.baseScale * showcaseCropState.scaleMultiplier;
    const displayWidth = showcaseCropState.naturalWidth * scale;
    const displayHeight = showcaseCropState.naturalHeight * scale;
    const imageLeft = (stageWidth / 2) - (displayWidth / 2) + showcaseCropState.offsetX;
    const imageTop = (stageHeight / 2) - (displayHeight / 2) + showcaseCropState.offsetY;

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
        try {
            const ratioX = outputWidth / stageWidth;
            const ratioY = outputHeight / stageHeight;
            ctx.drawImage(img, imageLeft * ratioX, imageTop * ratioY, displayWidth * ratioX, displayHeight * ratioY);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) {
                alert('建立裁切圖片失敗。');
                return;
            }

            const formData = new FormData();
            formData.append('filename', showcaseCropState.filename);
            formData.append('crop', blob, `${showcaseCropState.filename.replace(/\.[^.]+$/, '')}_showcase.jpg`);
            const response = await fetch('/api/showcase_photo_crop', { method: 'POST', body: formData });
            if (!response.ok) {
                alert('儲存輪播裁切圖片失敗。');
                return;
            }

            const selectedResponse = await fetch('/api/showcase_photos');
            let selectedPhotos = await selectedResponse.json();
            if (!selectedPhotos.includes(showcaseCropState.filename)) {
                selectedPhotos.push(showcaseCropState.filename);
                await fetch('/api/showcase_photos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ photos: selectedPhotos }),
                });
            }

            closeShowcaseCropModal();
            await loadGallery();
            loadShowcaseSlider();
        } catch (error) {
            console.error('Failed to save showcase crop:', error);
            alert('儲存輪播裁切圖片失敗。');
        }
    };
    img.onerror = () => {
        alert('載入裁切圖片資料失敗。');
    };
    img.src = showcaseCropState.imageSrc;
}

// 處理點擊「加入/移除輪播」的邏輯
async function toggleShowcasePhoto(filename, btnElement) {
    const card = btnElement.parentElement;
    const isCurrentlySelected = card.classList.contains('selected');

    const response = await fetch('/api/showcase_photos');
    let selectedPhotos = await response.json();

    if (isCurrentlySelected) {
        selectedPhotos = selectedPhotos.filter(p => p !== filename);
        card.classList.remove('selected');
        btnElement.innerText = '☆ 選擇';

        await fetch('/api/showcase_photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photos: selectedPhotos })
        });

        loadShowcaseSlider();
        return;
    }

    openShowcaseCropModal(filename, btnElement);
}

/**
 * Handle deleting a photo from the gallery
 */
async function deletePhoto(filename, btnElement) {
    if (!confirm('確定要刪除這張照片嗎？')) return;
    
    // Remove from UI immediately for better user experience
    const card = btnElement.parentElement;
    const gallery = card ? card.parentElement : null;
    card.remove();

    try {
        const response = await fetch('/api/delete-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: filename })
        });

        if (!response.ok) {
            alert('從伺服器刪除照片失敗。');
            loadGallery(); // Reload from DB to sync UI if deletion failed
            return;
        }
        if (gallery && gallery.children.length === 0) {
            gallery.innerHTML = '<p style="color:#999; grid-column: 1 / -1;">目前還沒有照片。來上傳第一張照片吧！</p>';
        }
        await loadShowcaseSlider();
    } catch (error) {
        console.error('Error deleting photo:', error);
        loadGallery();
    }
}

function updateFileCount(input) {
    const textSpan = document.getElementById('file-chosen-text');
    if (input.files && input.files.length > 0) {
        textSpan.innerText = `已選擇 ${input.files.length} 個檔案`;
        textSpan.style.color = 'var(--accent-color)';
        textSpan.style.fontWeight = 'bold';
    } else {
        textSpan.innerText = '尚未選擇檔案';
        textSpan.style.color = '#666';
        textSpan.style.fontWeight = 'normal';
    }
}

/**
 * Lightbox Functions
 */
function openLightbox(src) {
    const lightbox = document.getElementById('lightbox-overlay');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = src;
    lightbox.style.display = 'flex';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox-overlay');
    lightbox.style.display = 'none';
}

// Ensure gallery loads automatically on page startup
window.addEventListener('load', updateShowcaseCropGuide);
window.addEventListener('resize', updateShowcaseCropGuide);
window.addEventListener('resize', () => {
    if (!readFrameAnalysisOrientationPreference()) {
        syncFrameAnalysisOrientation(true);
    }
});
window.addEventListener('load', initTrainingMenu);
window.addEventListener('load', initPracticeWeekdayListeners);
window.addEventListener('load', initPracticeMenuTouchDrag);

const menuState = {
    rows: [],
    editingId: null,
    editorOpen: false,
    builderOpen: true,
    practiceMenu: {
        first_half: [],
        second_half: [],
        weekdays: [],
        updated_at: ''
    },
    generatedRows: [],
    matchingRows: [],
    filters: {
        focuses: [],
        complexities: [],
        fatigue_levels: [],
        difficulty_levels: []
    }
};

let menuBuilderDragOpenTimer = null;
const PRACTICE_MENU_TOUCH_HOLD_MS = 240;
const PRACTICE_MENU_TOUCH_MOVE_TOLERANCE = 12;
const DEFAULT_MENU_AUTO_EXCLUDES = ['體能'];
const practiceMenuTouchDrag = {
    pointerId: null,
    holdTimer: null,
    dragging: false,
    payload: null,
    sourceElement: null,
    activeZone: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    suppressClickUntil: 0
};

const PRACTICE_WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function readMenuAutoExcludeItems() {
    return [...DEFAULT_MENU_AUTO_EXCLUDES];
}

function rowMatchesMenuExcludeItems(row, excludeItems) {
    if (!excludeItems.length) return false;
    const haystack = [
        row.name,
        ...(row.focuses || []),
        ...(row.complexities || []),
        ...(row.fatigue_levels || []),
        ...(row.difficulty_levels || [])
    ].join(' ').toLowerCase();
    return excludeItems.some((item) => haystack.includes(String(item).toLowerCase()));
}

function createMenuCheckboxMarkup(name, value, label, checked = false) {
    return `
        <label class="custom-checkbox menu-checkbox">
            <input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${checked ? 'checked' : ''}>
            <span>${escapeHtml(label)}</span>
        </label>
    `;
}

function renderMenuFilterOptions(filters) {
    const focusGrid = document.getElementById('menu-focus-grid');
    const complexityGrid = document.getElementById('menu-complexity-grid');
    const fatigueGrid = document.getElementById('menu-fatigue-grid');
    const difficultyGrid = document.getElementById('menu-difficulty-grid');

    if (focusGrid) {
        focusGrid.innerHTML = filters.focuses.map((value) => createMenuCheckboxMarkup('menu-focus', value, value)).join('');
    }
    if (complexityGrid) {
        complexityGrid.innerHTML = filters.complexities.map((value) => createMenuCheckboxMarkup('menu-complexity', value, value)).join('');
    }
    if (fatigueGrid) {
        fatigueGrid.innerHTML = filters.fatigue_levels.map((value) => createMenuCheckboxMarkup('menu-fatigue', value, value)).join('');
    }
    if (difficultyGrid) {
        difficultyGrid.innerHTML = filters.difficulty_levels.map((value) => createMenuCheckboxMarkup('menu-difficulty', value, value)).join('');
    }
}

function setMenuFilterChecked(name, checked) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
        input.checked = checked;
    });
    syncCustomCheckboxState();
}

function selectAllMenuFilters() {
    setMenuFilterChecked('menu-focus', true);
    setMenuFilterChecked('menu-complexity', true);
    setMenuFilterChecked('menu-fatigue', true);
    setMenuFilterChecked('menu-difficulty', true);
    generateMenu();
}

function initMenuFilterAutoRefresh() {
    ['menu-players', 'menu-court-mode', 'menu-plan-size'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', generateMenu);
            element.addEventListener('input', generateMenu);
        }
    });
    ['menu-focus-grid', 'menu-complexity-grid', 'menu-fatigue-grid', 'menu-difficulty-grid'].forEach((id) => {
        const container = document.getElementById(id);
        if (container) {
            container.addEventListener('change', generateMenu);
        }
    });
}

function getCheckedMenuValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function getMenuFiltersFromUI() {
    const playersInput = document.getElementById('menu-players');
    const courtModeInput = document.getElementById('menu-court-mode');
    const planSizeInput = document.getElementById('menu-plan-size');

    return {
        maxPlayers: Math.max(1, Number.parseInt(playersInput?.value || '0', 10) || 0),
        courtMode: courtModeInput?.value || '',
        planSize: Math.max(1, Number.parseInt(planSizeInput?.value || '5', 10) || 5),
        focuses: getCheckedMenuValues('menu-focus'),
        complexities: getCheckedMenuValues('menu-complexity'),
        fatigueLevels: getCheckedMenuValues('menu-fatigue'),
        difficultyLevels: getCheckedMenuValues('menu-difficulty')
    };
}

function intersects(values, selected) {
    if (!selected || selected.length === 0) return true;
    return values.some((item) => selected.includes(item));
}

function getFilteredMenuRows() {
    const filters = getMenuFiltersFromUI();
    return menuState.rows.filter((row) => {
        if (filters.maxPlayers && row.people_count && row.people_count > filters.maxPlayers) return false;
        if (filters.courtMode && !row.court_modes.includes(filters.courtMode)) return false;
        if (!intersects(row.focuses, filters.focuses)) return false;
        if (!intersects(row.complexities, filters.complexities)) return false;
        if (!intersects(row.fatigue_levels, filters.fatigueLevels)) return false;
        if (!intersects(row.difficulty_levels, filters.difficultyLevels)) return false;
        return true;
    });
}

function scoreMenuRow(row, filters) {
    let score = 0;
    score += row.focuses.filter((item) => filters.focuses.includes(item)).length * 5;
    score += row.complexities.filter((item) => filters.complexities.includes(item)).length * 2;
    score += row.fatigue_levels.filter((item) => filters.fatigueLevels.includes(item)).length * 2;
    score += row.difficulty_levels.filter((item) => filters.difficultyLevels.includes(item)).length * 2;
    if (filters.maxPlayers && row.people_count) {
        score += Math.max(0, 4 - Math.abs(filters.maxPlayers - row.people_count));
    }
    if (filters.courtMode && row.court_modes.includes(filters.courtMode)) {
        score += 2;
    }
    return score;
}

function pickRecommendedMenuRows(rows, filters) {
    const sortedRows = [...rows].sort((a, b) => {
        const scoreDiff = scoreMenuRow(b, filters) - scoreMenuRow(a, filters);
        if (scoreDiff !== 0) return scoreDiff;
        return sortMenuRows([a, b])[0] === a ? -1 : 1;
    });
    return sortedRows.slice(0, filters.planSize);
}

function shuffleMenuRows(rows) {
    const shuffled = [...rows];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function getAutoMenuCount(inputId, fallbackValue) {
    const value = Number.parseInt(document.getElementById(inputId)?.value || '', 10);
    if (!Number.isFinite(value)) return fallbackValue;
    return Math.max(0, Math.min(12, value));
}

function rowMatchesSelectedValues(rowValues, selectedValues) {
    if (!selectedValues.length) return true;
    return (rowValues || []).some((item) => selectedValues.includes(item));
}

function scoreAutoMenuCandidate(row, filters, targetCourtMode) {
    let score = 0;
    const focusMatches = row.focuses.filter((item) => filters.focuses.includes(item)).length;
    const complexityMatches = row.complexities.filter((item) => filters.complexities.includes(item)).length;
    const fatigueMatches = row.fatigue_levels.filter((item) => filters.fatigueLevels.includes(item)).length;
    const difficultyMatches = row.difficulty_levels.filter((item) => filters.difficultyLevels.includes(item)).length;

    if (row.court_modes.includes(targetCourtMode)) score += 80;
    if (filters.maxPlayers && row.people_count) score += Math.max(0, 18 - Math.abs(filters.maxPlayers - row.people_count) * 3);
    score += focusMatches * 12;
    score += complexityMatches * 18;
    score += fatigueMatches * 18;
    score += difficultyMatches * 18;
    if (filters.complexities.length && complexityMatches === 0) score -= 14;
    if (filters.fatigueLevels.length && fatigueMatches === 0) score -= 14;
    if (filters.difficultyLevels.length && difficultyMatches === 0) score -= 14;
    if (filters.focuses.length && focusMatches === 0) score -= 6;
    return score;
}

function selectAutoMenuRows(targetCount, targetCourtMode, filters, usedIds = new Set()) {
    if (targetCount <= 0) return [];
    const excludeItems = readMenuAutoExcludeItems();

    const baseRows = menuState.rows.filter((row) => {
        if (usedIds.has(row.id)) return false;
        if (filters.maxPlayers && row.people_count && row.people_count > filters.maxPlayers) return false;
        if (!row.court_modes.includes(targetCourtMode)) return false;
        if (rowMatchesMenuExcludeItems(row, excludeItems)) return false;
        return true;
    });

    const strictRows = baseRows.filter((row) => {
        if (!rowMatchesSelectedValues(row.focuses, filters.focuses)) return false;
        if (!rowMatchesSelectedValues(row.complexities, filters.complexities)) return false;
        if (!rowMatchesSelectedValues(row.fatigue_levels, filters.fatigueLevels)) return false;
        if (!rowMatchesSelectedValues(row.difficulty_levels, filters.difficultyLevels)) return false;
        return true;
    });

    const selected = shuffleMenuRows(strictRows).slice(0, targetCount);
    if (selected.length >= targetCount) return selected;

    const selectedIds = new Set(selected.map((row) => row.id));
    const fallbackRows = baseRows
        .filter((row) => !selectedIds.has(row.id))
        .map((row) => ({ row, score: scoreAutoMenuCandidate(row, filters, targetCourtMode) }))
        .sort((a, b) => b.score - a.score);

    while (selected.length < targetCount && fallbackRows.length) {
        const bestScore = fallbackRows[0].score;
        const bestGroup = fallbackRows.filter((item) => item.score === bestScore);
        const shuffledGroup = shuffleMenuRows(bestGroup);
        const picked = shuffledGroup[0];
        if (!picked) break;
        selected.push(picked.row);
        const removeId = picked.row.id;
        for (let index = fallbackRows.length - 1; index >= 0; index -= 1) {
            if (fallbackRows[index].row.id === removeId) {
                fallbackRows.splice(index, 1);
            }
        }
    }

    return selected;
}

async function autoGeneratePracticeMenu() {
    if (localStorage.getItem('vbt_role') !== 'captain') return;
    if (!menuState.rows.length) {
        alert('目前沒有可用的菜單資料庫。');
        return;
    }

    const nextPractice = getNextPracticeInfo(menuState.practiceMenu.weekdays || []);
    if (!nextPractice.date) {
        alert('請先設定本週練球星期，才能自動生成菜單。');
        return;
    }

    const firstCount = getAutoMenuCount('menu-auto-first-count', 3);
    const secondCount = getAutoMenuCount('menu-auto-second-count', 3);
    if (firstCount === 0 && secondCount === 0) {
        alert('請至少設定一個上半或下半菜單數量。');
        return;
    }

    const filters = getMenuFiltersFromUI();
    const courtSummary = getPracticeCourtSummary(nextPractice.date);
    const firstMode = courtSummary.find((item) => item.key === 'first')?.hasCourt ? '有場' : '沒場';
    const secondMode = courtSummary.find((item) => item.key === 'second')?.hasCourt ? '有場' : '沒場';
    const usedIds = new Set();
    const firstRows = selectAutoMenuRows(firstCount, firstMode, filters, usedIds);
    firstRows.forEach((row) => usedIds.add(row.id));
    const secondRows = selectAutoMenuRows(secondCount, secondMode, filters, usedIds);

    menuState.practiceMenu.first_half = firstRows.map((row) => ({
        source_type: 'auto',
        source_id: row.id || null,
        name: row.name || '未命名訓練'
    }));
    menuState.practiceMenu.second_half = secondRows.map((row) => ({
        source_type: 'auto',
        source_id: row.id || null,
        name: row.name || '未命名訓練'
    }));

    await savePracticeMenu();
    await loadPracticeMenu();

    const fixedExcludeLabel = readMenuAutoExcludeItems().join('、');
    if (firstRows.length < firstCount || secondRows.length < secondCount) {
        alert(`已自動生成菜單。上半套用 ${firstMode} 並排除 ${fixedExcludeLabel}，實際 ${firstRows.length}/${firstCount}；下半套用 ${secondMode} 並排除 ${fixedExcludeLabel}，實際 ${secondRows.length}/${secondCount}。系統已優先使用完全符合的菜單，並從最接近條件的候選補齊，若資料庫不足則會少於設定數量。`);
        return;
    }

    alert(`已自動生成菜單。上半套用 ${firstMode}、下半套用 ${secondMode}，並固定排除 ${fixedExcludeLabel}。`);
}

function getMenuCourtRank(courtModes) {
    const values = new Set(courtModes || []);
    if (values.has('有場') && !values.has('沒場')) return 0;
    if (values.has('有場') && values.has('沒場')) return 1;
    if (values.has('沒場')) return 2;
    return 3;
}

function getMenuDifficultyRank(difficultyLevels) {
    const rankMap = { '簡單': 0, '普通': 1, '困難': 2 };
    const ranks = (difficultyLevels || []).map((item) => rankMap[item]).filter((item) => Number.isFinite(item));
    return ranks.length ? Math.min(...ranks) : 99;
}

function sortMenuRows(rows) {
    return [...rows].sort((a, b) => {
        const courtDiff = getMenuCourtRank(a.court_modes) - getMenuCourtRank(b.court_modes);
        if (courtDiff !== 0) return courtDiff;
        const peopleDiff = (a.people_count || 999) - (b.people_count || 999);
        if (peopleDiff !== 0) return peopleDiff;
        const difficultyDiff = getMenuDifficultyRank(a.difficulty_levels) - getMenuDifficultyRank(b.difficulty_levels);
        if (difficultyDiff !== 0) return difficultyDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function createPracticeMenuSourceItem(row, sourceLabel, sourceType) {
    const encodedName = encodeURIComponent(row.name || '');
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';
    return `
        <article class="menu-source-item" draggable="true" data-practice-drag-kind="source" data-source-type="${escapeHtml(sourceType)}" data-source-id="${Number(row.id || 0)}" data-source-name="${encodedName}" ondragstart="handlePracticeMenuDragStart(event, '${escapeHtml(sourceType)}', ${Number(row.id || 0)}, decodeURIComponent('${encodedName}'))" ondragend="handlePracticeMenuDragEnd()">
            <div class="menu-source-item__main">
                <div class="menu-source-item__title">${escapeHtml(row.name)}</div>
                <div class="menu-source-item__meta">${escapeHtml((row.court_modes || []).join(' / ') || '-')} &middot; ${escapeHtml(String(row.people_count || '-'))} 人 &middot; ${escapeHtml((row.difficulty_levels || []).join(' / ') || '-')}</div>
            </div>
            <div class="menu-source-item__actions">
                <span class="menu-source-item__badge">${escapeHtml(sourceLabel)}</span>
                ${isCaptain ? `<button type="button" class="court-btn" onclick="addPracticeMenuItem('${sourceType}', ${Number(row.id || 0)}, decodeURIComponent('${encodedName}'), 'first_half')">+ 上半</button>` : ''}
                ${isCaptain ? `<button type="button" class="court-btn" onclick="addPracticeMenuItem('${sourceType}', ${Number(row.id || 0)}, decodeURIComponent('${encodedName}'), 'second_half')">+ 下半</button>` : ''}
            </div>
        </article>
    `;
}

function renderPlanSources() {
    const resultContainer = document.getElementById('menu-result');
    if (!resultContainer) return;
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';

    if (!menuState.rows.length) {
        resultContainer.innerHTML = '<div class="menu-empty-state">找不到菜單資料庫，請確認 CSV 已成功匯入。</div>';
        return;
    }

    const generated = menuState.generatedRows || [];
    const matching = menuState.matchingRows || [];
    if (!generated.length && !matching.length) {
        resultContainer.innerHTML = '<div class="menu-empty-state">請先產生菜單或顯示符合項目，再拖曳到下方編排區。</div>';
        return;
    }

    resultContainer.innerHTML = `
        ${generated.length ? `
            <div class="menu-result-summary">
                <div>
                    <h4>系統建議菜單</h4>
                    ${isCaptain ? `<p>${escapeHtml(String(generated.length))} 個項目可拖曳</p>` : ''}
                </div>
            </div>
            <div class="menu-source-grid">
                ${generated.map((row) => createPracticeMenuSourceItem(row, '建議', 'generated')).join('')}
            </div>
        ` : ''}
        ${matching.length ? `
            <div class="menu-result-summary" style="margin-top:18px;">
                <div>
                    <h4>符合條件項目</h4>
                    ${isCaptain ? `<p>${escapeHtml(String(matching.length))} 個項目可拖曳</p>` : ''}
                </div>
            </div>
            <div class="menu-source-grid">
                ${matching.map((row) => createPracticeMenuSourceItem(row, '符合', 'match')).join('')}
            </div>
        ` : ''}
    `;
}

function createPracticeMenuBoardItem(item, halfKey, index) {
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';
    return `
        <div class="practice-menu-item practice-menu-board__item" ${isCaptain ? `draggable="true" data-half-key="${halfKey}" data-index="${index}" ondragstart="handlePracticeMenuExistingDragStart(event, '${halfKey}', ${index})" ondragend="handlePracticeMenuDragEnd()"` : ''}>
            <span>${escapeHtml(item.name || '未命名訓練')}</span>
            ${isCaptain ? `<button type="button" class="practice-menu-item__remove" onclick="removePracticeMenuItem('${halfKey}', ${index})">&times;</button>` : ''}
        </div>
    `;
}

function getNextPracticeInfo(weekdays) {
    const normalized = (weekdays || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
    if (!normalized.length) return { date: '', weekday: '' };
    const today = new Date();
    const currentDay = today.getDay();
    let bestOffset = null;
    let bestDay = null;
    normalized.forEach((day) => {
        let offset = (day - currentDay + 7) % 7;
        if (bestOffset === null || offset < bestOffset) {
            bestOffset = offset;
            bestDay = day;
        }
    });
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + (bestOffset || 0));
    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDate.getDate()).padStart(2, '0');
    return {
        date: `${yyyy}-${mm}-${dd}`,
        weekday: Number.isInteger(bestDay) ? PRACTICE_WEEKDAY_NAMES[bestDay] : ''
    };
}

function formatPracticeCourtLabel(slotData) {
    const label = String(slotData?.line1 || '').replace(/\s+/g, '').trim();
    return label || '沒場';
}

function getPracticeCourtSummary(dateValue) {
    const normalizedDate = normalizeCourtDateValue(dateValue);
    if (!normalizedDate) {
        return [
            { key: 'first', label: '上半', value: '沒場', hasCourt: false },
            { key: 'second', label: '下半', value: '沒場', hasCourt: false }
        ];
    }

    const monthId = normalizedDate.slice(0, 7);
    const monthRows = getCourtRowsForMonth(monthId, false);
    const targetRow = monthRows.find((row) => normalizeCourtDateValue(row.date) === normalizedDate);
    const firstLabel = formatPracticeCourtLabel(targetRow?.slot1);
    const secondLabel = formatPracticeCourtLabel(targetRow?.slot2);

    return [
        { key: 'first', label: '上半', value: firstLabel, hasCourt: firstLabel !== '沒場' },
        { key: 'second', label: '下半', value: secondLabel, hasCourt: secondLabel !== '沒場' }
    ];
}

function renderPracticeWeekdayControls(weekdays) {
    const isCaptain = localStorage.getItem('vbt_role') === 'captain';
    if (!isCaptain) return '';
    const selected = new Set((weekdays || []).map((value) => Number(value)));
    const nextPractice = getNextPracticeInfo([...selected]);
    const labels = [...selected].sort((a, b) => a - b).map((value) => PRACTICE_WEEKDAY_NAMES[value]).join(', ');
    const controls = PRACTICE_WEEKDAY_NAMES.map((label, index) => `
        <label class="court-weekday-option ${isCaptain ? '' : 'menu-weekday-option--readonly'}">
            <input type="checkbox" data-practice-weekday="${index}" ${selected.has(index) ? 'checked' : ''} ${isCaptain ? '' : 'disabled'}>
            ${label}
        </label>
    `).join('');
    return `
        <div class="practice-menu-board__controls">
            <div class="court-weekday-filter practice-weekday-filter">
                <span class="court-weekday-filter__label">星期</span>
                ${controls}
            </div>
        </div>
    `;
}

function renderPracticeWeekdayCard() {
    const container = document.getElementById('menu-practice-weekdays');
    if (!container) return;
    container.innerHTML = renderPracticeWeekdayControls(menuState.practiceMenu.weekdays || []);
}

function renderPracticeMenuBoard() {
    const container = document.getElementById('menu-practice-board');
    if (!container) return;
    const firstHalf = menuState.practiceMenu.first_half || [];
    const secondHalf = menuState.practiceMenu.second_half || [];
    const updatedAt = menuState.practiceMenu.updated_at || '';
    const weekdays = menuState.practiceMenu.weekdays || [];
    const nextPractice = getNextPracticeInfo(weekdays);
    const titleSuffix = nextPractice.date ? ` ${nextPractice.date.slice(5)}${nextPractice.weekday ? `(${nextPractice.weekday})` : ''}` : '';
    const courtSummary = getPracticeCourtSummary(nextPractice.date);
    const courtBadges = nextPractice.date
        ? `<div class="practice-menu-board__court-badges">${courtSummary.map((item) => `
            <span class="practice-menu-board__court-badge${item.hasCourt ? ' is-booked' : ' is-empty'}">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</span>
        `).join('')}</div>`
        : '';

    container.innerHTML = `
        <div class="practice-menu-board" data-practice-menu-export="true">
            <div class="strategy-panel-header practice-menu-board__summary">
                <div>
                    <div class="practice-menu-board__title-row">
                        <h4 class="strategy-panel-title">本週菜單${escapeHtml(titleSuffix)}</h4>
                        ${courtBadges}
                    </div>
                    <p>${updatedAt ? `更新日期：${escapeHtml(updatedAt)}` : '請在下方編排並發布本週練球菜單。'}</p>
                </div>
                <div class="practice-menu-board__actions">
                    <button type="button" class="court-btn" onclick="downloadPracticeMenuBoardAsPng()">下載 PNG</button>
                </div>
            </div>
            <div class="practice-menu-board__halves">
                <section class="practice-menu-board__half">
                    <div class="practice-menu-board__list practice-menu-drop-zone" data-half-key="first_half" ondragover="handlePracticeMenuDragOver(event)" ondragleave="handlePracticeMenuDragLeave(event)" ondrop="handlePracticeMenuDrop(event, 'first_half')">
                        ${firstHalf.length ? firstHalf.map((item, index) => createPracticeMenuBoardItem(item, 'first_half', index)).join('') : '<div class="menu-empty-state" style="margin-top:0;">目前沒有訓練。</div>'}
                    </div>
                </section>
                <section class="practice-menu-board__half">
                    <div class="practice-menu-board__list practice-menu-drop-zone" data-half-key="second_half" ondragover="handlePracticeMenuDragOver(event)" ondragleave="handlePracticeMenuDragLeave(event)" ondrop="handlePracticeMenuDrop(event, 'second_half')">
                        ${secondHalf.length ? secondHalf.map((item, index) => createPracticeMenuBoardItem(item, 'second_half', index)).join('') : '<div class="menu-empty-state" style="margin-top:0;">目前沒有訓練。</div>'}
                    </div>
                </section>
            </div>
        </div>
    `;
    renderPracticeMenuDropZones();
}

function generateMenu() {
    const filters = getMenuFiltersFromUI();
    const filteredRows = getFilteredMenuRows();
    const recommendedRows = pickRecommendedMenuRows(filteredRows, filters);
    menuState.matchingRows = filteredRows;
    menuState.generatedRows = recommendedRows;
    renderPlanSources();
}

function showAllMenuMatches() {
    const filteredRows = getFilteredMenuRows();
    menuState.matchingRows = filteredRows;
    renderPlanSources();
}

function resetMenuFilters() {
    const playersInput = document.getElementById('menu-players');
    const courtModeInput = document.getElementById('menu-court-mode');
    const planSizeInput = document.getElementById('menu-plan-size');

    if (playersInput) playersInput.value = 6;
    if (courtModeInput) courtModeInput.value = '';
    if (planSizeInput) planSizeInput.value = 5;

    document.querySelectorAll('#menu input[type="checkbox"]').forEach((input) => {
        input.checked = false;
    });

    generateMenu();
}

function toggleMenuEditor(forceState) {
    const nextState = typeof forceState === 'boolean' ? forceState : !menuState.editorOpen;
    menuState.editorOpen = nextState;
    const panel = document.getElementById('menu-editor-panel');
    const icon = document.getElementById('menu-editor-toggle-icon');
    if (panel) panel.style.display = nextState ? 'block' : 'none';
    if (icon) icon.textContent = nextState ? '▴' : '▾';
}

function syncMenuBuilderVisibility() {
    const card = document.getElementById('menu-builder-card');
    const body = document.getElementById('menu-builder-body');
    const toggle = document.getElementById('menu-builder-toggle');
    if (!card || !body || !toggle) return;

    card.classList.toggle('is-open', menuState.builderOpen);
    card.classList.toggle('is-collapsed', !menuState.builderOpen);
    body.style.display = menuState.builderOpen ? 'block' : 'none';
    toggle.setAttribute('aria-expanded', String(menuState.builderOpen));
    toggle.title = menuState.builderOpen ? '\u6536\u5408\u83dc\u55ae\u7de8\u6392' : '\u986f\u793a\u83dc\u55ae\u7de8\u6392';
}

function toggleMenuBuilder(forceState) {
    menuState.builderOpen = typeof forceState === 'boolean' ? forceState : !menuState.builderOpen;
    syncMenuBuilderVisibility();
}

function setMenuBuilderDragState(isDragging) {
    window.clearTimeout(menuBuilderDragOpenTimer);
    const card = document.getElementById('menu-builder-card');
    document.body.classList.toggle('dragging-menu-item', Boolean(isDragging));
    if (!card) return;
    card.classList.toggle('is-dragging', Boolean(isDragging));
}

function clearPracticeMenuTouchHold() {
    window.clearTimeout(practiceMenuTouchDrag.holdTimer);
    practiceMenuTouchDrag.holdTimer = null;
}

function resetPracticeMenuTouchDrag() {
    clearPracticeMenuTouchHold();
    if (practiceMenuTouchDrag.sourceElement) {
        practiceMenuTouchDrag.sourceElement.classList.remove('is-touch-dragging');
    }
    practiceMenuTouchDrag.pointerId = null;
    practiceMenuTouchDrag.dragging = false;
    practiceMenuTouchDrag.payload = null;
    practiceMenuTouchDrag.sourceElement = null;
    practiceMenuTouchDrag.activeZone = null;
}

function getPracticeMenuTouchPayload(target) {
    const sourceItem = target.closest('.menu-source-item');
    if (sourceItem) {
        return {
            payload: {
                drag_kind: 'source',
                source_type: sourceItem.dataset.sourceType || '',
                source_id: Number(sourceItem.dataset.sourceId || 0) || null,
                name: decodeURIComponent(sourceItem.dataset.sourceName || '')
            },
            sourceElement: sourceItem
        };
    }

    const existingItem = target.closest('.menu-drop-zone__item, .practice-menu-board__item');
    if (existingItem) {
        const halfKey = existingItem.dataset.halfKey || '';
        const index = Number(existingItem.dataset.index || -1);
        const item = (menuState.practiceMenu[halfKey] || [])[index];
        if (!item) return null;
        return {
            payload: {
                drag_kind: 'existing',
                from_half: halfKey,
                from_index: index,
                item
            },
            sourceElement: existingItem
        };
    }

    return null;
}

function updatePracticeMenuTouchDropTarget(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    const zone = target ? target.closest('.menu-drop-zone, .practice-menu-drop-zone') : null;
    if (!zone) {
        practiceMenuTouchDrag.activeZone = null;
        clearPracticeMenuDropIndicators();
        return;
    }

    practiceMenuTouchDrag.activeZone = zone;
    const insertIndex = getPracticeMenuInsertIndex(zone, clientY);
    updatePracticeMenuDropIndicator(zone, insertIndex);
}

async function performPracticeMenuDropFromPayload(payload, halfKey, zone, clientY) {
    const insertIndex = getPracticeMenuInsertIndex(zone, clientY);
    if (payload.drag_kind === 'existing') {
        const fromHalf = payload.from_half;
        const fromIndex = Number(payload.from_index);
        const sourceItems = [...(menuState.practiceMenu[fromHalf] || [])];
        const [movedItem] = sourceItems.splice(fromIndex, 1);
        if (!movedItem) return;
        const targetItems = fromHalf === halfKey ? sourceItems : [...(menuState.practiceMenu[halfKey] || [])];
        const adjustedIndex = fromHalf === halfKey && fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
        const normalizedIndex = Math.max(0, Math.min(adjustedIndex, targetItems.length));
        targetItems.splice(normalizedIndex, 0, movedItem);
        menuState.practiceMenu[fromHalf] = sourceItems;
        menuState.practiceMenu[halfKey] = targetItems;
        await savePracticeMenu();
        await loadPracticeMenu();
        return;
    }

    const nextItems = [...(menuState.practiceMenu[halfKey] || [])];
    const normalizedIndex = Math.max(0, Math.min(insertIndex, nextItems.length));
    nextItems.splice(normalizedIndex, 0, {
        source_type: payload.source_type,
        source_id: payload.source_id || null,
        name: payload.name || '?芸??蝺?'
    });
    menuState.practiceMenu[halfKey] = nextItems;
    await savePracticeMenu();
    await loadPracticeMenu();
}

function initPracticeMenuTouchDrag() {
    if (!window.PointerEvent) return;

    document.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch' || !event.isPrimary) return;
        if (event.target.closest('button, input, textarea, select, a, label')) return;

        const match = getPracticeMenuTouchPayload(event.target);
        if (!match) return;

        clearPracticeMenuTouchHold();
        practiceMenuTouchDrag.pointerId = event.pointerId;
        practiceMenuTouchDrag.dragging = false;
        practiceMenuTouchDrag.payload = match.payload;
        practiceMenuTouchDrag.sourceElement = match.sourceElement;
        practiceMenuTouchDrag.activeZone = null;
        practiceMenuTouchDrag.startX = event.clientX;
        practiceMenuTouchDrag.startY = event.clientY;
        practiceMenuTouchDrag.lastX = event.clientX;
        practiceMenuTouchDrag.lastY = event.clientY;
        practiceMenuTouchDrag.holdTimer = window.setTimeout(() => {
            practiceMenuTouchDrag.dragging = true;
            practiceMenuTouchDrag.suppressClickUntil = Date.now() + 400;
            setMenuBuilderDragState(true);
            toggleMenuBuilder(true);
            if (practiceMenuTouchDrag.sourceElement) {
                practiceMenuTouchDrag.sourceElement.classList.add('is-touch-dragging');
            }
            updatePracticeMenuTouchDropTarget(practiceMenuTouchDrag.lastX, practiceMenuTouchDrag.lastY);
        }, PRACTICE_MENU_TOUCH_HOLD_MS);
    }, { passive: true });

    document.addEventListener('pointermove', (event) => {
        if (event.pointerId !== practiceMenuTouchDrag.pointerId) return;

        practiceMenuTouchDrag.lastX = event.clientX;
        practiceMenuTouchDrag.lastY = event.clientY;

        if (!practiceMenuTouchDrag.dragging) {
            const distanceX = Math.abs(event.clientX - practiceMenuTouchDrag.startX);
            const distanceY = Math.abs(event.clientY - practiceMenuTouchDrag.startY);
            if (distanceX > PRACTICE_MENU_TOUCH_MOVE_TOLERANCE || distanceY > PRACTICE_MENU_TOUCH_MOVE_TOLERANCE) {
                resetPracticeMenuTouchDrag();
            }
            return;
        }

        event.preventDefault();
        updatePracticeMenuTouchDropTarget(event.clientX, event.clientY);
    }, { passive: false });

    document.addEventListener('pointerup', async (event) => {
        if (event.pointerId !== practiceMenuTouchDrag.pointerId) return;

        const wasDragging = practiceMenuTouchDrag.dragging;
        const payload = practiceMenuTouchDrag.payload;
        const zone = practiceMenuTouchDrag.activeZone;
        const clientY = practiceMenuTouchDrag.lastY;
        resetPracticeMenuTouchDrag();

        if (!wasDragging || !payload || !zone) {
            handlePracticeMenuDragEnd();
            return;
        }

        const halfKey = zone.dataset.halfKey || '';
        if (!halfKey) {
            handlePracticeMenuDragEnd();
            return;
        }

        try {
            await performPracticeMenuDropFromPayload(payload, halfKey, zone, clientY);
        } catch (error) {
            console.error('Failed to drop practice menu item via touch', error);
        } finally {
            handlePracticeMenuDragEnd();
        }
    }, { passive: false });

    document.addEventListener('pointercancel', (event) => {
        if (event.pointerId !== practiceMenuTouchDrag.pointerId) return;
        resetPracticeMenuTouchDrag();
        handlePracticeMenuDragEnd();
    });

    document.addEventListener('click', (event) => {
        if (Date.now() > practiceMenuTouchDrag.suppressClickUntil) return;
        if (!event.target.closest('.menu-source-item, .menu-drop-zone__item, .menu-drop-zone, .practice-menu-board__item, .practice-menu-drop-zone')) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
}

function renderPracticeMenuDropZoneItems(halfKey) {
    const items = menuState.practiceMenu[halfKey] || [];
    if (!items.length) {
        return '<div class="menu-drop-zone__empty">把菜單拖曳到這裡，或手動新增。</div>';
    }
    return items.map((item, index) => `
        <div class="menu-drop-zone__item" draggable="true" data-practice-drag-kind="existing" data-half-key="${halfKey}" data-index="${index}" ondragstart="handlePracticeMenuExistingDragStart(event, '${halfKey}', ${index})" ondragend="handlePracticeMenuDragEnd()">
            <span>${escapeHtml(item.name || '未命名訓練')}</span>
            <button type="button" onclick="removePracticeMenuItem('${halfKey}', ${index})">&times;</button>
        </div>
    `).join('');
}

function getTeamResourceKind(url) {
    const normalized = String(url || '').toLowerCase();
    if (normalized.includes('notion.so') || normalized.includes('notion.site')) {
        return { label: 'Notion', icon: 'fas fa-book-open', accentClass: 'resource-preview--notion' };
    }
    if (normalized.includes('/forms/') || normalized.includes('forms.gle/')) {
        return { label: 'Google 表單', icon: 'fas fa-clipboard-list', accentClass: 'resource-preview--file' };
    }
    if (normalized.includes('/spreadsheets/')) {
        return { label: 'Google 試算表', icon: 'fas fa-table', accentClass: 'resource-preview--sheet' };
    }
    if (normalized.includes('/document/')) {
        return { label: 'Google 文件', icon: 'fas fa-file-alt', accentClass: 'resource-preview--doc' };
    }
    return { label: '外部連結', icon: 'fas fa-link', accentClass: 'resource-preview--file' };
}

function renderTeamResourceCard(item, sectionId) {
    const resourceKind = getTeamResourceKind(item.url);
    const title = item.title && item.title.trim() ? item.title.trim() : resourceKind.label;
    return `
        <div class="video-card">
            ${isCaptainRole() ? `<button class="delete-btn" onclick="deleteTeamResourceItem('${item.id}', '${sectionId}')">刪除</button>` : ''}
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: inherit;">
                <div class="video-preview resource-preview ${resourceKind.accentClass}">
                    <i class="${resourceKind.icon}"></i>
                    <span>${resourceKind.label}</span>
                </div>
                <div class="video-info">
                    <h5>${escapeHtml(title)}</h5>
                    <p>${escapeHtml(item.url.length > 60 ? `${item.url.slice(0, 60)}...` : item.url)}</p>
                </div>
            </a>
        </div>
    `;
}

function renderPracticeMenuDropZones() {
    const firstZone = document.getElementById('menu-first-half-zone');
    const secondZone = document.getElementById('menu-second-half-zone');
    if (firstZone) firstZone.innerHTML = renderPracticeMenuDropZoneItems('first_half');
    if (secondZone) secondZone.innerHTML = renderPracticeMenuDropZoneItems('second_half');
    clearPracticeMenuDropIndicators();
}

async function savePracticeMenu() {
    await fetch('/api/practice_menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuState.practiceMenu)
    });
}

async function loadPracticeMenu() {
    try {
        const response = await fetch('/api/practice_menu');
        const data = await response.json();
        menuState.practiceMenu = {
            first_half: Array.isArray(data.first_half) ? data.first_half : [],
            second_half: Array.isArray(data.second_half) ? data.second_half : [],
            weekdays: Array.isArray(data.weekdays) ? data.weekdays : [],
            updated_at: data.updated_at || ''
        };
        renderPracticeMenuBoard();
        renderPracticeWeekdayCard();
    } catch (error) {
        console.error('Failed to load practice menu', error);
    }
}

async function addPracticeMenuItem(sourceType, sourceId, sourceName, halfKey) {
    const item = {
        source_type: sourceType,
        source_id: sourceId || null,
        name: sourceName || '未命名訓練'
    };
    menuState.practiceMenu[halfKey] = [...(menuState.practiceMenu[halfKey] || []), item];
    await savePracticeMenu();
    await loadPracticeMenu();
}

async function addManualPracticeMenuItem(halfKey) {
    const input = document.getElementById(halfKey === 'first_half' ? 'menu-first-half-manual' : 'menu-second-half-manual');
    const value = input?.value?.trim();
    if (!value) return;
    await addPracticeMenuItem('manual', null, value, halfKey);
    if (input) input.value = '';
}

async function removePracticeMenuItem(halfKey, index) {
    if (localStorage.getItem('vbt_role') !== 'captain') return;
    const nextItems = [...(menuState.practiceMenu[halfKey] || [])];
    nextItems.splice(index, 1);
    menuState.practiceMenu[halfKey] = nextItems;
    await savePracticeMenu();
    await loadPracticeMenu();
}

async function updatePracticeWeekdays() {
    const selected = Array.from(document.querySelectorAll('input[data-practice-weekday]:checked')).map((input) => Number(input.dataset.practiceWeekday));
    menuState.practiceMenu.weekdays = selected;
    await savePracticeMenu();
    await loadPracticeMenu();
}

function handlePracticeMenuDragStart(event, sourceType, sourceId, sourceName) {
    setMenuBuilderDragState(true);
    menuBuilderDragOpenTimer = window.setTimeout(() => {
        toggleMenuBuilder(true);
    }, 120);
    event.dataTransfer.setData('text/plain', JSON.stringify({
        drag_kind: 'source',
        source_type: sourceType,
        source_id: sourceId || null,
        name: sourceName || '未命名訓練'
    }));
}

function handlePracticeMenuExistingDragStart(event, halfKey, index) {
    const item = (menuState.practiceMenu[halfKey] || [])[index];
    if (!item) return;
    setMenuBuilderDragState(true);
    menuBuilderDragOpenTimer = window.setTimeout(() => {
        toggleMenuBuilder(true);
    }, 120);
    event.dataTransfer.setData('text/plain', JSON.stringify({
        drag_kind: 'existing',
        from_half: halfKey,
        from_index: index,
        item
    }));
}

function handlePracticeMenuDragEnd() {
    setMenuBuilderDragState(false);
    clearPracticeMenuDropIndicators();
}

function handlePracticeMenuDragOver(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    if (!zone) return;
    const insertIndex = getPracticeMenuInsertIndex(zone, event.clientY);
    updatePracticeMenuDropIndicator(zone, insertIndex);
}

async function handlePracticeMenuDrop(event, halfKey) {
    event.preventDefault();
    try {
        const zone = event.currentTarget;
        const insertIndex = getPracticeMenuInsertIndex(zone, event.clientY);
        const payload = JSON.parse(event.dataTransfer.getData('text/plain'));
        return await performPracticeMenuDropFromPayload(payload, halfKey, zone, event.clientY);
        if (payload.drag_kind === 'existing') {
            const fromHalf = payload.from_half;
            const fromIndex = Number(payload.from_index);
            const sourceItems = [...(menuState.practiceMenu[fromHalf] || [])];
            const [movedItem] = sourceItems.splice(fromIndex, 1);
            if (!movedItem) return;
            const targetItems = fromHalf === halfKey ? sourceItems : [...(menuState.practiceMenu[halfKey] || [])];
            const adjustedIndex = fromHalf === halfKey && fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
            const normalizedIndex = Math.max(0, Math.min(adjustedIndex, targetItems.length));
            targetItems.splice(normalizedIndex, 0, movedItem);
            menuState.practiceMenu[fromHalf] = sourceItems;
            menuState.practiceMenu[halfKey] = targetItems;
            await savePracticeMenu();
            await loadPracticeMenu();
            return;
        }
        const nextItems = [...(menuState.practiceMenu[halfKey] || [])];
        const normalizedIndex = Math.max(0, Math.min(insertIndex, nextItems.length));
        nextItems.splice(normalizedIndex, 0, {
            source_type: payload.source_type,
            source_id: payload.source_id || null,
            name: payload.name || '未命名訓練'
        });
        menuState.practiceMenu[halfKey] = nextItems;
        await savePracticeMenu();
        await loadPracticeMenu();
    } catch (error) {
        console.error('Failed to drop practice menu item', error);
    } finally {
        handlePracticeMenuDragEnd();
    }
}

function getPracticeMenuInsertIndex(zone, clientY) {
    if (!zone) return 0;
    const items = Array.from(zone.querySelectorAll('.menu-drop-zone__item, .practice-menu-board__item'));
    for (const item of items) {
        const rect = item.getBoundingClientRect();
        if (clientY < rect.top + (rect.height / 2)) {
            return Number(item.dataset.index || 0);
        }
    }
    return items.length;
}

function clearPracticeMenuDropIndicators() {
    document.querySelectorAll('.menu-drop-zone__item.drop-before, .menu-drop-zone__item.drop-after, .practice-menu-board__item.drop-before, .practice-menu-board__item.drop-after').forEach((item) => {
        item.classList.remove('drop-before', 'drop-after');
    });
    document.querySelectorAll('.menu-drop-zone.is-drop-target-empty, .practice-menu-drop-zone.is-drop-target-empty').forEach((zone) => {
        zone.classList.remove('is-drop-target-empty');
    });
}

function updatePracticeMenuDropIndicator(zone, insertIndex) {
    clearPracticeMenuDropIndicators();
    if (!zone) return;
    const items = Array.from(zone.querySelectorAll('.menu-drop-zone__item, .practice-menu-board__item'));
    if (!items.length) {
        zone.classList.add('is-drop-target-empty');
        return;
    }
    if (insertIndex >= items.length) {
        items[items.length - 1].classList.add('drop-after');
        return;
    }
    items[insertIndex].classList.add('drop-before');
}

function handlePracticeMenuDragLeave(event) {
    const zone = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (zone && relatedTarget && zone.contains(relatedTarget)) return;
    clearPracticeMenuDropIndicators();
}

function initPracticeWeekdayListeners() {
    document.addEventListener('change', async (event) => {
        const target = event.target;
        if (target && target.matches('input[data-practice-weekday]')) {
            await updatePracticeWeekdays();
        }
    });
}

function menuValuesToText(values) {
    return (values || []).join(', ');
}

function fillMenuEditor(row) {
    menuState.editingId = row?.id || null;
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };
    setValue('menu-edit-id', row?.id || '');
    setValue('menu-edit-name', row?.name || '');
    setValue('menu-edit-players', row?.people_count || 2);
    setValue('menu-edit-focuses', menuValuesToText(row?.focuses));
    setValue('menu-edit-court-modes', menuValuesToText(row?.court_modes));
    setValue('menu-edit-complexities', menuValuesToText(row?.complexities));
    setValue('menu-edit-fatigue', menuValuesToText(row?.fatigue_levels));
    setValue('menu-edit-difficulty', menuValuesToText(row?.difficulty_levels));
}

function resetMenuEditor() {
    fillMenuEditor(null);
}

function startCreateMenuItem() {
    resetMenuEditor();
    const nameInput = document.getElementById('menu-edit-name');
    if (nameInput) nameInput.focus();
}

function renderMenuEditorList() {
    const list = document.getElementById('menu-editor-list');
    if (!list) return;
    if (!menuState.rows.length) {
        list.innerHTML = '<div class="menu-empty-state" style="margin-top:0;">目前沒有訓練。</div>';
        return;
    }
    list.innerHTML = sortMenuRows(menuState.rows).map((row) => `
        <button type="button" class="menu-editor-item ${menuState.editingId === row.id ? 'active' : ''}" onclick="fillMenuEditorById(${row.id})">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${escapeHtml((row.court_modes || []).join(' / ') || '-')} &middot; ${escapeHtml(String(row.people_count || '-'))} 人 &middot; ${escapeHtml((row.difficulty_levels || []).join(' / ') || '-')}</span>
        </button>
    `).join('');
}

function fillMenuEditorById(itemId) {
    const row = menuState.rows.find((item) => item.id === itemId);
    if (!row) return;
    fillMenuEditor(row);
    renderMenuEditorList();
}

function collectMenuEditorPayload() {
    return {
        name: document.getElementById('menu-edit-name')?.value || '',
        people_count: document.getElementById('menu-edit-players')?.value || 0,
        focuses: document.getElementById('menu-edit-focuses')?.value || '',
        court_modes: document.getElementById('menu-edit-court-modes')?.value || '',
        complexities: document.getElementById('menu-edit-complexities')?.value || '',
        fatigue_levels: document.getElementById('menu-edit-fatigue')?.value || '',
        difficulty_levels: document.getElementById('menu-edit-difficulty')?.value || ''
    };
}

function ensureMenuEditorActionsPlacement() {
    const actionRow = document.querySelector('#menu-editor-panel .menu-editor-actions');
    const layout = document.querySelector('#menu-editor-panel .menu-editor-layout');
    if (!actionRow || !layout) return;
    if (actionRow.nextElementSibling !== layout) {
        layout.parentElement.insertBefore(actionRow, layout);
    }
}

function setMenuImportStatus(message, type = '') {
    const status = document.getElementById('menu-import-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.remove('is-error', 'is-success');
    if (type === 'error') status.classList.add('is-error');
    if (type === 'success') status.classList.add('is-success');
}

async function importMenuCsv() {
    const fileInput = document.getElementById('menu-import-file');
    const replaceInput = document.getElementById('menu-import-replace');
    const file = fileInput?.files?.[0];

    if (!file) {
        setMenuImportStatus('請先選擇 CSV 檔案。', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('replace', replaceInput?.checked ? 'true' : 'false');

    setMenuImportStatus('CSV 匯入中...');

    try {
        const response = await fetch('/api/menu_data/import', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (!response.ok) {
            setMenuImportStatus(data.error || 'CSV 匯入失敗。', 'error');
            return;
        }

        if (fileInput) fileInput.value = '';
        if (replaceInput) replaceInput.checked = false;
        resetMenuEditor();
        await refreshMenuData(false);
        generateMenu();
        setMenuImportStatus(`已從 ${data.filename || 'CSV'} 匯入 ${data.count || 0} 筆菜單。`, 'success');
    } catch (error) {
        console.error('Failed to import menu CSV', error);
        setMenuImportStatus('CSV 匯入失敗。', 'error');
    }
}

async function refreshMenuData(preserveEditor = true) {
    const response = await fetch('/api/menu_data');
    const data = await response.json();
    menuState.rows = Array.isArray(data.rows) ? data.rows : [];
    menuState.filters = data.filters || menuState.filters;
    renderMenuFilterOptions(menuState.filters);
    renderMenuEditorList();
    if (preserveEditor && menuState.editingId) {
        const current = menuState.rows.find((item) => item.id === menuState.editingId);
        if (current) fillMenuEditor(current);
        else resetMenuEditor();
    }
    return data;
}

async function saveMenuItem() {
    const payload = collectMenuEditorPayload();
    const itemId = document.getElementById('menu-edit-id')?.value;
    const method = itemId ? 'PUT' : 'POST';
    const url = itemId ? `/api/menu_data/${itemId}` : '/api/menu_data';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '儲存菜單失敗。');
            return;
        }
        menuState.editingId = data.item?.id || null;
        await refreshMenuData(true);
        generateMenu();
    } catch (error) {
        console.error('Failed to save menu item', error);
        alert('儲存菜單失敗。');
    }
}

async function deleteMenuItem() {
    const itemId = document.getElementById('menu-edit-id')?.value;
    if (!itemId) {
        alert('請先選擇要刪除的菜單。');
        return;
    }
    if (!confirm('確定要從菜單資料庫刪除這個菜單嗎？')) return;

    try {
        const response = await fetch(`/api/menu_data/${itemId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '刪除菜單失敗。');
            return;
        }
        resetMenuEditor();
        await refreshMenuData(false);
        generateMenu();
    } catch (error) {
        console.error('Failed to delete menu item', error);
        alert('刪除菜單失敗。');
    }
}

async function initTrainingMenu() {
    const resultContainer = document.getElementById('menu-result');
    syncMenuBuilderVisibility();
    await loadPracticeMenu();
    toggleMenuBuilder(true);
    ensureMenuEditorActionsPlacement();
    if (resultContainer) {
        resultContainer.innerHTML = '<div class="menu-empty-state">菜單資料庫載入中...</div>';
    }

    try {
        const data = await refreshMenuData(false);
        resetMenuEditor();
        toggleMenuEditor(false);
        toggleMenuBuilder(true);
        initMenuFilterAutoRefresh();

        if (!menuState.rows.length && resultContainer) {
            resultContainer.innerHTML = '<div class="menu-empty-state">找不到菜單資料庫，請先匯入 CSV。</div>';
            return;
        }

        generateMenu();
    } catch (error) {
        console.error('Failed to load training menu', error);
        if (resultContainer) {
            resultContainer.innerHTML = '<div class="menu-empty-state">菜單資料庫載入失敗。</div>';
        }
    }
}

// ==========================================
// 6. Court Status & Scraper Management (融合升級版)
// ==========================================

function getServerBootstrapDate() {
    const rawValue = window.APP_BOOTSTRAP && window.APP_BOOTSTRAP.serverToday;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rawValue || ''))) return null;

    const [year, month, day] = String(rawValue).split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function getBaseAppDate() {
    return getServerBootstrapDate() || new Date();
}

function getMonthData(offsetMonth = 0) {
    const date = getBaseAppDate();
    date.setMonth(date.getMonth() + offsetMonth);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return { id: `${yyyy}-${mm}`, displayNumber: date.getMonth() + 1, year: yyyy, label: `${yyyy}-${mm}` };
}

const COURT_WEEKDAY_KEY = 'vbt_court_weekdays';
const COURT_INCLUDED_DATES_KEY = 'vbt_court_included_dates';
const COURT_EXCLUDED_DATES_KEY = 'vbt_court_excluded_dates';
const COURT_WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const courtStatusCache = {};
const courtEditState = {
    active: false,
    monthId: null,
    draftRows: []
};
let activeCourtTab = 'current';

function getDefaultCourtWeekdays() {
    return [0, 1, 2, 3, 4, 5, 6];
}

function getSelectedCourtWeekdays() {
    const checkboxes = document.querySelectorAll('[data-court-weekday]');
    if (checkboxes.length > 0) {
        const selected = Array.from(checkboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => Number(checkbox.dataset.courtWeekday));
        return selected.length > 0 ? selected : getDefaultCourtWeekdays();
    }

    try {
        const saved = JSON.parse(localStorage.getItem(COURT_WEEKDAY_KEY) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            return saved.map(Number);
        }
    } catch (error) {
        console.warn('Failed to read saved court weekdays', error);
    }

    return getDefaultCourtWeekdays();
}

function getCourtDateFilterMap() {
    try {
        const saved = JSON.parse(localStorage.getItem(COURT_INCLUDED_DATES_KEY) || '{}');
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (error) {
        console.warn('Failed to read saved court date filters', error);
        return {};
    }
}

function saveCourtDateFilterMap(nextMap) {
    localStorage.setItem(COURT_INCLUDED_DATES_KEY, JSON.stringify(nextMap));
}

function getCourtExcludedDateFilterMap() {
    try {
        const saved = JSON.parse(localStorage.getItem(COURT_EXCLUDED_DATES_KEY) || '{}');
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (error) {
        console.warn('Failed to read saved court excluded date filters', error);
        return {};
    }
}

function saveCourtExcludedDateFilterMap(nextMap) {
    localStorage.setItem(COURT_EXCLUDED_DATES_KEY, JSON.stringify(nextMap));
}

function getCourtIncludedDates(monthId) {
    const savedMap = getCourtDateFilterMap();
    const values = Array.isArray(savedMap[monthId]) ? savedMap[monthId] : [];
    return values
        .map((value) => normalizeCourtDateValue(value))
        .filter((value) => value && value.startsWith(`${monthId}-`))
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort();
}

function setCourtIncludedDates(monthId, values) {
    const savedMap = getCourtDateFilterMap();
    const nextValues = (Array.isArray(values) ? values : [])
        .map((value) => normalizeCourtDateValue(value))
        .filter((value) => value && value.startsWith(`${monthId}-`))
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort();
    if (nextValues.length > 0) {
        savedMap[monthId] = nextValues;
    } else {
        delete savedMap[monthId];
    }
    saveCourtDateFilterMap(savedMap);
}

function getCourtExcludedDates(monthId) {
    const savedMap = getCourtExcludedDateFilterMap();
    const values = Array.isArray(savedMap[monthId]) ? savedMap[monthId] : [];
    return values
        .map((value) => normalizeCourtDateValue(value))
        .filter((value) => value && value.startsWith(`${monthId}-`))
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort();
}

function setCourtExcludedDates(monthId, values) {
    const savedMap = getCourtExcludedDateFilterMap();
    const nextValues = (Array.isArray(values) ? values : [])
        .map((value) => normalizeCourtDateValue(value))
        .filter((value) => value && value.startsWith(`${monthId}-`))
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort();
    if (nextValues.length > 0) {
        savedMap[monthId] = nextValues;
    } else {
        delete savedMap[monthId];
    }
    saveCourtExcludedDateFilterMap(savedMap);
}

function getCourtDatePickerId(monthId) {
    return `court-date-picker-${monthId}`;
}

function renderCourtIncludedDateTags(monthId) {
    const includedValues = getCourtIncludedDates(monthId);
    const excludedValues = getCourtExcludedDates(monthId);
    if (includedValues.length === 0 && excludedValues.length === 0) return '';
    return `
        <div class="court-date-tags">
            ${includedValues.map((dateValue) => `
                <span class="court-date-tag">
                    <span>${escapeHtml(dateValue)}</span>
                    <button type="button" onclick="removeCourtIncludedDate('${monthId}', '${dateValue}')">&times;</button>
                </span>
            `).join('')}
            ${excludedValues.map((dateValue) => `
                <span class="court-date-tag court-date-tag--exclude">
                    <span>${escapeHtml(dateValue)}</span>
                    <button type="button" onclick="removeCourtExcludedDate('${monthId}', '${dateValue}')">&times;</button>
                </span>
            `).join('')}
        </div>
    `;
}

function renderCourtDateFilterControls(monthId) {
    const [year, month] = monthId.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `
        <div class="court-date-panel">
            <div class="court-date-tools">
                <input type="date" id="${getCourtDatePickerId(monthId)}" class="court-date-picker" min="${monthId}-01" max="${monthId}-${String(lastDay).padStart(2, '0')}">
                <button type="button" class="court-btn" onclick="addCourtIncludedDate('${monthId}')">加入日期</button>
                <button type="button" class="court-btn" onclick="addCourtExcludedDate('${monthId}')">刪除日期</button>
            </div>
            ${renderCourtIncludedDateTags(monthId)}
        </div>
    `;
}

function addCourtIncludedDate(monthId) {
    const picker = document.getElementById(getCourtDatePickerId(monthId));
    const normalizedDate = normalizeCourtDateValue(picker ? picker.value : '');
    if (!normalizedDate) {
        alert('請先選擇日期。');
        return;
    }
    if (!normalizedDate.startsWith(`${monthId}-`)) {
        alert(`請選擇 ${monthId} 的日期。`);
        return;
    }
    const nextValues = Array.from(new Set([...getCourtIncludedDates(monthId), normalizedDate])).sort();
    setCourtIncludedDates(monthId, nextValues);
    setCourtExcludedDates(monthId, getCourtExcludedDates(monthId).filter((value) => value !== normalizedDate));
    refreshCourtTableByMonth(monthId);
}

function removeCourtIncludedDate(monthId, dateValue) {
    const nextValues = getCourtIncludedDates(monthId).filter((value) => value !== dateValue);
    setCourtIncludedDates(monthId, nextValues);
    refreshCourtTableByMonth(monthId);
}

function addCourtExcludedDate(monthId) {
    const picker = document.getElementById(getCourtDatePickerId(monthId));
    const normalizedDate = normalizeCourtDateValue(picker ? picker.value : '');
    if (!normalizedDate) {
        alert('請先選擇日期。');
        return;
    }
    if (!normalizedDate.startsWith(`${monthId}-`)) {
        alert(`請選擇 ${monthId} 的日期。`);
        return;
    }
    const nextValues = Array.from(new Set([...getCourtExcludedDates(monthId), normalizedDate])).sort();
    setCourtExcludedDates(monthId, nextValues);
    setCourtIncludedDates(monthId, getCourtIncludedDates(monthId).filter((value) => value !== normalizedDate));
    refreshCourtTableByMonth(monthId);
}

function removeCourtExcludedDate(monthId, dateValue) {
    const nextValues = getCourtExcludedDates(monthId).filter((value) => value !== dateValue);
    setCourtExcludedDates(monthId, nextValues);
    refreshCourtTableByMonth(monthId);
}

function initCourtWeekdayFilters() {
    const checkboxes = document.querySelectorAll('[data-court-weekday]');
    if (checkboxes.length === 0) return;

    let selectedWeekdays = getDefaultCourtWeekdays();
    try {
        const saved = JSON.parse(localStorage.getItem(COURT_WEEKDAY_KEY) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            selectedWeekdays = saved.map(Number);
        }
    } catch (error) {
        console.warn('Failed to parse saved court weekdays', error);
    }

    checkboxes.forEach(checkbox => {
        checkbox.checked = selectedWeekdays.includes(Number(checkbox.dataset.courtWeekday));
        checkbox.addEventListener('change', () => {
            const selected = Array.from(checkboxes)
                .filter(item => item.checked)
                .map(item => Number(item.dataset.courtWeekday));

            if (selected.length === 0) {
                checkbox.checked = true;
                return;
            }

            localStorage.setItem(COURT_WEEKDAY_KEY, JSON.stringify(selected));
            loadCourtStatus();
        });
    });
}

function normalizeCourtDateValue(dateValue) {
    if (!dateValue) return '';
    const normalized = String(dateValue).trim().replace(/\//g, '-');
    const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return '';
    const [, year, month, day] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatCourtDateLabel(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} (${COURT_WEEKDAY_NAMES[dateObj.getDay()]})`;
}

function buildCourtCalendarRowsWithWeekdays(monthId, data, weekdays) {
    const selectedWeekdays = new Set(weekdays);
    const [year, month] = monthId.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dataMap = new Map();

    (Array.isArray(data) ? data : []).forEach(row => {
        const normalizedDate = normalizeCourtDateValue(row.date);
        if (!normalizedDate) return;
        dataMap.set(normalizedDate, row);
    });

    const rows = [];
    for (let day = 1; day <= lastDay; day++) {
        const dateObj = new Date(year, month - 1, day);
        if (!selectedWeekdays.has(dateObj.getDay())) continue;

        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const existingRow = dataMap.get(dateKey);

        rows.push({
            date: formatCourtDateLabel(dateObj),
            slot1: existingRow ? existingRow.slot1 : null,
            slot2: existingRow ? existingRow.slot2 : null
        });
    }

    return rows;
}

function cloneCourtRows(rows) {
    return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function simplifyCourtName(value) {
    return String(value ?? '')
        .replace(/Volleyball\s+Court\s*/gi, '場 ')
        .replace(/Court\s*/gi, '場 ')
        .trim();
}

function normalizeCourtSlot(slotData) {
    if (!slotData) return null;

    const line1 = simplifyCourtName((slotData.line1 ?? slotData.court ?? '').toString().trim());
    const line2 = (slotData.line2 ?? slotData.dept ?? '').toString().trim();
    const color = slotData.color === 'blue' ? 'blue' : slotData.color === 'yellow' ? 'yellow' : 'none';

    if (!line1 && !line2 && color === 'none') return null;

    return { line1, line2, color };
}

function normalizeCourtSlotList(slotData) {
    if (!slotData) return [];
    const normalizedItems = Array.isArray(slotData)
        ? slotData.map((item) => normalizeCourtSlot(item)).filter(Boolean)
        : [normalizeCourtSlot(slotData)].filter(Boolean);
    const seen = new Set();
    return normalizedItems.filter((item) => {
        const key = `${item.line1}|${item.line2}|${item.color}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getEditableCourtSlotList(slotData) {
    if (!slotData) return [];
    const rawItems = Array.isArray(slotData) ? slotData : [slotData];
    const seen = new Set();
    const normalizedItems = [];

    rawItems.forEach((item) => {
        const normalized = normalizeCourtSlot(item) || {
            line1: String(item?.line1 ?? item?.court ?? '').trim(),
            line2: String(item?.line2 ?? item?.dept ?? '').trim(),
            color: item?.color === 'blue' ? 'blue' : item?.color === 'yellow' ? 'yellow' : 'none'
        };
        const key = `${normalized.line1}|${normalized.line2}|${normalized.color}`;
        if (seen.has(key)) return;
        seen.add(key);
        normalizedItems.push(normalized);
    });

    return normalizedItems;
}

function normalizeCourtRow(row) {
    return {
        date: row.date,
        slot1: Array.isArray(row.slot1) ? normalizeCourtSlotList(row.slot1) : normalizeCourtSlot(row.slot1),
        slot2: Array.isArray(row.slot2) ? normalizeCourtSlotList(row.slot2) : normalizeCourtSlot(row.slot2)
    };
}

function getCourtMonthDataById(monthId) {
    const now = getMonthData(0);
    if (now.id === monthId) return now;

    const next = getMonthData(1);
    if (next.id === monthId) return next;

    const [year, month] = monthId.split('-').map(Number);
    return { id: monthId, displayNumber: month, year };
}

function getActiveCourtMonthId() {
    return activeCourtTab === 'next' ? getMonthData(1).id : getMonthData(0).id;
}

function updateCourtEditButton() {
    const editBtn = document.getElementById('edit-table-btn');
    if (!editBtn) return;
    if (activeCourtTab === 'saved') {
        editBtn.style.display = 'none';
        return;
    }
    editBtn.style.display = 'inline-flex';

    const isEditingActiveTab = courtEditState.active && courtEditState.monthId === getActiveCourtMonthId();
    editBtn.innerHTML = isEditingActiveTab
        ? '<i class="fas fa-times"></i> 取消編輯'
        : '<i class="fas fa-edit"></i> 編輯表格';
}

function getCourtRowsForMonth(monthId, visibleOnly = true) {
    const cache = courtStatusCache[monthId];
    if (!cache) return [];
    return visibleOnly ? cache.visibleRows : cache.allRows;
}

function getCourtDraftRows(monthId, visibleOnly = true) {
    const sourceRows = courtEditState.active && courtEditState.monthId === monthId
        ? courtEditState.draftRows
        : getCourtRowsForMonth(monthId, false);

    if (!visibleOnly) return sourceRows;

    const selectedWeekdays = new Set(getSelectedCourtWeekdays());
    const includedDates = new Set(getCourtIncludedDates(monthId));
    const excludedDates = new Set(getCourtExcludedDates(monthId));
    return sourceRows.filter(row => {
        const dateValue = normalizeCourtDateValue(row.date);
        if (!dateValue) return true;
        const matchesWeekday = selectedWeekdays.has(new Date(`${dateValue}T00:00:00`).getDay());
        const matchesIncludedDate = includedDates.has(dateValue);
        if (excludedDates.has(dateValue)) return false;
        if (includedDates.size > 0) return matchesWeekday || matchesIncludedDate;
        return matchesWeekday;
    });
}

function setCourtCache(monthId, rows) {
    const normalizedRows = rows.map(normalizeCourtRow);
    courtStatusCache[monthId] = {
        allRows: normalizedRows,
        visibleRows: buildCourtCalendarRowsWithWeekdays(monthId, normalizedRows, getSelectedCourtWeekdays())
    };
}

function refreshCourtTableByMonth(monthId) {
    const current = getMonthData(0);
    const next = getMonthData(1);

    if (monthId === current.id) {
        renderCourtTable(current.id, 'display-current');
    } else if (monthId === next.id) {
        renderCourtTable(next.id, 'display-next');
    }
}

function getCourtCellClass(slotData) {
    const slots = normalizeCourtSlotList(slotData);
    if (slots.length === 0) {
        const single = normalizeCourtSlot(slotData);
        if (!single) return 'court-empty';
        if (single.color === 'blue') return 'court-booked court-booked--blue';
        if (single.color === 'yellow') return 'court-booked court-booked--yellow';
        return 'court-empty';
    }
    if (slots.some((slot) => slot.color === 'blue')) return 'court-booked court-booked--blue';
    if (slots.some((slot) => slot.color === 'yellow')) return 'court-booked court-booked--yellow';
    return 'court-empty';
}

function renderCourtSlotDisplay(slotData, isAuth) {
    const normalizedList = normalizeCourtSlotList(slotData);
    if (normalizedList.length === 0) {
        const normalized = normalizeCourtSlot(slotData);
        if (!normalized) return `<td class="court-empty">-</td>`;
        let content = `<div class="slot-line1">${escapeHtml(normalized.line1)}</div>`;
        if (isAuth && normalized.line2) {
            content += `<div class="dept-name slot-line2">${escapeHtml(normalized.line2)}</div>`;
        }
        return `<td class="${getCourtCellClass(normalized)}">${content}</td>`;
    }

    const content = normalizedList.map((normalized) => {
        let block = `<div class="slot-line1">${escapeHtml(normalized.line1)}</div>`;
        if (isAuth && normalized.line2) {
            block += `<div class="dept-name slot-line2">${escapeHtml(normalized.line2)}</div>`;
        }
        return `<div class="court-slot-entry">${block}</div>`;
    }).join('');

    return `<td class="${getCourtCellClass(normalizedList)}">${content}</td>`;
}

async function loadCourtStatus() {
    const current = getMonthData(0);
    const next = getMonthData(1);

    const labelCur = document.getElementById('label-current-month');
    const labelNext = document.getElementById('label-next-month');
    if (labelCur) labelCur.innerText = current.label;
    if (labelNext) labelNext.innerText = next.label;

    await fetchAndDisplayCourt(current.id, 'display-current');
    await fetchAndDisplayCourt(next.id, 'display-next');
    
    // 恢復該 Session 記住的子分頁
    const savedTab = sessionStorage.getItem('vbt_court_tab') || 'current';
    switchCourtTab(savedTab);
    
    updateCourtEditButton();
    renderPracticeMenuBoard();
}

async function deleteCourtOnlyMonth(monthId) {
    if (!monthId) return;
    if (!confirm(`確定要刪除 ${monthId} 的場地狀態資料嗎？投籤紀錄會保留。`)) return;
    try {
        const response = await fetch(`/api/court_status/${monthId}?scope=court`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '刪除場地狀態資料失敗。');
            return;
        }
        await loadCourtStatus();
        if (typeof loadLotteryDashboard === 'function') await loadLotteryDashboard();
        if (typeof loadLotteryMonthHistory === 'function') await loadLotteryMonthHistory();
    } catch (error) {
        console.error('Failed to delete court-only month', error);
        alert('刪除場地狀態資料失敗。');
    }
}

async function deleteBidOnlyMonth(monthId) {
    if (!monthId) return;
    if (!confirm(`確定要刪除 ${monthId} 的投籤資料嗎？場地狀態會保留。`)) return;
    try {
        const response = await fetch(`/api/lottery_bids/${monthId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || '刪除投籤資料失敗。');
            return;
        }
        await loadCourtStatus();
        if (typeof loadLotteryDashboard === 'function') await loadLotteryDashboard();
        if (typeof loadLotteryMonthHistory === 'function') await loadLotteryMonthHistory();
    } catch (error) {
        console.error('Failed to delete bid-only month', error);
        alert('刪除投籤資料失敗。');
    }
}

function transformCourtData(rawData) {
    if (!Array.isArray(rawData)) return [];
    if (rawData.length === 0) return [];

    if (rawData[0].slot1 !== undefined && typeof rawData[0].slot1 === 'object') {
        return rawData.map(normalizeCourtRow);
    }

    if ('slot1_court' in rawData[0] || 'slot1_name' in rawData[0]) {
        return rawData.map(row => ({
            date: row.date || row.Date,
            slot1: normalizeCourtSlot((row.slot1_court || row.slot1_name) ? {
                line1: row.slot1_court || row.slot1_name,
                line2: row.slot1_dept || '',
                color: 'yellow'
            } : null),
            slot2: normalizeCourtSlot((row.slot2_court || row.slot2_name) ? {
                line1: row.slot2_court || row.slot2_name,
                line2: row.slot2_dept || '',
                color: 'yellow'
            } : null)
        }));
    }

    const grouped = {};
    rawData.forEach(item => {
        const d = normalizeCourtDateValue(item.date || item.Date);
        if (!d) return;

        if (!grouped[d]) {
            grouped[d] = { date: d, slot1: [], slot2: [] };
        }

        const time = (item.time || item.Time || '').toString();
        const court = item.court || item.Court || item.court_name || '';
        const dept = item.dept || item.Dept || item.department || item['Booked By'] || '';
        if (!court) return;

        const courtInfo = normalizeCourtSlot({
            line1: court,
            line2: dept,
            color: 'yellow'
        });

        if (time.includes('18') || time.includes('19')) {
            const exists = grouped[d].slot1.some((item) => item.line1 === courtInfo.line1 && item.line2 === courtInfo.line2 && item.color === courtInfo.color);
            if (!exists) grouped[d].slot1.push(courtInfo);
        } else if (time.includes('20') || time.includes('21')) {
            const exists = grouped[d].slot2.some((item) => item.line1 === courtInfo.line1 && item.line2 === courtInfo.line2 && item.color === courtInfo.color);
            if (!exists) grouped[d].slot2.push(courtInfo);
        }
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchAndDisplayCourt(monthId, elementId) {
    try {
        const response = await fetch(`/api/court_status/${monthId}`);
        const responseData = await response.json();
        let rawData = responseData.drawresult || responseData.data || responseData;

        if (rawData.content && typeof rawData.content === 'string') {
            try { rawData = JSON.parse(rawData.content); } catch (e) {}
        } else if (typeof rawData === 'string') {
            try { rawData = JSON.parse(rawData); } catch (e) {}
        }

        const formattedData = transformCourtData(rawData);
        console.log(`[court_status] ${monthId}`, {
            rawCount: Array.isArray(rawData) ? rawData.length : 0,
            formattedCount: formattedData.length,
            sample: formattedData.slice(0, 3)
        });
        const completedData = buildCourtCalendarRowsWithWeekdays(monthId, formattedData, getDefaultCourtWeekdays());
        setCourtCache(monthId, completedData);
        renderCourtTable(monthId, elementId);
    } catch (error) {
        console.error(`Failed to load court status for ${monthId}`, error);
        const displayDiv = document.getElementById(elementId);
        if (displayDiv) displayDiv.innerHTML = '<p style="color:red; text-align:center;">載入資料失敗。</p>';
    }
}

function renderCourtTable(monthId, containerId) {
    const role = localStorage.getItem('vbt_role');
    const isAuth = role === 'member' || role === 'captain';
    const isEditing = courtEditState.active && courtEditState.monthId === monthId;
    const tableData = getCourtDraftRows(monthId, true);
    const monthData = getCourtMonthDataById(monthId);

    let html = '';

    html += `
        <div class="court-controls court-controls--wrap">
            <div class="court-controls__actions">
                ${isAuth && isEditing ? `
                    <button class="court-btn" onclick="saveCourtStatus()">儲存表格</button>
                    <button class="court-btn" onclick="toggleEditMode(false)">取消編輯</button>
                ` : `
                    ${isAuth ? '<button class="court-btn" onclick="toggleNames()">隱藏 / 顯示名稱</button>' : ''}
                    <button class="court-btn" onclick="downloadCourtTableAsPng('${monthId}')">下載 PNG</button>
                `}
            </div>
            ${!isEditing ? renderCourtDateFilterControls(monthId) : ''}
        </div>
    `;

    html += `
        <div class="court-dashboard-container" data-court-month="${monthId}">
            <div class="court-export-title">場地狀態 ${monthData.id}</div>
            <table class="court-table">
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>18:00 - 20:00</th>
                        <th>20:00 - 22:00</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (tableData.length === 0) {
        const emptyMessage = getCourtIncludedDates(monthId).length > 0 ? '目前沒有符合指定日期的場地資料。' : '目前沒有場地資料。';
        html += `<tr><td colspan="3" style="color:#999; padding: 20px;">${emptyMessage}</td></tr>`;
    } else {
        tableData.forEach((row) => {
            html += `<tr><td><strong>${row.date}</strong></td>`;
            html += isEditing
                ? renderCourtSlotEditor(row.slot1, row.date, 'slot1')
                : renderCourtSlotDisplay(row.slot1, isAuth);
            html += isEditing
                ? renderCourtSlotEditor(row.slot2, row.date, 'slot2')
                : renderCourtSlotDisplay(row.slot2, isAuth);
            html += `</tr>`;
        });
    }

    html += `</tbody></table></div>`;

    const displayDiv = document.getElementById(containerId);
    if (displayDiv) displayDiv.innerHTML = html;
}

function toggleNames() {
    const names = document.querySelectorAll('.slot-line2');
    names.forEach(name => {
        name.style.display = name.style.display === 'none' ? 'block' : 'none';
    });
}

function switchCourtTab(tabType) {
    activeCourtTab = tabType;
    sessionStorage.setItem('vbt_court_tab', tabType);
    
    document.getElementById('tab-current').classList.remove('active');
    document.getElementById('tab-next').classList.remove('active');
    document.getElementById(`tab-${tabType}`).classList.add('active');

    document.getElementById('display-current').style.display = tabType === 'current' ? 'block' : 'none';
    document.getElementById('display-next').style.display = tabType === 'next' ? 'block' : 'none';
    updateCourtEditButton();
}

function toggleEditMode(forceState) {
    const monthId = getActiveCourtMonthId();
    const shouldEnable = typeof forceState === 'boolean'
        ? forceState
        : !(courtEditState.active && courtEditState.monthId === monthId);

    if (shouldEnable) {
        courtEditState.active = true;
        courtEditState.monthId = monthId;
        courtEditState.draftRows = cloneCourtRows(getCourtRowsForMonth(monthId, false));
    } else {
        courtEditState.active = false;
        courtEditState.monthId = null;
        courtEditState.draftRows = [];
    }

    refreshCourtTableByMonth(monthId);
    updateCourtEditButton();
}

async function saveCourtStatus() {
    if (!courtEditState.active || !courtEditState.monthId) return;

    const monthId = courtEditState.monthId;
    const sanitizedRows = courtEditState.draftRows.map(normalizeCourtRow);

    try {
        const response = await fetch('/api/court_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                month_id: monthId,
                content: JSON.stringify(sanitizedRows)
            })
        });

        if (response.ok) {
            setCourtCache(monthId, sanitizedRows);
            courtEditState.active = false;
            courtEditState.monthId = null;
            courtEditState.draftRows = [];
            refreshCourtTableByMonth(monthId);
            updateCourtEditButton();
            alert(`${monthId} 的場地狀態已成功儲存。`);
        }
    } catch (error) {
        console.error('Error saving court status', error);
    }
}

function updateCourtCell(rowDate, slotKey, field, value) {
    if (!courtEditState.active) return;

    const row = courtEditState.draftRows.find(item => item.date === rowDate);
    if (!row) return;

    const currentSlotSource = Array.isArray(row[slotKey]) ? row[slotKey][0] : row[slotKey];
    const currentSlot = normalizeCourtSlot(currentSlotSource) || {
        line1: '',
        line2: '',
        color: 'none'
    };

    currentSlot[field] = value;
    row[slotKey] = normalizeCourtSlot(currentSlot);
}

function updateCourtSlotEntry(rowDate, slotKey, index, field, value) {
    if (!courtEditState.active) return;

    const row = courtEditState.draftRows.find((item) => item.date === rowDate);
    if (!row) return;

    const slotList = getEditableCourtSlotList(row[slotKey]);
    while (slotList.length <= index) {
        slotList.push({ line1: '', line2: '', color: 'none' });
    }

    const nextEntry = normalizeCourtSlot(slotList[index]) || { line1: '', line2: '', color: 'none' };
    nextEntry[field] = value;
    slotList[index] = nextEntry;
    row[slotKey] = slotList;
}

function addCourtSlotEntry(rowDate, slotKey) {
    if (!courtEditState.active) return;

    const row = courtEditState.draftRows.find((item) => item.date === rowDate);
    if (!row) return;

    const slotList = getEditableCourtSlotList(row[slotKey]);
    slotList.push({ line1: '', line2: '', color: 'none' });
    row[slotKey] = slotList;
    refreshCourtTableByMonth(courtEditState.monthId);
}

function removeCourtSlotEntry(rowDate, slotKey, index) {
    if (!courtEditState.active) return;

    const row = courtEditState.draftRows.find((item) => item.date === rowDate);
    if (!row) return;

    const slotList = getEditableCourtSlotList(row[slotKey]);
    if (index < 0 || index >= slotList.length) return;
    slotList.splice(index, 1);
    row[slotKey] = slotList;
    refreshCourtTableByMonth(courtEditState.monthId);
}

function renderCourtSlotEditor(slotData, rowDate, slotKey) {
    const slotList = getEditableCourtSlotList(slotData);
    const editableSlots = slotList.length > 0 ? slotList : [{ line1: '', line2: '', color: 'none' }];
    const editorRows = editableSlots.map((slot, index) => {
        const normalized = normalizeCourtSlot(slot) || { line1: '', line2: '', color: 'none' };
        return `
            <div class="court-edit-slot-row">
                <div class="court-edit-slot-row__header">
                    <strong>場次 ${index + 1}</strong>
                    <button class="court-btn court-btn--ghost court-btn--sm" type="button" onclick="removeCourtSlotEntry('${rowDate}', '${slotKey}', ${index})">刪除</button>
                </div>
                <div class="court-edit-field">
                    <label>顏色</label>
                    <select onchange="updateCourtSlotEntry('${rowDate}', '${slotKey}', ${index}, 'color', this.value)">
                        <option value="none" ${normalized.color === 'none' ? 'selected' : ''}>無色</option>
                        <option value="yellow" ${normalized.color === 'yellow' ? 'selected' : ''}>黃色</option>
                        <option value="blue" ${normalized.color === 'blue' ? 'selected' : ''}>藍色</option>
                    </select>
                </div>
                <div class="court-edit-field">
                    <label>第一行</label>
                    <input type="text" value="${escapeHtml(normalized.line1)}" placeholder="場 4, 5, 6, 7" oninput="updateCourtSlotEntry('${rowDate}', '${slotKey}', ${index}, 'line1', this.value)">
                </div>
                <div class="court-edit-field">
                    <label>第二行</label>
                    <input type="text" value="${escapeHtml(normalized.line2)}" placeholder="預約系所或紀錄" oninput="updateCourtSlotEntry('${rowDate}', '${slotKey}', ${index}, 'line2', this.value)">
                </div>
            </div>
        `;
    }).join('');

    return `
        <td class="${getCourtCellClass(slotList)} court-edit-cell">
            <div class="court-edit-slot-list">
                ${editorRows}
            </div>
            <div class="court-edit-actions">
                <button class="court-btn court-btn--ghost court-btn--sm" type="button" onclick="addCourtSlotEntry('${rowDate}', '${slotKey}')">+ 新增場</button>
            </div>
        </td>
    `;
}

async function downloadCourtTableAsPng(monthId) {
    const target = document.querySelector(`.court-dashboard-container[data-court-month="${monthId}"]`);
    if (!target) return;

    if (typeof html2canvas !== 'function') {
        alert('下載為 PNG 需要載入 html2canvas。');
        return;
    }

    try {
        const canvas = await captureFixedSizePngCanvas(target, {
            width: 1000,
            backgroundColor: null,
        });

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `court-status-${monthId}.png`;
        link.click();
    } catch (error) {
        console.error('Failed to export court table as PNG', error);
        alert('匯出 PNG 失敗，請再試一次。');
    }
}

async function captureFixedSizePngCanvas(target, options = {}) {
    if (!target || typeof html2canvas !== 'function') {
        throw new Error('html2canvas is not available');
    }

    const exportWidth = Math.max(320, Number(options.width) || 1000);
    const backgroundColor = Object.prototype.hasOwnProperty.call(options, 'backgroundColor')
        ? options.backgroundColor
        : '#ffffff';

    const cloneWrapper = document.createElement('div');
    cloneWrapper.style.position = 'fixed';
    cloneWrapper.style.left = '-100000px';
    cloneWrapper.style.top = '0';
    cloneWrapper.style.width = `${exportWidth}px`;
    cloneWrapper.style.maxWidth = `${exportWidth}px`;
    cloneWrapper.style.padding = '0';
    cloneWrapper.style.margin = '0';
    cloneWrapper.style.background = backgroundColor || 'transparent';
    cloneWrapper.style.zIndex = '-1';

    const clone = target.cloneNode(true);
    if (options.cloneClassName) {
        clone.classList.add(options.cloneClassName);
    }
    clone.style.width = `${exportWidth}px`;
    clone.style.maxWidth = `${exportWidth}px`;
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.querySelectorAll('*').forEach((element) => {
        element.style.animation = 'none';
        element.style.transition = 'none';
    });

    cloneWrapper.appendChild(clone);
    document.body.appendChild(cloneWrapper);

    try {
        return await html2canvas(clone, {
            backgroundColor,
            scale: 2,
            useCORS: true,
            width: exportWidth,
            windowWidth: exportWidth,
            scrollX: 0,
            scrollY: 0,
        });
    } finally {
        cloneWrapper.remove();
    }
}

async function downloadPracticeMenuBoardAsPng() {
    const target = document.querySelector('[data-practice-menu-export="true"]');
    if (!target) return;

    if (typeof html2canvas !== 'function') {
        alert('截圖功能尚未載入完成。');
        return;
    }

    const nextPractice = getNextPracticeInfo(menuState.practiceMenu.weekdays || []);
    const filenameDate = normalizeCourtDateValue(nextPractice.date) || menuState.practiceMenu.updated_at || 'practice-menu';

    try {
        const canvas = await captureFixedSizePngCanvas(target, {
            width: 430,
            backgroundColor: '#ffffff',
            cloneClassName: 'capture-mobile-menu',
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `practice-menu-${filenameDate}.png`;
        link.click();
    } catch (error) {
        console.error('Failed to export practice menu as PNG', error);
        alert('匯出 PNG 失敗，請再試一次。');
    }
}

async function executeScraper(buttonEl) {
    const startEl = document.getElementById('config-start');
    const endEl = document.getElementById('config-end');
    const ignoreEl = document.getElementById('config-ignore-res');
    const swapInEl = document.getElementById('config-swap-in');
    const swapOutEl = document.getElementById('config-swap-out');

    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';
    const ignoreRes = ignoreEl ? ignoreEl.checked : false;
    const monthId = startDate ? startDate.substring(0, 7) : '';

    const swapInRaw = swapInEl ? swapInEl.value : '';
    const swapOutRaw = swapOutEl ? swapOutEl.value : '';
    const swapIn = swapInRaw ? swapInRaw.split(',').map(s => s.trim()) : [];
    const swapOut = swapOutRaw ? swapOutRaw.split(',').map(s => s.trim()) : [];

    if (!startDate || !endDate) {
        alert('\u8acb\u5148\u8a2d\u5b9a\u958b\u59cb\u8207\u7d50\u675f\u65e5\u671f\u3002');
        return;
    }

    if (!confirm(`\u78ba\u5b9a\u8981\u57f7\u884c ${startDate} \u5230 ${endDate} \u7684\u722c\u87f2\u55ce\uff1f`)) return;

    await withButtonLoading(buttonEl, '\u722c\u53d6\u4e2d', async () => {
        try {
            const response = await fetch('/api/trigger_scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month_id: monthId,
                    start_date: startDate,
                    end_date: endDate,
                    ignore_reservation: ignoreRes,
                    swap_in: swapIn,
                    swap_out: swapOut
                })
            });

            await response.json();
            await pollScrapeStatus(monthId);
        } catch (error) {
            console.error('Error triggering scraper', error);
            alert('\u57f7\u884c\u722c\u87f2\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002');
        }
    });
}

async function pollScrapeStatus(targetMonth, maxAttempts = 20) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            const response = await fetch('/api/scrape_status');
            const data = await response.json();

            if (data.target_month && targetMonth && data.target_month !== targetMonth) {
                continue;
            }

            if (data.status === 'error') {
                alert(data.message || '系統拒絕存取。請登入台大場地系統後，再試著重新爬取。');
                return;
            }

            if (data.status === 'warning') {
                alert(data.message || '爬蟲未成功更新最新資料，已先顯示舊資料。');
                await loadCourtStatus();
                return;
            }

            if (data.status === 'success') {
                await loadCourtStatus();
                return;
            }
        } catch (error) {
            console.error('Error polling scrape status', error);
            alert('查詢爬蟲狀態失敗，請稍後重新整理頁面。');
            return;
        }
    }

    alert('爬蟲等待逾時，目前仍未收到完成通知。請稍後重新整理，或再試一次。');
}

function fillScrapeDateRange(monthOffset) {
    const today = getBaseAppDate();
    const rangeStart = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const rangeEnd = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0);

    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    document.getElementById('config-start').value = formatDate(rangeStart);
    document.getElementById('config-end').value = formatDate(rangeEnd);
}

function scrapeThisMonth() {
    fillScrapeDateRange(0);
}

function scrapeNextMonth() {
    fillScrapeDateRange(1);
}


const LOTTERY_WEEKDAY_KEY = 'vbt_lottery_weekdays';
const PROBABILITY_WEEKDAY_KEY = 'vbt_probability_weekdays';
const STRATEGY_WEEKDAY_KEY = 'vbt_strategy_weekdays';
const PROBABILITY_COURT_KEY = 'vbt_probability_courts';
const STRATEGY_COURT_KEY = 'vbt_strategy_courts';
const STRATEGY_INCLUDE_DATES_KEY = 'vbt_strategy_include_dates';
const STRATEGY_EXCLUDE_DATES_KEY = 'vbt_strategy_exclude_dates';
const PROBABILITY_START_MONTH_KEY = 'vbt_probability_start_month';
const PROBABILITY_END_MONTH_KEY = 'vbt_probability_end_month';
const STRATEGY_TICKET_BUDGET_KEY = 'vbt_strategy_ticket_budget';
const STRATEGY_WEIGHT_RATIO_KEY = 'vbt_strategy_weight_ratio';
const ACCOUNT_PLAN_STORAGE_PREFIX = 'vbt_account_plan_draft';
const ACCOUNT_PLAN_WEEKDAY_KEY = 'vbt_account_plan_weekdays';
const ACCOUNT_PLAN_MONTH_KEY = 'vbt_account_plan_month';
const LOTTERY_COURTS = ['Court 4', 'Court 5', 'Court 6', 'Court 7'];
const LOTTERY_WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
const LOTTERY_ACCOUNT_NAMES = ['A', 'B', 'C', 'D', 'E'];
const lotteryBidsCache = {};
const lotteryEditState = {
    active: false,
    monthId: null,
    draftRows: []
};
let activeLotteryTab = 'current';
let activeProbabilityTab = 'selected';
let activeStrategyTab = 'selected';
let lotterySelectedMonthId = getMonthData(0).id;
let lotteryDashboardAbortController = null;
let latestLotteryDashboardData = null;
const strategyPlanDrafts = {
    selected: null,
    all: null,
};

function cloneJson(value) {
    return value ? JSON.parse(JSON.stringify(value)) : null;
}

function getStrategyDraftKey(tabKey = activeStrategyTab) {
    return tabKey === 'all' ? 'all' : 'selected';
}

function createStrategyPoolKey(pool) {
    return String(pool?.pool_id || `${pool?.date || ''}|${pool?.time || ''}|${pool?.court || ''}`);
}

function getPoolPredictiveWinProbability(pool, tickets) {
    const normalizedTickets = Math.max(0, Math.min(5, Number.parseInt(tickets, 10) || 0));
    if (normalizedTickets <= 0) return 0;
    const predictiveMap = pool?.predictive_win_probability_by_tickets || {};
    return Number(predictiveMap[String(normalizedTickets)] || 0);
}

function initializeStrategyPlanDrafts() {
    strategyPlanDrafts.selected = cloneJson(latestLotteryDashboardData?.strategy?.selected);
    strategyPlanDrafts.all = cloneJson(latestLotteryDashboardData?.strategy?.all_time);
}

function getStrategyPlanDraft(tabKey = activeStrategyTab) {
    return strategyPlanDrafts[getStrategyDraftKey(tabKey)];
}

function renderStrategyPanelByTab(tabKey = activeStrategyTab) {
    const normalizedTabKey = getStrategyDraftKey(tabKey);
    const panelId = normalizedTabKey === 'all' ? 'strategy-all-panel' : 'strategy-selected-panel';
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const summaryLabel = normalizedTabKey === 'all'
        ? `目標月份：${latestLotteryDashboardData?.strategy?.target_month || getMonthData(1).id} ｜ 全部歷史：${(latestLotteryDashboardData?.all_time?.months_used || []).join(', ') || '無'}`
        : `目標月份：${latestLotteryDashboardData?.strategy?.target_month || getMonthData(1).id} ｜ 所選區間：${(latestLotteryDashboardData?.selected?.months_used || []).join(', ') || '無'}`;
    panel.innerHTML = renderStrategyTable(getStrategyPlanDraft(normalizedTabKey), summaryLabel, normalizedTabKey);
}

function updateStrategyRecommendedTickets(tabKey, poolKey, value) {
    const plan = getStrategyPlanDraft(tabKey);
    if (!plan || !Array.isArray(plan.candidate_pools)) return;
    const pool = plan.candidate_pools.find((item) => createStrategyPoolKey(item) === String(poolKey));
    if (!pool) return;

    const nextTickets = Math.max(0, Math.min(5, Number.parseInt(value, 10) || 0));
    pool.recommended_tickets = nextTickets;
    pool.recommended_win_probability = Math.round(getPoolPredictiveWinProbability(pool, nextTickets) * 10) / 10;

    renderStrategyPanelByTab(tabKey);
}

function initCheckboxFilter(selector, storageKey, defaultValues, valueGetter, onChange) {
    const checkboxes = document.querySelectorAll(selector);
    if (checkboxes.length === 0) return;

    let selectedValues = defaultValues;
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            selectedValues = saved;
        }
    } catch (error) {
        console.warn(`Failed to parse ${storageKey}`, error);
    }

    checkboxes.forEach((checkbox) => {
        const value = valueGetter(checkbox);
        checkbox.checked = selectedValues.includes(value);
        checkbox.addEventListener('change', () => {
            const selected = Array.from(checkboxes)
                .filter((item) => item.checked)
                .map((item) => valueGetter(item));

            if (selected.length === 0) {
                checkbox.checked = true;
                return;
            }

            localStorage.setItem(storageKey, JSON.stringify(selected));
            onChange();
        });
    });
}

function getStoredCheckboxValues(selector, storageKey, defaultValues, valueGetter) {
    const checkboxes = document.querySelectorAll(selector);
    if (checkboxes.length > 0) {
        const selected = Array.from(checkboxes)
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => valueGetter(checkbox));
        return selected.length > 0 ? selected : defaultValues;
    }

    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(saved) && saved.length > 0) {
            return saved;
        }
    } catch (error) {
        console.warn(`Failed to read ${storageKey}`, error);
    }

    return defaultValues;
}

function getDefaultLotteryWeekdays() {
    return [0, 1, 2, 3, 4, 5, 6];
}

function getDefaultStrategyWeekdays() {
    return [0, 1, 2, 3, 4, 5, 6];
}

function getSelectedLotteryWeekdays() {
    return getStoredCheckboxValues('[data-lottery-weekday]', LOTTERY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.lotteryWeekday));
}

function getSelectedProbabilityWeekdays() {
    return getStoredCheckboxValues('[data-probability-weekday]', PROBABILITY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.probabilityWeekday));
}

function getSelectedStrategyWeekdays() {
    return getStoredCheckboxValues('[data-strategy-weekday]', STRATEGY_WEEKDAY_KEY, getDefaultStrategyWeekdays(), (checkbox) => Number(checkbox.dataset.strategyWeekday));
}

function getSelectedProbabilityCourts() {
    return getStoredCheckboxValues('[data-probability-court]', PROBABILITY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.probabilityCourt);
}

function getSelectedStrategyCourts() {
    return getStoredCheckboxValues('[data-strategy-court]', STRATEGY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.strategyCourt);
}

function getSelectedAccountPlanWeekdays() {
    return getStoredCheckboxValues('[data-account-plan-weekday]', ACCOUNT_PLAN_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.accountPlanWeekday));
}

function getSelectedAccountPlanMonth() {
    const savedMonth = normalizeMonthString(localStorage.getItem(ACCOUNT_PLAN_MONTH_KEY) || '');
    return savedMonth || getMonthData(1).id;
}

function setSelectedAccountPlanMonth(monthId) {
    const normalized = normalizeMonthString(monthId);
    if (!normalized) return;
    localStorage.setItem(ACCOUNT_PLAN_MONTH_KEY, normalized);
}

function readStoredDateList(storageKey) {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!Array.isArray(saved)) return [];
        return saved
            .map((value) => normalizeCourtDateValue(value))
            .filter(Boolean)
            .filter((value, index, array) => array.indexOf(value) === index)
            .sort();
    } catch (error) {
        console.warn(`Failed to read ${storageKey}`, error);
        return [];
    }
}

function getStrategyIncludedDates() {
    return readStoredDateList(STRATEGY_INCLUDE_DATES_KEY);
}

function getStrategyExcludedDates() {
    return readStoredDateList(STRATEGY_EXCLUDE_DATES_KEY);
}

function saveStrategyDateList(storageKey, values) {
    localStorage.setItem(storageKey, JSON.stringify(values));
}

function renderStrategyDateTags(containerId, values, mode) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!Array.isArray(values) || values.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = values.map((dateValue) => `
        <span class="strategy-date-tag${mode === 'exclude' ? ' strategy-date-tag--exclude' : ''}">
            <span>${escapeHtml(dateValue)}</span>
            <button type="button" onclick="removeStrategyDate('${mode}', '${dateValue}')">&times;</button>
        </span>
    `).join('');
}

function renderStrategyDateFilters() {
    renderStrategyDateTags('strategy-include-dates', getStrategyIncludedDates(), 'include');
    renderStrategyDateTags('strategy-exclude-dates', getStrategyExcludedDates(), 'exclude');
}

function addStrategyDate(mode) {
    const picker = document.getElementById('strategy-date-picker');
    const normalizedDate = normalizeCourtDateValue(picker ? picker.value : '');
    if (!normalizedDate) {
        alert('請先選擇日期。');
        return;
    }

    const targetKey = mode === 'exclude' ? STRATEGY_EXCLUDE_DATES_KEY : STRATEGY_INCLUDE_DATES_KEY;
    const otherKey = mode === 'exclude' ? STRATEGY_INCLUDE_DATES_KEY : STRATEGY_EXCLUDE_DATES_KEY;
    const nextValues = Array.from(new Set([...readStoredDateList(targetKey), normalizedDate])).sort();
    const nextOtherValues = readStoredDateList(otherKey).filter((value) => value !== normalizedDate);

    saveStrategyDateList(targetKey, nextValues);
    saveStrategyDateList(otherKey, nextOtherValues);
    renderStrategyDateFilters();
    loadLotteryDashboard();
}

function removeStrategyDate(mode, dateValue) {
    const storageKey = mode === 'exclude' ? STRATEGY_EXCLUDE_DATES_KEY : STRATEGY_INCLUDE_DATES_KEY;
    const nextValues = readStoredDateList(storageKey).filter((value) => value !== dateValue);
    saveStrategyDateList(storageKey, nextValues);
    renderStrategyDateFilters();
    loadLotteryDashboard();
}

function lotteryWeekdayIndex(dateValue) {
    const jsDay = new Date(`${dateValue}T00:00:00`).getDay();
    return (jsDay + 6) % 7;
}

function initLotteryWeekdayFilters() {
    initCheckboxFilter('[data-lottery-weekday]', LOTTERY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.lotteryWeekday), () => {
        loadLotteryBids();
        loadLotteryDashboard();
    });
    initCheckboxFilter('[data-probability-weekday]', PROBABILITY_WEEKDAY_KEY, getDefaultLotteryWeekdays(), (checkbox) => Number(checkbox.dataset.probabilityWeekday), loadLotteryDashboard);
    initCheckboxFilter('[data-strategy-weekday]', STRATEGY_WEEKDAY_KEY, getDefaultStrategyWeekdays(), (checkbox) => Number(checkbox.dataset.strategyWeekday), loadLotteryDashboard);
    initCheckboxFilter('[data-probability-court]', PROBABILITY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.probabilityCourt, loadLotteryDashboard);
    initCheckboxFilter('[data-strategy-court]', STRATEGY_COURT_KEY, LOTTERY_COURTS, (checkbox) => checkbox.dataset.strategyCourt, loadLotteryDashboard);
    renderStrategyDateFilters();
}

function normalizeLotterySlot(slotData) {
    const normalized = {};
    LOTTERY_COURTS.forEach((court) => {
        const rawValue = slotData && Object.prototype.hasOwnProperty.call(slotData, court) ? slotData[court] : 0;
        normalized[court] = Math.max(0, Math.min(5, Number.parseInt(rawValue, 10) || 0));
    });
    return normalized;
}

function normalizeLotteryRow(row) {
    const normalizedDate = normalizeCourtDateValue(row.date);
    
    const dateObj = new Date(normalizedDate);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekdayStr = weekdays[dateObj.getDay()];

    return {
        date: normalizedDate,
        weekday: weekdayStr,
        slot1: normalizeLotterySlot(row.slot1 || {}),
        slot2: normalizeLotterySlot(row.slot2 || {})
    };
}

function cloneLotteryRows(rows) {
    return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
}

function getAccountPlanStorageKey(monthId) {
    return `${ACCOUNT_PLAN_STORAGE_PREFIX}:${monthId}`;
}

function buildZeroLotteryRows(monthId) {
    const [year, month] = monthId.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const rows = [];
    for (let day = 1; day <= lastDay; day++) {
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        rows.push({
            date: dateKey,
            weekday: LOTTERY_WEEKDAY_NAMES[lotteryWeekdayIndex(dateKey)],
            slot1: normalizeLotterySlot({}),
            slot2: normalizeLotterySlot({}),
        });
    }
    return rows;
}

function getStoredAccountPlanRows(monthId) {
    const storageKey = getAccountPlanStorageKey(monthId);
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!Array.isArray(saved) || saved.length === 0) return buildZeroLotteryRows(monthId);
        const normalizedMap = new Map(saved.map((row) => {
            const normalized = normalizeLotteryRow(row);
            return [normalized.date, normalized];
        }));
        return buildZeroLotteryRows(monthId).map((row) => normalizedMap.get(row.date) || row);
    } catch (error) {
        console.warn(`Failed to read account plan rows for ${monthId}`, error);
        return buildZeroLotteryRows(monthId);
    }
}

function saveAccountPlanRows(monthId, rows) {
    const storageKey = getAccountPlanStorageKey(monthId);
    localStorage.setItem(storageKey, JSON.stringify(rows.map(normalizeLotteryRow)));
}

function updateAccountPlanCell(monthId, rowDate, slotKey, court, value) {
    const rows = getStoredAccountPlanRows(monthId);
    const normalizedDate = normalizeCourtDateValue(rowDate);
    const row = rows.find((item) => item.date === normalizedDate);
    if (!row) return;
    row[slotKey] = normalizeLotterySlot(row[slotKey] || {});
    row[slotKey][court] = Math.max(0, Math.min(5, Number.parseInt(value, 10) || 0));
    saveAccountPlanRows(monthId, rows);
    renderIndependentAccountPlanSection();
}

function clearAccountPlanRows(monthId) {
    saveAccountPlanRows(monthId, buildZeroLotteryRows(monthId));
    renderIndependentAccountPlanSection();
}

function buildRowsFromStrategyPlan(strategyPlan, monthId) {
    const rows = buildZeroLotteryRows(monthId);
    const rowMap = new Map(rows.map((row) => [row.date, row]));
    (strategyPlan?.candidate_pools || []).forEach((pool) => {
        const row = rowMap.get(pool.date);
        if (!row) return;
        const slotKey = pool.time === '18:00-20:00' ? 'slot1' : 'slot2';
        row[slotKey][pool.court] = Math.max(0, Math.min(5, Number.parseInt(pool.recommended_tickets || 0, 10) || 0));
    });
    return rows;
}

function importStrategyToAccountPlan() {
    const monthId = latestLotteryDashboardData?.strategy?.target_month || getMonthData(1).id;
    const strategyPlan = getStrategyPlanDraft(activeStrategyTab);
    if (!strategyPlan || !Array.isArray(strategyPlan.candidate_pools)) {
        alert('目前還沒有可帶入的策略分析結果。');
        return;
    }
    setSelectedAccountPlanMonth(monthId);
    saveAccountPlanRows(monthId, buildRowsFromStrategyPlan(strategyPlan, monthId));
    renderIndependentAccountPlanSection();
}

function buildAccountAssignmentsFromRows(rows) {
    const accountState = LOTTERY_ACCOUNT_NAMES.map((account) => ({
        account,
        ticketsUsed: 0,
        assignments: [],
        slotCounts: {},
        courtCounts: {},
    }));
    const requests = [];
    (rows || []).forEach((row) => {
        const normalized = normalizeLotteryRow(row);
        [
            ['slot1', '18:00-20:00'],
            ['slot2', '20:00-22:00'],
        ].forEach(([slotKey, timeLabel]) => {
            LOTTERY_COURTS.forEach((court) => {
                const tickets = normalized[slotKey]?.[court] || 0;
                if (tickets > 0) {
                    requests.push({
                        date: normalized.date,
                        weekday: normalized.weekday,
                        time: timeLabel,
                        court,
                        tickets,
                    });
                }
            });
        });
    });

    requests.sort((a, b) => b.tickets - a.tickets || a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || LOTTERY_COURTS.indexOf(a.court) - LOTTERY_COURTS.indexOf(b.court));
    const unassigned = [];

    requests.forEach((request) => {
        const slotKey = `${request.date}|${request.time}`;
        const courtKey = request.court;
        const eligible = accountState
            .filter((account) => account.ticketsUsed < 10)
            .sort((a, b) =>
                (b.courtCounts[courtKey] || 0) - (a.courtCounts[courtKey] || 0)
                || (a.slotCounts[slotKey] || 0) - (b.slotCounts[slotKey] || 0)
                || a.ticketsUsed - b.ticketsUsed
                || a.account.localeCompare(b.account)
            );
        const assigned = eligible.slice(0, request.tickets);
        assigned.forEach((account) => {
            account.ticketsUsed += 1;
            account.slotCounts[slotKey] = (account.slotCounts[slotKey] || 0) + 1;
            account.courtCounts[courtKey] = (account.courtCounts[courtKey] || 0) + 1;
            account.assignments.push({
                date: request.date,
                weekday: request.weekday,
                time: request.time,
                court: request.court,
            });
        });
        if (assigned.length < request.tickets) {
            unassigned.push({
                ...request,
                unassignedCount: request.tickets - assigned.length,
            });
        }
    });

    accountState.forEach((account) => {
        account.assignments.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || LOTTERY_COURTS.indexOf(a.court) - LOTTERY_COURTS.indexOf(b.court));
    });

    return { accounts: accountState, unassigned };
}

function toggleAccountPlanWeekday(value) {
    const weekdayValue = Number.parseInt(value, 10);
    if (!Number.isFinite(weekdayValue)) return;
    const current = new Set(getSelectedAccountPlanWeekdays());
    if (current.has(weekdayValue)) {
        if (current.size === 1) return;
        current.delete(weekdayValue);
    } else {
        current.add(weekdayValue);
    }
    localStorage.setItem(ACCOUNT_PLAN_WEEKDAY_KEY, JSON.stringify(Array.from(current).sort((a, b) => a - b)));
    renderIndependentAccountPlanSection();
}

function updateAccountPlanMonth(value) {
    const normalized = normalizeMonthString(value);
    if (!normalized) return;
    setSelectedAccountPlanMonth(normalized);
    renderIndependentAccountPlanSection();
}

function formatLotteryDateLabel(dateValue) {
    return `${dateValue} (${LOTTERY_WEEKDAY_NAMES[lotteryWeekdayIndex(dateValue)]})`;
}

function buildLotteryCalendarRowsWithWeekdays(monthId, data, weekdays) {
    const selectedWeekdays = new Set(weekdays);
    const [year, month] = monthId.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dataMap = new Map();

    (Array.isArray(data) ? data : []).forEach((row) => {
        const normalizedDate = normalizeCourtDateValue(row.date);
        if (!normalizedDate) return;
        dataMap.set(normalizedDate, normalizeLotteryRow(row));
    });

    const rows = [];
    for (let day = 1; day <= lastDay; day++) {
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (!selectedWeekdays.has(lotteryWeekdayIndex(dateKey))) continue;
        const existingRow = dataMap.get(dateKey);
        rows.push({
            date: formatLotteryDateLabel(dateKey),
            slot1: existingRow ? existingRow.slot1 : normalizeLotterySlot({}),
            slot2: existingRow ? existingRow.slot2 : normalizeLotterySlot({})
        });
    }
    return rows;
}

function buildAccountPlanRowsWithWeekdays(monthId, rows, weekdays) {
    return buildLotteryCalendarRowsWithWeekdays(monthId, rows, weekdays);
}

function setLotteryCache(monthId, rows) {
    const normalizedRows = rows.map(normalizeLotteryRow);
    lotteryBidsCache[monthId] = {
        allRows: normalizedRows,
        visibleRows: buildLotteryCalendarRowsWithWeekdays(monthId, normalizedRows, getSelectedLotteryWeekdays())
    };
}

function getLotteryRowsForMonth(monthId, visibleOnly = true) {
    const cache = lotteryBidsCache[monthId];
    if (!cache) return [];
    return visibleOnly ? cache.visibleRows : cache.allRows;
}

function getLotteryDraftRows(monthId, visibleOnly = true) {
    const sourceRows = lotteryEditState.active && lotteryEditState.monthId === monthId
        ? lotteryEditState.draftRows
        : getLotteryRowsForMonth(monthId, false);
    if (!visibleOnly) return sourceRows;

    const selectedWeekdays = new Set(getSelectedLotteryWeekdays());
    return sourceRows.filter((row) => {
        const dateValue = normalizeCourtDateValue(row.date);
        return dateValue ? selectedWeekdays.has(lotteryWeekdayIndex(dateValue)) : true;
    });
}

function getActiveLotteryMonthId() {
    if (activeLotteryTab === 'next') return getMonthData(1).id;
    if (activeLotteryTab === 'selected') return lotterySelectedMonthId;
    return getMonthData(0).id;
}

function updateLotteryMonthLabels() {
    const current = getMonthData(0);
    const next = getMonthData(1);
    const selected = getCourtMonthDataById(lotterySelectedMonthId);

    const labelCur = document.getElementById('label-lottery-current-month');
    const labelNext = document.getElementById('label-lottery-next-month');
    const labelSelected = document.getElementById('label-lottery-selected-month');
    if (labelCur) labelCur.innerText = current.label;
    if (labelNext) labelNext.innerText = next.label;
    if (labelSelected) labelSelected.innerText = selected.id;
}

function updateLotteryEditButton() {
    const editBtn = document.getElementById('lottery-edit-btn');
    if (!editBtn) return;
    const isEditing = lotteryEditState.active && lotteryEditState.monthId === getActiveLotteryMonthId();
    editBtn.innerHTML = isEditing
        ? '<i class="fas fa-times"></i> 取消編輯'
        : '<i class="fas fa-edit"></i> 編輯投籤';
}

function refreshLotteryTableByMonth(monthId) {
    const currentMonthId = getMonthData(0).id;
    const nextMonthId = getMonthData(1).id;
    if (monthId === currentMonthId) renderLotteryTable(currentMonthId, 'lottery-display-current');
    if (monthId === nextMonthId) renderLotteryTable(nextMonthId, 'lottery-display-next');
    if (monthId === lotterySelectedMonthId) renderLotteryTable(lotterySelectedMonthId, 'lottery-display-selected');
}

function renderLotterySlotDisplay(slotData) {
    const slot = normalizeLotterySlot(slotData || {});
    const activeCourts = LOTTERY_COURTS.filter((court) => slot[court] > 0);
    if (activeCourts.length === 0) return '<td class="court-empty">-</td>';
    const lines = activeCourts.map((court) => `
        <div class="lottery-slot-line">
            <span>${court.replace('Court ', '場 ')}</span>
            <strong>${slot[court]}</strong>
        </div>
    `).join('');
    return `<td><div class="lottery-slot-display">${lines}</div></td>`;
}

function renderLotterySlotEditor(slotData, rowDate, slotKey) {
    const slot = normalizeLotterySlot(slotData || {});
    const rows = LOTTERY_COURTS.map((court) => `
        <div class="lottery-edit-row">
            <label>${court.replace('Court ', '場 ')}</label>
            <select onchange="updateLotteryCell('${rowDate}', '${slotKey}', '${court}', this.value)">
                ${[0, 1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${slot[court] === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
        </div>
    `).join('');
    return `<td class="court-edit-cell"><div class="lottery-edit-grid">${rows}</div></td>`;
}

function renderLotteryTable(monthId, containerId) {
    const isEditing = lotteryEditState.active && lotteryEditState.monthId === monthId;
    const tableData = getLotteryDraftRows(monthId, true);
    const monthData = getCourtMonthDataById(monthId);
    let html = '';

    if (isEditing) {
        html += `
            <div class="court-controls">
                <button class="court-btn" onclick="saveLotteryBids()">儲存投籤</button>
                <button class="court-btn" onclick="toggleLotteryEditMode(false)">取消編輯</button>
            </div>
        `;
    }

    html += `
        <div class="court-dashboard-container" data-lottery-month="${monthId}">
            <div class="court-export-title">投籤紀錄 ${monthData.id}</div>
            <table class="court-table lottery-table">
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>18:00 - 20:00</th>
                        <th>20:00 - 22:00</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (tableData.length === 0) {
        html += '<tr><td colspan="3" style="color:#999; padding: 20px;">目前沒有投籤資料。</td></tr>';
    } else {
        tableData.forEach((row) => {
            html += `<tr><td><strong>${row.date} (${row.weekday})</strong></td>`;
            html += isEditing ? renderLotterySlotEditor(row.slot1, row.date, 'slot1') : renderLotterySlotDisplay(row.slot1);
            html += isEditing ? renderLotterySlotEditor(row.slot2, row.date, 'slot2') : renderLotterySlotDisplay(row.slot2);
            html += '</tr>';
        });
    }

    html += '</tbody></table></div>';
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = html;
}

async function fetchAndDisplayLotteryBids(monthId, elementId) {
    try {
        const response = await fetch(`/api/lottery_bids/${monthId}`);
        const data = await response.json();
        const rows = Array.isArray(data.content) ? data.content.map(normalizeLotteryRow) : [];
        setLotteryCache(monthId, rows);
        renderLotteryTable(monthId, elementId);
    } catch (error) {
        console.error(`Failed to load lottery bids for ${monthId}`, error);
        const container = document.getElementById(elementId);
        if (container) container.innerHTML = '<p style="color:red; text-align:center;">投籤資料載入失敗。</p>';
    }
}

async function loadLotteryMonthHistory() {
    const container = document.getElementById('lottery-display-saved');
    if (!container) return;
    try {
        const response = await fetch('/api/lottery_bids_summary');
        const data = await response.json();
        const months = Array.isArray(data.months) ? data.months : [];
        const isCaptain = localStorage.getItem('vbt_role') === 'captain';
        if (months.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; margin:0; padding:20px;">目前還沒有已儲存的投籤紀錄。</p>';
            return;
        }
        container.innerHTML = `
            <div class="court-dashboard-container">
                <table class="court-table probability-table">
                    <thead>
                        <tr>
                            <th>已儲存月份</th>
                            ${isCaptain ? '<th>刪除場地</th>' : ''}
                            <th>總投籤數</th>
                            ${isCaptain ? '<th>刪除投籤</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${months.map((item) => `
                            <tr>
                                <td><strong class="${item.has_court_data ? '' : 'missing-data-text'}">${escapeHtml(item.month_id)}</strong></td>
                                ${isCaptain ? `<td>${item.has_court_data ? `<button type="button" class="court-btn" style="padding:6px 14px; font-size:0.8rem;" onclick="deleteCourtOnlyMonth('${item.month_id}')">刪除場地</button>` : '<span class="missing-data-text">缺少資料</span>'}</td>` : ''}
                                <td><span class="${item.has_bid_data ? '' : 'missing-data-text'}">${item.has_bid_data ? item.total_bids : '缺少資料'}</span></td>
                                ${isCaptain ? `<td>${item.has_bid_data ? `<button type="button" class="court-btn" style="padding:6px 14px; font-size:0.8rem;" onclick="deleteBidOnlyMonth('${item.month_id}')">刪除投籤</button>` : '<span class="missing-data-text">缺少資料</span>'}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load lottery month history', error);
    }
}

async function loadLotteryBids() {
    const current = getMonthData(0);
    const next = getMonthData(1);
    updateLotteryMonthLabels();
    await fetchAndDisplayLotteryBids(current.id, 'lottery-display-current');
    await fetchAndDisplayLotteryBids(next.id, 'lottery-display-next');
    await fetchAndDisplayLotteryBids(lotterySelectedMonthId, 'lottery-display-selected');
    await loadLotteryMonthHistory();
    
    // 恢復該 Session 記住的子分頁
    const savedTab = sessionStorage.getItem('vbt_lottery_tab') || 'current';
    switchLotteryTab(savedTab);
    
    updateLotteryEditButton();
}

function switchLotteryTab(tabType) {
    activeLotteryTab = tabType;
    sessionStorage.setItem('vbt_lottery_tab', tabType);
    
    document.getElementById('lottery-tab-current').classList.toggle('active', tabType === 'current');
    document.getElementById('lottery-tab-next').classList.toggle('active', tabType === 'next');
    document.getElementById('lottery-tab-selected').classList.toggle('active', tabType === 'selected');
    document.getElementById('lottery-tab-saved').classList.toggle('active', tabType === 'saved');
    document.getElementById('lottery-display-current').style.display = tabType === 'current' ? 'block' : 'none';
    document.getElementById('lottery-display-next').style.display = tabType === 'next' ? 'block' : 'none';
    document.getElementById('lottery-display-selected').style.display = tabType === 'selected' ? 'block' : 'none';
    document.getElementById('lottery-display-saved').style.display = tabType === 'saved' ? 'block' : 'none';
    updateLotteryEditButton();
    loadLotteryDashboard();
}

async function loadSelectedLotteryMonth(trigger) {
    await withButtonLoading(trigger, '\u8f09\u5165\u4e2d', async () => {
        const picker = document.getElementById('lottery-month-picker');
        lotterySelectedMonthId = picker && picker.value ? picker.value : getMonthData(0).id;
        updateLotteryMonthLabels();
        await fetchAndDisplayLotteryBids(lotterySelectedMonthId, 'lottery-display-selected');
        switchLotteryTab('selected');
    });
}

function toggleLotteryEditMode(forceState) {
    const monthId = getActiveLotteryMonthId();
    const shouldEnable = typeof forceState === 'boolean' ? forceState : !(lotteryEditState.active && lotteryEditState.monthId === monthId);
    if (shouldEnable) {
        lotteryEditState.active = true;
        lotteryEditState.monthId = monthId;
        lotteryEditState.draftRows = cloneLotteryRows(getLotteryRowsForMonth(monthId, false));
    } else {
        lotteryEditState.active = false;
        lotteryEditState.monthId = null;
        lotteryEditState.draftRows = [];
    }
    refreshLotteryTableByMonth(monthId);
    updateLotteryEditButton();
}

function updateLotteryCell(rowDate, slotKey, court, value) {
    if (!lotteryEditState.active) return;
    const normalizedDate = normalizeCourtDateValue(rowDate);
    const row = lotteryEditState.draftRows.find((item) => item.date === normalizedDate);
    if (!row) return;
    row[slotKey] = normalizeLotterySlot(row[slotKey] || {});
    row[slotKey][court] = Math.max(0, Math.min(5, Number.parseInt(value, 10) || 0));
}

async function saveLotteryBids() {
    if (!lotteryEditState.active || !lotteryEditState.monthId) return;
    const monthId = lotteryEditState.monthId;
    const sanitizedRows = lotteryEditState.draftRows.map(normalizeLotteryRow);
    try {
        const response = await fetch('/api/lottery_bids', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month_id: monthId, content: sanitizedRows })
        });
        if (response.ok) {
            setLotteryCache(monthId, sanitizedRows);
            lotteryEditState.active = false;
            lotteryEditState.monthId = null;
            lotteryEditState.draftRows = [];
            refreshLotteryTableByMonth(monthId);
            await loadLotteryMonthHistory();
            await loadLotteryDashboard();
            updateLotteryEditButton();
            alert(`${monthId} 的投籤紀錄已成功儲存。`);
        } else {
            alert('儲存投籤紀錄失敗。');
        }
    } catch (error) {
        console.error('Error saving lottery bids', error);
        alert('儲存投籤紀錄失敗。');
    }
}

function initProbabilityControls() {
    const currentMonthId = getMonthData(0).id;
    const startInput = document.getElementById('probability-start-month');
    const endInput = document.getElementById('probability-end-month');
    const picker = document.getElementById('lottery-month-picker');
    const savedStartMonth = localStorage.getItem(PROBABILITY_START_MONTH_KEY) || '';
    const savedEndMonth = localStorage.getItem(PROBABILITY_END_MONTH_KEY) || '';
    const savedTicketBudget = localStorage.getItem(STRATEGY_TICKET_BUDGET_KEY) || '';
    const savedWeightRatio = localStorage.getItem(STRATEGY_WEIGHT_RATIO_KEY) || '';
    const ticketBudgetInput = document.getElementById('strategy-ticket-budget');
    const weightRatioInput = document.getElementById('strategy-weight-ratio');

    if (startInput) startInput.value = savedStartMonth || currentMonthId;
    if (endInput) endInput.value = savedEndMonth || currentMonthId;
    if (picker) picker.value = currentMonthId;
    if (ticketBudgetInput) ticketBudgetInput.value = savedTicketBudget || '50';
    if (weightRatioInput) weightRatioInput.value = savedWeightRatio || '1.3';
}

function switchProbabilityTab(tabType) {
    activeProbabilityTab = tabType;
    sessionStorage.setItem('vbt_probability_tab', tabType);
    
    document.getElementById('probability-tab-selected').classList.toggle('active', tabType === 'selected');
    document.getElementById('probability-tab-all').classList.toggle('active', tabType === 'all');
    document.getElementById('probability-selected-panel').style.display = tabType === 'selected' ? 'block' : 'none';
    document.getElementById('probability-all-panel').style.display = tabType === 'all' ? 'block' : 'none';
}

function switchStrategyTab(tabType) {
    activeStrategyTab = tabType;
    sessionStorage.setItem('vbt_strategy_tab', tabType);
    
    document.getElementById('strategy-tab-selected').classList.toggle('active', tabType === 'selected');
    document.getElementById('strategy-tab-all').classList.toggle('active', tabType === 'all');
    document.getElementById('strategy-selected-panel').style.display = tabType === 'selected' ? 'block' : 'none';
    document.getElementById('strategy-all-panel').style.display = tabType === 'all' ? 'block' : 'none';
}

function getProbabilityCellTone(winRate, attempts) {
    const isDarkMode = document.documentElement.dataset.themeMode === 'dark';
    const surfaceBase = isDarkMode ? '#23262d' : '#f3f6f9';
    const surfaceSoft = isDarkMode ? '#2a2f37' : '#edf3f8';
    const interactiveStrong = getCssVariableValue('--interactive-strong', isDarkMode ? '#3b82f6' : '#5f86a7');
    if (!attempts) return mixHex(surfaceBase, interactiveStrong, isDarkMode ? 0.06 : 0.02);
    if (attempts < 2) return mixHex(surfaceSoft, interactiveStrong, isDarkMode ? 0.1 : 0.05);

    const scales = isDarkMode
        ? [0.08, 0.12, 0.18, 0.24, 0.3, 0.38, 0.48, 0.6, 0.72, 0.82]
        : [0.04, 0.08, 0.12, 0.18, 0.24, 0.32, 0.42, 0.56, 0.7, 0.82];
    const normalized = Math.max(0, Math.min(100, Number(winRate) || 0));
    const index = Math.min(scales.length - 1, Math.floor(normalized / 10));
    return mixHex(surfaceBase, interactiveStrong, scales[index]);
}


function getProbabilityCellPalette(winRate, attempts) {
    const background = getProbabilityCellTone(winRate, attempts);
    const isDarkMode = document.documentElement.dataset.themeMode === 'dark';
    const interactiveColor = getCssVariableValue('--interactive-color', isDarkMode ? '#60a5fa' : '#4d667c');
    const interactiveStrong = getCssVariableValue('--interactive-strong', isDarkMode ? '#3b82f6' : '#355269');
    const textMain = getCssVariableValue('--text-main', isDarkMode ? '#e0e3e7' : '#203444');
    const textMuted = getCssVariableValue('--text-muted', isDarkMode ? '#a9b0ba' : '#6b7f90');
    if (!attempts) {
        return {
            background,
            text: textMuted,
            subtext: textMuted,
            border: hexToRgba(interactiveColor, isDarkMode ? 0.18 : 0.08)
        };
    }
    if (attempts < 2) {
        return {
            background,
            text: textMain,
            subtext: textMuted,
            border: hexToRgba(interactiveColor, isDarkMode ? 0.24 : 0.1)
        };
    }

    const normalized = Math.max(0, Math.min(100, Number(winRate) || 0));
    if (normalized >= 80) {
        return {
            background,
            text: isDarkMode ? '#f5f7fa' : '#ffffff',
            subtext: isDarkMode ? 'rgba(245, 247, 250, 0.85)' : 'rgba(255, 255, 255, 0.92)',
            border: hexToRgba(interactiveStrong, isDarkMode ? 0.34 : 0.18)
        };
    }
    if (normalized >= 60) {
        return {
            background,
            text: isDarkMode ? '#e7edf5' : '#203444',
            subtext: isDarkMode ? '#cad4df' : '#f4f8fb',
            border: hexToRgba(interactiveStrong, isDarkMode ? 0.28 : 0.16)
        };
    }
    if (normalized >= 30) {
        return {
            background,
            text: isDarkMode ? '#d2d9e2' : '#324a5e',
            subtext: isDarkMode ? '#aeb8c4' : '#4c6478',
            border: hexToRgba(interactiveStrong, isDarkMode ? 0.22 : 0.14)
        };
    }
    return {
        background,
        text: isDarkMode ? textMain : '#4f6477',
        subtext: isDarkMode ? textMuted : '#6b7f90',
        border: hexToRgba(interactiveStrong, isDarkMode ? 0.18 : 0.12)
    };
}

function renderProbabilityMatrix(stats, emptyMessage, selectedWeekdays, selectedCourts, model) {
    const weekdayNames = selectedWeekdays.map((index) => LOTTERY_WEEKDAY_NAMES[index]);
    const filteredStats = (Array.isArray(stats) ? stats : []).filter((item) => weekdayNames.includes(item.weekday) && selectedCourts.includes(item.court));
    if (filteredStats.length === 0) return `<p style="text-align:center; color:#999; padding: 20px;">${emptyMessage}</p>`;

    const modelLine = model
        ? `<div class="strategy-note">Model: <strong>${escapeHtml(model.selected_prior || '-')}</strong> · Inference: <strong>${escapeHtml(model.inference || '-')}</strong></div>`
        : '';

    let html = `${modelLine}<div class="court-dashboard-container"><div class="probability-matrix"><table class="court-table probability-table"><thead><tr><th>Pool</th><th>Base Tickets</th><th>History</th><th>Predictive Win %</th></tr></thead><tbody>`;
    filteredStats.forEach((item) => {
        const meanBase = item.posterior_mean_base_tickets ?? item.estimated_pool_tickets ?? 0;
        const stddev = item.posterior_stddev ?? 0;
        const interval = item.credible_interval || {};
        const predictiveMap = item.predictive_win_probability_by_tickets || {};
        const predictiveText = [1, 2, 3, 4, 5].map((tickets) => `${tickets}: ${predictiveMap[String(tickets)] ?? '-'}%`).join('<br>');
        const palette = getProbabilityCellPalette(item.win_rate || 0, item.attempts || 0);
        html += `
            <tr>
                <td><strong>${escapeHtml(item.weekday)} ${escapeHtml(item.time)}</strong><br>${escapeHtml((item.court || '').replace('Court ', '場 '))}</td>
                <td>
                    <div class="probability-cell" style="background:${palette.background}; color:${palette.text}; border-color:${palette.border};">
                        <strong style="color:${palette.text};">${meanBase} ± ${stddev}</strong>
                        <small style="color:${palette.subtext};">MAP ${item.posterior_map_base_tickets ?? '-'} · CI ${interval.low ?? '-'}-${interval.high ?? '-'}</small>
                    </div>
                </td>
                <td>中籤 ${item.total_wins} / 出手 ${item.attempts} 次 / 投籤 ${item.total_bids} 支</td>
                <td>${predictiveText}</td>
            </tr>
        `;
    });
    html += '</tbody></table></div></div>';
    return html;
}

function renderAllocationCompact(allocationByPool) {
    if (!Array.isArray(allocationByPool) || allocationByPool.length === 0) return '0 tickets assigned';
    return allocationByPool.map((item) => `${item.court.replace('Court ', '場 ')} ${item.date} ${item.time} × ${item.tickets}`).join('<br>');
}

function renderStrategyMetricChip(label, value, modifier) {
    return `<span class="strategy-metric-chip strategy-metric-chip--${modifier}"><strong>${label}</strong> ${escapeHtml(String(value))}</span>`;
}

function renderStrategyRecommendedEditor(pool, tabKey) {
    const selectedValue = Math.max(0, Math.min(5, Number.parseInt(pool?.recommended_tickets || 0, 10) || 0));
    const poolKey = createStrategyPoolKey(pool);
    return `
        <span class="strategy-metric-chip strategy-metric-chip--recommended strategy-metric-chip--editable">
            <strong>Rec</strong>
            <select class="strategy-rec-select" onchange="updateStrategyRecommendedTickets('${escapeHtml(tabKey)}', '${escapeHtml(poolKey)}', this.value)">
                ${[0, 1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select>
        </span>
    `;
}

function buildStrategyInfoDisplayMap(candidatePools) {
    const scoredPools = (candidatePools || [])
        .map((pool) => {
            const tickets = Math.max(0, Math.min(5, Number.parseInt(pool?.recommended_tickets || 0, 10) || 0));
            if (tickets <= 0) return null;
            const relativePercent = Number((pool?.relative_information_gain_percent_by_tickets || {})[String(tickets)]);
            const fallbackRaw = Number((pool?.expected_information_gain_by_tickets || {})[String(tickets)]);
            const rawValue = Number.isFinite(relativePercent) && relativePercent > 0
                ? relativePercent
                : (Number.isFinite(fallbackRaw) && fallbackRaw > 0 ? fallbackRaw : 0);
            return {
                poolKey: createStrategyPoolKey(pool),
                rawValue,
            };
        })
        .filter(Boolean);

    const positiveValues = scoredPools
        .map((item) => item.rawValue)
        .filter((value) => Number.isFinite(value) && value > 0);

    const displayMap = new Map();
    const minPositive = positiveValues.length > 0 ? Math.min(...positiveValues) : 0;
    const maxPositive = positiveValues.length > 0 ? Math.max(...positiveValues) : 0;
    const hasSpread = maxPositive > minPositive;

    (candidatePools || []).forEach((pool) => {
        const tickets = Math.max(0, Math.min(5, Number.parseInt(pool?.recommended_tickets || 0, 10) || 0));
        if (tickets <= 0) {
            displayMap.set(createStrategyPoolKey(pool), '-');
            return;
        }
        const scored = scoredPools.find((item) => item.poolKey === createStrategyPoolKey(pool));
        const rawValue = scored ? scored.rawValue : 0;
        let normalizedScore = 1;
        if (positiveValues.length === 0) {
            normalizedScore = 1;
        } else if (rawValue <= 0) {
            normalizedScore = 1;
        } else if (!hasSpread) {
            normalizedScore = 100;
        } else {
            normalizedScore = Math.round(1 + (((rawValue - minPositive) / (maxPositive - minPositive)) * 99));
        }
        displayMap.set(createStrategyPoolKey(pool), `${Math.max(1, Math.min(100, normalizedScore))}%`);
    });

    return displayMap;
}

function getStrategyManualAllocationSummary(candidatePools) {
    const totalTickets = (candidatePools || []).reduce(
        (sum, pool) => sum + Math.max(0, Math.min(5, Number.parseInt(pool?.recommended_tickets || 0, 10) || 0)),
        0
    );
    const budget = getStrategyTicketBudget();
    return {
        totalTickets,
        budget,
        isOverBudget: totalTickets > budget,
    };
}

function renderStrategyPoolMatrix(candidatePools, tabKey) {
    if (!Array.isArray(candidatePools) || candidatePools.length === 0) {
        return '<p style="text-align:center; color:#999; padding: 20px;">沒有符合條件的 pool。</p>';
    }

    const infoDisplayMap = buildStrategyInfoDisplayMap(candidatePools);
    const grouped = new Map();
    candidatePools.forEach((pool) => {
        const rowKey = `${pool.date}|${pool.time}`;
        if (!grouped.has(rowKey)) {
            grouped.set(rowKey, {
                date: pool.date,
                weekday: pool.weekday,
                time: pool.time,
                courts: new Map(),
            });
        }
        grouped.get(rowKey).courts.set(pool.court, pool);
    });

    let html = '<div class="court-dashboard-container"><div class="probability-matrix"><table class="court-table probability-table"><thead><tr><th>日期 / 時段</th>';
    LOTTERY_COURTS.forEach((court) => {
        html += `<th>${court.replace('Court ', '場 ')}</th>`;
    });
    html += '</tr></thead><tbody>';

    Array.from(grouped.values())
        .sort((a, b) => `${a.date}|${a.time}`.localeCompare(`${b.date}|${b.time}`))
        .forEach((row) => {
            let slotLoseProbability = 1;
            row.courts.forEach((pool) => {
                const recommendedTickets = pool.recommended_tickets || 0;
                const slotWinProbability = recommendedTickets > 0 ? ((pool.recommended_win_probability || 0) / 100) : 0;
                slotLoseProbability *= (1 - slotWinProbability);
            });
            const slotSuccessRate = Math.round((1 - slotLoseProbability) * 1000) / 10;
            html += `<tr><td><strong>${escapeHtml(row.date)} (${escapeHtml(row.weekday)})</strong><br>${escapeHtml(row.time)}<br><small>時段中籤率 ${slotSuccessRate}%</small></td>`;
            LOTTERY_COURTS.forEach((court) => {
                const pool = row.courts.get(court);
                if (!pool) {
                    html += '<td class="court-empty">-</td>';
                    return;
                }
                const recommendedTickets = pool.recommended_tickets || 0;
                const predictive = recommendedTickets > 0 ? `${pool.recommended_win_probability}%` : '0%';
                const infoGain = infoDisplayMap.get(createStrategyPoolKey(pool)) ?? '-';
                const fallbackNote = pool.fallback_source && pool.fallback_source !== 'exact'
                    ? '<div class="strategy-fallback-note">fallback</div>'
                    : '';
                html += `
                    <td>
                        <div class="strategy-pool-cell">
                            ${renderStrategyMetricChip('Base', `${pool.posterior_mean_base_tickets} ± ${pool.posterior_stddev}`, 'base')}
                            ${renderStrategyRecommendedEditor(pool, tabKey)}
                            ${renderStrategyMetricChip('Predict', predictive, 'predictive')}
                            ${renderStrategyMetricChip('Info', infoGain, 'info')}
                            ${fallbackNote}
                        </div>
                    </td>
                `;
            });
            html += '</tr>';
        });

    html += '</tbody></table></div></div>';
    return html;
}

function renderStrategyPoolTable(candidatePools, tabKey) {
    if (!Array.isArray(candidatePools) || candidatePools.length === 0) {
        return '<p style="text-align:center; color:#999; padding: 20px;">沒有符合條件的 pool。</p>';
    }

    const infoDisplayMap = buildStrategyInfoDisplayMap(candidatePools);
    let html = '<div class="court-dashboard-container"><div class="probability-matrix"><table class="court-table probability-table"><thead><tr><th>Pool</th><th>Estimated Base</th><th>Recommended</th><th>Predictive</th><th>Info Gain</th></tr></thead><tbody>';
    candidatePools.forEach((pool) => {
        const recommendedTickets = pool.recommended_tickets || 0;
        const predictive = recommendedTickets > 0 ? `${pool.recommended_win_probability}%` : '-';
        const infoGain = infoDisplayMap.get(createStrategyPoolKey(pool)) ?? '-';
        html += `
            <tr>
                <td><strong>${escapeHtml(pool.date)} (${escapeHtml(pool.weekday)})</strong><br>${escapeHtml(pool.time)} · ${escapeHtml(pool.court.replace('Court ', '場 '))}${pool.fallback_source && pool.fallback_source !== 'exact' ? '<br><small>fallback</small>' : ''}</td>
                <td>${pool.posterior_mean_base_tickets} ± ${pool.posterior_stddev}</td>
                <td>${renderStrategyRecommendedEditor(pool, tabKey)}</td>
                <td>${predictive}</td>
                <td>${infoGain}</td>
            </tr>
        `;
    });
    html += '</tbody></table></div></div>';
    return html;
}

function renderStrategyTable(plan, summaryLabel, tabKey = activeStrategyTab) {
    if (!plan || !Array.isArray(plan.candidate_pools) || plan.candidate_pools.length === 0) {
        return '<p style="text-align:center; color:#999; padding: 20px;">資料不足，無法產生策略建議。</p>';
    }

    const allocationSummary = getStrategyManualAllocationSummary(plan.candidate_pools);
    const usageClass = allocationSummary.isOverBudget
        ? 'strategy-manual-usage strategy-manual-usage--over'
        : 'strategy-manual-usage';
    let html = `<div class="strategy-note">${escapeHtml(summaryLabel)}</div>`;
    html += `
        <div class="${usageClass}">
            目前手動調整後總共用了 <strong>${allocationSummary.totalTickets}</strong> 張籤
            ／ 上限 <strong>${allocationSummary.budget}</strong> 張
            ${allocationSummary.isOverBudget ? '／ 已超過上限，請調整 Rec' : ''}
        </div>
    `;
    html += renderStrategyPoolMatrix(plan.candidate_pools, getStrategyDraftKey(tabKey));
    return html;
}

function renderAccountPlanEditorTable(monthId, rows) {
    let html = '<div class="court-dashboard-container"><div class="probability-matrix"><table class="court-table lottery-table"><thead><tr><th>日期</th><th>18:00 - 20:00</th><th>20:00 - 22:00</th></tr></thead><tbody>';
    rows.forEach((row) => {
        const slot1 = normalizeLotterySlot(row.slot1 || {});
        const slot2 = normalizeLotterySlot(row.slot2 || {});
        const renderCell = (slotKey, slot) => `
            <td class="court-edit-cell">
                <div class="lottery-edit-grid">
                    ${LOTTERY_COURTS.map((court) => `
                        <div class="lottery-edit-row">
                            <label>${court.replace('Court ', '場 ')}</label>
                            <select onchange="updateAccountPlanCell('${monthId}', '${row.date}', '${slotKey}', '${court}', this.value)">
                                ${[0, 1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${slot[court] === value ? 'selected' : ''}>${value}</option>`).join('')}
                            </select>
                        </div>
                    `).join('')}
                </div>
            </td>
        `;
        html += `<tr><td><strong>${escapeHtml(row.date)}</strong></td>${renderCell('slot1', slot1)}${renderCell('slot2', slot2)}</tr>`;
    });
    html += '</tbody></table></div></div>';
    return html;
}

function renderIndependentAccountPlanSection() {
    const container = document.getElementById('strategy-account-plan');
    if (!container) return;
    const monthId = getSelectedAccountPlanMonth();
    const selectedWeekdays = getSelectedAccountPlanWeekdays();
    const rows = getStoredAccountPlanRows(monthId);
    const visibleRows = buildAccountPlanRowsWithWeekdays(monthId, rows, selectedWeekdays);
    const assignmentPlan = buildAccountAssignmentsFromRows(rows);
    const totalTickets = rows.reduce((sum, row) => {
        const normalized = normalizeLotteryRow(row);
        return sum
            + LOTTERY_COURTS.reduce((acc, court) => acc + (normalized.slot1?.[court] || 0), 0)
            + LOTTERY_COURTS.reduce((acc, court) => acc + (normalized.slot2?.[court] || 0), 0);
    }, 0);
    const weekdayOptions = LOTTERY_WEEKDAY_NAMES.map((name, index) => `
        <label class="court-weekday-option${selectedWeekdays.includes(index) ? ' is-checked' : ''}">
            <input type="checkbox" data-account-plan-weekday="${index}" ${selectedWeekdays.includes(index) ? 'checked' : ''} onchange="toggleAccountPlanWeekday('${index}')"> ${name}
        </label>
    `).join('');

    let html = `
        <div class="strategy-panel-header">
            <div>
                <h4 class="strategy-panel-title">帳號投籤分配</h4>
            </div>
            <div class="strategy-weight-controls">
                <button class="court-btn" type="button" onclick="importStrategyToAccountPlan()">一鍵帶入策略分析結果</button>
                <button class="court-btn" type="button" onclick="clearAccountPlanRows('${monthId}')">全部清空</button>
            </div>
        </div>
        <div class="strategy-filter-row">
            <div class="court-weekday-filter" id="account-plan-weekday-filter">
                <span class="court-weekday-filter__label">星期</span>
                ${weekdayOptions}
            </div>
            <div class="strategy-month-controls">
                <label>
                    <span>指定月份</span>
                    <input type="month" id="account-plan-month-picker" value="${escapeHtml(monthId)}" onchange="updateAccountPlanMonth(this.value)" placeholder="YYYY-MM" inputmode="numeric">
                </label>
            </div>
        </div>
        <div class="strategy-note">獨立投籤草稿 ｜ 目標月份：${escapeHtml(monthId)} ｜ 目前總籤數：<strong>${totalTickets}</strong></div>
        ${renderAccountPlanEditorTable(monthId, visibleRows)}
    `;

    html += '<div class="court-dashboard-container"><div class="probability-matrix"><table class="court-table probability-table account-plan-table"><thead><tr><th>帳號</th><th>已用</th><th>投籤位置</th></tr></thead><tbody>';
    assignmentPlan.accounts.forEach((account) => {
        const assignments = account.assignments.length > 0
            ? `<div class="account-assignment-list">${account.assignments.map((item) => `
                <div class="account-assignment-item account-assignment-item--${escapeHtml(item.court.toLowerCase().replace(/\s+/g, '-'))}">
                    <div class="account-assignment-main">
                        <span class="account-assignment-date">${escapeHtml(item.date)} (${escapeHtml(item.weekday)})</span>
                        <span class="account-assignment-time">${escapeHtml(item.time)}</span>
                    </div>
                    <span class="account-assignment-court account-assignment-court--${escapeHtml(item.court.toLowerCase().replace(/\s+/g, '-'))}">${escapeHtml(item.court.replace('Court ', '場 '))}</span>
                </div>
            `).join('')}</div>`
            : '<span class="missing-data-text">未分配</span>';
        html += `
            <tr>
                <td class="account-plan-table__account"><span class="account-plan-account-name">${escapeHtml(account.account)}</span></td>
                <td class="account-plan-table__usage"><span class="account-plan-usage-pill">${account.ticketsUsed} / 10</span></td>
                <td class="account-plan-table__assignments">${assignments}</td>
            </tr>
        `;
    });
    html += '</tbody></table></div></div>';

    if (assignmentPlan.unassigned.length > 0) {
        html += '<div class="court-dashboard-container"><div class="strategy-note">未分配籤數</div><div class="probability-matrix"><table class="court-table probability-table"><thead><tr><th>位置</th><th>未分配</th></tr></thead><tbody>';
        assignmentPlan.unassigned.forEach((item) => {
            html += `<tr><td>${escapeHtml(`${item.date} (${item.weekday}) ${item.time} ${item.court.replace('Court ', '場 ')}`)}</td><td><strong>${item.unassignedCount}</strong></td></tr>`;
        });
        html += '</tbody></table></div></div>';
    }

    container.innerHTML = html;
    applyTextInputFallback('account-plan-month-picker', 'month');
    syncCustomCheckboxState(container);
}

function refreshLotteryDashboard(trigger) {
    return withButtonLoading(trigger, '\u5206\u6790\u4e2d', () => loadLotteryDashboard());
}

function refreshStrategyPanel(trigger) {
    return withButtonLoading(trigger, '\u5206\u6790\u4e2d', () => loadLotteryDashboard());
}

function getStrategyWeights() {
    const ratioInput = document.getElementById('strategy-weight-ratio');
    const ratio = Number.parseFloat(ratioInput ? ratioInput.value : '1.3');
    const late = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.3;
    return {
        early: 1,
        late,
    };
}

function getStrategyTicketBudget() {
    const input = document.getElementById('strategy-ticket-budget');
    const budget = Number.parseInt(input ? input.value : '50', 10);
    return Number.isFinite(budget) && budget >= 0 ? budget : 50;
}

async function loadLotteryDashboard() {
    const startInput = document.getElementById('probability-start-month');
    const endInput = document.getElementById('probability-end-month');
    if (!startInput || !endInput) return;

    let startMonth = startInput.value || getMonthData(0).id;
    let endMonth = endInput.value || startMonth;
    if (startMonth > endMonth) {
        [startMonth, endMonth] = [endMonth, startMonth];
        startInput.value = startMonth;
        endInput.value = endMonth;
    }

    localStorage.setItem(PROBABILITY_START_MONTH_KEY, startMonth);
    localStorage.setItem(PROBABILITY_END_MONTH_KEY, endMonth);

    const targetMonth = getMonthData(1).id;
    const probabilityWeekdays = getSelectedProbabilityWeekdays();
    const strategyWeekdays = getSelectedStrategyWeekdays();
    const probabilityCourts = getSelectedProbabilityCourts();
    const strategyCourts = getSelectedStrategyCourts();
    const strategyIncludedDates = getStrategyIncludedDates();
    const strategyExcludedDates = getStrategyExcludedDates();
    const strategyWeights = getStrategyWeights();
    const strategyTicketBudget = getStrategyTicketBudget();
    localStorage.setItem(STRATEGY_TICKET_BUDGET_KEY, String(strategyTicketBudget));
    localStorage.setItem(STRATEGY_WEIGHT_RATIO_KEY, String(strategyWeights.late));

    const params = new URLSearchParams({
        start_month: startMonth,
        end_month: endMonth,
        target_month: targetMonth,
        strategy_weight_ratio: String(strategyWeights.late),
        strategy_ticket_budget: String(strategyTicketBudget),
    });
    strategyWeekdays.forEach((weekday) => params.append('strategy_weekday', String(weekday)));
    strategyCourts.forEach((court) => params.append('strategy_court', court));
    strategyIncludedDates.forEach((dateValue) => params.append('strategy_include_date', dateValue));
    strategyExcludedDates.forEach((dateValue) => params.append('strategy_exclude_date', dateValue));

    const selectedPanel = document.getElementById('probability-selected-panel');
    const allPanel = document.getElementById('probability-all-panel');
    const strategySelectedPanel = document.getElementById('strategy-selected-panel');
    const strategyAllPanel = document.getElementById('strategy-all-panel');
    if (selectedPanel) selectedPanel.innerHTML = '<p style="text-align:center; color:#999; padding: 20px;">機率分析載入中...</p>';
    if (allPanel) allPanel.innerHTML = '<p style="text-align:center; color:#999; padding: 20px;">機率分析載入中...</p>';
    if (strategySelectedPanel) strategySelectedPanel.innerHTML = '<p style="text-align:center; color:#999; padding: 20px;">策略分析載入中...</p>';
    if (strategyAllPanel) strategyAllPanel.innerHTML = '<p style="text-align:center; color:#999; padding: 20px;">策略分析載入中...</p>';

    try {
        if (lotteryDashboardAbortController) {
            lotteryDashboardAbortController.abort();
        }
        lotteryDashboardAbortController = new AbortController();
        const response = await fetch(`/api/lottery_dashboard?${params.toString()}`, {
            signal: lotteryDashboardAbortController.signal,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error || `HTTP ${response.status}`);
        }
        latestLotteryDashboardData = data;
        initializeStrategyPlanDrafts();
        const summary = document.getElementById('probability-summary');

        if (selectedPanel) selectedPanel.innerHTML = renderProbabilityMatrix(data.selected.pool_summaries, '所選月份區間內沒有可用的對應資料。', probabilityWeekdays, probabilityCourts, data.selected.model);
        if (allPanel) allPanel.innerHTML = renderProbabilityMatrix(data.all_time.pool_summaries, '目前還沒有足夠的歷史資料。', probabilityWeekdays, probabilityCourts, data.all_time.model);
        if (summary) {
            const usedRange = (data.selected.months_used || []).join(', ') || '無';
            const usedHistory = (data.all_time.months_used || []).join(', ') || '無';
            const selectedModel = data?.selected?.model?.selected_prior || '-';
            const allModel = data?.all_time?.model?.selected_prior || '-';
            const selectedFallbackNote = data?.selected?.used_all_history_fallback
                ? ' ｜ <strong>所選區間無歷史，已改用全部歷史平均</strong>'
                : '';
            summary.innerHTML = `所選區間：<strong>${escapeHtml(usedRange)}</strong> ｜ Prior: <strong>${escapeHtml(selectedModel)}</strong>${selectedFallbackNote}<br>全部歷史：<strong>${escapeHtml(usedHistory)}</strong> ｜ Prior: <strong>${escapeHtml(allModel)}</strong>`;
        }
        const strategyTargetMonth = data?.strategy?.target_month || targetMonth;
        const selectedStrategySummary = `目標月份：${strategyTargetMonth} ｜ 所選區間：${(data.selected.months_used || []).join(', ') || '無'}`;
        const allHistoryStrategySummary = `目標月份：${strategyTargetMonth} ｜ 全部歷史：${(data.all_time.months_used || []).join(', ') || '無'}`;
        if (strategySelectedPanel) strategySelectedPanel.innerHTML = renderStrategyTable(getStrategyPlanDraft('selected'), selectedStrategySummary, 'selected');
        if (strategyAllPanel) strategyAllPanel.innerHTML = renderStrategyTable(getStrategyPlanDraft('all'), allHistoryStrategySummary, 'all');
        renderIndependentAccountPlanSection();

        switchProbabilityTab(sessionStorage.getItem('vbt_probability_tab') || activeProbabilityTab);
        switchStrategyTab(sessionStorage.getItem('vbt_strategy_tab') || activeStrategyTab);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('載入投籤儀表板失敗', error);
        const summary = document.getElementById('probability-summary');
        if (summary) summary.innerHTML = `<span style="color:#c0392b;">載入失敗：${escapeHtml(error.message || '未知錯誤')}</span>`;
        if (selectedPanel) selectedPanel.innerHTML = '<p style="text-align:center; color:#c0392b; padding: 20px;">機率分析載入失敗</p>';
        if (allPanel) allPanel.innerHTML = '<p style="text-align:center; color:#c0392b; padding: 20px;">機率分析載入失敗</p>';
        if (strategySelectedPanel) strategySelectedPanel.innerHTML = '<p style="text-align:center; color:#c0392b; padding: 20px;">策略分析載入失敗</p>';
        if (strategyAllPanel) strategyAllPanel.innerHTML = '<p style="text-align:center; color:#c0392b; padding: 20px;">策略分析載入失敗</p>';
        renderIndependentAccountPlanSection();
    } finally {
        lotteryDashboardAbortController = null;
    }
}

async function downloadStrategyTableAsPng() {
    const panelId = activeStrategyTab === 'all' ? 'strategy-all-panel' : 'strategy-selected-panel';
    const target = document.getElementById(panelId);
    if (!target) return;

    const captureNode = target.querySelector('.court-dashboard-container') || target;
    if (typeof html2canvas !== 'function') {
        alert('截圖功能尚未載入完成。');
        return;
    }

    const canvas = await captureFixedSizePngCanvas(captureNode, {
        width: 1000,
        backgroundColor: '#ffffff',
    });

    const link = document.createElement('a');
    link.download = `strategy-${activeStrategyTab === 'all' ? 'all-history' : 'selected-range'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

window.addEventListener('load', initLotteryWeekdayFilters);
window.addEventListener('load', initProbabilityControls);
window.addEventListener('load', () => {
    ['strategy-weight-ratio', 'strategy-ticket-budget'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('change', loadLotteryDashboard);
    });
});

// ==========================================
// 7. Change Password Feature
// ==========================================
function openChangePassword() {
    document.getElementById('change-password-overlay').style.setProperty('display', 'flex', 'important');
    document.getElementById('cp-message').innerText = '';
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
    
    // 自動關閉頭像下拉選單
    const menu = document.getElementById('avatarMenu');
    if(menu) menu.classList.remove('active');
}

function closeChangePassword() {
    document.getElementById('change-password-overlay').style.setProperty('display', 'none', 'important');
}

async function submitChangePassword(trigger) {
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const messageEl = document.getElementById('cp-message');
    
    // 從 LocalStorage 抓取當前登入的帳號
    const username = localStorage.getItem('vbt_username');

    if (!oldPassword || !newPassword) {
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '請填寫所有欄位。';
        return;
    }

    // 按鈕顯示讀取中
    const btn = getActionButton(trigger);
    const originalText = btn ? btn.innerText : '';
    if (btn) {
        btn.innerText = '更新中...';
        btn.disabled = true;
    }

    try {
        const response = await fetch('/api/change_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, old_password: oldPassword, new_password: newPassword })
        });
        
        const data = await response.json();

        if (response.ok) {
            messageEl.style.color = '#2ecc71';
            messageEl.innerText = '密碼更新成功！';
            setTimeout(() => {
                closeChangePassword();
            }, 1500);
        } else {
            messageEl.style.color = '#ff4757';
            messageEl.innerText = data.error || '密碼更新失敗。';
        }
    } catch (error) {
        console.error('Error:', error);
        messageEl.style.color = '#ff4757';
        messageEl.innerText = '伺服器連線失敗。';
    } finally {
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}
// ==========================================
// 8. Keyboard Shortcuts (Enter to Submit)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 建立一個共用的小工具：綁定 Enter 鍵到指定的按鈕功能上
    const attachEnter = (inputId, submitFunction) => {
        const inputElement = document.getElementById(inputId);
        if (inputElement) {
            inputElement.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    submitFunction();
                }
            });
        }
    };

    // 幫登入欄位加上 Enter 快捷鍵
    attachEnter('username', handleLogin);
    attachEnter('login-password', handleLogin);

    // 幫註冊欄位加上 Enter 快捷鍵
    attachEnter('reg-username', handleRegister);
    attachEnter('reg-password', handleRegister);

    // 幫修改密碼欄位加上 Enter 快捷鍵
    attachEnter('old-password', submitChangePassword);
    attachEnter('new-password', submitChangePassword);
});
// ==========================================
// 9. Dynamic Announcements Feature
// ==========================================
window.addEventListener('load', loadAnnouncements);

async function loadAnnouncements() {
    try {
        const response = await fetch('/api/announcements');
        if (response.ok) {
            const data = await response.json();
            window.currentAnnouncementsRaw = data.content; // 記住純文字，編輯時要用
            renderAnnouncements(data.content);
        }
    } catch (error) {
        console.error('Error loading announcements:', error);
    }
}

function renderAnnouncements(rawText) {
    const container = document.getElementById('announcement-content');
    if (!rawText || !rawText.trim()) {
        container.innerHTML = '<p style="color:#999; margin: 0;">目前沒有新公告。</p>';
        return;
    }
    
    // 把文字依照換行符號切開
    const lines = rawText.split('\n').filter(line => line.trim() !== '');
    
    let html = '<ul class="announcement-list">';
    lines.forEach(line => { 
        let formattedLine = line;
        // 如果有冒號，就把冒號前面的字加粗
        if (line.includes(':')) {
            const parts = line.split(/:(.*)/s); 
            formattedLine = `<strong>${parts[0]}</strong>:${parts[1]}`;
        } else if (line.includes('：')) {
            const parts = line.split(/：(.*)/s);
            formattedLine = `<strong>${parts[0]}</strong>：${parts[1]}`;
        }
        html += `<li class="announcement-item">${formattedLine}</li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
}

function openEditAnnouncement() {
    document.getElementById('edit-announcement-overlay').style.setProperty('display', 'flex', 'important');
    document.getElementById('announcement-textarea').value = window.currentAnnouncementsRaw || '';
}

function closeEditAnnouncement() {
    document.getElementById('edit-announcement-overlay').style.setProperty('display', 'none', 'important');
}

async function submitAnnouncements(trigger) {
    const newContent = document.getElementById('announcement-textarea').value;
    const btn = getActionButton(trigger);
    const originalText = btn ? btn.innerText : '';
    if (btn) {
        btn.innerText = '儲存中...';
        btn.disabled = true;
    }

    try {
        const response = await fetch('/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent })
        });

        if (response.ok) {
            closeEditAnnouncement();
            loadAnnouncements(); // 儲存成功後，重新讀取並刷新畫面
        } else {
            alert('公告儲存失敗。');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('伺服器連線失敗。');
    } finally {
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}
// ==========================================
// 10. Showcase Slider Feature (首頁合照輪播)
// ==========================================
window.addEventListener('load', loadShowcaseSlider);

let sliderInterval; // 宣告計時器
let showcaseCurrentIndex = 0;
const showcaseSwipeState = {
    startX: 0,
    startY: 0,
    isPointerDown: false,
    pointerId: null,
    suppressClickUntil: 0,
};

async function loadShowcaseSlider() {
    const container = document.getElementById('showcase-slider-container');
    if (!container) return;

    try {
        const response = await fetch('/api/showcase_photo_assets');
        const photos = await response.json();

        if (!photos || photos.length === 0) {
            clearInterval(sliderInterval);
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = ''; 
        showcaseCurrentIndex = 0;

        let slidesHtml = '';
        let dotsHtml = '<div class="slider-dots">';

        photos.forEach((photo, index) => {
            const imgPath = photo.src;
            const activeClass = index === 0 ? 'active' : '';
            slidesHtml += `<img src="${imgPath}" class="showcase-slide ${activeClass}" draggable="false" onclick="openLightbox('${imgPath}')">`;
            dotsHtml += `<div class="dot ${activeClass}" onclick="goToSlide(${index})"></div>`;
        });

        dotsHtml += '</div>';
        container.innerHTML = slidesHtml + dotsHtml;
        initShowcaseSwipe();

        startSliderTimer();

    } catch (error) {
        console.error('Error loading showcase slider:', error);
    }
}

function startSliderTimer() {
    clearInterval(sliderInterval);
    sliderInterval = setInterval(() => {
        nextSlide();
    }, 4500); // 4500 毫秒 = 4.5 秒換一張
}

function nextSlide() {
    const slides = document.querySelectorAll('.showcase-slide');
    if (slides.length <= 1) return;

    goToSlide((showcaseCurrentIndex + 1) % slides.length);
}

function prevSlide() {
    const slides = document.querySelectorAll('.showcase-slide');
    if (slides.length <= 1) return;

    goToSlide((showcaseCurrentIndex - 1 + slides.length) % slides.length);
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.showcase-slide');
    const dots = document.querySelectorAll('.dot');
    if (!slides.length || !dots.length || !slides[index] || !dots[index]) return;
    
    // 移除舊的 active
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));

    // 加上新的 active
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    showcaseCurrentIndex = index;

    // 重新計時 (避免使用者手動點擊後，馬上又跳下一張)
    startSliderTimer();
}

function initShowcaseSwipe() {
    const container = document.getElementById('showcase-slider-container');
    if (!container || container.dataset.swipeBound === 'true') return;
    container.dataset.swipeBound = 'true';

    container.addEventListener('touchstart', (event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        showcaseSwipeState.startX = touch.clientX;
        showcaseSwipeState.startY = touch.clientY;
    }, { passive: true });

    container.addEventListener('touchend', (event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        const deltaX = touch.clientX - showcaseSwipeState.startX;
        const deltaY = touch.clientY - showcaseSwipeState.startY;
        if (Math.abs(deltaX) < SHOWCASE_SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) return;
        showcaseSwipeState.suppressClickUntil = Date.now() + 400;
        if (deltaX < 0) {
            nextSlide();
            return;
        }
        prevSlide();
    }, { passive: true });

    container.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0) return;
        showcaseSwipeState.isPointerDown = true;
        showcaseSwipeState.pointerId = event.pointerId;
        showcaseSwipeState.startX = event.clientX;
        showcaseSwipeState.startY = event.clientY;
        container.classList.add('is-pointer-down');
        container.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    container.addEventListener('pointerup', (event) => {
        if (event.pointerType !== 'mouse' || event.pointerId !== showcaseSwipeState.pointerId || !showcaseSwipeState.isPointerDown) return;
        showcaseSwipeState.isPointerDown = false;
        showcaseSwipeState.pointerId = null;
        container.classList.remove('is-pointer-down');
        const deltaX = event.clientX - showcaseSwipeState.startX;
        const deltaY = event.clientY - showcaseSwipeState.startY;
        if (Math.abs(deltaX) < SHOWCASE_SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY)) return;
        showcaseSwipeState.suppressClickUntil = Date.now() + 400;
        if (deltaX < 0) {
            nextSlide();
            return;
        }
        prevSlide();
    });

    container.addEventListener('pointercancel', (event) => {
        if (event.pointerId !== showcaseSwipeState.pointerId) return;
        showcaseSwipeState.isPointerDown = false;
        showcaseSwipeState.pointerId = null;
        container.classList.remove('is-pointer-down');
    });

    container.addEventListener('lostpointercapture', () => {
        showcaseSwipeState.isPointerDown = false;
        showcaseSwipeState.pointerId = null;
        container.classList.remove('is-pointer-down');
    });

    container.addEventListener('click', (event) => {
        if (Date.now() > showcaseSwipeState.suppressClickUntil) return;
        if (!event.target.closest('.showcase-slide')) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
}

// ==========================================
// 11. Footer Features
// ==========================================
window.addEventListener('load', loadFooter);

let currentFooterData = {
    captainText: '隊長',
    captainLink: '#',
    viceText: '副隊長',
    viceLink: '#',
    igText: '球隊 IG',
    igLink: '#'
};

async function loadFooter() {
    try {
        const response = await fetch('/api/footer');
        if (response.ok) {
            const data = await response.json();
            if (data && Object.keys(data).length > 0) {
                currentFooterData = data;
            }
        }
    } catch (error) {
        // 若後端尚未建立 API，嘗試從 LocalStorage 讀取作為備案
        const localData = localStorage.getItem('vbt_footer_data');
        if (localData) {
            currentFooterData = JSON.parse(localData);
        }
    } finally {
        renderFooter();
    }
}

function renderFooter() {
    const container = document.getElementById('footer-contacts');
    if (!container) return;

    const makeLink = (text, link) => {
        if (!text) return '';
        const href = link && link.trim() !== '' ? escapeHtml(link) : '#';
        return `<a href="${href}" target="_blank" style="color: var(--accent-color); text-decoration: none; font-weight: 500;">${escapeHtml(text)}</a>`;
    };

    const parts = [];

    if (currentFooterData.captainText) parts.push(`隊長：${makeLink(currentFooterData.captainText, currentFooterData.captainLink)}`);
    if (currentFooterData.viceText) parts.push(`副隊長：${makeLink(currentFooterData.viceText, currentFooterData.viceLink)}`);
    if (currentFooterData.igText) parts.push(`IG：${makeLink(currentFooterData.igText, currentFooterData.igLink)}`);

    if (parts.length > 0) {
        container.innerHTML = `<strong style="margin-right: 5px;">聯絡資訊     </strong> ` + parts.join(' <span style="color:#ccc; margin: 0 8px;">|</span> ');
    } else {
        container.innerHTML = '';
    }
}

function openEditFooter() {
    document.getElementById('edit-footer-overlay').style.setProperty('display', 'flex', 'important');
    document.getElementById('footer-captain-text').value = currentFooterData.captainText || '';
    document.getElementById('footer-captain-link').value = currentFooterData.captainLink || '';
    document.getElementById('footer-vice-text').value = currentFooterData.viceText || '';
    document.getElementById('footer-vice-link').value = currentFooterData.viceLink || '';
    document.getElementById('footer-ig-text').value = currentFooterData.igText || '';
    document.getElementById('footer-ig-link').value = currentFooterData.igLink || '';
}

function closeEditFooter() {
    document.getElementById('edit-footer-overlay').style.setProperty('display', 'none', 'important');
}

async function submitFooter(e) {
    const payload = {
        captainText: document.getElementById('footer-captain-text').value.trim(),
        captainLink: document.getElementById('footer-captain-link').value.trim(),
        viceText: document.getElementById('footer-vice-text').value.trim(),
        viceLink: document.getElementById('footer-vice-link').value.trim(),
        igText: document.getElementById('footer-ig-text').value.trim(),
        igLink: document.getElementById('footer-ig-link').value.trim()
    };

    const btn = e ? e.target : document.activeElement;
    const originalText = btn.innerText;
    btn.innerText = '儲存中...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/footer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            closeEditFooter();
            loadFooter(); 
        } else {
            throw new Error('伺服器錯誤');
        }
    } catch (error) {
        // 若後端 API 尚未建立，在此提供本地備案，讓畫面能動作
        console.log('API 未回應，改為更新本地快取 (Local Storage)');
        localStorage.setItem('vbt_footer_data', JSON.stringify(payload));
        currentFooterData = payload;
        renderFooter();
        closeEditFooter();
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}
